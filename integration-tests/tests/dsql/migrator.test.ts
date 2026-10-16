/**
 * DSQL Migrator Integration Tests
 *
 * Tests the DSQL migrator against a real DSQL cluster.
 * Verifies:
 * - Migration schema and tracking table creation
 * - Migrations are idempotent (re-running produces no changes)
 * - Statement-level tracking works correctly
 *
 * Requires DSQL_CLUSTER_ENDPOINT environment variable.
 */

import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import { drizzle } from 'drizzle-orm/dsql';
import { migrate } from 'drizzle-orm/dsql/migrator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ENABLE_LOGGING = false;

// Generate unique test run ID to avoid conflicts
const testRunId = Math.random().toString(36).substring(2, 8);
const uniqueName = (base: string) => `${base}_${testRunId}`;

// Generate a migration folder name with proper timestamp prefix
let migrationCounter = 0;
const migrationName = (suffix: string) => {
	const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
	return `${timestamp}${String(++migrationCounter).padStart(4, '0')}_${suffix}`;
};

let db: DSQLDatabase<Record<string, unknown>>;

// Skip if no cluster endpoint
const skipIfNoCluster = () => {
	const clusterEndpoint = process.env['DSQL_CLUSTER_ENDPOINT'];
	return { skip: !clusterEndpoint };
};

beforeAll(async () => {
	if (skipIfNoCluster().skip) {
		return;
	}

	const clusterEndpoint = process.env['DSQL_CLUSTER_ENDPOINT']!;

	db = await retry(
		async () => {
			const database = drizzle({
				connection: { host: clusterEndpoint },
				logger: ENABLE_LOGGING,
			});
			await database.execute(sql`SELECT 1`);
			return database;
		},
		{ retries: 20, factor: 1, minTimeout: 250, maxTimeout: 250, randomize: false },
	);
});

afterAll(async () => {
	// Cleanup is handled per-test
});

// Helper to create a temporary migrations folder with migration files
// Uses the new drizzle-kit format: subdirectories with migration.sql files
function createMigrationsFolder(migrations: { name: string; sql: string }[]): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsql-migrations-'));

	for (const migration of migrations) {
		const migrationDir = path.join(tmpDir, migration.name);
		fs.mkdirSync(migrationDir);
		fs.writeFileSync(path.join(migrationDir, 'migration.sql'), migration.sql);
	}

	return tmpDir;
}

// Helper to cleanup migrations folder
function cleanupMigrationsFolder(folder: string) {
	try {
		fs.rmSync(folder, { recursive: true, force: true });
	} catch (e) {
		// Ignore errors during cleanup
	}
}

