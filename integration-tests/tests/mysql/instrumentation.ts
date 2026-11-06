import { createProvider, requireEnv } from '@drizzle/test-utils';
import { Client } from '@planetscale/database';
import { connect, type Connection } from '@tidbcloud/serverless';
import {
	AnyRelationsBuilderConfig,
	defineRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	getCacheKey,
	is,
	RelationsBuilder,
	RelationsBuilderConfig,
	Table,
} from 'drizzle-orm';
import type { MutationOption } from 'drizzle-orm/cache/core';
import { Cache } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type { MySqlAsyncDatabase, MySqlSchema, MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
import { drizzle as proxyDrizzle, RemoteCallback } from 'drizzle-orm/mysql-proxy';
import type { AnyMySql2Connection } from 'drizzle-orm/mysql2';
import { drizzle as mysql2Drizzle } from 'drizzle-orm/mysql2';
import { mysql2Codecs } from 'drizzle-orm/mysql2/codecs';
import { drizzle as psDrizzle } from 'drizzle-orm/planetscale-serverless';
import { drizzle as drizzleTidb } from 'drizzle-orm/tidb-serverless';
import { type FunctionsVersioning, type InferCallbackType, seed } from 'drizzle-seed';
import Keyv from 'keyv';
import { createConnection } from 'mysql2/promise';
import type * as mysql from 'mysql2/promise';
import type { Mock } from 'vitest';
import { test as base, vi } from 'vitest';
import { relations } from './schema';

export class TestCache extends Cache {
	private globalTtl: number = 1000;
	private usedTablesPerKey: Record<string, string[]> = {};

	constructor(private readonly strat: 'explicit' | 'all', private kv: Keyv = new Keyv()) {
		super();
	}

	override strategy(): 'explicit' | 'all' {
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
			const tableName = is(table, Table) ? getCacheKey(table) : table as string;
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
					const tableName = is(table, Table) ? getCacheKey(table) : table as string;
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}

class ServerSimulator {
	constructor(private db: mysql.Connection) {}

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					rowsAsArray: true,
				});

				return { data: result[0] as any };
			} catch (e: any) {
				return { error: e };
			}
		} else if (method === 'execute') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
				});

				return { data: result as any };
			} catch (e: any) {
				return { error: e };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	async migrations(queries: string[]) {
		await this.db.query('START TRANSACTION');
		try {
			for (const query of queries) {
				await this.db.query(query);
			}
			await this.db.query('COMMIT');
		} catch (e) {
			await this.db.query('ROLLBACK');
			throw e;
		}

		return {};
	}
}

export type MysqlSchema = Record<
	string,
	MySqlTable<any> | MySqlSchema | MySqlView
>;

