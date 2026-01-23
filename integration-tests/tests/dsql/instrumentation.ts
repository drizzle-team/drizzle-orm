import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import { drizzle } from 'drizzle-orm/dsql';
import { test as base } from 'vitest';

const ENABLE_LOGGING = false;

// Counter for unique table names - use random to avoid concurrent test conflicts
let tableCounter = 0;
const testRunId = Math.random().toString(36).substring(2, 8);

export function uniqueTableName(base: string): string {
	return `${base}_${testRunId}_${++tableCounter}`;
}

// Push function to create tables from SQL statements
export const _push = async (
	db: DSQLDatabase<any>,
	statements: string[],
) => {
	for (const s of statements) {
		await db.execute(sql.raw(s)).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

// Create a single shared database connection (pool handles concurrency)
let sharedDb: DSQLDatabase<any> | null = null;

async function getSharedDb(): Promise<DSQLDatabase<any>> {
	if (sharedDb) return sharedDb;

	const clusterId = process.env['DSQL_CLUSTER_ID'];
	if (!clusterId) {
		throw new Error('DSQL_CLUSTER_ID environment variable is required');
	}

	sharedDb = await retry(
		async () => {
			const database = drizzle({
				connection: {
					endpoint: `${clusterId}.dsql.us-west-2.on.aws`,
					region: 'us-west-2',
				},
				logger: ENABLE_LOGGING,
			});
			// Test connection
			await database.execute(sql`SELECT 1`);
			return database;
		},
		{
			retries: 20,
			factor: 1,
			minTimeout: 250,
			maxTimeout: 250,
			randomize: false,
		},
	);

	// Clean up old test schemas (DSQL has a limit of 10 schemas)
	const schemas = await sharedDb.execute(sql`
		SELECT schema_name FROM information_schema.schemata
		WHERE schema_name LIKE 'test_schema_%'
		   OR schema_name LIKE 'schema1_%'
		   OR schema_name LIKE 'schema2_%'
	`);
	for (const row of (schemas as any).rows || []) {
		await sharedDb.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(row.schema_name)} CASCADE`);
	}

	return sharedDb;
}

export type DSQLTestContext = {
	db: DSQLDatabase<any>;
	uniqueName: (base: string) => string;
	createTable: (tableName: string, ddl: string) => Promise<void>;
	dropTable: (tableName: string) => Promise<void>;
};

export const dsqlTest = base.extend<DSQLTestContext>({
	db: [
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const db = await getSharedDb();
			await use(db);
		},
		{ scope: 'test' },
	],
	uniqueName: [
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			await use(uniqueTableName);
		},
		{ scope: 'test' },
	],
	createTable: [
		async ({ db }, use) => {
			const createTable = async (tableName: string, ddl: string) => {
				await db.execute(sql.raw(`drop table if exists "${tableName}" cascade`));
				await db.execute(sql.raw(ddl));
			};
			await use(createTable);
		},
		{ scope: 'test' },
	],
	dropTable: [
		async ({ db }, use) => {
			const dropTable = async (tableName: string) => {
				await db.execute(sql.raw(`drop table if exists "${tableName}" cascade`));
			};
			await use(dropTable);
		},
		{ scope: 'test' },
	],
});

export type Test = typeof dsqlTest;
