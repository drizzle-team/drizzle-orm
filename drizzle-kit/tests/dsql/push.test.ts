/**
 * DSQL Push Tests
 *
 * Tests that verify drizzle-kit's push/migrate command execution against a real DSQL cluster.
 * These tests create actual tables and verify the results via introspection.
 *
 * DSQL-specific behavior tested:
 * - Each DDL statement auto-commits (no transaction rollback)
 * - ASYNC index creation
 * - Idempotency verification
 * - Sequences with required CACHE (must be 1 or >= 65536)
 * - Identity columns with required CACHE (must be 1 or >= 65536)
 * - Foreign keys and check constraints added with NOT VALID
 * - No enums or policies
 *
 * Required environment variable:
 *   DSQL_CLUSTER_ENDPOINT - The full DSQL cluster endpoint (e.g., "abc123.dsql.us-west-2.on.aws")
 */

import { sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import {
	bigint,
	boolean,
	check,
	dsqlSchema,
	dsqlSequence,
	dsqlTable,
	foreignKey,
	index,
	integer,
	json,
	jsonb,
	numeric,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/dsql-core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { fromDatabase } from '../../src/dialects/dsql/introspect';
import { interimToDDL } from '../../src/dialects/postgres/ddl';
import type { DB } from '../../src/utils';
import {
	_,
	cleanupIndex,
	cleanupSchema,
	cleanupTable,
	type DSQLTestDatabase,
	prepareTestDatabase,
	push,
	skipIfNoCluster,
} from './mocks';

let testDb: DSQLTestDatabase;
let db: DB;
let dsqlDb: DSQLDatabase<any>;

beforeAll(async () => {
	if (skipIfNoCluster().skip) {
		return;
	}
	testDb = await prepareTestDatabase();
	db = testDb.db;
	dsqlDb = testDb.dsqlDb;
});

afterAll(async () => {
	if (testDb) {
		await testDb.close();
	}
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Basic Operations', () => {
	test('push creates table', async () => {
		const tableName = _.uniqueName('push_basic');

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		try {
			const { sqlStatements } = await push({ db, dsqlDb, to });

			expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
			expect(sqlStatements[0]).toContain('CREATE TABLE');

			// Verify table exists via introspection
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const table = ddl.tables.one({ name: tableName });
			expect(table).toBeTruthy();
			expect(table?.schema).toBe('public');

			// Verify columns
			const columns = ddl.columns.list({ table: tableName });
			expect(columns).toHaveLength(2);
			expect(columns.find((c) => c.name === 'id')).toBeTruthy();
			expect(columns.find((c) => c.name === 'name')).toBeTruthy();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push is idempotent', async () => {
		const tableName = _.uniqueName('push_idemp');

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: varchar('email', { length: 255 }).notNull(),
			}),
		};

		try {
			// First push - creates table (idempotency verified by push helper)
			const { sqlStatements: firstPush } = await push({ db, dsqlDb, to });
			expect(firstPush.length).toBeGreaterThan(0);

			// Second push - should produce no changes (idempotency verified by push helper)
			const { sqlStatements: secondPush } = await push({ db, dsqlDb, to });
			expect(secondPush).toHaveLength(0);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push adds column to existing table', async () => {
		const tableName = _.uniqueName('push_add_col');

		// Initial schema
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		// Updated schema with new column
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial });

			// Add column
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
			expect(sqlStatements.some((s) => s.includes('ADD COLUMN'))).toBe(true);

			// Verify column exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const emailCol = ddl.columns.one({ table: tableName, name: 'email' });
			expect(emailCol).toBeTruthy();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push drops column', async () => {
		const tableName = _.uniqueName('push_drop_col');

		// Initial schema with two columns
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}),
		};

		// Updated schema without email
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial });

			// Drop column
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.some((s) => s.includes('DROP COLUMN'))).toBe(true);

			// Verify column no longer exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			expect(ddl.columns.one({ table: tableName, name: 'email' })).toBeNull();
			expect(ddl.columns.list({ table: tableName })).toHaveLength(1);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push drops table', async () => {
		const tableName = _.uniqueName('push_drop_tbl');

		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
			}),
		};

		try {
			// Create table
			await push({ db, dsqlDb, to: initial });

			// Verify table exists
			let schema = await fromDatabase(db, () => true);
			let { ddl } = interimToDDL(schema);
			expect(ddl.tables.one({ name: tableName })).toBeTruthy();

			// Drop table by pushing empty schema
			const { sqlStatements } = await push({ db, dsqlDb, to: {} });

			expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
			expect(sqlStatements.some((s) => s.includes('DROP TABLE'))).toBe(true);

			// Verify table is gone
			schema = await fromDatabase(db, () => true);
			({ ddl } = interimToDDL(schema));
			expect(ddl.tables.one({ name: tableName })).toBeNull();
		} finally {
			// Cleanup in case test failed
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Indexes', () => {
	test('push creates index', async () => {
		const tableName = _.uniqueName('push_idx');
		const indexName = _.uniqueName('email_idx');

		const to = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [index(indexName).on(t.email)],
			),
		};

		try {
			// Push helper waits for async index and verifies idempotency
			const { sqlStatements } = await push({ db, dsqlDb, to });

			// Should have CREATE TABLE and CREATE INDEX
			expect(sqlStatements.length).toBeGreaterThanOrEqual(1);

			// Verify index exists via introspection
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const indexes = ddl.indexes.list({ table: tableName });
			const emailIdx = indexes.find((i) => i.name === indexName);
			expect(emailIdx).toBeTruthy();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push creates unique index', async () => {
		const tableName = _.uniqueName('push_uniq_idx');
		const indexName = _.uniqueName('email_uniq_idx');

		const to = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [uniqueIndex(indexName).on(t.email)],
			),
		};

		try {
			// Push helper waits for async index and verifies idempotency
			await push({ db, dsqlDb, to });

			// Verify unique index exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const indexes = ddl.indexes.list({ table: tableName });
			const emailIdx = indexes.find((i) => i.name === indexName);
			expect(emailIdx).toBeTruthy();
			expect(emailIdx?.isUnique).toBe(true);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push adds index to existing table', async () => {
		const tableName = _.uniqueName('push_add_idx');
		const indexName = _.uniqueName('new_idx');

		// Initial schema without index
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		// Updated schema with index
		const updated = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					name: text('name').notNull(),
				},
				(t) => [index(indexName).on(t.name)],
			),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial });

			// Add index (push helper waits for async index and verifies idempotency)
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.length).toBeGreaterThanOrEqual(1);
			expect(sqlStatements.some((s) => s.includes('CREATE INDEX'))).toBe(true);

			// Verify index exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const idx = ddl.indexes.one({ name: indexName });
			expect(idx).toBeTruthy();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Constraints', () => {
	test('push creates table with unique constraint', async () => {
		const tableName = _.uniqueName('push_uniq_const');

		const to = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull().unique(),
			}),
		};

		try {
			await push({ db, dsqlDb, to });

			// Verify unique constraint exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const uniques = ddl.uniques.list({ table: tableName });
			expect(uniques.length).toBeGreaterThan(0);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push creates table with check constraint', async () => {
		const tableName = _.uniqueName('push_check');

		const to = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					age: integer('age'),
				},
				(t) => [check('age_check', sql`${t.age} >= 0`)],
			),
		};

		try {
			await push({ db, dsqlDb, to });

			// Verify check constraint exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const checks = ddl.checks.list({ table: tableName });
			expect(checks.length).toBeGreaterThan(0);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push creates table with composite primary key', async () => {
		const tableName = _.uniqueName('push_comp_pk');

		const to = {
			userRoles: dsqlTable(
				tableName,
				{
					userId: uuid('user_id').notNull(),
					roleId: uuid('role_id').notNull(),
					grantedAt: timestamp('granted_at').defaultNow(),
				},
				(t) => [primaryKey({ columns: [t.userId, t.roleId] })],
			),
		};

		try {
			await push({ db, dsqlDb, to });

			// Verify composite PK exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const pk = ddl.pks.one({ table: tableName });
			expect(pk).toBeTruthy();
			expect(pk?.columns).toContain('user_id');
			expect(pk?.columns).toContain('role_id');
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Schemas', () => {
	test('push creates table in custom schema', async () => {
		const schemaName = _.uniqueName('push_schema');
		const tableName = _.uniqueName('push_schema_tbl');

		const testSchema = dsqlSchema(schemaName);
		const to = {
			testSchema,
			users: testSchema.table(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		try {
			await push({ db, dsqlDb, to });

			// Verify schema and table exist
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);

			const schemaExists = ddl.schemas.one({ name: schemaName });
			expect(schemaExists).toBeTruthy();

			const table = ddl.tables.one({ schema: schemaName, name: tableName });
			expect(table).toBeTruthy();
		} finally {
			await cleanupSchema(dsqlDb, schemaName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Column Modifications', () => {
	// DSQL does not support ALTER COLUMN SET DATA TYPE - throws an error
	test('push alters column type throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('push_alter_type');

		// Initial schema with integer
		const initial = {
			orders: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				quantity: integer('quantity'),
			}),
		};

		// Updated schema with numeric
		const updated = {
			orders: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				quantity: numeric('quantity', { precision: 10, scale: 2 }),
			}),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Alter column type should throw
			await expect(push({ db, dsqlDb, to: updated, ignoreSubsequent: true })).rejects.toThrow(
				'DSQL does not support',
			);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	// DSQL does not support ALTER COLUMN SET NOT NULL - throws an error
	test('push adds not null constraint throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('push_add_notnull');

		// Initial schema with nullable column
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		// Updated schema with not null
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			}),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Alter to not null should throw
			await expect(push({ db, dsqlDb, to: updated, ignoreSubsequent: true })).rejects.toThrow(
				'DSQL does not support',
			);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push adds default value', async () => {
		const tableName = _.uniqueName('push_add_def');

		// Initial schema without default
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active'),
			}),
		};

		// Updated schema with default
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active').default(true),
			}),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial });

			// Add default
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.some((s) => s.includes('SET DEFAULT'))).toBe(true);

			// Verify default exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const activeCol = ddl.columns.one({ table: tableName, name: 'active' });
			expect(activeCol?.default).toBe('true');
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push drops default value and not null', async () => {
		const tableName = _.uniqueName('push_drop_def');

		// Initial schema with default and not null
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active').notNull().default(true),
			}),
		};

		// Updated schema without default and not null
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				active: boolean('active'),
			}),
		};

		try {
			// Create initial table
			await push({ db, dsqlDb, to: initial });

			// Drop default and not null
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.some((s) => s.includes('DROP DEFAULT'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('DROP NOT NULL'))).toBe(true);

			// Verify column is nullable with no default
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const activeCol = ddl.columns.one({ table: tableName, name: 'active' });
			expect(activeCol?.default).toBeNull();
			expect(activeCol?.notNull).toBe(false);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Full Workflow', () => {
	// This test exercises only operations that DSQL actually supports:
	// - CREATE TABLE with all constraints
	// - ADD COLUMN without constraints (nullable, no default)
	// - CREATE INDEX ASYNC
	// - DROP INDEX
	// - DROP TABLE
	// Note: DSQL does NOT support ALTER COLUMN SET NOT NULL or SET DATA TYPE!
	test('complete schema lifecycle (DSQL-compatible operations)', async () => {
		const tableName = _.uniqueName('push_lifecycle');
		const indexName = _.uniqueName('lifecycle_idx');

		try {
			// Step 1: Create initial table with all desired columns and constraints upfront
			// DSQL supports most constraints only in CREATE TABLE, not in ALTER TABLE
			const v1 = {
				users: dsqlTable(tableName, {
					id: uuid('id').primaryKey().defaultRandom(),
					name: text('name').notNull(),
					email: varchar('email', { length: 255 }),
				}),
			};

			await push({ db, dsqlDb, to: v1 });

			let schema = await fromDatabase(db, () => true);
			let { ddl } = interimToDDL(schema);
			expect(ddl.tables.one({ name: tableName })).toBeTruthy();
			expect(ddl.columns.list({ table: tableName })).toHaveLength(3);

			// Step 2: Add index (push helper waits for async index and verifies idempotency)
			const v2 = {
				users: dsqlTable(
					tableName,
					{
						id: uuid('id').primaryKey().defaultRandom(),
						name: text('name').notNull(),
						email: varchar('email', { length: 255 }),
					},
					(t) => [index(indexName).on(t.email)],
				),
			};

			await push({ db, dsqlDb, to: v2 });

			schema = await fromDatabase(db, () => true);
			({ ddl } = interimToDDL(schema));
			const idx = ddl.indexes.list({ table: tableName }).find((i) => i.name === indexName);
			expect(idx).toBeTruthy();

			// Step 3: Drop the index (DSQL supports DROP INDEX)
			const v3 = {
				users: dsqlTable(tableName, {
					id: uuid('id').primaryKey().defaultRandom(),
					name: text('name').notNull(),
					email: varchar('email', { length: 255 }),
				}),
			};

			await push({ db, dsqlDb, to: v3 });

			schema = await fromDatabase(db, () => true);
			({ ddl } = interimToDDL(schema));
			// Verify index is dropped
			const droppedIdx = ddl.indexes.list({ table: tableName }).find((i) => i.name === indexName);
			expect(droppedIdx).toBeFalsy();

			// Step 4: Verify DROP TABLE works by pushing empty schema
			await push({ db, dsqlDb, to: {} });

			schema = await fromDatabase(db, () => true);
			({ ddl } = interimToDDL(schema));
			expect(ddl.tables.one({ name: tableName })).toBeNull();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	// Test that DSQL properly rejects ADD COLUMN with constraints
	test('add column with default throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('push_add_col_def');

		// Initial table
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		// Try to add column with default
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
				createdAt: timestamp('created_at').defaultNow(),
			}),
		};

		try {
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Adding column with DEFAULT should throw
			await expect(push({ db, dsqlDb, to: updated, ignoreSubsequent: true })).rejects.toThrow(
				'DSQL does not support',
			);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	// Test that DSQL properly rejects ADD COLUMN with NOT NULL
	test('add column with not null throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('push_add_col_nn');

		// Initial table
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		// Try to add a not null column
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
				email: text('email').notNull(),
			}),
		};

		try {
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Adding column with NOT NULL should throw
			await expect(push({ db, dsqlDb, to: updated, ignoreSubsequent: true })).rejects.toThrow(
				'DSQL does not support',
			);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Schema-Qualified Operations', () => {
	test('push creates index in non-public schema', async () => {
		const schemaName = _.uniqueName('idx_schema');
		const tableName = _.uniqueName('idx_tbl');
		const indexName = _.uniqueName('schema_idx');

		const testSchema = dsqlSchema(schemaName);
		const to = {
			testSchema,
			users: testSchema.table(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [index(indexName).on(t.email)],
			),
		};

		try {
			// Push helper waits for async index and verifies idempotency
			const { sqlStatements } = await push({ db, dsqlDb, to });

			expect(sqlStatements.length).toBeGreaterThan(0);
			expect(sqlStatements.some((s) => s.includes('CREATE INDEX ASYNC'))).toBe(true);

			// Verify index exists in the correct schema
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const idx = ddl.indexes.one({ schema: schemaName, name: indexName });
			expect(idx).toBeTruthy();
			expect(idx?.table).toBe(tableName);
		} finally {
			await cleanupSchema(dsqlDb, schemaName);
		}
	});

	test('push drops index in non-public schema', async () => {
		const schemaName = _.uniqueName('drop_idx_schema');
		const tableName = _.uniqueName('drop_idx_tbl');
		const indexName = _.uniqueName('drop_schema_idx');

		const testSchema = dsqlSchema(schemaName);

		// Initial schema with index
		const initial = {
			testSchema,
			users: testSchema.table(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [index(indexName).on(t.email)],
			),
		};

		// Updated schema without index
		const updated = {
			testSchema,
			users: testSchema.table(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull(),
			}),
		};

		try {
			// Create table with index (push helper waits for async index)
			await push({ db, dsqlDb, to: initial });

			// Verify index exists
			let schema = await fromDatabase(db, () => true);
			let { ddl } = interimToDDL(schema);
			expect(ddl.indexes.one({ schema: schemaName, name: indexName })).toBeTruthy();

			// Drop index
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.length).toBeGreaterThan(0);
			expect(sqlStatements.some((s) => s.includes('DROP INDEX'))).toBe(true);
			// Verify DROP INDEX uses schema-qualified name
			expect(sqlStatements.some((s) => s.includes(`"${schemaName}"."${indexName}"`))).toBe(true);

			// Verify index is gone
			schema = await fromDatabase(db, () => true);
			({ ddl } = interimToDDL(schema));
			expect(ddl.indexes.one({ schema: schemaName, name: indexName })).toBeNull();
		} finally {
			await cleanupSchema(dsqlDb, schemaName);
		}
	});

	test('push creates unique index in non-public schema', async () => {
		const schemaName = _.uniqueName('uniq_schema');
		const tableName = _.uniqueName('uniq_tbl');
		const indexName = _.uniqueName('uniq_schema_idx');

		const testSchema = dsqlSchema(schemaName);
		const to = {
			testSchema,
			users: testSchema.table(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
				},
				(t) => [uniqueIndex(indexName).on(t.email)],
			),
		};

		try {
			// Push helper waits for async index and verifies idempotency
			await push({ db, dsqlDb, to });

			// Verify unique index exists in the correct schema
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const idx = ddl.indexes.one({ schema: schemaName, name: indexName });
			expect(idx).toBeTruthy();
			expect(idx?.isUnique).toBe(true);
		} finally {
			await cleanupSchema(dsqlDb, schemaName);
		}
	});
});

