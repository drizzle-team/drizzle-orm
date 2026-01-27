/**
 * DSQL Introspection Tests
 *
 * Tests that verify drizzle-kit can correctly introspect a DSQL database.
 * These tests run against a real DSQL cluster.
 *
 * Required environment variable:
 *   DSQL_CLUSTER_ID - The DSQL cluster ID (e.g., "abc123def456")
 *
 * The tests will:
 * 1. Create tables with various features (columns, indexes, constraints)
 * 2. Run introspection
 * 3. Verify the introspected schema matches what was created
 * 4. Clean up
 *
 * Note: DSQL has limitations compared to PostgreSQL:
 * - No foreign keys
 * - Only btree indexes (no hash, gin, gist)
 * - No enums
 * - No sequences (use uuid with gen_random_uuid())
 * - JSON functions work at runtime but JSON cannot be a column type
 */

import { sql } from 'drizzle-orm';
import { drizzle, type DSQLDatabase } from 'drizzle-orm/dsql';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { fromDatabase } from '../../src/dialects/dsql/introspect';
import { interimToDDL } from '../../src/dialects/postgres/ddl';
import type { DB } from '../../src/utils';

const ENABLE_LOGGING = false;

let dsqlDb: DSQLDatabase<any>;
let db: DB;

// Generate unique names to avoid conflicts between test runs
const testRunId = Math.random().toString(36).substring(2, 8);
const uniqueName = (base: string) => `${base}_${testRunId}`;

