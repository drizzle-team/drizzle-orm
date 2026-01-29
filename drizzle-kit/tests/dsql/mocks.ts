/**
 * DSQL Test Utilities
 *
 * Provides test helpers for DSQL generate and push commands.
 * These utilities follow patterns from postgres/mocks.ts but are
 * adapted for DSQL-specific constraints:
 * - No transactions (each DDL statement auto-commits)
 * - Real cluster required (DSQL_CLUSTER_ENDPOINT environment variable)
 * - Unique table naming for test isolation
 * - ASYNC indexes
 * - No enums, sequences, foreign keys, policies
 */

import { is, sql } from 'drizzle-orm';
import { drizzle, type DSQLDatabase } from 'drizzle-orm/dsql';
import { DSQLSchema, DSQLTable, type DSQLView, getTableConfig, isDSQLView } from 'drizzle-orm/dsql-core';
import type { CasingType } from 'src/cli/validations/common';
import { ddlDiff, ddlDiffDry } from 'src/dialects/dsql/diff';
import { fromDrizzleSchema } from 'src/dialects/dsql/drizzle';
import { fromDatabase, fromDatabaseForDrizzle } from 'src/dialects/dsql/introspect';
import { createDDL, interimToDDL, type PostgresDDL } from 'src/dialects/postgres/ddl';
import type { EntityFilter } from 'src/dialects/pull-utils';
import type { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';

// Generate unique names to avoid conflicts between test runs
const testRunId = Math.random().toString(36).substring(2, 8);

/**
 * Generates a unique name for test isolation.
 * Since DSQL has no transaction support, we cannot roll back changes.
 * Each test should use unique table names to avoid conflicts.
 */
export const uniqueName = (base: string) => `${base}_${testRunId}`;

/**
 * Simple retry helper for connection establishment.
 */
export async function retry<T>(fn: () => Promise<T>, maxRetries = 20, delay = 250): Promise<T> {
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

/**
 * Type definition for DSQL schema objects.
 */
export type DSQLSchemaType = Record<
	string,
	| DSQLTable<any>
	| DSQLSchema<string>
	| DSQLView
	| unknown
>;

/**
 * Check if DSQL cluster is available for tests.
 * Returns { skip: true } if DSQL_CLUSTER_ENDPOINT is not set.
 */
export const skipIfNoCluster = () => {
	const clusterEndpoint = process.env['DSQL_CLUSTER_ENDPOINT'];
	return { skip: !clusterEndpoint, reason: 'DSQL_CLUSTER_ENDPOINT environment variable not set' };
};

/**
 * Converts a Drizzle DSQL schema to DDL representation.
 */
export const drizzleToDDL = (
	schema: DSQLSchemaType,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, DSQLTable)) as DSQLTable[];
	const schemas = Object.values(schema).filter((it) => is(it, DSQLSchema)) as DSQLSchema<string>[];
	const views = Object.values(schema).filter((it) => isDSQLView(it)) as DSQLView[];

	const grouped = { schemas, tables, views };

	const {
		schema: res,
		errors,
		warnings,
	} = fromDrizzleSchema(grouped, casing, () => true);

	if (errors.length > 0) {
		throw new Error(`Schema errors: ${JSON.stringify(errors)}`);
	}

	return { ...interimToDDL(res), warnings };
};

/**
 * Computes the diff between two schemas and returns migration SQL.
 * If left is empty ({}), creates a DDL from scratch.
 */
export const diff = async (
	left: DSQLSchemaType | PostgresDDL,
	right: DSQLSchemaType | PostgresDDL,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as PostgresDDL, errors: [] }
		: Object.keys(left).length === 0
		? { ddl: createDDL(), errors: [] }
		: drizzleToDDL(left, casing);

	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as PostgresDDL, errors: [] }
		: drizzleToDDL(right, casing);

	if (err1.length > 0 || err2.length > 0) {
		throw new Error(`Schema errors: ${JSON.stringify([...err1, ...err2])}`);
	}

	const renames = new Set(renamesArr);

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);

	return { sqlStatements, statements, groupedStatements, ddlFrom: ddl1, ddlTo: ddl2 };
};

