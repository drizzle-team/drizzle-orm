import type { AwsDataApiPgQueryResult, AwsDataApiSessionOptions } from 'drizzle-orm/aws-data-api/pg';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import type { PreparedQueryConfig } from 'drizzle-orm/pg-core';
import fetch from 'node-fetch';
import ws from 'ws';
import { assertUnreachable } from '../global';
import type { ProxyParams } from '../serializer/studio';
import {
	type DB,
	LibSQLDB,
	normalisePGliteUrl,
	normaliseSQLiteUrl,
	type Proxy,
	type SQLiteDB,
	type SqliteProxy,
} from '../utils';
import { assertPackages, checkPackage } from './utils';
import { LibSQLCredentials } from './validations/libsql';
import type { MysqlCredentials } from './validations/mysql';
import { withStyle } from './validations/outputs';
import type { PostgresCredentials } from './validations/postgres';
import { SingleStoreCredentials } from './validations/singlestore';
import type { SqliteCredentials } from './validations/sqlite';

export const preparePostgresDB = async (
	credentials: PostgresCredentials,
): Promise<
	DB & {
		proxy: Proxy;
		migrate: (config: string | MigrationConfig) => Promise<void>;
	}
> => {
	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'aws-data-api') {
			assertPackages('@aws-sdk/client-rds-data');
			const { RDSDataClient, ExecuteStatementCommand, TypeHint } = await import(
				'@aws-sdk/client-rds-data'
			);
			const { AwsDataApiSession, drizzle } = await import(
				'drizzle-orm/aws-data-api/pg'
			);
			const { migrate } = await import('drizzle-orm/aws-data-api/pg/migrator');
			const { PgDialect } = await import('drizzle-orm/pg-core');

			const config: AwsDataApiSessionOptions = {
				database: credentials.database,
				resourceArn: credentials.resourceArn,
				secretArn: credentials.secretArn,
			};
			const rdsClient = new RDSDataClient();
			const session = new AwsDataApiSession(
				rdsClient,
				new PgDialect(),
				undefined,
				config,
				undefined,
			);

			const db = drizzle(rdsClient, config);
			const migrateFn = async (config: string | MigrationConfig) => {
				return migrate(db, config);
			};

			const query = async (sql: string, params: any[]) => {
				const prepared = session.prepareQuery(
					{ sql, params: params ?? [] },
					undefined,
					undefined,
					false,
				);
				const result = await prepared.all();
				return result as any[];
			};
			const proxy = async (params: ProxyParams) => {
				const prepared = session.prepareQuery<
					PreparedQueryConfig & {
						execute: AwsDataApiPgQueryResult<unknown>;
						values: AwsDataApiPgQueryResult<unknown[]>;
					}
				>(
					{
						sql: params.sql,
						params: params.params ?? [],
						typings: params.typings,
					},
					undefined,
					undefined,
					params.mode === 'array',
				);
				if (params.mode === 'array') {
					const result = await prepared.values();
					return result.rows;
				}
				const result = await prepared.execute();
				return result.rows;
			};

			return {
				query,
				proxy,
				migrate: migrateFn,
			};
		}

		if (driver === 'pglite') {
			assertPackages('@electric-sql/pglite');
			const { PGlite } = await import('@electric-sql/pglite');
			const { drizzle } = await import('drizzle-orm/pglite');
			const { migrate } = await import('drizzle-orm/pglite/migrator');

			const pglite = new PGlite(normalisePGliteUrl(credentials.url));
			await pglite.waitReady;
			const drzl = drizzle(pglite);
			const migrateFn = async (config: MigrationConfig) => {
				return migrate(drzl, config);
			};

			const query = async <T>(sql: string, params: any[] = []) => {
				const result = await pglite.query(sql, params);
				return result.rows as T[];
			};

			const proxy = async (params: ProxyParams) => {
				const preparedParams = preparePGliteParams(params.params);
				if (
					params.method === 'values'
					|| params.method === 'get'
					|| params.method === 'all'
				) {
					const result = await pglite.query(params.sql, preparedParams, {
						rowMode: params.mode,
					});
					return result.rows;
				}

				const result = await pglite.query(params.sql, preparedParams);
				return result.rows;
			};

			return { query, proxy, migrate: migrateFn };
		}

		assertUnreachable(driver);
	}

	if (await checkPackage('pg')) {
		console.log(withStyle.info(`Using 'pg' driver for database querying`));
		const pg = await import('pg');
		const { drizzle } = await import('drizzle-orm/node-postgres');
		const { migrate } = await import('drizzle-orm/node-postgres/migrator');

		const ssl = 'ssl' in credentials
			? credentials.ssl === 'prefer'
					|| credentials.ssl === 'require'
					|| credentials.ssl === 'allow'
				? { rejectUnauthorized: false }
				: credentials.ssl === 'verify-full'
				? {}
				: credentials.ssl
			: {};

		const client = 'url' in credentials
			? new pg.default.Pool({ connectionString: credentials.url, max: 1 })
			: new pg.default.Pool({ ...credentials, ssl, max: 1 });

		const db = drizzle(client);
		const migrateFn = async (config: string | MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
			});
			return result.rows;
		};

		return { query, proxy, migrate: migrateFn };
	}

	if (await checkPackage('postgres')) {
		console.log(
			withStyle.info(`Using 'postgres' driver for database querying`),
		);
		const postgres = await import('postgres');

		const { drizzle } = await import('drizzle-orm/postgres-js');
		const { migrate } = await import('drizzle-orm/postgres-js/migrator');

		const client = 'url' in credentials
			? postgres.default(credentials.url, { max: 1 })
			: postgres.default({ ...credentials, max: 1 });

		const db = drizzle(client);
		const migrateFn = async (config: string | MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.unsafe(sql, params ?? []);
			return result as any[];
		};

		const proxy = async (params: ProxyParams) => {
			if (params.mode === 'object') {
				return await client.unsafe(params.sql, params.params);
			}
			return await client.unsafe(params.sql, params.params).values();
		};

		return { query, proxy, migrate: migrateFn };
	}

	if (await checkPackage('@vercel/postgres')) {
		console.log(
			withStyle.info(`Using '@vercel/postgres' driver for database querying`),
		);
		console.log(
			withStyle.fullWarning(
				"'@vercel/postgres' can only connect to remote Neon/Vercel Postgres/Supabase instances through a websocket",
			),
		);
		const { VercelPool } = await import('@vercel/postgres');
		const { drizzle } = await import('drizzle-orm/vercel-postgres');
		const { migrate } = await import('drizzle-orm/vercel-postgres/migrator');
		const ssl = 'ssl' in credentials
			? credentials.ssl === 'prefer'
					|| credentials.ssl === 'require'
					|| credentials.ssl === 'allow'
				? { rejectUnauthorized: false }
				: credentials.ssl === 'verify-full'
				? {}
				: credentials.ssl
			: {};

		const client = 'url' in credentials
			? new VercelPool({ connectionString: credentials.url })
			: new VercelPool({ ...credentials, ssl });

		await client.connect();

		const db = drizzle(client);
		const migrateFn = async (config: string | MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
			});
			return result.rows;
		};

		return { query, proxy, migrate: migrateFn };
	}

	if (await checkPackage('@neondatabase/serverless')) {
		console.log(
			withStyle.info(
				`Using '@neondatabase/serverless' driver for database querying`,
			),
		);
		console.log(
			withStyle.fullWarning(
				"'@neondatabase/serverless' can only connect to remote Neon/Vercel Postgres/Supabase instances through a websocket",
			),
		);
		const { Pool, neonConfig } = await import('@neondatabase/serverless');
		const { drizzle } = await import('drizzle-orm/neon-serverless');
		const { migrate } = await import('drizzle-orm/neon-serverless/migrator');

		const ssl = 'ssl' in credentials
			? credentials.ssl === 'prefer'
					|| credentials.ssl === 'require'
					|| credentials.ssl === 'allow'
				? { rejectUnauthorized: false }
				: credentials.ssl === 'verify-full'
				? {}
				: credentials.ssl
			: {};

		const client = 'url' in credentials
			? new Pool({ connectionString: credentials.url, max: 1 })
			: new Pool({ ...credentials, max: 1, ssl });
		neonConfig.webSocketConstructor = ws;

		const db = drizzle(client);
		const migrateFn = async (config: string | MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
			});
			return result.rows;
		};

		return { query, proxy, migrate: migrateFn };
	}

	console.error(
		"To connect to Postgres database - please install either of 'pg', 'postgres', '@neondatabase/serverless' or '@vercel/postgres' drivers",
	);
	process.exit(1);
};

