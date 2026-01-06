import { neon, neonConfig, type NeonQueryFunction, Pool as NeonPool } from '@neondatabase/serverless';

import { PGlite } from '@electric-sql/pglite';
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
import { drizzle as drizzleNeonHttp, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNeonWs } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
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
import { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';
import { drizzle as drizzleProxy } from 'drizzle-orm/pg-proxy';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgresjs } from 'drizzle-orm/postgres-js';
import Keyv from 'keyv';
import { Client as ClientNodePostgres, types as typesNodePostgres } from 'pg';
import postgres from 'postgres';
import { test as base } from 'vitest';
import ws from 'ws';
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

neonConfig.webSocketConstructor = ws;

// TODO: @L-Mario564 we need this rule only for drizzle-orm package
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
	constructor(private db: ClientNodePostgres) {
		const types = typesNodePostgres;

		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
		types.setTypeParser(types.builtins.INTERVAL, (val) => val);
		types.setTypeParser(1231 as (typeof types.builtins)[keyof typeof types.builtins], (val) => val);
		types.setTypeParser(1115 as (typeof types.builtins)[keyof typeof types.builtins], (val) => val);
		types.setTypeParser(1185 as (typeof types.builtins)[keyof typeof types.builtins], (val) => val);
		types.setTypeParser(1187 as (typeof types.builtins)[keyof typeof types.builtins], (val) => val);
		types.setTypeParser(1182 as (typeof types.builtins)[keyof typeof types.builtins], (val) => val);
	}

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
					text: sql,
					values: params,
					rowMode: 'array',
				});

				return { data: result.rows as any };
			} catch (e: any) {
				return { error: e };
			}
		} else if (method === 'execute') {
			try {
				const result = await this.db.query({
					text: sql,
					values: params,
				});

				return { data: result.rows as any };
			} catch (e: any) {
				return { error: e };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	async migrations(queries: string[]) {
		await this.db.query('BEGIN');
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
	const { diff } = await import('../../../drizzle-kit/tests/postgres/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const prepareNeonHttpClient = async (db: string) => {
	const url = new URL(process.env['NEON_CONNECTION_STRING']!);
	url.pathname = `/${db}`;
	const client = neon(url.toString());

	await client('drop schema if exists public, "mySchema" cascade;');
	await client('create schema public');
	await client('create schema "mySchema";');
	await client(`SET TIME ZONE 'UTC';`);

	const query = async (sql: string, params: any[] = []) => {
		const res = await client(sql, params);
		return res as any[];
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client(x))).then((results) => [results] as any);
	};

	return { client, query, batch };
};

export const prepareNeonWsClient = async (db: string) => {
	const url = new URL(process.env['NEON_CONNECTION_STRING']!);
	url.pathname = `/${db}`;
	const client = new NeonPool({ connectionString: url.toString(), max: 1 });

	await client.query('drop schema if exists public, "mySchema" cascade;');
	await client.query('create schema public');
	await client.query('create schema "mySchema";');
	await client.query(`SET TIME ZONE 'UTC';`);

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
	};

	return { client, query, batch };
};

export const preparePglite = async () => {
	const client = new PGlite();
	await client.query('create schema "mySchema";');

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
	};

	return { client, query, batch };
};

export const prepareNodePostgres = async (db: string) => {
	const url = new URL(process.env['PG_CONNECTION_STRING']!);
	url.pathname = `/${db}`;
	if (!url) throw new Error();

	const client = new ClientNodePostgres(url.toString());
	client.connect();

	await client.query('drop schema if exists public, "mySchema" cascade;');
	await client.query('create schema public');
	await client.query('create schema "mySchema";');

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
	};

	return { client, query, batch };
};

export const preparePostgresjs = async (db: string) => {
	const url = new URL(process.env['PG_CONNECTION_STRING']!);
	url.pathname = `/${db}`;
	if (!url) throw new Error();

	const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
	await client`drop schema if exists public, "mySchema" cascade;`;
	await client`create schema public`;
	await client`create schema "mySchema";`;

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.unsafe(sql, params);
		return res;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.unsafe(x))).then((results) => [results] as any);
	};

	return { client, query, batch };
};

