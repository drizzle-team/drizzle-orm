import { AuroraDSQLClient } from '@aws/aurora-dsql-node-postgres-connector';
import { auroraDSQLPostgres } from '@aws/aurora-dsql-postgresjs-connector';
import {
	type AnyRelationsBuilderConfig,
	defineRelations,
	type ExtractTablesFromSchema,
	type ExtractTablesWithRelations,
	getTableName,
	is,
	type RelationsBuilder,
	type RelationsBuilderConfig,
	Table,
} from 'drizzle-orm';
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import { drizzle as drizzleNodePgDsql } from 'drizzle-orm/node-postgres/dsql';
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
import type { DsqlAsyncDatabase } from 'drizzle-orm/pg-core/async/dsql';
import { drizzle as drizzlePostgresJsDsql } from 'drizzle-orm/postgres-js/dsql';
import Keyv from 'keyv';
import type { Sql } from 'postgres';
import { test as base } from 'vitest';
import { relations } from '../pg/relations';
import { dsqlUrl } from './connection';
import { retryOcc } from './occ';

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

export const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
	log?: 'statements',
) => {
	const { diff } = await import('../../../drizzle-kit/tests/postgres/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		if (log === 'statements') console.log(s);
		await retryOcc(() => query(s, [])).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const resetSchemas = async (run: (sql: string) => Promise<any[]>) => {
	const tables = await run(
		`select schemaname, tablename from pg_tables where schemaname not in ('information_schema', 'sys') and schemaname !~ '^pg_'`,
	);
	for (const table of tables) {
		await run(`drop table if exists ${quote(table['schemaname'])}.${quote(table['tablename'])} cascade`);
	}

	const views = await run(
		`select schemaname, viewname from pg_views where schemaname not in ('information_schema', 'sys') and schemaname !~ '^pg_'`,
	);
	for (const view of views) {
		await run(`drop view if exists ${quote(view['schemaname'])}.${quote(view['viewname'])} cascade`);
	}

	const schemas = await run(
		`select nspname from pg_namespace where nspname not in ('public', 'information_schema', 'sys') and nspname !~ '^pg_'`,
	);
	for (const schema of schemas) {
		await run(`drop schema if exists ${quote(String(Object.values(schema)[0]))} cascade`);
	}

	await run('create schema "mySchema"');
};

const dsqlDatabase = () => {
	const pathname = new URL(dsqlUrl()).pathname.slice(1);
	return pathname || 'postgres';
};

export const prepareNodePgDsql = async () => {
	const client = new AuroraDSQLClient({ connectionString: dsqlUrl() });
	await client.connect();

	await resetSchemas(async (sql) => retryOcc(async () => (await client.query(sql)).rows));

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
	};

	return { client, query, batch, database: dsqlDatabase() };
};

export const preparePostgresJsDsql = async () => {
	const client: Sql = auroraDSQLPostgres(dsqlUrl(), { max: 1, onnotice: () => {} }) as Sql;

	await resetSchemas(async (sql) => retryOcc(async () => await client.unsafe(sql) as any[]));

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.unsafe(sql, params);
		return res as any[];
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.unsafe(x))).then((results) => [results] as any);
	};

	return { client, query, batch, database: dsqlDatabase() };
};

type Vendor =
	| 'node-postgres-dsql'
	| 'postgres-js-dsql';

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

export const provideForNodePgDsql = async () => {
	const clients = [
		await prepareNodePgDsql(),
	];

	return providerClosure(clients);
};

export const provideForPostgresJsDsql = async () => {
	const clients = [
		await preparePostgresJsDsql(),
	];

	return providerClosure(clients);
};

type ProvideForNodePgDsql = Awaited<ReturnType<typeof provideForNodePgDsql>>;
type ProvideForPostgresJsDsql = Awaited<ReturnType<typeof provideForPostgresJsDsql>>;

type Provider =
	| ProvideForNodePgDsql
	| ProvideForPostgresJsDsql;

const testFor = (vendor: Vendor) => {
	return base.extend<{
		provider: Provider;
		kit: {
			client: any;
			query: (sql: string, params?: any[]) => Promise<any[]>;
			batch: (statements: string[]) => Promise<any>;
			database: string | undefined;
		};
		client: any;
		db: DsqlAsyncDatabase<any, typeof relations>;
		push: (schema: any, params?: { log: 'statements' }) => Promise<void>;
		createDB: {
			<S extends PostgresSchema>(schema: S): DsqlAsyncDatabase<any, ReturnType<typeof defineRelations<S>>>;
			<S extends PostgresSchema, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
				useJitMappers?: boolean,
			): DsqlAsyncDatabase<any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
		};
		caches: { all: DsqlAsyncDatabase<any, typeof relations>; explicit: DsqlAsyncDatabase<any, typeof relations> };
	}>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const provider = vendor === 'node-postgres-dsql'
					? await provideForNodePgDsql()
					: vendor === 'postgres-js-dsql'
					? await provideForPostgresJsDsql()
					: '' as never;

				await use(provider);
			},
			{ scope: 'file' },
		],
		kit: [
			async ({ provider }, use) => {
				const { client, batch, query, release, database } = await provider();
				await use({ client: client as any, query, batch, database });
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
				const db = vendor === 'node-postgres-dsql'
					? drizzleNodePgDsql({ client: kit.client as any, relations })
					: vendor === 'postgres-js-dsql'
					? drizzlePostgresJsDsql({ client: kit.client as any, relations })
					: '' as never;

				await use(db);
			},
			{ scope: 'test' },
		],
		push: [
			async ({ kit }, use) => {
				const push = (
					schema: any,
					params?: { log: 'statements' },
				) => _push(kit.query, schema, params?.log);

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
					useJitMappers?: boolean,
				) => {
					const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);

					if (vendor === 'node-postgres-dsql') {
						return drizzleNodePgDsql({ client: kit.client as any, relations, jit: useJitMappers });
					}
					if (vendor === 'postgres-js-dsql') {
						return drizzlePostgresJsDsql({ client: kit.client as any, relations, jit: useJitMappers });
					}

					throw new Error();
				};

				await use(createDB);
			},
			{ scope: 'test' },
		],
		caches: [
			async ({ kit }, use) => {
				const config1 = { client: kit.client as any, relations, cache: new TestCache('all') };
				const config2 = { client: kit.client as any, relations, cache: new TestCache('explicit') };

				const db1 = vendor === 'node-postgres-dsql'
					? drizzleNodePgDsql(config1)
					: vendor === 'postgres-js-dsql'
					? drizzlePostgresJsDsql(config1)
					: '' as never;

				const db2 = vendor === 'node-postgres-dsql'
					? drizzleNodePgDsql(config2)
					: vendor === 'postgres-js-dsql'
					? drizzlePostgresJsDsql(config2)
					: '' as never;

				await use({ all: db1, explicit: db2 });
			},
			{ scope: 'test' },
		],
	});
};

export const nodePgDsqlTest = testFor('node-postgres-dsql');
export const postgresJsDsqlTest = testFor('postgres-js-dsql');

export type Test = ReturnType<typeof testFor>;