// Helper to cleanup test migrations schema
async function cleanupMigrations(schemaName: string) {
	try {
		await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`);
	} catch (e) {
		// Ignore errors during cleanup
	}
}

// Helper to cleanup test tables
async function cleanupTable(tableName: string) {
	try {
		await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
	} catch (e) {
		// Ignore errors during cleanup
	}
}

describe.skipIf(skipIfNoCluster().skip)('DSQL Migrator Integration', () => {
	test('migrate creates schema and tracking table', async () => {
		const schemaName = uniqueName('mig_schema');
		const tableName = uniqueName('mig_tracking');
		const testTableName = uniqueName('mig_test');

		const migrationsFolder = createMigrationsFolder([
			{
				name: migrationName('create_test_table'),
				sql: `CREATE TABLE ${testTableName} (id BIGINT PRIMARY KEY, name TEXT);`,
			},
		]);

		try {
			const result = await migrate(db, {
				migrationsFolder,
				migrationsSchema: schemaName,
				migrationsTable: tableName,
			});

			expect(result.success).toBe(true);
			expect(result.appliedStatements).toBeGreaterThanOrEqual(1);

			// Verify tracking table exists
			const tableCheck = await db.execute(sql`
				SELECT EXISTS (
					SELECT 1 FROM information_schema.tables
					WHERE table_schema = ${schemaName}
					AND table_name = ${tableName}
				) as exists
			`);
			expect((tableCheck as any).rows[0]?.exists).toBe(true);

			// Verify test table was created
			const testTableCheck = await db.execute(sql`
				SELECT EXISTS (
					SELECT 1 FROM information_schema.tables
					WHERE table_name = ${testTableName}
				) as exists
			`);
			expect((testTableCheck as any).rows[0]?.exists).toBe(true);
		} finally {
			cleanupMigrationsFolder(migrationsFolder);
			await cleanupMigrations(schemaName);
			await cleanupTable(testTableName);
		}
	});

	test('migrate is idempotent', async () => {
		const schemaName = uniqueName('idemp_schema');
		const tableName = uniqueName('idemp_tracking');
		const testTableName = uniqueName('idemp_test');

		const migrationsFolder = createMigrationsFolder([
			{
				name: migrationName('create_idemp_table'),
				sql: `CREATE TABLE ${testTableName} (id BIGINT PRIMARY KEY);`,
			},
		]);

		try {
			// First migration
			const result1 = await migrate(db, {
				migrationsFolder,
				migrationsSchema: schemaName,
				migrationsTable: tableName,
			});

			expect(result1.success).toBe(true);
			expect(result1.appliedStatements).toBeGreaterThanOrEqual(1);

			// Second migration (should be no-op)
			const result2 = await migrate(db, {
				migrationsFolder,
				migrationsSchema: schemaName,
				migrationsTable: tableName,
			});

			expect(result2.success).toBe(true);
			expect(result2.appliedStatements).toBe(0);
			expect(result2.totalStatements).toBe(0);
		} finally {
			cleanupMigrationsFolder(migrationsFolder);
			await cleanupMigrations(schemaName);
			await cleanupTable(testTableName);
		}
	});

	test('migrate handles multiple statements in one migration', async () => {
		const schemaName = uniqueName('stmt_schema');
		const tableName = uniqueName('stmt_tracking');
		const testTable1 = uniqueName('stmt_test1');
		const testTable2 = uniqueName('stmt_test2');

		// Use --> statement-breakpoint to separate statements (DSQL requires one DDL per transaction)
		const migrationsFolder = createMigrationsFolder([
			{
				name: migrationName('create_multi_tables'),
				sql:
					`CREATE TABLE ${testTable1} (id BIGINT PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE ${testTable2} (id BIGINT PRIMARY KEY);`,
			},
		]);

		try {
			const result = await migrate(db, {
				migrationsFolder,
				migrationsSchema: schemaName,
				migrationsTable: tableName,
			});

			expect(result.success).toBe(true);
			expect(result.appliedStatements).toBeGreaterThanOrEqual(2);

			// Verify both tables were created
			const table1Check = await db.execute(sql`
				SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ${testTable1}) as exists
			`);
			expect((table1Check as any).rows[0]?.exists).toBe(true);

			const table2Check = await db.execute(sql`
				SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ${testTable2}) as exists
			`);
			expect((table2Check as any).rows[0]?.exists).toBe(true);
		} finally {
			cleanupMigrationsFolder(migrationsFolder);
			await cleanupMigrations(schemaName);
			await cleanupTable(testTable1);
			await cleanupTable(testTable2);
		}
	});

	test('migrate handles multiple migrations', async () => {
		const schemaName = uniqueName('multi_schema');
		const tableName = uniqueName('multi_tracking');
		const testTable1 = uniqueName('multi_test1');
		const testTable2 = uniqueName('multi_test2');

		const migrationsFolder = createMigrationsFolder([
			{
				name: migrationName('first_migration'),
				sql: `CREATE TABLE ${testTable1} (id BIGINT PRIMARY KEY);`,
			},
			{
				name: migrationName('second_migration'),
				sql: `CREATE TABLE ${testTable2} (id BIGINT PRIMARY KEY);`,
			},
		]);

		try {
			const result = await migrate(db, {
				migrationsFolder,
				migrationsSchema: schemaName,
				migrationsTable: tableName,
			});

			expect(result.success).toBe(true);
			expect(result.completedMigrations).toBe(2);
			expect(result.totalMigrations).toBe(2);
		} finally {
			cleanupMigrationsFolder(migrationsFolder);
			await cleanupMigrations(schemaName);
			await cleanupTable(testTable1);
			await cleanupTable(testTable2);
		}
	});

	test('migrate returns error details on failure', async () => {
		const schemaName = uniqueName('fail_schema');
		const tableName = uniqueName('fail_tracking');
		const testTable = uniqueName('fail_test');

		// Use statement breakpoint to create two separate statements - the second will fail
		const migrationsFolder = createMigrationsFolder([
			{
				name: migrationName('failing_migration'),
				sql:
					`CREATE TABLE ${testTable} (id BIGINT PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE ${testTable} (id BIGINT PRIMARY KEY);`,
			},
		]);

		try {
			const result = await migrate(db, {
				migrationsFolder,
				migrationsSchema: schemaName,
				migrationsTable: tableName,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error?.message).toContain('already exists');
		} finally {
			cleanupMigrationsFolder(migrationsFolder);
			await cleanupMigrations(schemaName);
			await cleanupTable(testTable);
		}
	});
});
