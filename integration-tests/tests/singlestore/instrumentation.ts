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
import { drizzle as drizzleSingleStore, type SingleStoreDatabase } from 'drizzle-orm/singlestore';
import type { SingleStoreEnumColumn, SingleStoreSchema, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { SingleStoreView } from 'drizzle-orm/singlestore-core/view';
import { drizzle as drizzleProxy } from 'drizzle-orm/singlestore-proxy';
import Keyv from 'keyv';
import { type Connection, createConnection } from 'mysql2/promise';
import { test as base } from 'vitest';
import relations from './relations';

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

// eslint-disable-next-line drizzle-internal/require-entity-kind
class ServerSimulator {
	constructor(private db: Connection) {}

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

export const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/singlestore/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const prepareSingleStoreClient = async (uri: string) => {
	const client = await createConnection({
		uri,
		supportBigNumbers: true,
		multipleStatements: true,
	});
	await client.connect();

	await Promise.all([
		client.query('drop database if exists "mySchema";'),
		client.query('drop database if exists drizzle;'),
	]);

	await Promise.all([
		client.query('create database "mySchema";'),
		client.query('create database drizzle'),
	]);

	await client.changeUser({ database: 'drizzle' });

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res[0] as any[];
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => client.query(x)),
		).then((results) => [results] as any);
	};

	return { client, query, batch };
};

export const prepareProxy = async (uri: string) => {
	const client = await createConnection({
		uri,
		supportBigNumbers: true,
		multipleStatements: true,
	});
	await client.connect();

	await Promise.all([
		client.query('drop database if exists "mySchema";'),
		client.query('drop database if exists drizzle;'),
	]);

	await Promise.all([
		client.query('create database "mySchema";'),
		client.query('create database drizzle'),
	]);

	await client.changeUser({ database: 'drizzle' });

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res[0] as any[];
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => client.query(x)),
		).then((results) => [results] as any);
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

export const providerForSingleStore = async () => {
	const url = process.env['SINGLESTORE_MANY_CONNECTION_STRING'];
	if (url === undefined) throw new Error('SINGLESTORE_CONNECTION_STRING is not set.');
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareSingleStoreClient(urlI)));

	return providerClosure(clients);
};

export const provideForProxy = async () => {
	const url = process.env['SINGLESTORE_MANY_CONNECTION_STRING'];
	if (url === undefined) throw new Error('SINGLESTORE_CONNECTION_STRING is not set.');
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareSingleStoreClient(urlI)));

	return providerClosure(clients);
};

type ProviderSingleStore = Awaited<ReturnType<typeof providerForSingleStore>>;
type ProvideForProxy = Awaited<ReturnType<typeof provideForProxy>>;

type Provider =
	| ProviderSingleStore
	| ProvideForProxy;

export type SingleStoreSchema_ = Record<
	string,
	| SingleStoreTable<any>
	| SingleStoreEnumColumn<any>
	| SingleStoreSchema
	| SingleStoreView
	| unknown
>;

const testFor = (vendor: 'singlestore' | 'proxy') => {
	return base.extend<{
		provider: Provider;
		kit: {
			client: any;
			query: (sql: string, params?: any[]) => Promise<any[]>;
			batch: (statements: string[]) => Promise<any>;
		};
		client: Connection;
		db: SingleStoreDatabase<any, any, any, typeof relations>;
		push: (schema: any) => Promise<void>;
		createDB: {
			<S extends SingleStoreSchema_>(
				schema: S,
			): SingleStoreDatabase<any, any, any, ReturnType<typeof defineRelations<S>>>;
			<S extends SingleStoreSchema_, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
			): SingleStoreDatabase<any, any, any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
		};
		caches: {
			all: SingleStoreDatabase<any, any, any, typeof relations>;
			explicit: SingleStoreDatabase<any, any, any, typeof relations>;
		};
	}>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const provider = vendor === 'singlestore'
					? await providerForSingleStore()
					: vendor === 'proxy'
					? await provideForProxy()
					: '' as never;

				await use(provider);
			},
			{ scope: 'file' },
		],
		kit: [
			async ({ provider }, use) => {
				const { client, batch, query, release } = await provider();
				await use({ client: client, query, batch });
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
				if (vendor === 'proxy') {
					const serverSimulator = new ServerSimulator(kit.client);
					const proxyHandler = async (sql: string, params: any[], method: any) => {
						try {
							const response = await serverSimulator.query(sql, params, method);

							if (response.error !== undefined) {
								throw response.error;
							}

							return { rows: response.data };
						} catch (e: any) {
							console.error('Error from singlestore proxy server:', e.message);
							throw e;
						}
					};
					await use(drizzleProxy(proxyHandler, { relations }));
					return;
				}

				const db = vendor === 'singlestore'
					? drizzleSingleStore({ client: kit.client as any, relations })
					: '' as never;

				await use(db);
			},
			{ scope: 'test' },
		],
		push: [
			async ({ kit }, use) => {
				const push = (
					schema: any,
				) => _push(kit.query, schema);

				await use(push);
			},
			{ scope: 'test' },
		],
		createDB: [
			async ({ kit }, use) => {
				const createDB = <S extends SingleStoreSchema_>(
					schema: S,
					cb?: (
						helpers: RelationsBuilder<ExtractTablesFromSchema<S>>,
					) => RelationsBuilderConfig<ExtractTablesFromSchema<S>>,
				) => {
					const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);

					if (vendor === 'singlestore') return drizzleSingleStore({ client: kit.client, relations });

					if (vendor === 'proxy') {
						const serverSimulator = new ServerSimulator(kit.client);
						const proxyHandler = async (sql: string, params: any[], method: any) => {
							try {
								const response = await serverSimulator.query(sql, params, method);

								if (response.error !== undefined) {
									throw response.error;
								}

								return { rows: response.data };
							} catch (e: any) {
								console.error('Error from singlestore proxy server:', e.message);
								throw e;
							}
						};
						return drizzleProxy(proxyHandler, { relations });
					}
					throw new Error();
				};

				await use(createDB);
			},
			{ scope: 'test' },
		],
		caches: [
			async ({ kit }, use) => {
				if (vendor === 'proxy') {
					const serverSimulator = new ServerSimulator(kit.client);
					const proxyHandler = async (sql: string, params: any[], method: any) => {
						try {
							const response = await serverSimulator.query(sql, params, method);

							if (response.error !== undefined) {
								throw response.error;
							}

							return { rows: response.data };
						} catch (e: any) {
							console.error('Error from singlestore proxy server:', e.message);
							throw e;
						}
					};
					const db1 = drizzleProxy(proxyHandler, { relations, cache: new TestCache('all') });
					const db2 = drizzleProxy(proxyHandler, { relations, cache: new TestCache('explicit') });
					await use({ all: db1, explicit: db2 });
					return;
				}

				const config1 = { client: kit.client as any, relations, cache: new TestCache('all') };
				const config2 = { client: kit.client as any, relations, cache: new TestCache('explicit') };

				const db1 = vendor === 'singlestore'
					? drizzleSingleStore(config1)
					: '' as never;

				const db2 = vendor === 'singlestore'
					? drizzleSingleStore(config2)
					: '' as never;

				await use({ all: db1, explicit: db2 });
			},
			{ scope: 'test' },
		],
	});
};

export const singleStoreTest = testFor('singlestore');
export const proxyTest = testFor('proxy').extend<{ simulator: ServerSimulator }>({
	simulator: [
		async ({ client }, use) => {
			const simulator = new ServerSimulator(client);
			await use(simulator);
		},
		{ scope: 'test' },
	],
});

export type Test = ReturnType<typeof testFor>;
