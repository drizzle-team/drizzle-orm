import retry from 'async-retry';
import { getTableName, is, sql, Table } from 'drizzle-orm';
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import { drizzle } from 'drizzle-orm/dsql';
import Keyv from 'keyv';
import { test as base } from 'vitest';
import relations from './dsql.relations';
import * as schema from './dsql.schema';

const ENABLE_LOGGING = false;

// Test cache implementation for cache behavior tests
// oxlint-disable-next-line drizzle-internal/require-entity-kind
export class TestCache extends Cache {
	private globalTtl: number = 1000;
	private usedTablesPerKey: Record<string, string[]> = {};

	constructor(private readonly strat: 'explicit' | 'all', private kv: Keyv = new Keyv()) {
		super();
	}

	override strategy() {
		return this.strat;
	}

	override async get(key: string, _tables: string[], _isTag: boolean): Promise<any[] | undefined> {
		const res = await this.kv.get(key) ?? undefined;
		return res;
	}

	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Promise<void> {
		await this.kv.set(key, response, config ? config.ex : this.globalTtl);
		for (const table of tables) {
			const keys = this.usedTablesPerKey[table];
			if (keys === undefined) {
				this.usedTablesPerKey[table] = [key];
			} else {
				keys.push(key);
			}
		}
	}

	override async onMutate(params: MutationOption): Promise<void> {
		const tagsArray = params.tags ? Array.isArray(params.tags) ? params.tags : [params.tags] : [];
		const tablesArray = params.tables ? Array.isArray(params.tables) ? params.tables : [params.tables] : [];

		const keysToDelete = new Set<string>();

		for (const table of tablesArray) {
			const tableName = is(table, Table) ? getTableName(table) : table as string;
			const keys = this.usedTablesPerKey[tableName] ?? [];
			for (const key of keys) keysToDelete.add(key);
		}

		if (keysToDelete.size > 0 || tagsArray.length > 0) {
			for (const tag of tagsArray) {
				await this.kv.delete(tag);
			}

			for (const key of keysToDelete) {
				await this.kv.delete(key);
				for (const table of tablesArray) {
					const tableName = is(table, Table) ? getTableName(table) : table as string;
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}

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
// Use promise-based singletons to avoid race conditions with concurrent tests
let sharedDbPromise: Promise<DSQLDatabase<any>> | null = null;
let rqbDbPromise: Promise<DSQLDatabase<typeof schema, typeof relations>> | null = null;

async function createSharedDb(): Promise<DSQLDatabase<any>> {
	const clusterId = process.env['DSQL_CLUSTER_ID'];
	if (!clusterId) {
		throw new Error('DSQL_CLUSTER_ID environment variable is required');
	}

	const database = await retry(
		async () => {
			const db = drizzle({
				connection: {
					host: `${clusterId}.dsql.us-west-2.on.aws`,
				},
				logger: ENABLE_LOGGING,
			});
			// Test connection
			await db.execute(sql`SELECT 1`);
			return db;
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
	const schemas = await database.execute(sql`
		SELECT schema_name FROM information_schema.schemata
		WHERE schema_name LIKE 'test_schema_%'
		   OR schema_name LIKE 'schema1_%'
		   OR schema_name LIKE 'schema2_%'
	`);
	for (const row of (schemas as any).rows || []) {
		await database.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(row.schema_name)} CASCADE`);
	}

	return database;
}

function getSharedDb(): Promise<DSQLDatabase<any>> {
	if (!sharedDbPromise) {
		sharedDbPromise = createSharedDb();
	}
	return sharedDbPromise;
}

async function createRqbDb(): Promise<DSQLDatabase<typeof schema, typeof relations>> {
	const clusterId = process.env['DSQL_CLUSTER_ID'];
	if (!clusterId) {
		throw new Error('DSQL_CLUSTER_ID environment variable is required');
	}

	const database = await retry(
		async () => {
			const db = drizzle({
				connection: {
					host: `${clusterId}.dsql.us-west-2.on.aws`,
				},
				relations,
				logger: ENABLE_LOGGING,
			});
			// Test connection
			await db.execute(sql`SELECT 1`);
			return db;
		},
		{
			retries: 20,
			factor: 1,
			minTimeout: 250,
			maxTimeout: 250,
			randomize: false,
		},
	);

	// Create RQB tables
	await database.execute(sql`DROP TABLE IF EXISTS rqb_users_to_groups CASCADE`);
	await database.execute(sql`DROP TABLE IF EXISTS rqb_comments CASCADE`);
	await database.execute(sql`DROP TABLE IF EXISTS rqb_posts CASCADE`);
	await database.execute(sql`DROP TABLE IF EXISTS rqb_groups CASCADE`);
	await database.execute(sql`DROP TABLE IF EXISTS rqb_users CASCADE`);

	await database.execute(sql`
		CREATE TABLE rqb_users (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			name text NOT NULL,
			email text,
			invited_by uuid
		)
	`);
	await database.execute(sql`
		CREATE TABLE rqb_posts (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			content text NOT NULL,
			owner_id uuid NOT NULL
		)
	`);
	await database.execute(sql`
		CREATE TABLE rqb_comments (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			text text NOT NULL,
			post_id uuid NOT NULL,
			author_id uuid NOT NULL
		)
	`);
	await database.execute(sql`
		CREATE TABLE rqb_groups (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			name text NOT NULL
		)
	`);
	await database.execute(sql`
		CREATE TABLE rqb_users_to_groups (
			user_id uuid NOT NULL,
			group_id uuid NOT NULL,
			PRIMARY KEY (user_id, group_id)
		)
	`);

	return database;
}

function getRqbDb(): Promise<DSQLDatabase<typeof schema, typeof relations>> {
	if (!rqbDbPromise) {
		rqbDbPromise = createRqbDb();
	}
	return rqbDbPromise;
}

export { relations, schema };

export type DSQLTestContext = {
	db: DSQLDatabase<any>;
	rqbDb: DSQLDatabase<typeof schema, typeof relations>;
	uniqueName: (base: string) => string;
	createTable: (tableName: string, ddl: string) => Promise<void>;
	dropTable: (tableName: string) => Promise<void>;
	caches: {
		all: DSQLDatabase<any>;
		explicit: DSQLDatabase<any>;
	};
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
	rqbDb: [
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const db = await getRqbDb();
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
	caches: [
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const clusterId = process.env['DSQL_CLUSTER_ID'];
			if (!clusterId) {
				throw new Error('DSQL_CLUSTER_ID environment variable is required');
			}

			const connectionConfig = {
				host: `${clusterId}.dsql.us-west-2.on.aws`,
			};

			const allDb = await retry(
				async () => {
					const db = drizzle({
						connection: connectionConfig,
						logger: ENABLE_LOGGING,
						cache: new TestCache('all'),
					});
					await db.execute(sql`SELECT 1`);
					return db;
				},
				{ retries: 20, factor: 1, minTimeout: 250, maxTimeout: 250, randomize: false },
			);

			const explicitDb = await retry(
				async () => {
					const db = drizzle({
						connection: connectionConfig,
						logger: ENABLE_LOGGING,
						cache: new TestCache('explicit'),
					});
					await db.execute(sql`SELECT 1`);
					return db;
				},
				{ retries: 20, factor: 1, minTimeout: 250, maxTimeout: 250, randomize: false },
			);

			await use({ all: allDb, explicit: explicitDb });
		},
		{ scope: 'test' },
	],
});

export type Test = typeof dsqlTest;