const parseSingleStoreCredentials = (credentials: SingleStoreCredentials) => {
	if ('url' in credentials) {
		const url = credentials.url;

		const connectionUrl = new URL(url);
		const pathname = connectionUrl.pathname;

		const database = pathname.split('/')[pathname.split('/').length - 1];
		if (!database) {
			console.error(
				'You should specify a database name in connection string (singlestore://USER:PASSWORD@HOST:PORT/DATABASE)',
			);
			process.exit(1);
		}
		return { database, url };
	} else {
		return {
			database: credentials.database,
			credentials,
		};
	}
};

export const connectToSingleStore = async (
	it: SingleStoreCredentials,
): Promise<{
	db: DB;
	proxy: Proxy;
	database: string;
	migrate: (config: MigrationConfig) => Promise<void>;
}> => {
	const result = parseSingleStoreCredentials(it);

	if (await checkPackage('mysql2')) {
		const { createConnection } = await import('mysql2/promise');
		const { drizzle } = await import('drizzle-orm/singlestore');
		const { migrate } = await import('drizzle-orm/singlestore/migrator');

		const connection = result.url
			? await createConnection(result.url)
			: await createConnection(result.credentials!); // needed for some reason!

		const db = drizzle(connection);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		await connection.connect();
		const query: DB['query'] = async <T>(
			sql: string,
			params?: any[],
		): Promise<T[]> => {
			const res = await connection.execute(sql, params);
			return res[0] as any;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await connection.query({
				sql: params.sql,
				values: params.params,
				rowsAsArray: params.mode === 'array',
			});
			return result[0] as any[];
		};

		return {
			db: { query },
			proxy,
			database: result.database,
			migrate: migrateFn,
		};
	}

	console.error(
		"To connect to SingleStore database - please install 'singlestore' driver",
	);
	process.exit(1);
};

