import { Client } from '@planetscale/database';
import { getTableName, is, Table } from 'drizzle-orm';
import type { MutationOption } from 'drizzle-orm/cache/core';
import { Cache } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type { MySqlDatabase } from 'drizzle-orm/mysql-core';
import type { AnyMySql2Connection } from 'drizzle-orm/mysql2';
import { drizzle as mysql2Drizzle } from 'drizzle-orm/mysql2';
import { drizzle as psDrizzle } from 'drizzle-orm/planetscale-serverless';
import { FunctionsVersioning, InferCallbackType, seed } from 'drizzle-seed';
import Keyv from 'keyv';
import { createConnection } from 'mysql2/promise';
import type { Mock } from 'vitest';
import { test as base, vi } from 'vitest';
import type { MysqlSchema } from '../../../drizzle-kit/tests/mysql/mocks';
import { diff } from '../../../drizzle-kit/tests/mysql/mocks';
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

export type RefineCallbackT<Schema extends MysqlSchema> = (
	funcs: FunctionsVersioning,
) => InferCallbackType<MySqlDatabase<any, any>, Schema>;

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: MysqlSchema,
) => {
	const res = await diff({}, schema, []);
	for (const s of res.sqlStatements) {
		await query(s, []);
	}
};

const _seed = async <Schema extends MysqlSchema>(
	db: MySqlDatabase<any, any>,
	schema: Schema,
	refineCallback?: RefineCallbackT<Schema>,
) => {
	return refineCallback === undefined ? seed(db, schema) : seed(db, schema).refine(refineCallback);
};

const prepareTest = (vendor: 'mysql' | 'planetscale') => {
	return base.extend<
		{
			client: {
				client: AnyMySql2Connection | Client;
				query: (sql: string, params: any[]) => Promise<any[]>;
				batch: (statements: string[]) => Promise<void>;
			};
			db: MySqlDatabase<any, any, never, typeof relations>;
			push: (schema: MysqlSchema) => Promise<void>;
			seed: (
				schema: MysqlSchema,
				refineCallback?: (funcs: FunctionsVersioning) => InferCallbackType<MySqlDatabase<any, any>, MysqlSchema>,
			) => Promise<void>;
			drizzle: {
				withCacheAll: {
					db: MySqlDatabase<any, any>;
					put: Mock<() => never>;
					get: Mock<() => never>;
					onMutate: Mock<() => never>;
					invalidate: Mock<() => never>;
				};
				withCacheExplicit: {
					db: MySqlDatabase<any, any>;
					put: Mock<() => never>;
					get: Mock<() => never>;
					onMutate: Mock<() => never>;
					invalidate: Mock<() => never>;
				};
			};
		}
	>({
		client: [
			// oxlint-disable-line no-empty-pattern
			async ({}, use) => {
				if (vendor === 'mysql') {
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
					: psDrizzle({ client: client.client as Client, relations });

				await use(db as any);
			},
			{ scope: 'worker' },
		],
		push: [
			async ({ client }, use) => {
				const { query } = client;
				const push = (
					schema: MysqlSchema,
				) => _push(query, schema);

				await use(push);
			},
			{ scope: 'worker' },
		],
		seed: [
			async ({ db }, use) => {
				const seed = (
					schema: MysqlSchema,
					refineCallback?: (funcs: FunctionsVersioning) => InferCallbackType<MySqlDatabase<any, any>, MysqlSchema>,
				) => _seed(db, schema, refineCallback);

				await use(seed);
			},
			{ scope: 'worker' },
		],
		drizzle: [
			async ({ client }, use) => {
				const explicitCache = new TestCache('explicit');
				const allCache = new TestCache('all');
				const withCacheExplicit = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as any, cache: explicitCache })
					: psDrizzle({ client: client.client as any, cache: explicitCache });
				const withCacheAll = vendor === 'mysql'
					? mysql2Drizzle({ client: client.client as any, cache: allCache })
					: psDrizzle({ client: client.client as any, cache: allCache });

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

				await use(drz);

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
export type Test = ReturnType<typeof prepareTest>;
