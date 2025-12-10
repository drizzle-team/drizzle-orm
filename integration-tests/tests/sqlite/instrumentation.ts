import { type Client as LibSQLClient, createClient, type InArgs, type InStatement } from '@libsql/client';
import {
	createClient as createHttpClient,
	type InArgs as HttpInArgs,
	type InStatement as HttpInStatement,
} from '@libsql/client/http';
import {
	createClient as createNodeClient,
	type InArgs as NodeInArgs,
	type InStatement as NodeInStatement,
} from '@libsql/client/node';
import {
	createClient as createSqlite3Client,
	type InArgs as Sqlite3InArgs,
	type InStatement as Sqlite3InStatement,
} from '@libsql/client/sqlite3';
import {
	type Client as LibSQLWsClient,
	createClient as createWsClient,
	type InArgs as WsInArgs,
	type InStatement as WsInStatement,
} from '@libsql/client/ws';
import { D1Database, D1DatabaseAPI } from '@miniflare/d1';
import { createSQLiteDB } from '@miniflare/shared';
import { Database as SqliteCloudDatabase, SQLiteCloudRowset } from '@sqlitecloud/drivers';
import { Database as TursoDatabase } from '@tursodatabase/database';
import retry from 'async-retry';
import type BetterSqlite3 from 'better-sqlite3';
import Client from 'better-sqlite3';
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
import { drizzle as drizzleBetterSqlite3 } from 'drizzle-orm/better-sqlite3';
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibSQL, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle as drizzleLibSQLHttp } from 'drizzle-orm/libsql/http';
import { drizzle as drizzleLibSQLNode } from 'drizzle-orm/libsql/node';
import { drizzle as drizzleLibSQLSqlite3 } from 'drizzle-orm/libsql/sqlite3';
import { drizzle as drizzleLibSQLWs } from 'drizzle-orm/libsql/ws';
import { drizzle as drizzleSqlJs } from 'drizzle-orm/sql-js';
import { drizzle as drizzleSqliteCloud } from 'drizzle-orm/sqlite-cloud';
import { BaseSQLiteDatabase, SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';
import { drizzle as drizzleTursoDatabase } from 'drizzle-orm/tursodatabase/database';
import Keyv from 'keyv';
import type { Database as SQLJsDatabase } from 'sql.js';
import initSqlJs from 'sql.js';
import { test as base } from 'vitest';
import relations from './relations';
import sqliteRelations from './sqlite.relations';
import * as sqliteSchema from './sqlite.schema';

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
	constructor(private db: BetterSqlite3.Database) {}

	async query(sql: string, params: any[], method: string) {
		if (method === 'run') {
			try {
				const result = this.db.prepare(sql).run(params);
				return { data: result as any };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'all' || method === 'values') {
			try {
				const rows = this.db.prepare(sql).raw().all(params);
				return { data: rows };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'get') {
			try {
				const row = this.db.prepare(sql).raw().get(params);
				return { data: row };
			} catch (e: any) {
				return { error: e.message };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	migrations(queries: string[]) {
		this.db.exec('BEGIN');
		try {
			for (const query of queries) {
				this.db.exec(query);
			}
			this.db.exec('COMMIT');
		} catch {
			this.db.exec('ROLLBACK');
		}

		return {};
	}
}

export const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
) => {
	const { diff } = await import('../../../drizzle-kit/tests/sqlite/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const prepareSQLiteCloudClient = async (uri: string) => {
	const client = new SqliteCloudDatabase(uri);

	// TODO: revise: maybe I should create run and all funcs instead of query func
	const all = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		return await new Promise<any>((resolve, reject) => {
			(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
				if (e) return reject(e);

				return resolve(d.map((v) => Object.fromEntries(Object.entries(v))));
			});
		});
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		return await new Promise<any>((resolve, reject) => {
			(params.length ? stmt.bind(...params) : stmt).run((e: Error | null, d: SQLiteCloudRowset) => {
				if (e) return reject(e);

				return resolve(d);
			});
		});
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareBetterSqlite3Client = () => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
	const client = new Client(dbPath);

	const all = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		return stmt.all(...params);
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		return stmt.run(...params) as any;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareTursoDatabaseClient = () => {
	const client = new TursoDatabase(':memory:');

	const all = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		return stmt.all(...params);
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		return stmt.run(...params) as any;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareLibSQLClient = async (url: string, authToken?: string) => {
	const client = createClient({ url, authToken });
	// TODO revise: should I add here do-while loop for client creation?

	// client = await retry(async () => {
	// 	client = createClient({ url, authToken, intMode: 'number' });
	// 	return client;
	// }, {
	// 	retries: 20,
	// 	factor: 1,
	// 	minTimeout: 250,
	// 	maxTimeout: 250,
	// 	randomize: false,
	// 	onRetry() {
	// 		client?.close();
	// 	},
	// });

	const all = async (sql: string, params: any[] = []) => {
		const stmt: InStatement = { sql, args: params as InArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt: InStatement = { sql, args: params as InArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareLibSQLWsClient = async (url: string, authToken?: string) => {
	const client = createWsClient({ url, authToken });

	const all = async (sql: string, params: any[] = []) => {
		const stmt: WsInStatement = { sql, args: params as WsInArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt: WsInStatement = { sql, args: params as WsInArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareLibSQLSqlite3Client = (url: string = ':memory:') => {
	const client = createSqlite3Client({ url });

	const all = async (sql: string, params: any[] = []) => {
		const stmt: Sqlite3InStatement = { sql, args: params as Sqlite3InArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt: Sqlite3InStatement = { sql, args: params as Sqlite3InArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareLibSQLNodeClient = async (url: string, authToken?: string) => {
	const client = createNodeClient({ url, authToken });

	const all = async (sql: string, params: any[] = []) => {
		const stmt: NodeInStatement = { sql, args: params as NodeInArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt: NodeInStatement = { sql, args: params as NodeInArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareLibSQLHttpClient = async (url: string, authToken?: string) => {
	const client = createHttpClient({ url, authToken });

	const all = async (sql: string, params: any[] = []) => {
		const stmt: HttpInStatement = { sql, args: params as HttpInArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt: HttpInStatement = { sql, args: params as HttpInArgs };

		const result = await client!.execute(stmt);
		return result.rows;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
};

export const prepareD1Client = async () => {
	const sqliteDb = await createSQLiteDB(':memory:');
	const client = new D1Database(new D1DatabaseAPI(sqliteDb));

	const all = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		const result = await stmt.bind(...params).all();
		return result.results as any[];
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		const result = await stmt.bind(...params).run();
		return result.results as any[];
	};

	const batch = async (statements: string[]) => {
		return await client.batch(statements.map((x) => client.prepare(x)));
	};

	return { client, all, run, batch };
};

export const prepareSqlJs = async () => {
	const SQL = await initSqlJs();
	const client = new SQL.Database();

	const all = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		stmt.bind(params);
		const rows: any[] = [];
		while (stmt.step()) {
			rows.push(stmt.getAsObject());
		}
		stmt.free();

		return rows;
	};

	const run = async (sql: string, params: any[] = []) => {
		const stmt = client.prepare(sql);
		const result = stmt.run(params);
		stmt.free();
		return result as any;
	};

	const batch = async (statements: string[]) => {
		return Promise.all(
			statements.map((x) => run(x)),
		).then((results) => [results] as any);
	};

	return { client, all, run, batch };
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

export const providerForSQLiteCloud = async () => {
	const url = process.env['SQLITE_MANY_CLOUD_CONNECTION_STRING'];
	if (url === undefined) throw new Error('SQLITE_MANY_CLOUD_CONNECTION_STRING is not set.');
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareSQLiteCloudClient(urlI)));

	return providerClosure(clients);
};

export const providerForTursoDatabase = async () => {
	const clients = [prepareTursoDatabaseClient()];

	return providerClosure(clients);
};

export const providerForLibSQL = async () => {
	const url = process.env['LIBSQL_URL'];
	const authToken = process.env['LIBSQL_AUTH_TOKEN'];
	if (url === undefined) throw new Error('LIBSQL_URL is not set.');
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareLibSQLClient(urlI, authToken)));

	return providerClosure(clients);
};
export const providerForLibSQLWs = async () => {
	const url = process.env['LIBSQL_REMOTE_MANY_URL'];
	const authToken = process.env['LIBSQL_REMOTE_TOKEN'];
	if (url === undefined) {
		throw new Error('LIBSQL_REMOTE_MANY_URL is not set.');
	}
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareLibSQLWsClient(urlI, authToken)));

	return providerClosure(clients);
};
export const providerForLibSQLSqlite3 = async () => {
	const clients = [prepareLibSQLSqlite3Client()];

	return providerClosure(clients);
};

export const providerForLibSQLNode = async () => {
	const url = process.env['LIBSQL_URL'];
	const authToken = process.env['LIBSQL_AUTH_TOKEN'];
	if (url === undefined) {
		throw new Error('LIBSQL_URL is not set.');
	}
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareLibSQLNodeClient(urlI, authToken)));

	return providerClosure(clients);
};
export const providerForLibSQLHttp = async () => {
	const url = process.env['LIBSQL_REMOTE_MANY_URL'];
	const authToken = process.env['LIBSQL_REMOTE_TOKEN'];
	if (url === undefined) {
		throw new Error('LIBSQL_REMOTE_MANY_URL is not set.');
	}
	const uris = url.split(';').filter((val) => val !== '');
	const clients = await Promise.all(uris.map(async (urlI) => await prepareLibSQLHttpClient(urlI, authToken)));

	return providerClosure(clients);
};

export const providerForBetterSqlite3 = async () => {
	const clients = [prepareBetterSqlite3Client()];

	return providerClosure(clients);
};
export const providerForD1 = async () => {
	const clients = [await prepareD1Client()];

	return providerClosure(clients);
};
export const providerForSqlJs = async () => {
	const clients = [await prepareSqlJs()];

	return providerClosure(clients);
};

type ProviderForSQLiteCloud = Awaited<ReturnType<typeof providerForSQLiteCloud>>;
type ProviderForTursoDatabase = Awaited<ReturnType<typeof providerForTursoDatabase>>;
type ProviderForLibSQL = Awaited<ReturnType<typeof providerForLibSQL>>;
type ProviderForLibSQLWs = Awaited<ReturnType<typeof providerForLibSQLWs>>;
type ProviderForLibSQLSqlite3 = Awaited<ReturnType<typeof providerForLibSQLSqlite3>>;
type ProviderForLibSQLNode = Awaited<ReturnType<typeof providerForLibSQLNode>>;
type ProviderForLibSQLHttp = Awaited<ReturnType<typeof providerForLibSQLHttp>>;
type ProviderForBetterSqlite3 = Awaited<ReturnType<typeof providerForBetterSqlite3>>;
type ProviderForD1 = Awaited<ReturnType<typeof providerForD1>>;
type ProviderForSqlJs = Awaited<ReturnType<typeof providerForSqlJs>>;

type Provider =
	| ProviderForSQLiteCloud
	| ProviderForTursoDatabase
	| ProviderForLibSQL
	| ProviderForLibSQLWs
	| ProviderForLibSQLSqlite3
	| ProviderForLibSQLNode
	| ProviderForLibSQLHttp
	| ProviderForBetterSqlite3
	| ProviderForD1
	| ProviderForSqlJs;

export type SqliteSchema_ = Record<
	string,
	| SQLiteTable<any>
	| SQLiteView
	| unknown
>;

const testFor = (
	vendor:
		| 'sqlite-cloud'
		| 'proxy'
		| 'tursodatabase'
		| 'libsql'
		| 'libsql-turso'
		| 'libsql-turso-v1'
		| 'libsql-ws'
		| 'libsql-sqlite3'
		| 'libsql-node'
		| 'libsql-http'
		| 'better-sqlite3'
		| 'd1'
		| 'sql-js',
) => {
	return base.extend<{
		provider: Provider;
		kit: {
			client: any;
			all: (sql: string, params?: any[]) => Promise<any[]>;
			run: (sql: string, params?: any[]) => Promise<any[]>;
			batch: (statements: string[]) => Promise<any>;
		};
		client:
			| BetterSqlite3.Database
			| SqliteCloudDatabase
			| TursoDatabase
			| LibSQLClient
			| LibSQLWsClient
			| D1Database
			| SQLJsDatabase;
		db: BaseSQLiteDatabase<'async' | 'sync', any, any, typeof relations>;
		push: (schema: any) => Promise<void>;
		createDB: {
			<S extends SqliteSchema_>(
				schema: S,
			): BaseSQLiteDatabase<'async' | 'sync', any, any, ReturnType<typeof defineRelations<S>>>;
			<S extends SqliteSchema_, TConfig extends AnyRelationsBuilderConfig>(
				schema: S,
				cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
			): BaseSQLiteDatabase<
				'async' | 'sync',
				any,
				any,
				ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>
			>;
		};
		caches: {
			all: BaseSQLiteDatabase<'async' | 'sync', any, any, typeof relations>;
			explicit: BaseSQLiteDatabase<'async' | 'sync', any, any, typeof relations>;
		};
	}>({
		provider: [
			// oxlint-disable-next-line no-empty-pattern
			async ({}, use) => {
				const provider = vendor === 'sqlite-cloud'
					? await providerForSQLiteCloud()
					: vendor === 'tursodatabase'
					? await providerForTursoDatabase()
					: vendor === 'libsql' || vendor === 'libsql-turso' || vendor === 'libsql-turso-v1'
					? await providerForLibSQL()
					: vendor === 'libsql-ws'
					? await providerForLibSQLWs()
					: vendor === 'libsql-sqlite3'
					? await providerForLibSQLSqlite3()
					: vendor === 'libsql-node'
					? await providerForLibSQLNode()
					: vendor === 'libsql-http'
					? await providerForLibSQLHttp()
					: vendor === 'proxy' || vendor === 'better-sqlite3'
					? await providerForBetterSqlite3()
					: vendor === 'd1'
					? await providerForD1()
					: vendor === 'sql-js'
					? await providerForSqlJs()
					: '' as never;

				await use(provider);
			},
			{ scope: 'file' },
		],
		kit: [
			async ({ provider }, use) => {
				const { client, batch, all, run, release } = await provider();
				await use({ client: client, all, run, batch });
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
							console.error('Error from sqlite proxy server:', e.message);
							throw e;
						}
					};
					await use(drizzleProxy(proxyHandler, { relations }));
					return;
				}

				const db = vendor === 'sqlite-cloud'
					? drizzleSqliteCloud({ client: kit.client as any, relations })
					: vendor === 'tursodatabase'
					? drizzleTursoDatabase({ client: kit.client, relations })
					: vendor === 'libsql'
					? drizzleLibSQL({ client: kit.client, relations })
					: vendor === 'libsql-ws'
					? drizzleLibSQLWs({ client: kit.client, relations })
					: vendor === 'libsql-sqlite3'
					? drizzleLibSQLSqlite3({ client: kit.client, relations })
					: vendor === 'libsql-node'
					? drizzleLibSQLNode({ client: kit.client, relations })
					: vendor === 'libsql-http'
					? drizzleLibSQLHttp({ client: kit.client, relations })
					: vendor === 'better-sqlite3'
					? drizzleBetterSqlite3({ client: kit.client, relations })
					: vendor === 'd1'
					? drizzleD1(kit.client, { relations })
					: vendor === 'sql-js'
					? drizzleSqlJs(kit.client, { relations })
					: '' as never;

				await use(db);
			},
			{ scope: 'test' },
		],
		push: [
			async ({ kit }, use) => {
				const push = (
					schema: any,
				) => _push(kit.run, schema);

				await use(push);
			},
			{ scope: 'test' },
		],
		createDB: [
			async ({ kit }, use) => {
				const createDB = <S extends SqliteSchema_>(
					schema: S,
					cb?: (
						helpers: RelationsBuilder<ExtractTablesFromSchema<S>>,
					) => RelationsBuilderConfig<ExtractTablesFromSchema<S>>,
				) => {
					const relations = cb ? defineRelations(schema, cb) : defineRelations(schema);

					if (vendor === 'sqlite-cloud') return drizzleSqliteCloud({ client: kit.client, relations });
					if (vendor === 'tursodatabase') return drizzleTursoDatabase({ client: kit.client, relations });
					if (vendor === 'libsql' || vendor === 'libsql-turso' || vendor === 'libsql-turso-v1') {
						return drizzleLibSQL({ client: kit.client, relations });
					}
					if (vendor === 'libsql-ws') return drizzleLibSQLWs({ client: kit.client, relations });
					if (vendor === 'libsql-sqlite3') return drizzleLibSQLSqlite3({ client: kit.client, relations });
					if (vendor === 'libsql-node') return drizzleLibSQLNode({ client: kit.client, relations });
					if (vendor === 'libsql-http') return drizzleLibSQLHttp({ client: kit.client, relations });
					if (vendor === 'better-sqlite3') return drizzleBetterSqlite3({ client: kit.client, relations });
					if (vendor === 'd1') return drizzleD1(kit.client, { relations });
					if (vendor === 'sql-js') return drizzleSqlJs(kit.client, { relations });

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
								console.error('Error from sqlite proxy server:', e.message);
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
								throw new Error(response.error);
							}

							return { rows: response.data };
						} catch (e: any) {
							console.error('Error from sqlite proxy server:', e.message);
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

				const db1 = vendor === 'sqlite-cloud'
					? drizzleSqliteCloud(config1)
					: vendor === 'tursodatabase'
					? drizzleTursoDatabase(config1)
					: vendor === 'libsql' || vendor === 'libsql-turso' || vendor === 'libsql-turso-v1'
					? drizzleLibSQL(config1)
					: vendor === 'libsql-ws'
					? drizzleLibSQLWs(config1)
					: vendor === 'libsql-sqlite3'
					? drizzleLibSQLSqlite3(config1)
					: vendor === 'libsql-node'
					? drizzleLibSQLNode(config1)
					: vendor === 'libsql-http'
					? drizzleLibSQLHttp(config1)
					: vendor === 'better-sqlite3'
					? drizzleBetterSqlite3(config1)
					: vendor === 'd1'
					? drizzleD1(config1.client, { cache: config1.cache, relations: config1.relations })
					: vendor === 'sql-js'
					? drizzleSqlJs(config1.client, { cache: config1.cache, relations: config1.relations })
					: '' as never;

				const db2 = vendor === 'sqlite-cloud'
					? drizzleSqliteCloud(config2)
					: vendor === 'tursodatabase'
					? drizzleTursoDatabase(config2)
					: vendor === 'libsql' || vendor === 'libsql-turso' || vendor === 'libsql-turso-v1'
					? drizzleLibSQL(config2)
					: vendor === 'libsql-ws'
					? drizzleLibSQLWs(config2)
					: vendor === 'libsql-sqlite3'
					? drizzleLibSQLSqlite3(config2)
					: vendor === 'libsql-node'
					? drizzleLibSQLNode(config2)
					: vendor === 'libsql-http'
					? drizzleLibSQLHttp(config2)
					: vendor === 'better-sqlite3'
					? drizzleBetterSqlite3(config2)
					: vendor === 'd1'
					? drizzleD1(config2.client, { cache: config2.cache, relations: config2.relations })
					: vendor === 'sql-js'
					? drizzleSqlJs(config2.client, { cache: config2.cache, relations: config2.relations })
					: '' as never;

				await use({ all: db1, explicit: db2 });
			},
			{ scope: 'test' },
		],
	});
};

export const sqliteCloudTest = testFor('sqlite-cloud');
export const tursoDatabaseTest = testFor('tursodatabase');
export const libSQLTest = testFor('libsql');
export const libSQLWsTest = testFor('libsql-ws');
export const libSQLSqlite3Test = testFor('libsql-sqlite3');
export const libSQLNodeTest = testFor('libsql-node');
export const libSQLHttpTest = testFor('libsql-http');
export const betterSqlite3Test = testFor('better-sqlite3');
export const d1Test = testFor('d1');
export const sqlJsTest = testFor('sql-js');
export const libSQLTursoTest = testFor('libsql-turso').extend<{ db: LibSQLDatabase<never, typeof sqliteRelations> }>({
	db: [
		async ({ kit }, use) => {
			const db = drizzleLibSQL({
				client: kit.client,
				relations: sqliteRelations,
				casing: 'snake_case',
			}) as LibSQLDatabase<never, typeof sqliteRelations>;

			await use(db);
		},
		{ scope: 'test' },
	],
});
export const libSQLTursoV1Test = testFor('libsql-turso-v1').extend<{ db: LibSQLDatabase<typeof sqliteSchema> }>({
	db: [
		async ({ kit }, use) => {
			const db = drizzleLibSQL({
				client: kit.client,
				schema: sqliteSchema,
				casing: 'snake_case',
			}) as LibSQLDatabase<typeof sqliteSchema>;

			await use(db);
		},
		{ scope: 'test' },
	],
});
export const proxyTest = testFor('proxy').extend<{ serverSimulator: ServerSimulator }>({
	serverSimulator: [
		async ({ client }, use) => {
			const serverSimulator = new ServerSimulator(client as BetterSqlite3.Database);
			await use(serverSimulator);
		},
		{ scope: 'test' },
	],
});

export type Test = ReturnType<typeof testFor>;
