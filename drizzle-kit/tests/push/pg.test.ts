import { PGlite } from '@electric-sql/pglite';
import {
	bigint,
	bigserial,
	boolean,
	char,
	date,
	doublePrecision,
	index,
	integer,
	interval,
	json,
	jsonb,
	numeric,
	pgEnum,
	pgSchema,
	pgSequence,
	pgTable,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { SQL, sql } from 'drizzle-orm/sql';
import { pgSuggestions } from 'src/cli/commands/pgPushUtils';
import { diffTestSchemasPush } from 'tests/schemaDiffer';
import { afterEach, expect, test } from 'vitest';
import { DialectSuite, run } from './common';

const pgSuite: DialectSuite = {
	async allTypes() {
		const client = new PGlite();

		const customSchema = pgSchema('schemass');

		const transactionStatusEnum = customSchema.enum(
			'TransactionStatusEnum',
			['PENDING', 'FAILED', 'SUCCESS'],
		);

		const enumname = pgEnum('enumname', ['three', 'two', 'one']);

		const schema1 = {
			test: pgEnum('test', ['ds']),
			testHello: pgEnum('test_hello', ['ds']),
			enumname: pgEnum('enumname', ['three', 'two', 'one']),

			customSchema: customSchema,
			transactionStatusEnum: customSchema.enum('TransactionStatusEnum', [
				'PENDING',
				'FAILED',
				'SUCCESS',
			]),

			allSmallSerials: pgTable('schema_test', {
				columnAll: uuid('column_all').defaultRandom(),
				column: transactionStatusEnum('column').notNull(),
			}),

			allSmallInts: customSchema.table(
				'schema_test2',
				{
					columnAll: smallint('column_all').default(124).notNull(),
					column: smallint('columns').array(),
					column1: smallint('column1').array().array(),
					column2: smallint('column2').array().array(),
					column3: smallint('column3').array(),
				},
				(t) => ({
					cd: uniqueIndex('testdfds').on(t.column),
				}),
			),

			allEnums: customSchema.table(
				'all_enums',
				{
					columnAll: enumname('column_all').default('three').notNull(),
					column: enumname('columns'),
				},
				(t) => ({
					d: index('ds').on(t.column),
				}),
			),

			allTimestamps: customSchema.table('all_timestamps', {
				columnDateNow: timestamp('column_date_now', {
					precision: 1,
					withTimezone: true,
					mode: 'string',
				}).defaultNow(),
				columnAll: timestamp('column_all', { mode: 'string' }).default(
					'2023-03-01 12:47:29.792',
				),
				column: timestamp('column', { mode: 'string' }).default(
					sql`'2023-02-28 16:18:31.18'`,
				),
				column2: timestamp('column2', { mode: 'string', precision: 3 }).default(
					sql`'2023-02-28 16:18:31.18'`,
				),
			}),

			allUuids: customSchema.table('all_uuids', {
				columnAll: uuid('column_all').defaultRandom().notNull(),
				column: uuid('column'),
			}),

			allDates: customSchema.table('all_dates', {
				column_date_now: date('column_date_now').defaultNow(),
				column_all: date('column_all', { mode: 'date' })
					.default(new Date())
					.notNull(),
				column: date('column'),
			}),

			allReals: customSchema.table('all_reals', {
				columnAll: real('column_all').default(32).notNull(),
				column: real('column'),
				columnPrimary: real('column_primary').primaryKey().notNull(),
			}),

			allBigints: pgTable('all_bigints', {
				columnAll: bigint('column_all', { mode: 'number' })
					.default(124)
					.notNull(),
				column: bigint('column', { mode: 'number' }),
			}),

			allBigserials: customSchema.table('all_bigserials', {
				columnAll: bigserial('column_all', { mode: 'bigint' }).notNull(),
				column: bigserial('column', { mode: 'bigint' }).notNull(),
			}),

			allIntervals: customSchema.table('all_intervals', {
				columnAllConstrains: interval('column_all_constrains', {
					fields: 'month',
				})
					.default('1 mon')
					.notNull(),
				columnMinToSec: interval('column_min_to_sec', {
					fields: 'minute to second',
				}),
				columnWithoutFields: interval('column_without_fields')
					.default('00:00:01')
					.notNull(),
				column: interval('column'),
				column5: interval('column5', {
					fields: 'minute to second',
					precision: 3,
				}),
				column6: interval('column6'),
			}),

			allSerials: customSchema.table('all_serials', {
				columnAll: serial('column_all').notNull(),
				column: serial('column').notNull(),
			}),

			allTexts: customSchema.table(
				'all_texts',
				{
					columnAll: text('column_all').default('text').notNull(),
					column: text('columns').primaryKey(),
				},
				(t) => ({
					cd: index('test').on(t.column),
				}),
			),

			allBools: customSchema.table('all_bools', {
				columnAll: boolean('column_all').default(true).notNull(),
				column: boolean('column'),
			}),

			allVarchars: customSchema.table('all_varchars', {
				columnAll: varchar('column_all').default('text').notNull(),
				column: varchar('column', { length: 200 }),
			}),

			allTimes: customSchema.table('all_times', {
				columnDateNow: time('column_date_now').defaultNow(),
				columnAll: time('column_all').default('22:12:12').notNull(),
				column: time('column'),
			}),

			allChars: customSchema.table('all_chars', {
				columnAll: char('column_all', { length: 1 }).default('text').notNull(),
				column: char('column', { length: 1 }),
			}),

			allDoublePrecision: customSchema.table('all_double_precision', {
				columnAll: doublePrecision('column_all').default(33.2).notNull(),
				column: doublePrecision('column'),
			}),

			allJsonb: customSchema.table('all_jsonb', {
				columnDefaultObject: jsonb('column_default_object')
					.default({ hello: 'world world' })
					.notNull(),
				columnDefaultArray: jsonb('column_default_array').default({
					hello: { 'world world': ['foo', 'bar'] },
				}),
				column: jsonb('column'),
			}),

			allJson: customSchema.table('all_json', {
				columnDefaultObject: json('column_default_object')
					.default({ hello: 'world world' })
					.notNull(),
				columnDefaultArray: json('column_default_array').default({
					hello: { 'world world': ['foo', 'bar'] },
					foo: 'bar',
					fe: 23,
				}),
				column: json('column'),
			}),

			allIntegers: customSchema.table('all_integers', {
				columnAll: integer('column_all').primaryKey(),
				column: integer('column'),
				columnPrimary: integer('column_primary'),
			}),

			allNumerics: customSchema.table('all_numerics', {
				columnAll: numeric('column_all', { precision: 1, scale: 1 })
					.default('32')
					.notNull(),
				column: numeric('column'),
				columnPrimary: numeric('column_primary').primaryKey().notNull(),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema1,
			[],
			false,
			['public', 'schemass'],
		);
		expect(statements.length).toBe(0);
	},

	async addBasicIndexes() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index()
						.on(t.name.desc(), t.id.asc().nullsLast())
						.with({ fillfactor: 70 })
						.where(sql`select 1`),
					indx1: index('indx1')
						.using('hash', t.name.desc(), sql`${t.name}`)
						.with({ fillfactor: 70 }),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);
		expect(statements.length).toBe(2);
		expect(statements[0]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'create_index_pg',
			data: {
				columns: [
					{
						asc: false,
						expression: 'name',
						isExpression: false,
						nulls: 'last',
						opclass: undefined,
					},
					{
						asc: true,
						expression: 'id',
						isExpression: false,
						nulls: 'last',
						opclass: undefined,
					},
				],
				concurrently: false,
				isUnique: false,
				method: 'btree',
				name: 'users_name_id_index',
				where: 'select 1',
				with: {
					fillfactor: 70,
				},
			},
		});
		expect(statements[1]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'create_index_pg',
			data: {
				columns: [
					{
						asc: false,
						expression: 'name',
						isExpression: false,
						nulls: 'last',
						opclass: undefined,
					},
					{
						asc: true,
						expression: '"name"',
						isExpression: true,
						nulls: 'last',
					},
				],
				concurrently: false,
				isUnique: false,
				method: 'hash',
				name: 'indx1',
				where: undefined,
				with: {
					fillfactor: 70,
				},
			},
		});
		expect(sqlStatements.length).toBe(2);
		expect(sqlStatements[0]).toBe(
			`CREATE INDEX IF NOT EXISTS "users_name_id_index" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70) WHERE select 1;`,
		);
		expect(sqlStatements[1]).toBe(
			`CREATE INDEX IF NOT EXISTS "indx1" ON "users" USING hash ("name" DESC NULLS LAST,"name") WITH (fillfactor=70);`,
		);
	},

	async addGeneratedColumn() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name}`,
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements).toStrictEqual([
			{
				column: {
					generated: {
						as: '"users"."name"',
						type: 'stored',
					},
					name: 'gen_name',
					notNull: false,
					primaryKey: false,
					type: 'text',
				},
				schema: '',
				tableName: 'users',
				type: 'alter_table_add_column',
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
		]);

		// for (const st of sqlStatements) {
		//   await client.query(st);
		// }
	},

	async addGeneratedToColumn() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name'),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name}`,
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements).toStrictEqual([
			{
				columnAutoIncrement: undefined,
				columnDefault: undefined,
				columnGenerated: {
					as: '"users"."name"',
					type: 'stored',
				},
				columnName: 'gen_name',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_set_generated',
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" drop column "gen_name";',
			'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
		]);

		// for (const st of sqlStatements) {
		//   await client.query(st);
		// }
	},

	async dropGeneratedConstraint() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema1.users.name}`,
				),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name'),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements).toStrictEqual([
			{
				columnAutoIncrement: undefined,
				columnDefault: undefined,
				columnGenerated: undefined,
				columnName: 'gen_name',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_drop_generated',
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" ALTER COLUMN "gen_name" DROP EXPRESSION;',
		]);
	},

	async alterGeneratedConstraint() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema1.users.name}`,
				),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements).toStrictEqual([]);
		expect(sqlStatements).toStrictEqual([]);
	},

	async createTableWithGeneratedConstraint() {
		const client = new PGlite();

		const schema1 = {};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements).toStrictEqual([
			{
				columns: [
					{
						name: 'id',
						notNull: false,
						primaryKey: false,
						type: 'integer',
					},
					{
						name: 'id2',
						notNull: false,
						primaryKey: false,
						type: 'integer',
					},
					{
						name: 'name',
						notNull: false,
						primaryKey: false,
						type: 'text',
					},
					{
						generated: {
							as: '"users"."name" || \'hello\'',
							type: 'stored',
						},
						name: 'gen_name',
						notNull: false,
						primaryKey: false,
						type: 'text',
					},
				],
				compositePKs: [],
				compositePkName: '',
				schema: '',
				tableName: 'users',
				policies: [],
				type: 'create_table',
				uniqueConstraints: [],
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" integer,\n\t"id2" integer,\n\t"name" text,\n\t"gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED\n);\n',
		]);
	},

	async addBasicSequences() {
		const client = new PGlite();

		const schema1 = {
			seq: pgSequence('my_seq', { startWith: 100 }),
		};

		const schema2 = {
			seq: pgSequence('my_seq', { startWith: 100 }),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);
		expect(statements.length).toBe(0);
	},

	async changeIndexFields() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					removeColumn: index('removeColumn').on(t.name, t.id),
					addColumn: index('addColumn')
						.on(t.name.desc())
						.with({ fillfactor: 70 }),
					removeExpression: index('removeExpression')
						.on(t.name.desc(), sql`name`)
						.concurrently(),
					addExpression: index('addExpression').on(t.id.desc()),
					changeExpression: index('changeExpression').on(
						t.id.desc(),
						sql`name`,
					),
					changeName: index('changeName')
						.on(t.name.desc(), t.id.asc().nullsLast())
						.with({ fillfactor: 70 }),
					changeWith: index('changeWith').on(t.name).with({ fillfactor: 70 }),
					changeUsing: index('changeUsing').on(t.name),
				}),
			),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					removeColumn: index('removeColumn').on(t.name),
					addColumn: index('addColumn')
						.on(t.name.desc(), t.id.nullsLast())
						.with({ fillfactor: 70 }),
					removeExpression: index('removeExpression')
						.on(t.name.desc())
						.concurrently(),
					addExpression: index('addExpression').on(t.id.desc()),
					changeExpression: index('changeExpression').on(
						t.id.desc(),
						sql`name desc`,
					),
					changeName: index('newName')
						.on(t.name.desc(), sql`name`)
						.with({ fillfactor: 70 }),
					changeWith: index('changeWith').on(t.name).with({ fillfactor: 90 }),
					changeUsing: index('changeUsing').using('hash', t.name),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(sqlStatements).toStrictEqual([
			'DROP INDEX IF EXISTS "changeName";',
			'DROP INDEX IF EXISTS "addColumn";',
			'DROP INDEX IF EXISTS "changeExpression";',
			'DROP INDEX IF EXISTS "changeUsing";',
			'DROP INDEX IF EXISTS "changeWith";',
			'DROP INDEX IF EXISTS "removeColumn";',
			'DROP INDEX IF EXISTS "removeExpression";',
			'CREATE INDEX IF NOT EXISTS "newName" ON "users" USING btree ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
			'CREATE INDEX IF NOT EXISTS "addColumn" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
			'CREATE INDEX IF NOT EXISTS "changeExpression" ON "users" USING btree ("id" DESC NULLS LAST,name desc);',
			'CREATE INDEX IF NOT EXISTS "changeUsing" ON "users" USING hash ("name");',
			'CREATE INDEX IF NOT EXISTS "changeWith" ON "users" USING btree ("name") WITH (fillfactor=90);',
			'CREATE INDEX IF NOT EXISTS "removeColumn" ON "users" USING btree ("name");',
			'CREATE INDEX CONCURRENTLY IF NOT EXISTS "removeExpression" ON "users" USING btree ("name" DESC NULLS LAST);',
		]);
	},

	async dropIndex() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index()
						.on(t.name.desc(), t.id.asc().nullsLast())
						.with({ fillfactor: 70 }),
				}),
			),
		};

		const schema2 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements.length).toBe(1);
		expect(statements[0]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'drop_index',
			data: 'users_name_id_index;name--false--last,,id--true--last;false;btree;{"fillfactor":"70"}',
		});

		expect(sqlStatements.length).toBe(1);
		expect(sqlStatements[0]).toBe(
			`DROP INDEX IF EXISTS "users_name_id_index";`,
		);
	},

	async indexesToBeNotTriggered() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index('indx').on(t.name.desc()).concurrently(),
					indx1: index('indx1')
						.on(t.name.desc())
						.where(sql`true`),
					indx2: index('indx2')
						.on(t.name.op('text_ops'))
						.where(sql`true`),
					indx3: index('indx3')
						.on(sql`lower(name)`)
						.where(sql`true`),
				}),
			),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index('indx').on(t.name.desc()),
					indx1: index('indx1')
						.on(t.name.desc())
						.where(sql`false`),
					indx2: index('indx2')
						.on(t.name.op('test'))
						.where(sql`true`),
					indx3: index('indx3')
						.on(sql`lower(id)`)
						.where(sql`true`),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements.length).toBe(0);
	},

	async indexesTestCase1() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: uuid('id').defaultRandom().primaryKey(),
					name: text('name').notNull(),
					description: text('description'),
					imageUrl: text('image_url'),
					inStock: boolean('in_stock').default(true),
				},
				(t) => ({
					indx: index().on(t.id.desc().nullsFirst()),
					indx1: index('indx1').on(t.id, t.imageUrl),
					indx2: index('indx4').on(t.id),
				}),
			),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: uuid('id').defaultRandom().primaryKey(),
					name: text('name').notNull(),
					description: text('description'),
					imageUrl: text('image_url'),
					inStock: boolean('in_stock').default(true),
				},
				(t) => ({
					indx: index().on(t.id.desc().nullsFirst()),
					indx1: index('indx1').on(t.id, t.imageUrl),
					indx2: index('indx4').on(t.id),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements.length).toBe(0);
	},

	async addNotNull() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'User',
				{
					id: text('id').primaryKey().notNull(),
					name: text('name'),
					username: text('username'),
					gh_username: text('gh_username'),
					email: text('email'),
					emailVerified: timestamp('emailVerified', {
						precision: 3,
						mode: 'date',
					}),
					image: text('image'),
					createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
						.default(sql`CURRENT_TIMESTAMP`)
						.notNull(),
					updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
						.notNull()
						.$onUpdate(() => new Date()),
				},
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
			),
		};

		const schema2 = {
			users: pgTable(
				'User',
				{
					id: text('id').primaryKey().notNull(),
					name: text('name'),
					username: text('username'),
					gh_username: text('gh_username'),
					email: text('email').notNull(),
					emailVerified: timestamp('emailVerified', {
						precision: 3,
						mode: 'date',
					}),
					image: text('image'),
					createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
						.default(sql`CURRENT_TIMESTAMP`)
						.notNull(),
					updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
						.notNull()
						.$onUpdate(() => new Date()),
				},
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);
		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows as any[];
		};

		const { statementsToExecute } = await pgSuggestions({ query }, statements);

		expect(statementsToExecute).toStrictEqual([
			'ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;',
		]);
	},

	async addNotNullWithDataNoRollback() {
		const client = new PGlite();
		const db = drizzle(client);

		const schema1 = {
			users: pgTable(
				'User',
				{
					id: text('id').primaryKey().notNull(),
					name: text('name'),
					username: text('username'),
					gh_username: text('gh_username'),
					email: text('email'),
					emailVerified: timestamp('emailVerified', {
						precision: 3,
						mode: 'date',
					}),
					image: text('image'),
					createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
						.default(sql`CURRENT_TIMESTAMP`)
						.notNull(),
					updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
						.notNull()
						.$onUpdate(() => new Date()),
				},
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
			),
		};

		const schema2 = {
			users: pgTable(
				'User',
				{
					id: text('id').primaryKey().notNull(),
					name: text('name'),
					username: text('username'),
					gh_username: text('gh_username'),
					email: text('email').notNull(),
					emailVerified: timestamp('emailVerified', {
						precision: 3,
						mode: 'date',
					}),
					image: text('image'),
					createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
						.default(sql`CURRENT_TIMESTAMP`)
						.notNull(),
					updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
						.notNull()
						.$onUpdate(() => new Date()),
				},
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);
		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows as any[];
		};

		await db.insert(schema1.users).values({ id: 'str', email: 'email@gmail' });

		const { statementsToExecute, shouldAskForApprove } = await pgSuggestions(
			{ query },
			statements,
		);

		expect(statementsToExecute).toStrictEqual([
			'ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;',
		]);

		expect(shouldAskForApprove).toBeFalsy();
	},

	// async addVectorIndexes() {
	//   const client = new PGlite();

	//   const schema1 = {
	//     users: pgTable("users", {
	//       id: serial("id").primaryKey(),
	//       name: vector("name", { dimensions: 3 }),
	//     }),
	//   };

	//   const schema2 = {
	//     users: pgTable(
	//       "users",
	//       {
	//         id: serial("id").primaryKey(),
	//         embedding: vector("name", { dimensions: 3 }),
	//       },
	//       (t) => ({
	//         indx2: index("vector_embedding_idx")
	//           .using("hnsw", t.embedding.op("vector_ip_ops"))
	//           .with({ m: 16, ef_construction: 64 }),
	//       })
	//     ),
	//   };

	//   const { statements, sqlStatements } = await diffTestSchemasPush(
	//     client,
	//     schema1,
	//     schema2,
	//     [],
	//     false,
	//     ["public"]
	//   );
	//   expect(statements.length).toBe(1);
	//   expect(statements[0]).toStrictEqual({
	//     schema: "",
	//     tableName: "users",
	//     type: "create_index",
	//     data: 'vector_embedding_idx;name,true,last,vector_ip_ops;false;false;hnsw;undefined;{"m":16,"ef_construction":64}',
	//   });
	//   expect(sqlStatements.length).toBe(1);
	//   expect(sqlStatements[0]).toBe(
	//     `CREATE INDEX IF NOT EXISTS "vector_embedding_idx" ON "users" USING hnsw (name vector_ip_ops) WITH (m=16,ef_construction=64);`
	//   );
	// },
	async case1() {
		// TODO: implement if needed
		expect(true).toBe(true);
	},
};

