/**
 * DSQL Generate Tests
 *
 * Tests that verify drizzle-kit's DDL generation for DSQL dialect.
 * These tests verify the SQL statements generated when diffing schemas.
 *
 * DSQL-specific constraints tested:
 * - No enums (text/varchar instead)
 * - No sequences (uuid with gen_random_uuid())
 * - No foreign keys
 * - Only btree indexes
 * - ASYNC index creation
 */

import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	bytea,
	char,
	check,
	date,
	doublePrecision,
	dsqlSchema,
	dsqlTable,
	index,
	integer,
	interval,
	numeric,
	primaryKey,
	real,
	smallint,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/dsql-core';
import { describe, expect, test } from 'vitest';
import { _, diff, diffDry, drizzleToDDL, skipIfNoCluster } from './mocks';

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Table Creation', () => {
	test('create basic table with uuid primary key', async () => {
		const to = {
			users: dsqlTable(_.uniqueName('gen_users'), {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements).toHaveLength(1);
		expect(sqlStatements[0]).toContain('CREATE TABLE');
		expect(sqlStatements[0]).toContain('gen_random_uuid()');
		expect(sqlStatements[0]).toContain('uuid');
		expect(sqlStatements[0]).toContain('PRIMARY KEY');
	});

	test('create table with multiple columns', async () => {
		const to = {
			users: dsqlTable(_.uniqueName('gen_multi'), {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				email: varchar('email', { length: 255 }),
				isActive: boolean('is_active').default(true),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements).toHaveLength(1);
		expect(sqlStatements[0]).toContain('uuid');
		expect(sqlStatements[0]).toContain('text');
		expect(sqlStatements[0]).toContain('varchar(255)');
		expect(sqlStatements[0]).toContain('boolean');
		expect(sqlStatements[0]).toContain('DEFAULT true');
	});

	test('create table with composite primary key', async () => {
		const to = {
			userRoles: dsqlTable(
				_.uniqueName('gen_comp_pk'),
				{
					userId: uuid('user_id').notNull(),
					roleId: uuid('role_id').notNull(),
					assignedAt: timestamp('assigned_at').defaultNow(),
				},
				(t) => [primaryKey({ columns: [t.userId, t.roleId] })],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements).toHaveLength(1);
		expect(sqlStatements[0]).toContain('user_id');
		expect(sqlStatements[0]).toContain('role_id');
		expect(sqlStatements[0]).toContain('PRIMARY KEY');
	});

	test('create table in custom schema', async () => {
		const testSchema = dsqlSchema(_.uniqueName('gen_schema'));

		const to = {
			testSchema,
			users: testSchema.table(_.uniqueName('gen_schema_table'), {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		// Should create schema and table
		expect(sqlStatements.length).toBeGreaterThanOrEqual(2);
		expect(sqlStatements.some((s) => s.includes('CREATE SCHEMA'))).toBe(true);
		expect(sqlStatements.some((s) => s.includes('CREATE TABLE'))).toBe(true);
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Column Types', () => {
	test('uuid column with default', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_uuid'), {
				id: uuid('id').primaryKey().defaultRandom(),
				ref: uuid('ref').default(sql`gen_random_uuid()`),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('gen_random_uuid()');
	});

	test('text and varchar columns', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_text'), {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				email: varchar('email', { length: 255 }),
				code: char('code', { length: 10 }),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('text');
		expect(sqlStatements[0]).toContain('varchar(255)');
		expect(sqlStatements[0]).toContain('char(10)');
	});

	test('integer types', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_int'), {
				id: uuid('id').primaryKey().defaultRandom(),
				small: smallint('small'),
				regular: integer('regular').default(0),
				big: bigint('big'),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('smallint');
		expect(sqlStatements[0]).toContain('integer');
		expect(sqlStatements[0]).toContain('bigint');
		expect(sqlStatements[0]).toContain('DEFAULT 0');
	});

	test('numeric and decimal columns', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_num'), {
				id: uuid('id').primaryKey().defaultRandom(),
				price: numeric('price', { precision: 10, scale: 2 }),
				rate: real('rate'),
				precise: doublePrecision('precise'),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('numeric(10,2)');
		expect(sqlStatements[0]).toContain('real');
		expect(sqlStatements[0]).toContain('double precision');
	});

	test('boolean column', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_bool'), {
				id: uuid('id').primaryKey().defaultRandom(),
				isActive: boolean('is_active').default(true),
				isDeleted: boolean('is_deleted').notNull().default(false),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('boolean');
		expect(sqlStatements[0]).toContain('DEFAULT true');
		expect(sqlStatements[0]).toContain('DEFAULT false');
	});

	test('timestamp columns', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_ts'), {
				id: uuid('id').primaryKey().defaultRandom(),
				createdAt: timestamp('created_at').defaultNow(),
				updatedAt: timestamp('updated_at', { withTimezone: true }),
				scheduledFor: timestamp('scheduled_for', { precision: 3 }),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('timestamp');
		expect(sqlStatements[0]).toContain('now()');
	});

	test('date and time columns', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_date'), {
				id: uuid('id').primaryKey().defaultRandom(),
				birthday: date('birthday'),
				startTime: time('start_time'),
				duration: interval('duration'),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('date');
		expect(sqlStatements[0]).toContain('time');
		expect(sqlStatements[0]).toContain('interval');
	});

	test('bytea column', async () => {
		const to = {
			t: dsqlTable(_.uniqueName('gen_bytea'), {
				id: uuid('id').primaryKey().defaultRandom(),
				data: bytea('data'),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('bytea');
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Indexes', () => {
	test('create basic index', async () => {
		const to = {
			users: dsqlTable(
				_.uniqueName('gen_idx'),
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [index('email_idx').on(t.email)],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		// Table creation and index creation
		expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
		const indexStmt = sqlStatements.find((s) => s.includes('CREATE INDEX ASYNC'));
		expect(indexStmt).toBeDefined();
		expect(indexStmt).toContain('email_idx');
	});

	test('create unique index', async () => {
		const to = {
			users: dsqlTable(
				_.uniqueName('gen_uniq_idx'),
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [uniqueIndex('email_unique_idx').on(t.email)],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		const indexStmt = sqlStatements.find((s) => s.includes('CREATE UNIQUE INDEX'));
		expect(indexStmt).toBeDefined();
	});

	test('create composite index', async () => {
		const to = {
			orders: dsqlTable(
				_.uniqueName('gen_comp_idx'),
				{
					id: uuid('id').primaryKey().defaultRandom(),
					userId: uuid('user_id').notNull(),
					createdAt: timestamp('created_at').defaultNow(),
				},
				(t) => [index('user_date_idx').on(t.userId, t.createdAt)],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		const indexStmt = sqlStatements.find((s) => s.includes('CREATE INDEX'));
		expect(indexStmt).toBeDefined();
		expect(indexStmt).toContain('user_id');
		expect(indexStmt).toContain('created_at');
	});

	test('index with order and nulls options', async () => {
		const to = {
			orders: dsqlTable(
				_.uniqueName('gen_idx_opts'),
				{
					id: uuid('id').primaryKey().defaultRandom(),
					createdAt: timestamp('created_at').defaultNow(),
				},
				(t) => [index('date_desc_idx').on(t.createdAt.desc().nullsLast())],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		const indexStmt = sqlStatements.find((s) => s.includes('CREATE INDEX'));
		expect(indexStmt).toBeDefined();
		expect(indexStmt).toContain('DESC');
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Constraints', () => {
	test('unique constraint on column', async () => {
		const to = {
			users: dsqlTable(_.uniqueName('gen_uniq'), {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull().unique(),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		// Unique constraint can be inline or separate
		const hasUnique = sqlStatements.some(
			(s) => s.includes('UNIQUE') || s.includes('ADD CONSTRAINT'),
		);
		expect(hasUnique).toBe(true);
	});

	test('check constraint', async () => {
		const to = {
			users: dsqlTable(
				_.uniqueName('gen_check'),
				{
					id: uuid('id').primaryKey().defaultRandom(),
					age: integer('age'),
				},
				(t) => [check('age_positive', sql`${t.age} >= 0`)],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		const hasCheck = sqlStatements.some(
			(s) => s.includes('CHECK') || s.includes('age_positive'),
		);
		expect(hasCheck).toBe(true);
	});

	test('not null constraint', async () => {
		const to = {
			users: dsqlTable(_.uniqueName('gen_notnull'), {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements[0]).toContain('NOT NULL');
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Schema Modifications', () => {
	test('add column to existing table', async () => {
		const tableName = _.uniqueName('gen_add_col');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}),
		};

		const { sqlStatements } = await diff(from, to, []);

		expect(sqlStatements).toHaveLength(1);
		expect(sqlStatements[0]).toContain('ALTER TABLE');
		expect(sqlStatements[0]).toContain('ADD COLUMN');
		expect(sqlStatements[0]).toContain('email');
	});

	// DSQL does not support DROP COLUMN - throws an error
	test('drop column from table throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('gen_drop_col');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		await expect(diff(from, to, [])).rejects.toThrow('DSQL does not support');
	});

	test('rename column', async () => {
		const tableName = _.uniqueName('gen_rename_col');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				emailAddress: text('email_address'),
			}),
		};

		// Provide rename hint
		const { sqlStatements } = await diff(from, to, [`public.${tableName}.email->public.${tableName}.email_address`]);

		expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
		const renameStmt = sqlStatements.find((s) => s.includes('RENAME COLUMN'));
		expect(renameStmt).toBeDefined();
	});

	test('add index to existing table', async () => {
		const tableName = _.uniqueName('gen_add_idx');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull(),
			}),
		};

		const to = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [index('new_email_idx').on(t.email)],
			),
		};

		const { sqlStatements } = await diff(from, to, []);

		expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
		expect(sqlStatements.some((s) => s.includes('CREATE INDEX'))).toBe(true);
	});

	test('drop table', async () => {
		const tableName = _.uniqueName('gen_drop_tbl');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		const to = {};

		const { sqlStatements } = await diff(from, to, []);

		expect(sqlStatements).toHaveLength(1);
		expect(sqlStatements[0]).toContain('DROP TABLE');
	});

	// DSQL does not support ALTER COLUMN SET DATA TYPE - throws an error
	test('alter column type throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('gen_alter_type');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				count: integer('count'),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				count: bigint('count'),
			}),
		};

		await expect(diff(from, to, [])).rejects.toThrow('DSQL does not support');
	});

	// DSQL does not support ALTER COLUMN SET DEFAULT - throws an error
	test('add default value throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('gen_add_default');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active'),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active').default(true),
			}),
		};

		await expect(diff(from, to, [])).rejects.toThrow('DSQL does not support');
	});

	// DSQL does not support ALTER COLUMN DROP DEFAULT - throws an error
	test('drop default value throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('gen_drop_default');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active').default(true),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active'),
			}),
		};

		await expect(diff(from, to, [])).rejects.toThrow('DSQL does not support');
	});

	// DSQL does not support ALTER COLUMN SET NOT NULL - throws an error
	test('set not null throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('gen_set_notnull');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		await expect(diff(from, to, [])).rejects.toThrow('DSQL does not support');
	});

	// DSQL does not support ALTER COLUMN DROP NOT NULL - throws an error
	test('drop not null throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('gen_drop_notnull');

		const from = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		await expect(diff(from, to, [])).rejects.toThrow('DSQL does not support');
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Idempotency', () => {
	test('no changes when schemas match', async () => {
		const tableName = _.uniqueName('gen_idemp');

		const schema = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		const { sqlStatements } = await diff(schema, schema, []);

		expect(sqlStatements).toHaveLength(0);
	});

	test('DDL conversion is stable', () => {
		const tableName = _.uniqueName('gen_stable');

		const schema = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				email: varchar('email', { length: 255 }),
			}),
		};

		const { ddl: ddl1 } = drizzleToDDL(schema);
		const { ddl: ddl2 } = drizzleToDDL(schema);

		// Verify DDL entities are equivalent
		const entities1 = ddl1.entities.list();
		const entities2 = ddl2.entities.list();

		expect(entities1.length).toBe(entities2.length);
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Generate - Complex Schemas', () => {
	test('multiple tables with relationships (no FK)', async () => {
		// DSQL doesn't support foreign keys, but we can still model relationships
		const usersTable = _.uniqueName('gen_rel_users');
		const postsTable = _.uniqueName('gen_rel_posts');

		const to = {
			users: dsqlTable(usersTable, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
			posts: dsqlTable(
				postsTable,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					userId: uuid('user_id').notNull(), // Reference without FK
					title: text('title').notNull(),
					content: text('content'),
				},
				(t) => [index('posts_user_idx').on(t.userId)],
			),
		};

		const { sqlStatements } = await diff({}, to, []);

		// Should create both tables and index
		expect(sqlStatements.filter((s) => s.includes('CREATE TABLE'))).toHaveLength(2);
		expect(sqlStatements.some((s) => s.includes('CREATE INDEX'))).toBe(true);
	});

	test('table with all supported column types', async () => {
		const tableName = _.uniqueName('gen_all_types');

		const to = {
			allTypes: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				textCol: text('text_col'),
				varcharCol: varchar('varchar_col', { length: 100 }),
				charCol: char('char_col', { length: 5 }),
				boolCol: boolean('bool_col'),
				smallintCol: smallint('smallint_col'),
				intCol: integer('int_col'),
				bigintCol: bigint('bigint_col'),
				realCol: real('real_col'),
				doubleCol: doublePrecision('double_col'),
				numericCol: numeric('numeric_col', { precision: 10, scale: 2 }),
				dateCol: date('date_col'),
				timeCol: time('time_col'),
				timestampCol: timestamp('timestamp_col'),
				timestampTzCol: timestamp('timestamp_tz_col', { withTimezone: true }),
				intervalCol: interval('interval_col'),
				byteaCol: bytea('bytea_col'),
			}),
		};

		const { sqlStatements } = await diff({}, to, []);

		expect(sqlStatements).toHaveLength(1);
		const createTable = sqlStatements[0];

		// Verify all column types are present
		expect(createTable).toContain('uuid');
		expect(createTable).toContain('text');
		expect(createTable).toContain('varchar(100)');
		expect(createTable).toContain('char(5)');
		expect(createTable).toContain('boolean');
		expect(createTable).toContain('smallint');
		expect(createTable).toContain('integer');
		expect(createTable).toContain('bigint');
		expect(createTable).toContain('real');
		expect(createTable).toContain('double precision');
		expect(createTable).toContain('numeric(10,2)');
		expect(createTable).toContain('date');
		expect(createTable).toContain('time');
		expect(createTable).toContain('timestamp');
		expect(createTable).toContain('interval');
		expect(createTable).toContain('bytea');
	});
});