export const prepareProxy = async (db: string) => {
	const url = new URL(process.env['PG_CONNECTION_STRING']!);
	url.pathname = `/${db}`;
	if (!url) throw new Error();

	const client = new ClientNodePostgres(url.toString());
	client.connect();

	await client.query('drop schema if exists public, "mySchema" cascade;');
	await client.query('create schema public');
	await client.query('create schema "mySchema";');

	const query = async (sql: string, params: any[] = []) => {
		const res = await client.query(sql, params);
		return res.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(statements.map((x) => client.query(x))).then((results) => [results] as any);
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

export const providerForNeonHttp = async () => {
	const clients = [
		await prepareNeonHttpClient('db0'),
		await prepareNeonHttpClient('db1'),
		await prepareNeonHttpClient('db2'),
		await prepareNeonHttpClient('db3'),
		await prepareNeonHttpClient('db4'),
	];

	return providerClosure(clients);
};

export const providerForNeonWs = async () => {
	const clients = [
		await prepareNeonWsClient('db5'),
		await prepareNeonWsClient('db6'),
		await prepareNeonWsClient('db7'),
		await prepareNeonWsClient('db8'),
		await prepareNeonWsClient('db9'),
	];

	return providerClosure(clients);
};

export const provideForPglite = async () => {
	const clients = [
		await preparePglite(),
		await preparePglite(),
		await preparePglite(),
		await preparePglite(),
		await preparePglite(),
	];

	return providerClosure(clients);
};

export const provideForNodePostgres = async () => {
	const url = process.env['PG_CONNECTION_STRING'];
	if (!url) throw new Error();
	const client = new ClientNodePostgres({ connectionString: url });
	client.connect();

	await client.query(`drop database if exists db0`);
	await client.query(`drop database if exists db1`);
	await client.query(`drop database if exists db2`);
	await client.query(`drop database if exists db3`);
	await client.query(`drop database if exists db4`);
	await client.query('create database db0;');
	await client.query('create database db1;');
	await client.query('create database db2;');
	await client.query('create database db3;');
	await client.query('create database db4;');

	const clients = [
		await prepareNodePostgres('db0'),
		await prepareNodePostgres('db1'),
		await prepareNodePostgres('db2'),
		await prepareNodePostgres('db3'),
		await prepareNodePostgres('db4'),
	];

	return providerClosure(clients);
};

export const provideForPostgresjs = async () => {
	const url = process.env['PG_CONNECTION_STRING'];
	if (!url) throw new Error();
	const client = postgres(url, { max: 1, onnotice: () => {} });

	await client`drop database if exists db0`;
	await client`drop database if exists db1`;
	await client`drop database if exists db2`;
	await client`drop database if exists db3`;
	await client`drop database if exists db4`;
	await client`create database db0;`;
	await client`create database db1;`;
	await client`create database db2;`;
	await client`create database db3;`;
	await client`create database db4;`;

	const clients = [
		await preparePostgresjs('db0'),
		await preparePostgresjs('db1'),
		await preparePostgresjs('db2'),
		await preparePostgresjs('db3'),
		await preparePostgresjs('db4'),
	];

	return providerClosure(clients);
};

export const provideForProxy = async () => {
	const url = process.env['PG_CONNECTION_STRING'];
	if (!url) throw new Error();
	const client = new ClientNodePostgres({ connectionString: url });
	client.connect();

	await client.query(`drop database if exists db0`);
	await client.query('create database db0;');

	const clients = [
		await prepareProxy('db0'),
	];

	return providerClosure(clients);
};

type ProviderNeonHttp = Awaited<ReturnType<typeof providerForNeonHttp>>;
type ProviderNeonWs = Awaited<ReturnType<typeof providerForNeonWs>>;
type ProvideForPglite = Awaited<ReturnType<typeof provideForPglite>>;
type ProvideForNodePostgres = Awaited<ReturnType<typeof provideForNodePostgres>>;
type ProvideForPostgresjs = Awaited<ReturnType<typeof provideForPostgresjs>>;
type ProvideForProxy = Awaited<ReturnType<typeof provideForProxy>>;

type Provider =
	| ProviderNeonHttp
	| ProviderNeonWs
	| ProvideForPglite
	| ProvideForNodePostgres
	| ProvideForPostgresjs
	| ProvideForProxy;

const testFor = (vendor: 'neon-http' | 'neon-serverless' | 'pglite' | 'node-postgres' | 'postgresjs' | 'proxy') => {
	return base.extend<{
		provider: Provider;
		kit: {
			client: any;
			query: (sql: string, params?: any[]) => Promise<any[]>;
			batch: (statements: string[]) => Promise<any>;
		};
		client: any;
		db: PgAsyncDatabase<any, any, typeof relations>;
		push: (schema: any) => Promise<void>;
		createDB: {
			<S extends PostgresSchema>(schema: S): PgAsyncDatabase<any, any, ReturnType<typeof defineRelations<S>>>;
			<S extends PostgresSchema, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
			): PgAsyncDatabase<any, any, ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
		};
		caches: { all: PgAsyncDatabase<any, any, typeof relations>; explicit: PgAsyncDatabase<any, any, typeof relations> };
	}>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const provider = vendor === 'neon-http'
					? await providerForNeonHttp()
					: vendor === 'neon-serverless'
					? await providerForNeonWs()
					: vendor === 'pglite'
					? await provideForPglite()
					: vendor === 'node-postgres'
					? await provideForNodePostgres()
					: vendor === 'postgresjs'
					? await provideForPostgresjs()
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
							console.error('Error from pg proxy server:', e.message);
							throw e;
						}
					};
					await use(drizzleProxy(proxyHandler, { relations }));
					return;
				}

				const db = vendor === 'neon-http'
					? drizzleNeonHttp({ client: kit.client as any, relations })
					: vendor === 'neon-serverless'
					? drizzleNeonWs({ client: kit.client as any, relations })
					: vendor === 'pglite'
					? drizzlePglite({ client: kit.client as any, relations })
					: vendor === 'node-postgres'
					? drizzleNodePostgres({ client: kit.client as any, relations })
					: vendor === 'postgresjs'
					? drizzlePostgresjs({ client: kit.client as any, relations })
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
				const createDB = <S extends PostgresSchema>(
					schema: S,
					cb?: (
						helpers: RelationsBuilder<ExtractTablesFromSchema<S>>,
					) => RelationsBuilderConfig<ExtractTablesFromSchema<S>>,
				) => {
					const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);

					if (vendor === 'neon-http') return drizzleNeonHttp({ client: kit.client, relations });
					if (vendor === 'neon-serverless') return drizzleNeonWs({ client: kit.client as any, relations });
					if (vendor === 'pglite') return drizzlePglite({ client: kit.client as any, relations });
					if (vendor === 'node-postgres') return drizzleNodePostgres({ client: kit.client as any, relations });
					if (vendor === 'postgresjs') return drizzlePostgresjs({ client: kit.client as any, relations });

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
								console.error('Error from pg proxy server:', e.message);
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
							console.error('Error from pg proxy server:', e.message);
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

				const db1 = vendor === 'neon-http'
					? drizzleNeonHttp(config1)
					: vendor === 'neon-serverless'
					? drizzleNeonWs(config1)
					: vendor === 'pglite'
					? drizzlePglite(config1)
					: vendor === 'node-postgres'
					? drizzleNodePostgres(config1)
					: vendor === 'postgresjs'
					? drizzlePostgresjs(config1)
					: '' as never;

				const db2 = vendor === 'neon-http'
					? drizzleNeonHttp(config2)
					: vendor === 'neon-serverless'
					? drizzleNeonWs(config2)
					: vendor === 'pglite'
					? drizzlePglite(config2)
					: vendor === 'node-postgres'
					? drizzleNodePostgres(config2)
					: vendor === 'postgresjs'
					? drizzlePostgresjs(config2)
					: '' as never;

				await use({ all: db1, explicit: db2 });
			},
			{ scope: 'test' },
		],
	});
};

export const neonHttpTest = testFor('neon-http').extend<{ neonhttp: NeonHttpDatabase }>({
	neonhttp: [
		async ({ kit }, use) => {
			const db = drizzleNeonHttp({ client: kit.client as NeonQueryFunction<false, false>, relations });
			await use(db);
		},
		{ scope: 'test' },
	],
});

export const neonWsTest = testFor('neon-serverless');
export const pgliteTest = testFor('pglite');
export const nodePostgresTest = testFor('node-postgres');
export const postgresjsTest = testFor('postgresjs');
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