run(pgSuite);

test('full sequence: no changes', async () => {
	const client = new PGlite();

	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('basic sequence: change fields', async () => {
	const client = new PGlite();

	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 100000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 4,
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'alter_sequence',
			schema: 'public',
			name: 'my_seq',
			values: {
				minValue: '100',
				maxValue: '100000',
				increment: '4',
				startWith: '100',
				cache: '10',
				cycle: true,
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."my_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 100000 START WITH 100 CACHE 10 CYCLE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('basic sequence: change name', async () => {
	const client = new PGlite();

	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['public.my_seq->public.my_seq2'],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			nameFrom: 'my_seq',
			nameTo: 'my_seq2',
			schema: 'public',
			type: 'rename_sequence',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."my_seq" RENAME TO "my_seq2";',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('basic sequence: change name and fields', async () => {
	const client = new PGlite();

	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 4,
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['public.my_seq->public.my_seq2'],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			nameFrom: 'my_seq',
			nameTo: 'my_seq2',
			schema: 'public',
			type: 'rename_sequence',
		},
		{
			name: 'my_seq2',
			schema: 'public',
			type: 'alter_sequence',
			values: {
				cache: '10',
				cycle: true,
				increment: '4',
				maxValue: '10000',
				minValue: '100',
				startWith: '100',
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."my_seq" RENAME TO "my_seq2";',
		'ALTER SEQUENCE "public"."my_seq2" INCREMENT BY 4 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

// identity push tests
test('create table: identity always/by default - no params', async () => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity(),
			id2: smallint('id2').generatedByDefaultAsIdentity(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columns: [
				{
					identity: 'users_id_seq;byDefault;1;2147483647;1;1;1;false',
					name: 'id',
					notNull: true,
					primaryKey: false,
					type: 'integer',
				},
				{
					identity: 'users_id1_seq;byDefault;1;9223372036854775807;1;1;1;false',
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'bigint',
				},
				{
					identity: 'users_id2_seq;byDefault;1;32767;1;1;1;false',
					name: 'id2',
					notNull: true,
					primaryKey: false,
					type: 'smallint',
				},
			],
			compositePKs: [],
			compositePkName: '',
			schema: '',
			tableName: 'users',
			policies: [],
			type: 'create_table',
			uniqueConstraints: [],
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1)\n);\n',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create table: identity always/by default - few params', async () => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ increment: 4 }),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity({
				startWith: 120,
				maxValue: 17000,
			}),
			id2: smallint('id2').generatedByDefaultAsIdentity({ cycle: true }),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columns: [
				{
					identity: 'users_id_seq;byDefault;1;2147483647;4;1;1;false',
					name: 'id',
					notNull: true,
					primaryKey: false,
					type: 'integer',
				},
				{
					identity: 'users_id1_seq;byDefault;1;17000;1;120;1;false',
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'bigint',
				},
				{
					identity: 'users_id2_seq;byDefault;1;32767;1;1;1;true',
					name: 'id2',
					notNull: true,
					primaryKey: false,
					type: 'smallint',
				},
			],
			compositePKs: [],
			compositePkName: '',
			policies: [],
			schema: '',
			tableName: 'users',
			type: 'create_table',
			uniqueConstraints: [],
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 17000 START WITH 120 CACHE 1),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1 CYCLE)\n);\n',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create table: identity always/by default - all params', async () => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				increment: 4,
				minValue: 100,
			}),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity({
				startWith: 120,
				maxValue: 17000,
				increment: 3,
				cycle: true,
				cache: 100,
			}),
			id2: smallint('id2').generatedByDefaultAsIdentity({ cycle: true }),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columns: [
				{
					identity: 'users_id_seq;byDefault;100;2147483647;4;100;1;false',
					name: 'id',
					notNull: true,
					primaryKey: false,
					type: 'integer',
				},
				{
					identity: 'users_id1_seq;byDefault;1;17000;3;120;100;true',
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'bigint',
				},
				{
					identity: 'users_id2_seq;byDefault;1;32767;1;1;1;true',
					name: 'id2',
					notNull: true,
					primaryKey: false,
					type: 'smallint',
				},
			],
			compositePKs: [],
			compositePkName: '',
			schema: '',
			tableName: 'users',
			type: 'create_table',
			policies: [],
			uniqueConstraints: [],
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 2147483647 START WITH 100 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 3 MINVALUE 1 MAXVALUE 17000 START WITH 120 CACHE 100 CYCLE),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1 CYCLE)\n);\n',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('no diff: identity always/by default - no params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id2: integer('id2').generatedAlwaysAsIdentity(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id2: integer('id2').generatedAlwaysAsIdentity(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('no diff: identity always/by default - few params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				increment: 1,
				startWith: 3,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				increment: 1,
				startWith: 3,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('no diff: identity always/by default - all params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('drop identity from a column - no params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop identity from a column - few params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ name: 'custom_name' }),
			id1: integer('id1').generatedByDefaultAsIdentity({
				name: 'custom_name1',
				increment: 4,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				name: 'custom_name2',
				increment: 4,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id1',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id2',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop identity from a column - all params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id1: integer('id1').generatedByDefaultAsIdentity({
				name: 'custom_name1',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				name: 'custom_name2',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id1',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id2',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - no params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ startWith: 100 }),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;byDefault;1;2147483647;1;100;1;false',
			oldIdentity: 'users_id_seq;byDefault;1;2147483647;1;1;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET START WITH 100;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - few params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ startWith: 100 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				startWith: 100,
				increment: 4,
				maxValue: 10000,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;byDefault;1;10000;4;100;1;false',
			oldIdentity: 'users_id_seq;byDefault;1;2147483647;1;100;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - by default to always', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ startWith: 100 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({
				startWith: 100,
				increment: 4,
				maxValue: 10000,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;always;1;10000;4;100;1;false',
			oldIdentity: 'users_id_seq;byDefault;1;2147483647;1;100;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED ALWAYS;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - always to by default', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({ startWith: 100 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				startWith: 100,
				increment: 4,
				maxValue: 10000,
				cycle: true,
				cache: 100,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;byDefault;1;10000;4;100;100;true',
			oldIdentity: 'users_id_seq;always;1;2147483647;1;100;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED BY DEFAULT;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET CACHE 100;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET CYCLE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('add column with identity - few params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			email: text('email'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			email: text('email'),
			id: integer('id').generatedByDefaultAsIdentity({ name: 'custom_name' }),
			id1: integer('id1').generatedAlwaysAsIdentity({
				name: 'custom_name1',
				increment: 4,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				identity: 'custom_name;byDefault;1;2147483647;1;1;1;false',
				name: 'id',
				notNull: true,
				primaryKey: false,
				type: 'integer',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
		{
			column: {
				identity: 'custom_name1;always;1;2147483647;4;1;1;false',
				name: 'id1',
				notNull: true,
				primaryKey: false,
				type: 'integer',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ADD COLUMN "id" integer NOT NULL GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
		'ALTER TABLE "users" ADD COLUMN "id1" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
	]);

	// for (const st of sqlStatements) {
	//   await client.query(st);
	// }
});

test('add identity to column - few params', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
			id1: integer('id1'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ name: 'custom_name' }),
			id1: integer('id1').generatedAlwaysAsIdentity({
				name: 'custom_name1',
				increment: 4,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'custom_name;byDefault;1;2147483647;1;1;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_identity',
		},
		{
			columnName: 'id1',
			identity: 'custom_name1;always;1;2147483647;4;1;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
		'ALTER TABLE "users" ALTER COLUMN "id1" ADD GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
	]);

	// for (const st of sqlStatements) {
	//   await client.query(st);
	// }
});

test('add array column - empty array default', async () => {
	const client = new PGlite();

	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([]),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'alter_table_add_column',
			tableName: 'test',
			schema: '',
			column: { name: 'values', type: 'integer[]', primaryKey: false, notNull: false, default: "'{}'" },
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{}\';',
	]);
});

test('add array column - default', async () => {
	const client = new PGlite();

	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'alter_table_add_column',
			tableName: 'test',
			schema: '',
			column: { name: 'values', type: 'integer[]', primaryKey: false, notNull: false, default: "'{1,2,3}'" },
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{1,2,3}\';',
	]);
});
