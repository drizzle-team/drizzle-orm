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
 * - No foreign keys, enums, sequences, or policies
 *
 * Required environment variable:
 *   DSQL_CLUSTER_ENDPOINT - The full DSQL cluster endpoint (e.g., "abc123.dsql.us-west-2.on.aws")
 */

import { sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import {
	boolean,
	check,
	dsqlSchema,
	dsqlTable,
	index,
	integer,
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

	// DSQL does not support DROP COLUMN - throws an error
	test('push drops column throws error (unsupported in DSQL)', async () => {
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
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Drop column should throw
			await expect(push({ db, dsqlDb, to: updated, ignoreSubsequent: true })).rejects.toThrow(
				'DSQL does not support',
			);
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

	// DSQL does not support ALTER COLUMN SET DEFAULT - throws an error
	test('push adds default value throws error (unsupported in DSQL)', async () => {
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
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Add default should throw
			await expect(push({ db, dsqlDb, to: updated, ignoreSubsequent: true })).rejects.toThrow(
				'DSQL does not support',
			);
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
	// Note: DSQL does NOT support ALTER COLUMN or DROP COLUMN!
	test('complete schema lifecycle (DSQL-compatible operations)', async () => {
		const tableName = _.uniqueName('push_lifecycle');
		const indexName = _.uniqueName('lifecycle_idx');

		try {
			// Step 1: Create initial table with all desired columns and constraints upfront
			// DSQL supports constraints only in CREATE TABLE, not in ALTER TABLE
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

	// Test that DSQL properly rejects DROP COLUMN
	test('drop column throws error (unsupported in DSQL)', async () => {
		const tableName = _.uniqueName('push_drop_col2');

		// Initial table with two columns
		const initial = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
				email: text('email'),
			}),
		};

		// Try to drop a column
		const updated = {
			users: dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}),
		};

		try {
			await push({ db, dsqlDb, to: initial, ignoreSubsequent: true });

			// Dropping column should throw
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
