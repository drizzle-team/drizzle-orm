import { Client } from '@planetscale/database';
import { connect, type Connection } from '@tidbcloud/serverless';
import { getTableName, is, Table } from 'drizzle-orm';
import type { MutationOption } from 'drizzle-orm/cache/core';
import { Cache } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type { MySqlDatabase, MySqlSchema, MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
import { drizzle as proxyDrizzle } from 'drizzle-orm/mysql-proxy';
import type { AnyMySql2Connection } from 'drizzle-orm/mysql2';
import { drizzle as mysql2Drizzle } from 'drizzle-orm/mysql2';
import { drizzle as psDrizzle } from 'drizzle-orm/planetscale-serverless';
import { drizzle as drizzleTidb } from 'drizzle-orm/tidb-serverless';
import { type FunctionsVersioning, type InferCallbackType, seed } from 'drizzle-seed';
import Keyv from 'keyv';
import { createConnection } from 'mysql2/promise';
import type * as mysql from 'mysql2/promise';
import type { Mock } from 'vitest';
import { test as base, vi } from 'vitest';
import { relations } from './schema';

// eslint-disable-next-line drizzle-internal/require-entity-kind
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

// eslint-disable-next-line drizzle-internal/require-entity-kind
class ServerSimulator {
	constructor(private db: mysql.Connection) {}

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					rowsAsArray: true,
					typeCast: function(field: any, next: any) {
						if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
							return field.string();
						}
						return next();
					},
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
					typeCast: function(field: any, next: any) {
						if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
							return field.string();
						}
						return next();
					},
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
) => InferCallbackType<MySqlDatabase<any, any>, Schema>;

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
	db: MySqlDatabase<any, any>,
	schema: Schema,
	refineCallback?: RefineCallbackT<Schema>,
) => {
	return refineCallback === undefined ? seed(db, schema) : seed(db, schema).refine(refineCallback);
};

const createProxyHandler = (client: mysql.Connection) => {
	const serverSimulator = new ServerSimulator(client);
	const proxyHandler = async (sql: string, params: any[], method: any) => {
		try {
			const response = await serverSimulator.query(sql, params, method);
			if (response.error !== undefined) {
				throw response.error;
			}
			return { rows: response.data };
		} catch (e: any) {
			console.error('Error from mysql proxy server:', e.message);
			throw e;
		}
	};
	return proxyHandler;
};
const prepareTest = (vendor: 'mysql' | 'planetscale' | 'tidb' | 'mysql-proxy') => {
	return base.extend<
		{
			client: {
				client: AnyMySql2Connection | Client | Connection;
				query: (sql: string, params: any[]) => Promise<any[]>;
				batch: (statements: string[]) => Promise<void>;
			};
			// proxyHandler: (sql: string, params: any[], method: any) => Promise<{
			// 	rows: any;
			// }>;
			db: MySqlDatabase<any, any, never, typeof relations>;
			push: (schema: any) => Promise<void>;
			seed: <Schema extends MysqlSchema>(
				schema: Schema,
				refineCallback?: (funcs: FunctionsVersioning) => InferCallbackType<MySqlDatabase<any, any>, Schema>,
			) => Promise<void>;
			drizzle: {
				withCacheAll: {
					db: MySqlDatabase<any, any>;
					put: Mock<any>;
					get: Mock<any>;
					onMutate: Mock<any>;
					invalidate: Mock<any>;
				};
				withCacheExplicit: {
					db: MySqlDatabase<any, any>;
					put: Mock<any>;
					get: Mock<any>;
					onMutate: Mock<any>;
					invalidate: Mock<any>;
				};
			};
		}
	>({
		client: [
			// oxlint-disable-next-line
			async ({}, use) => {
				if (vendor === 'mysql' || vendor === 'mysql-proxy') {
					const envurl = process.env['MYSQL_CONNECTION_STRING'];
					if (!envurl) throw new Error('No mysql url provided');
					const client = await createConnection({
						uri: envurl,
						supportBigNumbers: true,
						multipleStatements: true,
					});
					await client.connect();
					await client.query('drop database drizzle; create database drizzle; use drizzle;');

					const query = async (sql: string, params: any[] = []) => {
						const res = await client.query(sql, params);
						return res[0] as any[];
					};
					const batch = async (statements: string[]) => {
						return client.query(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
					};

					await use({ client, query, batch });
					await client.end();
					client.destroy();
					return;
				}

				if (vendor === 'planetscale') {
					const envurl = process.env['PLANETSCALE_CONNECTION_STRING'];
					if (!envurl) throw new Error('No mysql url provided');
					const client = new Client({ url: envurl });

					const query = async (sql: string, params: any[] = []) => {
						return client.execute(sql, params).then((x) => x.rows);
					};

					const batch = async (statements: string[]) => {
						const queries = statements.map((x) => {
							return client.execute(x);
						});
						return Promise.all(queries).then(() => '' as any);
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

					await use({ client, query, batch });
					return;
				}

				if (vendor === 'tidb') {
					const connectionString = process.env['TIDB_CONNECTION_STRING'];
					if (!connectionString) {
						throw new Error('TIDB_CONNECTION_STRING is not set');
					}

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
					await use({ client, query, batch });
					return;
				}

				throw new Error('error');
			},
			{ scope: 'worker' },
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
					});

				await use(db as any);
			},
			{ scope: 'worker' },
		],
		push: [
			async ({ client }, use) => {
				const { query } = client;
				const push = (
					schema: any,
				) => _push(query, schema, vendor);

				await use(push);
			},
			{ scope: 'worker' },
		],
		seed: [
			async ({ db }, use) => {
				const seed = (
					schema: any,
					refineCallback?: (funcs: FunctionsVersioning) => InferCallbackType<MySqlDatabase<any, any>, any>,
				) => _seed(db, schema, refineCallback);

				await use(seed);
			},
			{ scope: 'worker' },
		],
		drizzle: [
			async ({ client }, use) => {
				const explicitCache = new TestCache('explicit');
				const allCache = new TestCache('all');
				const proxyHandler = createProxyHandler(client.client as mysql.Connection);

				const withCacheExplicit = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as any, cache: explicitCache })
					: vendor === 'tidb'
					? drizzleTidb({ client: client.client as Connection, relations, cache: explicitCache })
					: vendor === 'planetscale'
					? psDrizzle({ client: client.client as any, cache: explicitCache })
					: proxyDrizzle(proxyHandler, { cache: explicitCache });
				const withCacheAll = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as any, cache: allCache })
					: vendor === 'tidb'
					? drizzleTidb({ client: client.client as Connection, relations, cache: allCache })
					: vendor === 'planetscale'
					? psDrizzle({ client: client.client as any, cache: allCache })
					: proxyDrizzle(proxyHandler, { cache: allCache });

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
export const proxyTest = prepareTest('mysql-proxy').extend<{ simulator: ServerSimulator }>({
	simulator: [
		async ({ client: { client } }, use) => {
			const simulator = new ServerSimulator(client as mysql.Connection);
			await use(simulator);
		},
		{ scope: 'test' },
	],
});
export type Test = ReturnType<typeof prepareTest>;
