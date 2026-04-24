import {
	type AnyRelationsBuilderConfig,
	defineRelations,
	type DrizzleConfig,
	type ExtractTablesFromSchema,
	type ExtractTablesWithRelations,
	getTableName,
	is,
	type RelationsBuilder,
	type RelationsBuilderConfig,
	sql,
	Table,
} from 'drizzle-orm';
import { type AwsDsqlDatabase, drizzle as drizzleAwsDsql } from 'drizzle-orm/aws-dsql';
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type {
	PgEnum,
	PgEnumObject,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	PgView,
} from 'drizzle-orm/pg-core';
import Keyv from 'keyv';
import type { Pool } from 'pg';
import { test as base } from 'vitest';
import { relations } from './relations';

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
	| PgEnumObject<any>
	| PgSchema
	| PgSequence
	| PgView
	| PgMaterializedView
	| PgRole
	| PgPolicy
	| unknown
>;

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class TestCache extends Cache {
	private globalTtl: number = 1000;
	private usedTablesPerKey: Record<string, string[]> = {};

	constructor(
		private readonly strat: 'explicit' | 'all',
		private kv: Keyv = new Keyv(),
	) {
		super();
	}

	override strategy() {
		return this.strat;
	}

	override async get(key: string, _tables: string[], _isTag: boolean): Promise<any[] | undefined> {
		const res = (await this.kv.get(key)) ?? undefined;
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
		const tagsArray = params.tags ? (Array.isArray(params.tags) ? params.tags : [params.tags]) : [];
		const tablesArray = params.tables ? (Array.isArray(params.tables) ? params.tables : [params.tables]) : [];

		const keysToDelete = new Set<string>();

		for (const table of tablesArray) {
			const tableName = is(table, Table) ? getTableName(table) : (table as string);
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
					const tableName = is(table, Table) ? getTableName(table) : (table as string);
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}

export const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
	log?: 'statements',
) => {
	const { diff } = await import('../../../drizzle-kit/tests/postgres/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		if (log === 'statements') console.log(s);
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const prepareAwsDsql = async (dbName: string) => {
	const host = process.env['AWS_DSQL_CLUSTER_ENDPOINT'];
	if (!host) throw new Error('AWS_DSQL_CLUSTER_ENDPOINT environment variable is required');

	// For DSQL, we use the AuroraDSQLPool from the connector
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { AuroraDSQLPool } = require('@aws/aurora-dsql-node-postgres-connector');

	const client = new AuroraDSQLPool({
		host,
		user: process.env['AWS_DSQL_USER'] ?? 'admin',
		region: process.env['AWS_DSQL_REGION'],
		database: dbName || 'postgres',
		profile: process.env['AWS_DSQL_PROFILE'],
		max: 5,
		applicationName: 'drizzle-test',
	});

	const db = drizzleAwsDsql({ client });

	// Clean up tables (DSQL doesn't support DROP SCHEMA CASCADE the same way)
	try {
		const tables = await db.execute<{ tablename: string }>(
			sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
		);
		for (const row of tables.rows) {
			await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(row.tablename)} CASCADE`);
		}
	} catch (cleanupError) {
		console.debug(
			'[drizzle:dsql:test] Cleanup warning:',
			cleanupError instanceof Error ? cleanupError.message : cleanupError,
		);
	}

	// Raw query helper for drizzle-kit's _push (DDL doesn't need type parsing)
	const query = async (sqlStr: string, params: any[] = []) => {
		const res = await client.query(sqlStr, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		// DSQL auto-commits DDL, so we execute each statement separately
		const results = [];
		for (const stmt of statements) {
			const result = await client.query(stmt);
			results.push(result);
		}
		return [results] as any;
	};

	return { client, query, batch };
};

const providerClosure = async <T>(items: T[]) => {
	return async () => {
		while (true) {
			const c = items.shift();
			if (!c) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				continue;
			}
			return {
				...c,
				release: () => {
					items.push(c);
				},
			};
		}
	};
};

export const provideForAwsDsql = async () => {
	// DSQL uses a single database, but we can create multiple pools
	// Use different test prefixes to avoid conflicts
	const clients = [
		await prepareAwsDsql('postgres'),
	];

	return providerClosure(clients);
};

type ProvideForAwsDsql = Awaited<ReturnType<typeof provideForAwsDsql>>;

export const awsDsqlTest = base.extend<{
	provider: ProvideForAwsDsql;
	kit: {
		client: Pool;
		query: (sql: string, params?: any[]) => Promise<any[]>;
		batch: (statements: string[]) => Promise<any>;
	};
	client: Pool;
	db: AwsDsqlDatabase<any, typeof relations>;
	push: (schema: any, params?: { log: 'statements' }) => Promise<void>;
	createDB: {
		<S extends PostgresSchema>(schema: S): AwsDsqlDatabase<any, ReturnType<typeof defineRelations<S>>>;
		<S extends PostgresSchema, TConfig extends AnyRelationsBuilderConfig>(
			schema: S,
			cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
		): AwsDsqlDatabase<any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
		<S extends PostgresSchema, TConfig extends AnyRelationsBuilderConfig>(
			schema: S,
			cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
			casing: NonNullable<DrizzleConfig['casing']>,
		): AwsDsqlDatabase<any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
	};
	caches: { all: AwsDsqlDatabase<any, typeof relations>; explicit: AwsDsqlDatabase<any, typeof relations> };
}>({
	provider: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const provider = await provideForAwsDsql();
			await use(provider);
		},
		{ scope: 'file' },
	],
	kit: [
		async ({ provider }, use) => {
			const { client, batch, query, release } = await provider();
			await use({ client: client as any, query, batch });
			release();
		},
		{ scope: 'test' },
	],
	client: [
		async ({ kit }, use) => {
			await use(kit.client);
		},
		{ scope: 'test' },
	],
	db: [
		async ({ kit }, use) => {
			const db = drizzleAwsDsql({
				client: kit.client as any,
				relations,
			});
			await use(db);
		},
		{ scope: 'test' },
	],
	push: [
		async ({ kit }, use) => {
			const push = (schema: any, params?: { log: 'statements' }) => _push(kit.query, schema, params?.log);
			await use(push);
		},
		{ scope: 'test' },
	],
	createDB: [
		async ({ kit }, use) => {
			const createDB = <S extends PostgresSchema>(
				schema: S,
				cb?: (
					helpers: RelationsBuilder<ExtractTablesFromSchema<S>>,
				) => RelationsBuilderConfig<ExtractTablesFromSchema<S>>,
				casing?: NonNullable<DrizzleConfig['casing']>,
			) => {
				const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);
				return drizzleAwsDsql({
					client: kit.client as any,
					relations,
					casing,
				});
			};

			await use(createDB);
		},
		{ scope: 'test' },
	],
	caches: [
		async ({ kit }, use) => {
			const config1 = {
				client: kit.client as any,
				relations,
				cache: new TestCache('all'),
			};
			const config2 = {
				client: kit.client as any,
				relations,
				cache: new TestCache('explicit'),
			};

			const db1 = drizzleAwsDsql(config1);
			const db2 = drizzleAwsDsql(config2);

			await use({ all: db1, explicit: db2 });
		},
		{ scope: 'test' },
	],
});

export type Test = typeof awsDsqlTest;