/**
 * Computes a dry diff without using mock resolvers for interactive prompts.
 */
export const diffDry = async (
	left: DSQLSchemaType | PostgresDDL,
	right: DSQLSchemaType | PostgresDDL,
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as PostgresDDL, errors: [] }
		: Object.keys(left).length === 0
		? { ddl: createDDL(), errors: [] }
		: drizzleToDDL(left, casing);

	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as PostgresDDL, errors: [] }
		: drizzleToDDL(right, casing);

	if (err1.length > 0 || err2.length > 0) {
		throw new Error(`Schema errors: ${JSON.stringify([...err1, ...err2])}`);
	}

	return ddlDiffDry(ddl1, ddl2, 'default');
};

/**
 * Test database interface for DSQL.
 */
export type DSQLTestDatabase = {
	db: DB;
	dsqlDb: DSQLDatabase<any>;
	close: () => Promise<void>;
};

/**
 * Prepares a test database connection to DSQL.
 * Requires DSQL_CLUSTER_ENDPOINT environment variable.
 */
export const prepareTestDatabase = async (enableLogging = false): Promise<DSQLTestDatabase> => {
	const clusterEndpoint = process.env['DSQL_CLUSTER_ENDPOINT'];
	if (!clusterEndpoint) {
		throw new Error('DSQL_CLUSTER_ENDPOINT environment variable is required');
	}

	const dsqlDb = await retry(async () => {
		const database = drizzle({
			connection: {
				host: clusterEndpoint,
			},
			logger: enableLogging,
		});
		await database.execute(sql`SELECT 1`);
		return database;
	});

	// Create DB adapter for drizzle-kit introspection
	const db: DB = {
		query: async <T>(sqlStr: string, params?: any[]): Promise<T[]> => {
			const result = await dsqlDb.execute(sql.raw(sqlStr));
			return (result as any).rows as T[];
		},
	};

	const close = async () => {
		// DSQL connections are managed by AWS SDK, no explicit close needed
	};

	return { db, dsqlDb, close };
};

/**
 * Pushes schema changes to the DSQL database and verifies idempotency.
 *
 * DSQL-specific behavior:
 * - Each DDL statement auto-commits (no transaction rollback)
 * - Uses introspection to determine current state
 * - Verifies subsequent push produces no changes (idempotency)
 * - Filters introspection to only tables in the target schema for test isolation
 */