/**
 * Helper to cleanup sequences
 */
const cleanupSequence = async (dsqlDb: DSQLDatabase<any>, seqName: string, schema = 'public') => {
	try {
		if (schema !== 'public') {
			await dsqlDb.execute(sql`DROP SEQUENCE IF EXISTS ${sql.identifier(schema)}.${sql.identifier(seqName)}`);
		} else {
			await dsqlDb.execute(sql`DROP SEQUENCE IF EXISTS ${sql.identifier(seqName)}`);
		}
	} catch (e) {
		console.warn(`Failed to cleanup sequence ${schema}.${seqName}:`, e);
	}
};

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Sequences', () => {
	test('push creates sequence with default cache (65536)', async () => {
		const seqName = _.uniqueName('push_seq_default');

		const to = {
			mySeq: dsqlSequence(seqName),
		};

		try {
			const { sqlStatements } = await push({ db, dsqlDb, to, ignoreSubsequent: true });

			// Verify CREATE SEQUENCE was issued with correct CACHE
			expect(sqlStatements.some((s) => s.includes('CREATE SEQUENCE'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('CACHE 65536'))).toBe(true);

			// Verify sequence exists via introspection
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.cacheSize).toBe(65536);
		} finally {
			await cleanupSequence(dsqlDb, seqName);
		}
	});

	test('push creates sequence with cache = 1', async () => {
		const seqName = _.uniqueName('push_seq_cache1');

		const to = {
			mySeq: dsqlSequence(seqName, { cache: 1 }),
		};

		try {
			const { sqlStatements } = await push({ db, dsqlDb, to, ignoreSubsequent: true });

			expect(sqlStatements.some((s) => s.includes('CREATE SEQUENCE'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('CACHE 1'))).toBe(true);

			// Verify sequence exists with cache = 1
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.cacheSize).toBe(1);
		} finally {
			await cleanupSequence(dsqlDb, seqName);
		}
	});

	test('push creates sequence with all options', async () => {
		const seqName = _.uniqueName('push_seq_full');

		const to = {
			mySeq: dsqlSequence(seqName, {
				startWith: 100,
				increment: 5,
				minValue: 1,
				maxValue: 10000,
				cache: 65536,
				cycle: false,
			}),
		};

		try {
			const { sqlStatements } = await push({ db, dsqlDb, to, ignoreSubsequent: true });

			expect(sqlStatements.some((s) => s.includes('CREATE SEQUENCE'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('INCREMENT BY 5'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('START WITH 100'))).toBe(true);

			// Verify sequence exists with correct options
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.incrementBy).toBe('5');
			expect(seq?.startWith).toBe('100');
		} finally {
			await cleanupSequence(dsqlDb, seqName);
		}
	});

	test('push drops sequence', async () => {
		const seqName = _.uniqueName('push_seq_drop');

		// First create the sequence
		await dsqlDb.execute(sql`CREATE SEQUENCE ${sql.identifier(seqName)} CACHE 65536`);

		// Then push empty schema to drop it
		const to = {};

		try {
			const { sqlStatements } = await push({ db, dsqlDb, to, ignoreSubsequent: true });

			expect(sqlStatements.some((s) => s.includes('DROP SEQUENCE'))).toBe(true);

			// Verify sequence no longer exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeFalsy();
		} finally {
			await cleanupSequence(dsqlDb, seqName);
		}
	});

	test('sequence nextval works', async () => {
		const seqName = _.uniqueName('push_seq_nextval');

		const to = {
			mySeq: dsqlSequence(seqName, { startWith: 1, increment: 1, cache: 1 }),
		};

		try {
			await push({ db, dsqlDb, to, ignoreSubsequent: true });

			// Call nextval and verify it returns values
			const result1 = await dsqlDb.execute(sql`SELECT nextval(${seqName})`);
			const val1 = (result1 as any).rows[0].nextval;
			expect(Number(val1)).toBe(1);

			const result2 = await dsqlDb.execute(sql`SELECT nextval(${seqName})`);
			const val2 = (result2 as any).rows[0].nextval;
			expect(Number(val2)).toBe(2);
		} finally {
			await cleanupSequence(dsqlDb, seqName);
		}
	});

	test('push creates sequence in custom schema', async () => {
		const schemaName = _.uniqueName('seq_schema');
		const seqName = _.uniqueName('push_seq_schema');

		const testSchema = dsqlSchema(schemaName);
		const to = {
			testSchema,
			mySeq: testSchema.sequence(seqName),
		};

		try {
			const { sqlStatements } = await push({ db, dsqlDb, to, ignoreSubsequent: true });

			expect(sqlStatements.some((s) => s.includes('CREATE SCHEMA'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('CREATE SEQUENCE'))).toBe(true);

			// Verify sequence exists in the correct schema
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const seq = ddl.sequences.one({ schema: schemaName, name: seqName });
			expect(seq).toBeTruthy();
		} finally {
			await cleanupSchema(dsqlDb, schemaName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Foreign Keys', () => {
	test('push creates tables with foreign key', async () => {
		const usersTable = _.uniqueName('push_fk_users');
		const postsTable = _.uniqueName('push_fk_posts');

		const users = dsqlTable(usersTable, {
			id: uuid('id').primaryKey().defaultRandom(),
		});
		const posts = dsqlTable(postsTable, {
			id: uuid('id').primaryKey().defaultRandom(),
			userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
		});

		try {
			// Push helper verifies idempotency
			const { sqlStatements } = await push({ db, dsqlDb, to: { users, posts } });

			expect(sqlStatements.some((s) => s.includes('FOREIGN KEY') && s.includes('NOT VALID'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('ALTER TABLE ASYNC') && s.includes('VALIDATE CONSTRAINT'))).toBe(
				true,
			);

			// Verify foreign key exists via introspection
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const fks = ddl.fks.list({ table: postsTable });
			expect(fks).toHaveLength(1);
			expect(fks[0]?.tableTo).toBe(usersTable);
			expect(fks[0]?.columns).toStrictEqual(['user_id']);
			expect(fks[0]?.columnsTo).toStrictEqual(['id']);
			expect(fks[0]?.onDelete).toBe('CASCADE');
		} finally {
			await cleanupTable(dsqlDb, postsTable);
			await cleanupTable(dsqlDb, usersTable);
		}
	});

	test('foreign key is enforced', async () => {
		const usersTable = _.uniqueName('push_fk_enf_users');
		const postsTable = _.uniqueName('push_fk_enf_posts');

		const users = dsqlTable(usersTable, {
			id: uuid('id').primaryKey().defaultRandom(),
		});
		const posts = dsqlTable(postsTable, {
			id: uuid('id').primaryKey().defaultRandom(),
			userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
		});

		try {
			await push({ db, dsqlDb, to: { users, posts }, ignoreSubsequent: true });

			// Rows referencing a missing parent are rejected
			await expect(
				dsqlDb.execute(sql`INSERT INTO ${posts} (user_id) VALUES (gen_random_uuid())`),
			).rejects.toThrow();

			// ON DELETE CASCADE removes child rows
			const [user] = (await dsqlDb.execute(sql`INSERT INTO ${users} DEFAULT VALUES RETURNING id`) as any).rows;
			await dsqlDb.execute(sql`INSERT INTO ${posts} (user_id) VALUES (${user.id})`);
			await dsqlDb.execute(sql`DELETE FROM ${users} WHERE id = ${user.id}`);

			const remaining = await dsqlDb.execute(sql`SELECT count(*)::int AS count FROM ${posts}`);
			expect((remaining as any).rows[0].count).toBe(0);
		} finally {
			await cleanupTable(dsqlDb, postsTable);
			await cleanupTable(dsqlDb, usersTable);
		}
	});

	test('push creates composite and self-referencing foreign keys', async () => {
		const ordersTable = _.uniqueName('push_fk_orders');
		const itemsTable = _.uniqueName('push_fk_items');

		const orders = dsqlTable(
			ordersTable,
			{
				region: text('region').notNull(),
				orderNo: integer('order_no').notNull(),
			},
			(t) => [primaryKey({ columns: [t.region, t.orderNo] })],
		);
		const items = dsqlTable(
			itemsTable,
			{
				id: uuid('id').primaryKey().defaultRandom(),
				parentId: uuid('parent_id'),
				region: text('region'),
				orderNo: integer('order_no'),
			},
			(t) => [
				foreignKey({ columns: [t.region, t.orderNo], foreignColumns: [orders.region, orders.orderNo] }),
				foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }),
			],
		);

		try {
			// Push helper verifies idempotency
			await push({ db, dsqlDb, to: { orders, items } });

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const fks = ddl.fks.list({ table: itemsTable });
			expect(fks).toHaveLength(2);
			expect(fks.find((fk) => fk.tableTo === ordersTable)?.columns).toStrictEqual(['region', 'order_no']);
			expect(fks.find((fk) => fk.tableTo === itemsTable)?.columns).toStrictEqual(['parent_id']);
		} finally {
			await cleanupTable(dsqlDb, itemsTable);
			await cleanupTable(dsqlDb, ordersTable);
		}
	});

	test('push adds and drops foreign key on existing table', async () => {
		const usersTable = _.uniqueName('push_fk_add_users');
		const postsTable = _.uniqueName('push_fk_add_posts');

		const users = dsqlTable(usersTable, {
			id: uuid('id').primaryKey().defaultRandom(),
		});
		const withoutFk = {
			users,
			posts: dsqlTable(postsTable, {
				id: uuid('id').primaryKey().defaultRandom(),
				userId: uuid('user_id'),
			}),
		};
		const withFk = {
			users,
			posts: dsqlTable(postsTable, {
				id: uuid('id').primaryKey().defaultRandom(),
				userId: uuid('user_id').references(() => users.id),
			}),
		};

		try {
			await push({ db, dsqlDb, to: withoutFk });

			// Add foreign key (push helper verifies idempotency)
			const { sqlStatements: added } = await push({ db, dsqlDb, to: withFk });
			expect(added.some((s) => s.includes('ADD CONSTRAINT') && s.includes('NOT VALID'))).toBe(true);

			let schema = await fromDatabase(db, () => true);
			let { ddl } = interimToDDL(schema);
			expect(ddl.fks.list({ table: postsTable })).toHaveLength(1);

			// Drop foreign key
			const { sqlStatements: dropped } = await push({ db, dsqlDb, to: withoutFk });
			expect(dropped.some((s) => s.includes('DROP CONSTRAINT'))).toBe(true);

			schema = await fromDatabase(db, () => true);
			({ ddl } = interimToDDL(schema));
			expect(ddl.fks.list({ table: postsTable })).toHaveLength(0);
		} finally {
			await cleanupTable(dsqlDb, postsTable);
			await cleanupTable(dsqlDb, usersTable);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Check Constraints', () => {
	test('push adds check constraint to existing table', async () => {
		const tableName = _.uniqueName('push_check_add');

		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				age: integer('age'),
			}),
		};

		const updated = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					age: integer('age'),
				},
				(t) => [check('age_check', sql`${t.age} >= 0`)],
			),
		};

		try {
			await push({ db, dsqlDb, to: initial });

			// Push helper verifies idempotency while the constraint may still be NOT VALID
			const { sqlStatements } = await push({ db, dsqlDb, to: updated });

			expect(sqlStatements.some((s) => s.includes('CHECK') && s.includes('NOT VALID'))).toBe(true);
			expect(sqlStatements.some((s) => s.includes('VALIDATE CONSTRAINT "age_check"'))).toBe(true);

			// Verify check constraint exists
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const checks = ddl.checks.list({ table: tableName });
			expect(checks).toHaveLength(1);
			expect(checks[0]?.value).toBe('(age >= 0)');

			// New rows are checked immediately
			await expect(dsqlDb.execute(sql`INSERT INTO ${sql.identifier(tableName)} (age) VALUES (-1)`)).rejects
				.toThrow();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Identity Columns', () => {
	test('push creates table with identity column', async () => {
		const tableName = _.uniqueName('push_ident');

		const to = {
			users: dsqlTable(tableName, {
				id: bigint('id').primaryKey().generatedAlwaysAsIdentity(),
				name: text('name'),
			}),
		};

		try {
			// Push helper verifies idempotency
			const { sqlStatements } = await push({ db, dsqlDb, to });

			expect(sqlStatements.some((s) => s.includes('GENERATED ALWAYS AS IDENTITY'))).toBe(true);

			// Verify identity column via introspection
			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const idCol = ddl.columns.one({ table: tableName, name: 'id' });
			expect(idCol?.identity?.type).toBe('always');
			expect(idCol?.identity?.cache).toBe(65536);

			// The identity sequence is not introspected as a standalone sequence
			expect(ddl.sequences.list().some((seq) => seq.name === idCol?.identity?.name)).toBe(false);

			// Values are generated on insert
			const result = await dsqlDb.execute(
				sql`INSERT INTO ${sql.identifier(tableName)} (name) VALUES ('a') RETURNING id`,
			);
			expect(Number((result as any).rows[0].id)).toBeGreaterThan(0);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push creates identity column with options', async () => {
		const tableName = _.uniqueName('push_ident_opts');

		const to = {
			users: dsqlTable(tableName, {
				id: bigint('id').primaryKey().generatedByDefaultAsIdentity({ startWith: 100, increment: 5, cache: 1 }),
			}),
		};

		try {
			// Push helper verifies idempotency
			await push({ db, dsqlDb, to });

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const idCol = ddl.columns.one({ table: tableName, name: 'id' });
			expect(idCol?.identity?.type).toBe('byDefault');
			expect(idCol?.identity?.startWith).toBe('100');
			expect(idCol?.identity?.increment).toBe('5');
			expect(idCol?.identity?.cache).toBe(1);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push alters and drops identity', async () => {
		const tableName = _.uniqueName('push_ident_alter');

		const v1 = {
			users: dsqlTable(tableName, {
				id: bigint('id').primaryKey().generatedAlwaysAsIdentity(),
			}),
		};
		const v2 = {
			users: dsqlTable(tableName, {
				id: bigint('id').primaryKey().generatedByDefaultAsIdentity(),
			}),
		};
		const v3 = {
			users: dsqlTable(tableName, {
				id: bigint('id').primaryKey(),
			}),
		};

		try {
			await push({ db, dsqlDb, to: v1 });

			const { sqlStatements: altered } = await push({ db, dsqlDb, to: v2 });
			expect(altered.some((s) => s.includes('SET GENERATED BY DEFAULT'))).toBe(true);

			const { sqlStatements: dropped } = await push({ db, dsqlDb, to: v3 });
			expect(dropped.some((s) => s.includes('DROP IDENTITY'))).toBe(true);

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			expect(ddl.columns.one({ table: tableName, name: 'id' })?.identity).toBeNull();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push adds identity to existing NOT NULL column', async () => {
		const tableName = _.uniqueName('push_ident_add');

		const v1 = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				seq: bigint('seq').notNull(),
			}),
		};
		const v2 = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				seq: bigint('seq').generatedAlwaysAsIdentity(),
			}),
		};

		try {
			await push({ db, dsqlDb, to: v1 });

			// Push helper verifies idempotency
			const { sqlStatements } = await push({ db, dsqlDb, to: v2 });
			expect(sqlStatements.some((s) => s.includes('ADD GENERATED ALWAYS AS IDENTITY'))).toBe(true);

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const seqCol = ddl.columns.one({ table: tableName, name: 'seq' });
			expect(seqCol?.identity?.type).toBe('always');
			expect(seqCol?.identity?.cache).toBe(65536);
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Column Types', () => {
	test('push creates json and jsonb columns', async () => {
		const tableName = _.uniqueName('push_json');

		const to = {
			docs: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				data: json('data'),
				metadata: jsonb('metadata').default({ enabled: true }),
			}),
		};

		try {
			// Push helper verifies idempotency
			await push({ db, dsqlDb, to });

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			expect(ddl.columns.one({ table: tableName, name: 'data' })?.type).toBe('json');
			expect(ddl.columns.one({ table: tableName, name: 'metadata' })?.type).toBe('jsonb');
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});

	test('push drops generated expression', async () => {
		const tableName = _.uniqueName('push_drop_expr');

		const initial = {
			items: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				price: integer('price'),
				total: integer('total').generatedAlwaysAs(sql`price * 2`),
			}),
		};

		const updated = {
			items: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				price: integer('price'),
				total: integer('total'),
			}),
		};

		try {
			await push({ db, dsqlDb, to: initial });

			const { sqlStatements } = await push({ db, dsqlDb, to: updated });
			expect(sqlStatements.some((s) => s.includes('DROP EXPRESSION'))).toBe(true);

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			expect(ddl.columns.one({ table: tableName, name: 'total' })?.generated).toBeNull();
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Push - Expression and Partial Indexes', () => {
	test('push creates expression and partial indexes', async () => {
		const tableName = _.uniqueName('push_expr_idx');
		const exprIndexName = _.uniqueName('lower_email_idx');
		const partialIndexName = _.uniqueName('active_email_idx');

		const to = {
			users: dsqlTable(
				tableName,
				{
					id: uuid('id').primaryKey().defaultRandom(),
					email: text('email').notNull(),
					active: boolean('active'),
				},
				(t) => [
					index(exprIndexName).on(sql`lower(${t.email})`),
					index(partialIndexName).on(t.email).where(sql`${t.active} = true`),
				],
			),
		};

		try {
			// Push helper waits for async index and verifies idempotency
			await push({ db, dsqlDb, to });

			const schema = await fromDatabase(db, () => true);
			const { ddl } = interimToDDL(schema);
			const exprIdx = ddl.indexes.one({ name: exprIndexName });
			expect(exprIdx?.columns[0]?.isExpression).toBe(true);
			const partialIdx = ddl.indexes.one({ name: partialIndexName });
			expect(partialIdx?.where).toBe('(active = true)');
		} finally {
			await cleanupTable(dsqlDb, tableName);
		}
	});
});