const parseMysqlCredentials = (credentials: MysqlCredentials) => {
	if ('url' in credentials) {
		const url = credentials.url;

		const connectionUrl = new URL(url);
		const pathname = connectionUrl.pathname;

		const database = pathname.split('/')[pathname.split('/').length - 1];
		if (!database) {
			console.error(
				'You should specify a database name in connection string (mysql://USER:PASSWORD@HOST:PORT/DATABASE)',
			);
			process.exit(1);
		}
		return { database, url };
	} else {
		return {
			database: credentials.database,
			credentials,
		};
	}
};

export const connectToMySQL = async (
	it: MysqlCredentials,
): Promise<{
	db: DB;
	proxy: Proxy;
	database: string;
	migrate: (config: MigrationConfig) => Promise<void>;
}> => {
	const result = parseMysqlCredentials(it);

	if (await checkPackage('mysql2')) {
		const { createConnection } = await import('mysql2/promise');
		const { drizzle } = await import('drizzle-orm/mysql2');
		const { migrate } = await import('drizzle-orm/mysql2/migrator');

		const connection = result.url
			? await createConnection(result.url)
			: await createConnection(result.credentials!); // needed for some reason!

		const db = drizzle(connection);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		await connection.connect();
		const query: DB['query'] = async <T>(
			sql: string,
			params?: any[],
		): Promise<T[]> => {
			const res = await connection.execute(sql, params);
			return res[0] as any;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await connection.query({
				sql: params.sql,
				values: params.params,
				rowsAsArray: params.mode === 'array',
			});
			return result[0] as any[];
		};

		return {
			db: { query },
			proxy,
			database: result.database,
			migrate: migrateFn,
		};
	}

	if (await checkPackage('@planetscale/database')) {
		const { connect } = await import('@planetscale/database');
		const { drizzle } = await import('drizzle-orm/planetscale-serverless');
		const { migrate } = await import(
			'drizzle-orm/planetscale-serverless/migrator'
		);

		const connection = connect(result);

		const db = drizzle(connection);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async <T>(sql: string, params?: any[]): Promise<T[]> => {
			const res = await connection.execute(sql, params);
			return res.rows as T[];
		};
		const proxy: Proxy = async (params: ProxyParams) => {
			const result = params.mode === 'object'
				? await connection.execute(params.sql, params.params)
				: await connection.execute(params.sql, params.params, {
					as: 'array',
				});
			return result.rows;
		};

		return {
			db: { query },
			proxy,
			database: result.database,
			migrate: migrateFn,
		};
	}

	console.error(
		"To connect to MySQL database - please install either of 'mysql2' or '@planetscale/database' drivers",
	);
	process.exit(1);
};

