import { createProvider, requireEnv } from '@drizzle/test-utils';
import {
	type AnyRelationsBuilderConfig,
	defineRelations,
	type ExtractTablesFromSchema,
	type ExtractTablesWithRelations,
	type RelationsBuilder,
	type RelationsBuilderConfig,
} from 'drizzle-orm';
import { drizzle as drizzleSingleStore, type SingleStoreDatabase } from 'drizzle-orm/singlestore';
import { makeSingleStoreRawTextTypeCast } from 'drizzle-orm/singlestore';
import type { SingleStoreEnumColumn, SingleStoreSchema, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { SingleStoreView } from 'drizzle-orm/singlestore-core/view';
import { drizzle as drizzleProxy } from 'drizzle-orm/singlestore-proxy';
import { singleStoreCodecs } from 'drizzle-orm/singlestore/codecs';
import { type Connection, createConnection } from 'mysql2/promise';
import { test as base } from 'vitest';
import relations from './relations';

const rawTextTypeCast = makeSingleStoreRawTextTypeCast();

class ServerSimulator {
	constructor(private db: Connection) {}

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					rowsAsArray: true,
					// queries drizzle decodes with codecs decode these column types from text
					typeCast: rawTextTypeCast,
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
					// relational queries, which drizzle decodes with codecs, run in this method as well
					typeCast: rawTextTypeCast,
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

export const providerForSingleStore = async () => {
	const url = requireEnv('SINGLESTORE_MANY_CONNECTION_STRING');
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareSingleStoreClient(urlI)));

	return createProvider(clients);
};

export const provideForProxy = async () => {
	const url = requireEnv('SINGLESTORE_MANY_CONNECTION_STRING');
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareSingleStoreClient(urlI)));

	return createProvider(clients);
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
		db: SingleStoreDatabase<any, any, typeof relations>;
		push: (schema: any) => Promise<void>;
		createDB: {
			<S extends SingleStoreSchema_>(
				schema: S,
			): SingleStoreDatabase<any, any, ReturnType<typeof defineRelations<S>>>;
			<S extends SingleStoreSchema_, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
				useJitMappers?: boolean,
				paramsInErrors?: boolean,
			): SingleStoreDatabase<any, any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
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
					await use(drizzleProxy(proxyHandler, { relations, codecs: singleStoreCodecs }));
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
					useJitMappers?: boolean,
					paramsInErrors?: boolean,
				) => {
					const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);

					if (vendor === 'singlestore') {
						return drizzleSingleStore({ client: kit.client, relations, jit: useJitMappers, paramsInErrors });
					}

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
						return drizzleProxy(proxyHandler, {
							relations,
							jit: useJitMappers,
							paramsInErrors,
							codecs: singleStoreCodecs,
						});
					}
					throw new Error();
				};

				await use(createDB);
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