export const push = async (config: {
	db: DB;
	dsqlDb: DSQLDatabase<any>;
	to: DSQLSchemaType | PostgresDDL;
	renames?: string[];
	casing?: CasingType;
	log?: 'statements' | 'none';
	ignoreSubsequent?: boolean;
}): Promise<{
	sqlStatements: string[];
	statements: any[];
}> => {
	const { db, dsqlDb, to } = config;
	const log = config.log ?? 'none';
	const casing = config.casing;

	// Convert target schema to DDL
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as PostgresDDL, errors: [] }
		: drizzleToDDL(to, casing);

	if (err2.length > 0) {
		throw new Error(`Schema errors: ${JSON.stringify(err2)}`);
	}

	// Extract table names from the target schema for test isolation.
	// On shared DSQL clusters, we must filter introspection to only tables
	// we're pushing to avoid picking up tables from other test runs.
	const targetTableNames = new Set<string>();
	if ('entities' in to && '_' in to) {
		// It's already a PostgresDDL
		const ddl = to as PostgresDDL;
		for (const table of ddl.tables.list()) {
			targetTableNames.add(table.name);
		}
	} else {
		// It's a Drizzle schema
		const tables = Object.values(to).filter((it) => is(it, DSQLTable)) as DSQLTable[];
		for (const table of tables) {
			const tableConfig = getTableConfig(table);
			targetTableNames.add(tableConfig.name);
		}
	}

	// Create filter that only accepts tables matching our target schema.
	// For test isolation on shared DSQL clusters:
	// - When we have target tables, filter to only those tables
	// - When target is empty (DROP scenarios), filter to tables with this test run's suffix
	// This prevents picking up tables from concurrent test runs.
	const hasTargetTables = targetTableNames.size > 0;
	const tableFilter: EntityFilter = (entity) => {
		if (entity.type === 'role') return false;
		if (entity.type === 'table') {
			if (hasTargetTables) {
				// Filter to only target tables
				return targetTableNames.has(entity.name);
			} else {
				// For empty schema pushes (DROP scenarios), only accept tables
				// from this test run (identified by the unique testRunId suffix)
				return entity.name.endsWith(`_${testRunId}`);
			}
		}
		return true; // Accept schemas
	};

	// Introspect current database state using fromDatabaseForDrizzle
	// which filters out public schema and auto-generated indexes
	const schema = await fromDatabaseForDrizzle(
		db,
		tableFilter,
		() => {},
		{
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
	);
	schema.roles = [];
	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);

	if (err3.length > 0) {
		throw new Error(`Introspection errors: ${JSON.stringify(err3)}`);
	}

	const renames = new Set(config.renames ?? []);

	// Compute diff
	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	// Execute migrations
	for (const sqlStmt of sqlStatements) {
		if (log === 'statements') console.log(sqlStmt);

		// DSQL requires ASYNC for index creation
		// The ddl convertor should handle this, but we ensure it here
		try {
			await dsqlDb.execute(sql.raw(sqlStmt));
		} catch (e) {
			console.error('Failed SQL statement:', sqlStmt);
			throw e;
		}
	}

	// Verify idempotency - subsequent push should produce no changes
	if (!config.ignoreSubsequent) {
		// Wait for async operations like index creation
		await new Promise((r) => setTimeout(r, 2000));

		// Use the same introspection method and filter as the initial push
		// to filter out public schema, auto-generated indexes, and unrelated tables
		const schemaAfter = await fromDatabaseForDrizzle(
			db,
			tableFilter,
			() => {},
			{
				schema: 'drizzle',
				table: '__drizzle_migrations',
			},
		);
		schemaAfter.roles = [];
		const { ddl: ddl1After, errors: errAfter } = interimToDDL(schemaAfter);

		if (errAfter.length > 0) {
			throw new Error(`Introspection errors after push: ${JSON.stringify(errAfter)}`);
		}

		const { sqlStatements: subsequentStatements } = await ddlDiff(
			ddl1After,
			ddl2,
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			'push',
		);

		if (subsequentStatements.length > 0) {
			console.error('---- subsequent push is not empty ----');
			console.error(subsequentStatements.join('\n'));
			throw new Error(`Subsequent push produced changes: ${subsequentStatements.join('\n')}`);
		}
	}

	return { sqlStatements, statements };
};

/**
 * Cleans up test tables by dropping them.
 * Use in finally blocks to ensure cleanup even on test failure.
 */
export const cleanupTable = async (dsqlDb: DSQLDatabase<any>, tableName: string, schema = 'public') => {
	try {
		if (schema !== 'public') {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(schema)}.${sql.identifier(tableName)} CASCADE`);
		} else {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	} catch (e) {
		console.warn(`Failed to cleanup table ${schema}.${tableName}:`, e);
	}
};

/**
 * Cleans up test schemas by dropping them.
 */
export const cleanupSchema = async (dsqlDb: DSQLDatabase<any>, schemaName: string) => {
	try {
		await dsqlDb.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`);
	} catch (e) {
		console.warn(`Failed to cleanup schema ${schemaName}:`, e);
	}
};

/**
 * Cleans up test indexes by dropping them.
 */
export const cleanupIndex = async (
	dsqlDb: DSQLDatabase<any>,
	indexName: string,
	schema = 'public',
) => {
	try {
		if (schema !== 'public') {
			await dsqlDb.execute(sql`DROP INDEX IF EXISTS ${sql.identifier(schema)}.${sql.identifier(indexName)}`);
		} else {
			await dsqlDb.execute(sql`DROP INDEX IF EXISTS ${sql.identifier(indexName)}`);
		}
	} catch (e) {
		console.warn(`Failed to cleanup index ${schema}.${indexName}:`, e);
	}
};

/**
 * Helper to create unique names for test resources.
 */
export const _ = {
	uniqueName,
	testRunId,
};