const prepareSqliteParams = (params: any[], driver?: string) => {
	return params.map((param) => {
		if (
			param
			&& typeof param === 'object'
			&& 'type' in param
			&& 'value' in param
			&& param.type === 'binary'
		) {
			const value = typeof param.value === 'object'
				? JSON.stringify(param.value)
				: (param.value as string);

			if (driver === 'd1-http') {
				return value;
			}

			return Buffer.from(value);
		}
		return param;
	});
};

const preparePGliteParams = (params: any[]) => {
	return params.map((param) => {
		if (
			param
			&& typeof param === 'object'
			&& 'type' in param
			&& 'value' in param
			&& param.type === 'binary'
		) {
			const value = typeof param.value === 'object'
				? JSON.stringify(param.value)
				: (param.value as string);

			return value;
		}
		return param;
	});
};

export const connectToSQLite = async (
	credentials: SqliteCredentials,
): Promise<
	& SQLiteDB
	& SqliteProxy
	& { migrate: (config: MigrationConfig) => Promise<void> }
> => {
	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'd1-http') {
			const { drizzle } = await import('drizzle-orm/sqlite-proxy');
			const { migrate } = await import('drizzle-orm/sqlite-proxy/migrator');

			const remoteCallback: Parameters<typeof drizzle>[0] = async (
				sql,
				params,
				method,
			) => {
				const res = await fetch(
					`https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/d1/database/${credentials.databaseId}/${
						method === 'values' ? 'raw' : 'query'
					}`,
					{
						method: 'POST',
						body: JSON.stringify({ sql, params }),
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${credentials.token}`,
						},
					},
				);

				const data = (await res.json()) as
					| {
						success: true;
						result: {
							results:
								| any[]
								| {
									columns: string[];
									rows: any[][];
								};
						}[];
					}
					| {
						success: false;
						errors: { code: number; message: string }[];
					};

				if (!data.success) {
					throw new Error(
						data.errors.map((it) => `${it.code}: ${it.message}`).join('\n'),
					);
				}

				const result = data.result[0].results;
				const rows = Array.isArray(result) ? result : result.rows;

				return {
					rows,
				};
			};

			const drzl = drizzle(remoteCallback);
			const migrateFn = async (config: MigrationConfig) => {
				return migrate(
					drzl,
					async (queries) => {
						for (const query of queries) {
							await remoteCallback(query, [], 'run');
						}
					},
					config,
				);
			};

			const db: SQLiteDB = {
				query: async <T>(sql: string, params?: any[]) => {
					const res = await remoteCallback(sql, params || [], 'all');
					return res.rows as T[];
				},
				run: async (query: string) => {
					await remoteCallback(query, [], 'run');
				},
			};
			const proxy: SqliteProxy = {
				proxy: async (params: ProxyParams) => {
					const preparedParams = prepareSqliteParams(params.params, 'd1-http');
					const result = await remoteCallback(
						params.sql,
						preparedParams,
						params.mode === 'array' ? 'values' : 'all',
					);

					return result.rows;
				},
			};
			return { ...db, ...proxy, migrate: migrateFn };
		} else {
			assertUnreachable(driver);
		}
	}

	if (await checkPackage('@libsql/client')) {
		const { createClient } = await import('@libsql/client');
		const { drizzle } = await import('drizzle-orm/libsql');
		const { migrate } = await import('drizzle-orm/libsql/migrator');

		const client = createClient({
			url: normaliseSQLiteUrl(credentials.url, 'libsql'),
		});
		const drzl = drizzle(client);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(drzl, config);
		};

		const db: SQLiteDB = {
			query: async <T>(sql: string, params?: any[]) => {
				const res = await client.execute({ sql, args: params || [] });
				return res.rows as T[];
			},
			run: async (query: string) => {
				await client.execute(query);
			},
		};

		const proxy: SqliteProxy = {
			proxy: async (params: ProxyParams) => {
				const preparedParams = prepareSqliteParams(params.params);
				const result = await client.execute({
					sql: params.sql,
					args: preparedParams,
				});

				if (params.mode === 'array') {
					return result.rows.map((row) => Object.values(row));
				} else {
					return result.rows;
				}
			},
		};

		return { ...db, ...proxy, migrate: migrateFn };
	}

	if (await checkPackage('better-sqlite3')) {
		const { default: Database } = await import('better-sqlite3');
		const { drizzle } = await import('drizzle-orm/better-sqlite3');
		const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');

		const sqlite = new Database(
			normaliseSQLiteUrl(credentials.url, 'better-sqlite'),
		);
		const drzl = drizzle(sqlite);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(drzl, config);
		};

		const db: SQLiteDB = {
			query: async <T>(sql: string, params: any[] = []) => {
				return sqlite.prepare(sql).bind(params).all() as T[];
			},
			run: async (query: string) => {
				sqlite.prepare(query).run();
			},
		};

		const proxy: SqliteProxy = {
			proxy: async (params: ProxyParams) => {
				const preparedParams = prepareSqliteParams(params.params);
				if (
					params.method === 'values'
					|| params.method === 'get'
					|| params.method === 'all'
				) {
					return sqlite
						.prepare(params.sql)
						.raw(params.mode === 'array')
						.all(preparedParams);
				}

				return sqlite.prepare(params.sql).run(preparedParams);
			},
		};
		return { ...db, ...proxy, migrate: migrateFn };
	}

	console.log(
		"Please install either 'better-sqlite3' or '@libsql/client' for Drizzle Kit to connect to SQLite databases",
	);
	process.exit(1);
};

export const connectToLibSQL = async (credentials: LibSQLCredentials): Promise<
	& LibSQLDB
	& SqliteProxy
	& { migrate: (config: MigrationConfig) => Promise<void> }
> => {
	if (await checkPackage('@libsql/client')) {
		const { createClient } = await import('@libsql/client');
		const { drizzle } = await import('drizzle-orm/libsql');
		const { migrate } = await import('drizzle-orm/libsql/migrator');

		const client = createClient({
			url: normaliseSQLiteUrl(credentials.url, 'libsql'),
			authToken: credentials.authToken,
		});
		const drzl = drizzle(client);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(drzl, config);
		};

		const db: LibSQLDB = {
			query: async <T>(sql: string, params?: any[]) => {
				const res = await client.execute({ sql, args: params || [] });
				return res.rows as T[];
			},
			run: async (query: string) => {
				await client.execute(query);
			},
			batchWithPragma: async (queries: string[]) => {
				await client.migrate(queries);
			},
		};

		const proxy: SqliteProxy = {
			proxy: async (params: ProxyParams) => {
				const preparedParams = prepareSqliteParams(params.params);
				const result = await client.execute({
					sql: params.sql,
					args: preparedParams,
				});

				if (params.mode === 'array') {
					return result.rows.map((row) => Object.values(row));
				} else {
					return result.rows;
				}
			},
		};

		return { ...db, ...proxy, migrate: migrateFn };
	}

	console.log(
		"Please install '@libsql/client' for Drizzle Kit to connect to LibSQL databases",
	);
	process.exit(1);
};