export type RefineCallbackT<Schema extends MysqlSchema> = (
	funcs: FunctionsVersioning,
) => InferCallbackType<MySqlAsyncDatabase<any, any>, Schema>;

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
	vendor: string,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/mysql/mocks' as string);

	const res = await diff({}, schema, []);
	for (const s of res.sqlStatements) {
		const patched = vendor === 'tidb' ? s.replace('(now())', '(now(2))') : s;
		await query(patched, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

const _seed = async <Schema extends MysqlSchema>(
	db: MySqlAsyncDatabase<any, any>,
	schema: Schema,
	refineCallback?: RefineCallbackT<Schema>,
) => {
	return refineCallback === undefined ? seed(db, schema) : seed(db, schema).refine(refineCallback);
};

const createProxyHandler = (client: mysql.Connection) => {
	const serverSimulator = new ServerSimulator(client);
	const proxyHandler: RemoteCallback = async (sql: string, params: any[], method: any) => {
		try {
			const response = await serverSimulator.query(sql, params, method);
			if (response.error !== undefined) {
				throw response.error;
			}
			return {
				rows: response.data,
				...(Array.isArray(response.data[0])
					? {}
					: { insertId: response.data.lastInsertRowId, affectedRows: response.data.affectedRows }),
			};
		} catch (e: any) {
			console.error('Error from mysql proxy server:', e.message);
			throw e;
		}
	};
	return proxyHandler;
};
type MySqlTestClient = {
	client: AnyMySql2Connection | Client | Connection;
	query: (sql: string, params?: any[]) => Promise<any[]>;
	batch: (statements: string[]) => Promise<void>;
	/** A second independent connection to the same database, for transaction tests (MySQL only) */
	peer: { query: (sql: string) => Promise<any[]> } | undefined;
	/** The test's database, for tests that open connections of their own (MySQL only) */
	database?: string;
};

const prepareTest = (vendor: 'mysql' | 'planetscale' | 'tidb' | 'mysql-proxy') => {
	return base.extend<
		{
			/** Hands out a test's connection: on MySQL each one to a database of its own, for concurrent tests. */
			clients: { acquire: () => Promise<MySqlTestClient & { release: () => Promise<void> }> };
			client: MySqlTestClient;
			/** A second independent connection to the same database for transaction tests */
			peer: { query: (sql: string) => Promise<any[]> } | undefined;
			// proxyHandler: (sql: string, params: any[], method: any) => Promise<{
			// 	rows: any;
			// }>;
			db: MySqlAsyncDatabase<any, typeof relations>;
			createDB: {
				<S extends MysqlSchema, TConfig extends AnyRelationsBuilderConfig>(config: {
					schema?: S;
					cb?: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig;
					proxyClient?: mysql.Connection;
					jit?: boolean;
					paramsInErrors?: boolean;
				}): MySqlAsyncDatabase<any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
			};
			push: (schema: any) => Promise<void>;
			seed: <Schema extends MysqlSchema>(
				schema: Schema,
				refineCallback?: (funcs: FunctionsVersioning) => InferCallbackType<MySqlAsyncDatabase<any, any>, Schema>,
			) => Promise<void>;
			drizzle: {
				withCacheAll: {
					db: MySqlAsyncDatabase<any, typeof relations>;
					put: Mock<any>;
					get: Mock<any>;
					onMutate: Mock<any>;
					invalidate: Mock<any>;
				};
				withCacheExplicit: {
					db: MySqlAsyncDatabase<any, typeof relations>;
					put: Mock<any>;
					get: Mock<any>;
					onMutate: Mock<any>;
					invalidate: Mock<any>;
				};
			};
		}
	>({
		clients: [
			// oxlint-disable-next-line
			async ({}, use) => {
				if (vendor === 'mysql' || vendor === 'mysql-proxy') {
					// A connection and a database for each test that runs at once (vitest's maxConcurrency, 5): one
					// connection runs one query at a time, so concurrent tests sharing one ran one after another.
					const envurl = requireEnv('MYSQL_CONNECTION_STRING');
					const items = await Promise.all([0, 1, 2, 3, 4].map(async (i) => {
						const database = `drizzle_c${i}`;
						const client = await createConnection({ uri: envurl, supportBigNumbers: true, multipleStatements: true });
						await client.connect();
						await client.query(`drop database if exists ${database}; create database ${database}; use ${database};`);
						// A second independent connection to the same database, for transaction tests.
						const peer = await createConnection({ uri: envurl, supportBigNumbers: true });
						await peer.connect();
						await peer.query(`use ${database};`);

						const item: MySqlTestClient & { database: string; close: () => Promise<void> } = {
							client,
							database,
							query: async (sql: string, params: any[] = []) => (await client.query(sql, params))[0] as any[],
							batch: async (statements: string[]) => {
								await client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n'));
							},
							peer: vendor === 'mysql'
								? { query: async (sql: string) => (await peer.query(sql))[0] as any[] }
								: undefined,
							close: async () => {
								await peer.end();
								await client.end();
								client.destroy();
							},
						};
						return item;
					}));
					const take = createProvider([...items]);

					await use({
						acquire: async () => {
							const item = await take();
							return {
								...item,
								// A test may have switched the connection to another database (`use drizzle1`).
								release: async () => {
									await (item.client as mysql.Connection).query(`use ${item.database};`).catch(() => {});
									item.release();
								},
							};
						},
					});
					for (const item of items) await item.close();
					return;
				}

				if (vendor === 'planetscale') {
					const envurl = requireEnv('PLANETSCALE_CONNECTION_STRING');
					const client = new Client({ url: envurl });

					const query = async (sql: string, params: any[] = []) => {
						return client.execute(sql, params).then((x) => x.rows);
					};

					// In order: each execute is its own session, so run together a DROP could land after a CREATE.
					const batch = async (statements: string[]) => {
						for (const statement of statements) await client.execute(statement);
						return '' as any;
					};

					const tables =
						(await query('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();')).map(
							(x) => x['TABLE_NAME'],
						);
					const views =
						(await query('SELECT table_name FROM information_schema.views WHERE table_schema = DATABASE();')).map((x) =>
							x['TABLE_NAME']
						);

					const dropViews = views.length === 0
						? 'select 1;'
						: `DROP VIEW IF EXISTS ${views.map((x) => `\`${x}\``).join(',')};`;
					const dropTables = tables.length === 0
						? 'select 1;'
						: `DROP TABLE IF EXISTS ${tables.map((x) => `\`${x}\``).join(',')};`;
					await query(dropViews);
					await query('SET FOREIGN_KEY_CHECKS = 0;');
					await query(dropTables);
					await query('SET FOREIGN_KEY_CHECKS = 1;');

					// One database for all tests: concurrent ones share the client, as HTTP requests run side by side.
					const shared = { client, query, batch, peer: undefined };
					await use({ acquire: async () => ({ ...shared, release: async () => {} }) });
					return;
				}

				if (vendor === 'tidb') {
					const connectionString = requireEnv('TIDB_CONNECTION_STRING');

					const tmpClient = connect({ url: connectionString });
					await tmpClient.execute('drop database if exists ci;');
					await tmpClient.execute('create database ci;');
					await tmpClient.execute('use ci;');

					const client = connect({ url: connectionString, database: 'ci' });

					const query = async (sql: string, params: any[] = []) => {
						return client.execute(sql, params) as Promise<any[]>;
					};

					const batch = async (statements: string[]) => {
						const queries = statements.map((x) => {
							return client.execute(x);
						});
						return Promise.all(queries).then(() => '' as any);
					};
					const shared = { client, query, batch, peer: undefined };
					await use({ acquire: async () => ({ ...shared, release: async () => {} }) });
					return;
				}

				throw new Error('error');
			},
			{ scope: 'worker' },
		],
		client: [
			async ({ clients }, use) => {
				const { release, ...client } = await clients.acquire();
				try {
					await use(client);
				} finally {
					await release();
				}
			},
			{ scope: 'test' },
		],
		peer: [
			async ({ client }, use) => {
				await use(client.peer);
			},
			{ scope: 'test' },
		],
		db: [
			async ({ client }, use) => {
				const db = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as AnyMySql2Connection, relations })
					: vendor === 'tidb'
					? drizzleTidb({ client: client.client as Connection, relations })
					: vendor === 'planetscale'
					? psDrizzle({ client: client.client as Client, relations })
					: proxyDrizzle(createProxyHandler(client.client as mysql.Connection), {
						relations,
						codecs: mysql2Codecs,
					});

				await use(db as any);
			},
			{ scope: 'test' },
		],
		createDB: [
			async ({ client }, use) => {
				const createDB = <S extends MysqlSchema>(config: {
					schema?: S;
					cb?: (
						helpers: RelationsBuilder<ExtractTablesFromSchema<S>>,
					) => RelationsBuilderConfig<ExtractTablesFromSchema<S>>;
					proxyClient?: mysql.Connection;
					jit?: boolean;
					paramsInErrors?: boolean;
				}) => {
					const { schema, cb, proxyClient, jit, paramsInErrors } = config;
					const relations = schema ? cb ? defineRelations(schema, cb) : defineRelations(schema) : undefined;

					if (vendor === 'mysql') {
						return mysql2Drizzle({ client: client.client as any, relations, jit, paramsInErrors });
					}
					if (vendor === 'tidb') return drizzleTidb({ client: client.client as any, relations, jit, paramsInErrors });
					if (vendor === 'planetscale') {
						return psDrizzle({ client: client.client as any, relations, jit, paramsInErrors });
					}
					if (vendor === 'mysql-proxy') {
						return proxyDrizzle(createProxyHandler(proxyClient ?? client.client as any), {
							relations,
							codecs: mysql2Codecs,
							jit,
							paramsInErrors,
						}) as any;
					}
					throw new Error();
				};

				await use(createDB);
			},
			{ scope: 'test' },
		],
		push: [
			async ({ client }, use) => {
				const { query } = client;
				const push = (
					schema: any,
				) => _push(query, schema, vendor);

				await use(push);
			},
			{ scope: 'test' },
		],
		seed: [
			async ({ db }, use) => {
				const seed = (
					schema: any,
					refineCallback?: (funcs: FunctionsVersioning) => InferCallbackType<MySqlAsyncDatabase<any, any>, any>,
				) => _seed(db, schema, refineCallback);

				await use(seed);
			},
			{ scope: 'test' },
		],
		drizzle: [
			async ({ client }, use) => {
				const explicitCache = new TestCache('explicit');
				const allCache = new TestCache('all');
				const proxyHandler = createProxyHandler(client.client as mysql.Connection);

				const withCacheExplicit = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as any, relations, cache: explicitCache })
					: vendor === 'tidb'
					? drizzleTidb({ client: client.client as Connection, relations, cache: explicitCache })
					: vendor === 'planetscale'
					? psDrizzle({ client: client.client as any, relations, cache: explicitCache })
					: proxyDrizzle(proxyHandler, { relations, cache: explicitCache, codecs: mysql2Codecs });
				const withCacheAll = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as any, relations, cache: allCache })
					: vendor === 'tidb'
					? drizzleTidb({ client: client.client as Connection, relations, cache: allCache })
					: vendor === 'planetscale'
					? psDrizzle({ client: client.client as any, relations, cache: allCache })
					: proxyDrizzle(proxyHandler, { relations, cache: allCache, codecs: mysql2Codecs });

				const drz = {
					withCacheAll: {
						db: withCacheAll,
						put: vi.spyOn(allCache, 'put'),
						get: vi.spyOn(allCache, 'get'),
						onMutate: vi.spyOn(allCache, 'onMutate'),
						invalidate: vi.spyOn(withCacheAll.$cache, 'invalidate'),
					},
					withCacheExplicit: {
						db: withCacheExplicit,
						put: vi.spyOn(explicitCache, 'put'),
						get: vi.spyOn(explicitCache, 'get'),
						onMutate: vi.spyOn(explicitCache, 'onMutate'),
						invalidate: vi.spyOn(withCacheExplicit.$cache, 'invalidate'),
					},
				};

				await use(drz as any);

				await withCacheAll.$cache.invalidate({});
				await withCacheExplicit.$cache.invalidate({});
				drz.withCacheAll.get.mockClear();
				drz.withCacheAll.put.mockClear();
				drz.withCacheAll.onMutate.mockClear();
				drz.withCacheAll.invalidate.mockClear();
				drz.withCacheExplicit.get.mockClear();
				drz.withCacheExplicit.put.mockClear();
				drz.withCacheExplicit.onMutate.mockClear();
				drz.withCacheExplicit.invalidate.mockClear();
			},
			{ scope: 'test' },
		],
	});
};

export const mysqlTest = prepareTest('mysql');
export const planetscaleTest = prepareTest('planetscale');
export const tidbTest = prepareTest('tidb');
export const proxyTest = prepareTest('mysql-proxy').extend<
	{ simulator: ServerSimulator; createSimulator: (proxyClient?: mysql.Connection) => ServerSimulator }
>({
	simulator: [
		async ({ client: { client } }, use) => {
			const simulator = new ServerSimulator(client as mysql.Connection);
			await use(simulator);
		},
		{ scope: 'test' },
	],
	createSimulator: [
		async ({ client: { client } }, use) => {
			const createSimulator = (proxyClient?: mysql.Connection) => {
				const simulator = new ServerSimulator(proxyClient ?? client as mysql.Connection);
				return simulator;
			};

			await use(createSimulator);
		},
		{ scope: 'test' },
	],
});
export type Test = ReturnType<typeof prepareTest>;