// Simple retry helper
async function retry<T>(fn: () => Promise<T>, maxRetries = 20, delay = 250): Promise<T> {
	let lastError: Error | undefined;
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (e) {
			lastError = e as Error;
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastError;
}

beforeAll(async () => {
	const clusterId = process.env['DSQL_CLUSTER_ID'];
	if (!clusterId) {
		throw new Error('DSQL_CLUSTER_ID environment variable is required');
	}

	dsqlDb = await retry(async () => {
		const database = drizzle({
			connection: {
				host: `${clusterId}.dsql.us-west-2.on.aws`,
			},
			logger: ENABLE_LOGGING,
		});
		await database.execute(sql`SELECT 1`);
		return database;
	});

	// Create DB adapter for drizzle-kit introspection
	db = {
		query: async <T>(sqlStr: string, params?: any[]): Promise<T[]> => {
			const result = await dsqlDb.execute(sql.raw(sqlStr));
			return (result as any).rows as T[];
		},
	};
});

afterAll(async () => {
	// Cleanup is handled per-test
});

describe('DSQL introspection', () => {
	test('introspect basic table', async () => {
		const tableName = uniqueName('basic_table');

		// Create table
		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name text NOT NULL,
				email text,
				created_at timestamptz DEFAULT now()
			)
		`);

		try {
			// Introspect
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Find our table
			const table = ddl.tables.one({ name: tableName });
			expect(table).toBeTruthy();
			expect(table?.schema).toBe('public');

			// Check columns
			const columns = ddl.columns.list({ table: tableName });
			expect(columns).toHaveLength(4);

			const idCol = columns.find((c) => c.name === 'id');
			expect(idCol).toBeTruthy();
			expect(idCol?.type).toBe('uuid');
			expect(idCol?.notNull).toBe(true);

			const nameCol = columns.find((c) => c.name === 'name');
			expect(nameCol).toBeTruthy();
			expect(nameCol?.type).toBe('text');
			expect(nameCol?.notNull).toBe(true);

			const emailCol = columns.find((c) => c.name === 'email');
			expect(emailCol).toBeTruthy();
			expect(emailCol?.notNull).toBe(false);

			// Check primary key
			const pk = ddl.pks.one({ table: tableName });
			expect(pk).toBeTruthy();
			expect(pk?.columns).toContain('id');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with index', async () => {
		const tableName = uniqueName('indexed_table');
		const indexName = uniqueName('name_idx');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name text NOT NULL
			)
		`);

		// DSQL requires ASYNC index creation
		await dsqlDb.execute(sql.raw(
			`CREATE INDEX ASYNC "${indexName}" ON "${tableName}" (name)`,
		));

		// Wait for index to be created
		await new Promise((r) => setTimeout(r, 2000));

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Find index (excluding PK-backing indexes)
			const indexes = ddl.indexes.list({ table: tableName });
			const idx = indexes.find((i) => i.name === indexName);
			expect(idx).toBeTruthy();
			expect(idx?.isUnique).toBe(false);
			expect(idx?.method).toBe('btree');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with unique constraint', async () => {
		const tableName = uniqueName('unique_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				email text NOT NULL UNIQUE
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const uniques = ddl.uniques.list({ table: tableName });
			expect(uniques.length).toBeGreaterThan(0);

			const emailUnique = uniques.find((u) => u.columns.includes('email'));
			expect(emailUnique).toBeTruthy();
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	// Note: DSQL does not support foreign keys
	// test('introspect table with foreign key', ...) is skipped

	test('introspect table with check constraint', async () => {
		const tableName = uniqueName('check_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				age integer CHECK (age >= 0)
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const checks = ddl.checks.list({ table: tableName });
			expect(checks.length).toBeGreaterThan(0);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table in custom schema', async () => {
		const schemaName = uniqueName('test_schema');
		const tableName = uniqueName('schema_table');

		await dsqlDb.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schemaName)}`);
		await dsqlDb.execute(sql.raw(
			`CREATE TABLE "${schemaName}"."${tableName}" (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name text NOT NULL
			)`,
		));

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Check schema exists
			const schemas = ddl.schemas.list();
			const testSchema = schemas.find((s) => s.name === schemaName);
			expect(testSchema).toBeTruthy();

			// Check table in schema
			const table = ddl.tables.one({ schema: schemaName, name: tableName });
			expect(table).toBeTruthy();
		} finally {
			await dsqlDb.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`);
		}
	});

	// Note: DSQL only supports btree indexes, hash indexes are not supported
	// test('introspect hash index', ...) is skipped

	test('introspect table with multiple column types', async () => {
		const tableName = uniqueName('types_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name varchar(255) NOT NULL,
				description text,
				count integer DEFAULT 0,
				amount numeric(10, 2),
				is_active boolean DEFAULT true,
				created_at timestamptz DEFAULT now(),
				updated_at timestamp
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const columns = ddl.columns.list({ table: tableName });
			expect(columns.length).toBe(8);

			// Check various column types
			const nameCol = columns.find((c) => c.name === 'name');
			expect(nameCol?.type).toBe('varchar(255)');

			const countCol = columns.find((c) => c.name === 'count');
			expect(countCol?.type).toBe('integer');

			const amountCol = columns.find((c) => c.name === 'amount');
			expect(amountCol?.type).toBe('numeric(10,2)');

			const isActiveCol = columns.find((c) => c.name === 'is_active');
			expect(isActiveCol?.type).toBe('boolean');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with composite primary key', async () => {
		const tableName = uniqueName('composite_pk_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				tenant_id uuid NOT NULL,
				user_id uuid NOT NULL,
				role text NOT NULL,
				PRIMARY KEY (tenant_id, user_id)
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const pk = ddl.pks.one({ table: tableName });
			expect(pk).toBeTruthy();
			expect(pk?.columns).toContain('tenant_id');
			expect(pk?.columns).toContain('user_id');
			expect(pk?.columns).toHaveLength(2);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with composite unique constraint', async () => {
		const tableName = uniqueName('composite_unique_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				tenant_id uuid NOT NULL,
				email text NOT NULL,
				UNIQUE (tenant_id, email)
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const uniques = ddl.uniques.list({ table: tableName });
			const compositeUnique = uniques.find(
				(u) => u.columns.includes('tenant_id') && u.columns.includes('email'),
			);
			expect(compositeUnique).toBeTruthy();
			expect(compositeUnique?.columns).toHaveLength(2);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});
});
