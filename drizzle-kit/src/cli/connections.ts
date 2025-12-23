import type { PGlite } from '@electric-sql/pglite';
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
	type TransactionProxy,
} from '../utils';
import { assertPackages, checkPackage } from './utils';
import { GelCredentials } from './validations/gel';
import { LibSQLCredentials } from './validations/libsql';
import type { MysqlCredentials } from './validations/mysql';
import { withStyle } from './validations/outputs';
import type { PostgresCredentials } from './validations/postgres';
import { SingleStoreCredentials } from './validations/singlestore';
import type { SqliteCredentials } from './validations/sqlite';

export const preparePostgresDB = async (
	credentials: PostgresCredentials | {
		driver: 'pglite';
		client: PGlite;
	},
): Promise<
	DB & {
		packageName:
			| '@aws-sdk/client-rds-data'
			| 'pglite'
			| 'pg'
			| 'postgres'
			| '@vercel/postgres'
			| '@neondatabase/serverless';
		proxy: Proxy;
		transactionProxy: TransactionProxy;
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
			const migrateFn = async (config: MigrationConfig) => {
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
			const transactionProxy: TransactionProxy = async (queries) => {
				throw new Error('Transaction not supported');
			};

			return {
				packageName: '@aws-sdk/client-rds-data',
				query,
				proxy,
				transactionProxy,
				migrate: migrateFn,
			};
		}

		if (driver === 'pglite') {
			assertPackages('@electric-sql/pglite');
			const { PGlite, types } = await import('@electric-sql/pglite');
			const { drizzle } = await import('drizzle-orm/pglite');
			const { migrate } = await import('drizzle-orm/pglite/migrator');

			const pglite = 'client' in credentials ? credentials.client : new PGlite(normalisePGliteUrl(credentials.url));
			await pglite.waitReady;
			const drzl = drizzle(pglite);
			const migrateFn = async (config: MigrationConfig) => {
				return migrate(drzl, config);
			};

			const parsers = {
				[types.TIMESTAMP]: (value: any) => value,
				[types.TIMESTAMPTZ]: (value: any) => value,
				[types.INTERVAL]: (value: any) => value,
				[types.DATE]: (value: any) => value,
			};

			const query = async <T>(sql: string, params: any[] = []) => {
				const result = await pglite.query(sql, params, {
					parsers,
				});
				return result.rows as T[];
			};

			const proxy = async (params: ProxyParams) => {
				const preparedParams = preparePGliteParams(params.params || []);
				const result = await pglite.query(params.sql, preparedParams, {
					rowMode: params.mode,
					parsers,
				});
				return result.rows;
			};

			const transactionProxy: TransactionProxy = async (queries) => {
				const results: any[] = [];
				try {
					await pglite.transaction(async (tx) => {
						for (const query of queries) {
							const result = await tx.query(query.sql, undefined, {
								parsers,
							});
							results.push(result.rows);
						}
					});
				} catch (error) {
					results.push(error as Error);
				}
				return results;
			};

			return { packageName: 'pglite', query, proxy, transactionProxy, migrate: migrateFn };
		}

		assertUnreachable(driver);
	}

	if (await checkPackage('pg')) {
		console.log(withStyle.info(`Using 'pg' driver for database querying`));
		const { default: pg } = await import('pg');
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

		// Override pg default date parsers
		const types: { getTypeParser: typeof pg.types.getTypeParser } = {
			// @ts-ignore
			getTypeParser: (typeId, format) => {
				if (typeId === pg.types.builtins.TIMESTAMPTZ) {
					return (val) => val;
				}
				if (typeId === pg.types.builtins.TIMESTAMP) {
					return (val) => val;
				}
				if (typeId === pg.types.builtins.DATE) {
					return (val) => val;
				}
				if (typeId === pg.types.builtins.INTERVAL) {
					return (val) => val;
				}
				// @ts-ignore
				return pg.types.getTypeParser(typeId, format);
			},
		};

		const client = 'url' in credentials
			? new pg.Pool({ connectionString: credentials.url, max: 1 })
			: new pg.Pool({ ...credentials, ssl, max: 1 });

		const db = drizzle(client);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query({
				text: sql,
				values: params ?? [],
				types,
			});
			return result.rows;
		};

		const proxy: Proxy = async (params) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			});
			return result.rows;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			const tx = await client.connect();
			try {
				await tx.query('BEGIN');
				for (const query of queries) {
					const result = await tx.query({
						text: query.sql,
						types,
					});
					results.push(result.rows);
				}
				await tx.query('COMMIT');
			} catch (error) {
				await tx.query('ROLLBACK');
				results.push(error as Error);
			} finally {
				tx.release();
			}
			return results;
		};

		return { packageName: 'pg', query, proxy, transactionProxy, migrate: migrateFn };
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

		const transparentParser = (val: any) => val;

		// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
		for (const type of ['1184', '1082', '1083', '1114']) {
			client.options.parsers[type as any] = transparentParser;
			client.options.serializers[type as any] = transparentParser;
		}
		client.options.serializers['114'] = transparentParser;
		client.options.serializers['3802'] = transparentParser;

		const db = drizzle(client);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.unsafe(sql, params ?? []);
			return result as any[];
		};

		const proxy: Proxy = async (params) => {
			if (params.mode === 'array') {
				return await client.unsafe(params.sql, params.params).values();
			}
			return await client.unsafe(params.sql, params.params);
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await client.begin(async (sql) => {
					for (const query of queries) {
						const result = await sql.unsafe(query.sql);
						results.push(result);
					}
				});
			} catch (error) {
				results.push(error as Error);
			}
			return results;
		};

		return { packageName: 'postgres', query, proxy, transactionProxy, migrate: migrateFn };
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
		const { VercelPool, types: pgTypes } = await import('@vercel/postgres');
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

		// Override @vercel/postgres default date parsers
		const types: { getTypeParser: typeof pgTypes.getTypeParser } = {
			// @ts-ignore
			getTypeParser: (typeId, format) => {
				if (typeId === pgTypes.builtins.TIMESTAMPTZ) {
					return (val: any) => val;
				}
				if (typeId === pgTypes.builtins.TIMESTAMP) {
					return (val: any) => val;
				}
				if (typeId === pgTypes.builtins.DATE) {
					return (val: any) => val;
				}
				if (typeId === pgTypes.builtins.INTERVAL) {
					return (val: any) => val;
				}
				// @ts-ignore
				return pgTypes.getTypeParser(typeId, format);
			},
		};

		const client = 'url' in credentials
			? new VercelPool({ connectionString: credentials.url })
			: new VercelPool({ ...credentials, ssl });

		await client.connect();

		const db = drizzle(client);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query({
				text: sql,
				values: params ?? [],
				types,
			});
			return result.rows;
		};

		const proxy: Proxy = async (params) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			});
			return result.rows;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			const tx = await client.connect();
			try {
				await tx.query('BEGIN');
				for (const query of queries) {
					const result = await tx.query({
						text: query.sql,
						types,
					});
					results.push(result.rows);
				}
				await tx.query('COMMIT');
			} catch (error) {
				await tx.query('ROLLBACK');
				results.push(error as Error);
			} finally {
				tx.release();
			}
			return results;
		};

		return { packageName: '@vercel/postgres', query, proxy, transactionProxy, migrate: migrateFn };
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
		const { Pool, neonConfig, types: pgTypes } = await import('@neondatabase/serverless');
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

		// Override @neondatabase/serverless default date parsers
		const types: { getTypeParser: typeof pgTypes.getTypeParser } = {
			// @ts-ignore
			getTypeParser: (typeId, format) => {
				if (typeId === pgTypes.builtins.TIMESTAMPTZ) {
					return (val: any) => val;
				}
				if (typeId === pgTypes.builtins.TIMESTAMP) {
					return (val: any) => val;
				}
				if (typeId === pgTypes.builtins.DATE) {
					return (val: any) => val;
				}
				if (typeId === pgTypes.builtins.INTERVAL) {
					return (val: any) => val;
				}
				// @ts-ignore
				return pgTypes.getTypeParser(typeId, format);
			},
		};

		const client = 'url' in credentials
			? new Pool({ connectionString: credentials.url, max: 1 })
			: new Pool({ ...credentials, max: 1, ssl });
		neonConfig.webSocketConstructor = ws;

		const db = drizzle(client);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query({
				text: sql,
				values: params ?? [],
				types,
			});
			return result.rows;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			});
			return result.rows;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			const tx = await client.connect();
			try {
				await tx.query('BEGIN');
				for (const query of queries) {
					const result = await tx.query({
						text: query.sql,
						types,
					});
					results.push(result.rows);
				}
				await tx.query('COMMIT');
			} catch (error) {
				await tx.query('ROLLBACK');
				results.push(error as Error);
			} finally {
				tx.release();
			}
			return results;
		};

		return { packageName: '@neondatabase/serverless', query, proxy, transactionProxy, migrate: migrateFn };
	}

	console.error(
		"To connect to Postgres database - please install either of 'pg', 'postgres', '@neondatabase/serverless' or '@vercel/postgres' drivers",
	);
	process.exit(1);
};

export const prepareGelDB = async (
	credentials?: GelCredentials,
): Promise<
	DB & {
		packageName: 'gel';
		proxy: Proxy;
		transactionProxy: TransactionProxy;
	}
> => {
	if (await checkPackage('gel')) {
		const gel = await import('gel');

		let client: ReturnType<typeof gel.createClient>;
		if (!credentials) {
			client = gel.createClient();
			try {
				await client.querySQL(`select 1;`);
			} catch (error: any) {
				if (error instanceof gel.ClientConnectionError) {
					console.error(
						`It looks like you forgot to link the Gel project or provide the database credentials.
To link your project, please refer https://docs.geldata.com/reference/cli/gel_instance/gel_instance_link, or add the dbCredentials to your configuration file.`,
					);
					process.exit(1);
				}

				throw error;
			}
		} else if ('url' in credentials) {
			'tlsSecurity' in credentials
				? client = gel.createClient({ dsn: credentials.url, tlsSecurity: credentials.tlsSecurity, concurrency: 1 })
				: client = gel.createClient({ dsn: credentials.url, concurrency: 1 });
		} else {
			gel.createClient({ ...credentials, concurrency: 1 });
		}

		const query = async (sql: string, params?: any[]) => {
			const result = params?.length ? await client.querySQL(sql, params) : await client.querySQL(sql);
			return result as any[];
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const { method, mode, params: sqlParams, sql, typings } = params;

			let result: any[];
			switch (mode) {
				case 'array':
					result = sqlParams?.length
						? await client.withSQLRowMode('array').querySQL(sql, sqlParams)
						: await client.withSQLRowMode('array').querySQL(sql);
					break;
				case 'object':
					result = sqlParams?.length ? await client.querySQL(sql, sqlParams) : await client.querySQL(sql);
					break;
			}

			return result;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const result: any[] = [];
			try {
				await client.transaction(async (tx) => {
					for (const query of queries) {
						const res = await tx.querySQL(query.sql);
						result.push(res);
					}
				});
			} catch (error) {
				result.push(error as Error);
			}
			return result;
		};

		return { packageName: 'gel', query, proxy, transactionProxy };
	}

	console.error(
		"To connect to gel database - please install 'edgedb' driver",
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
	packageName: 'mysql2';
	proxy: Proxy;
	transactionProxy: TransactionProxy;
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

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await connection.beginTransaction();
				for (const query of queries) {
					const res = await connection.query(query.sql);
					results.push(res[0]);
				}
				await connection.commit();
			} catch (error) {
				await connection.rollback();
				results.push(error as Error);
			}
			return results;
		};

		return {
			db: { query },
			packageName: 'mysql2',
			proxy,
			transactionProxy,
			database: result.database,
			migrate: migrateFn,
		};
	}

	console.error(
		"To connect to SingleStore database - please install 'mysql2' driver",
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
	packageName: 'mysql2' | '@planetscale/database';
	proxy: Proxy;
	transactionProxy: TransactionProxy;
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

		const typeCast = (field: any, next: any) => {
			if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
				return field.string();
			}
			return next();
		};

		await connection.connect();
		const query: DB['query'] = async <T>(
			sql: string,
			params?: any[],
		): Promise<T[]> => {
			const res = await connection.execute({
				sql,
				values: params,
				typeCast,
			});
			return res[0] as any;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await connection.query({
				sql: params.sql,
				values: params.params,
				rowsAsArray: params.mode === 'array',
				typeCast,
			});
			return result[0] as any[];
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await connection.beginTransaction();
				for (const query of queries) {
					const res = await connection.query(query.sql);
					results.push(res[0]);
				}
				await connection.commit();
			} catch (error) {
				await connection.rollback();
				results.push(error as Error);
			}
			return results;
		};

		return {
			db: { query },
			packageName: 'mysql2',
			proxy,
			transactionProxy,
			database: result.database,
			migrate: migrateFn,
		};
	}

	if (await checkPackage('@planetscale/database')) {
		const { Client } = await import('@planetscale/database');
		const { drizzle } = await import('drizzle-orm/planetscale-serverless');
		const { migrate } = await import(
			'drizzle-orm/planetscale-serverless/migrator'
		);

		const connection = new Client(result);

		const db = drizzle(connection);
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async <T>(sql: string, params?: any[]): Promise<T[]> => {
			const res = await connection.execute(sql, params);
			return res.rows as T[];
		};
		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await connection.execute(
				params.sql,
				params.params,
				params.mode === 'array' ? { as: 'array' } : undefined,
			);
			return result.rows;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await connection.transaction(async (tx) => {
					for (const query of queries) {
						const res = await tx.execute(query.sql);
						results.push(res.rows);
					}
				});
			} catch (error) {
				results.push(error as Error);
			}
			return results;
		};

		return {
			db: { query },
			packageName: '@planetscale/database',
			proxy,
			transactionProxy,
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
	& {
		packageName: 'd1-http' | '@libsql/client' | 'better-sqlite3';
		migrate: (config: MigrationConfig) => Promise<void>;
		proxy: Proxy;
		transactionProxy: TransactionProxy;
	}
> => {
	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'd1-http') {
			const { drizzle } = await import('drizzle-orm/sqlite-proxy');
			const { migrate } = await import('drizzle-orm/sqlite-proxy/migrator');

			type D1Response =
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

				const data = (await res.json()) as D1Response;

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

			const remoteBatchCallback = async (
				queries: {
					sql: string;
				}[],
			) => {
				const sql = queries.map((q) => q.sql).join('; ');
				const res = await fetch(
					`https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/d1/database/${credentials.databaseId}/query`,
					{
						method: 'POST',
						body: JSON.stringify({ sql }),
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${credentials.token}`,
						},
					},
				);

				const data = (await res.json()) as D1Response;

				if (!data.success) {
					throw new Error(
						data.errors.map((it) => `${it.code}: ${it.message}`).join('\n'),
					);
				}

				const rows = data.result.map((result) => {
					const res = result.results;
					return Array.isArray(res) ? res : res.rows;
				});

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
			const proxy: Proxy = async (params) => {
				const preparedParams = prepareSqliteParams(params.params || [], 'd1-http');
				const result = await remoteCallback(
					params.sql,
					preparedParams,
					params.mode === 'array' ? 'values' : 'all',
				);

				return result.rows;
			};
			const transactionProxy: TransactionProxy = async (queries) => {
				const result = await remoteBatchCallback(queries);
				return result.rows;
			};
			return { ...db, packageName: 'd1-http', proxy, transactionProxy, migrate: migrateFn };
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

		type Transaction = Awaited<ReturnType<typeof client.transaction>>;

		const proxy = async (params: ProxyParams) => {
			const preparedParams = prepareSqliteParams(params.params || []);
			const result = await client.execute({
				sql: params.sql,
				args: preparedParams,
			});

			if (params.mode === 'array') {
				return result.rows.map((row) => Object.values(row));
			} else {
				return result.rows;
			}
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: (any[] | Error)[] = [];
			let transaction: Transaction | null = null;
			try {
				transaction = await client.transaction();
				for (const query of queries) {
					const result = await transaction.execute(query.sql);
					results.push(result.rows);
				}
				await transaction.commit();
			} catch (error) {
				results.push(error as Error);
				await transaction?.rollback();
			} finally {
				transaction?.close();
			}
			return results;
		};

		return { ...db, packageName: '@libsql/client', proxy, transactionProxy, migrate: migrateFn };
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

		const proxy: Proxy = async (params) => {
			const preparedParams = prepareSqliteParams(params.params || []);
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

			sqlite.prepare(params.sql).run(preparedParams);

			return [];
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: (any[] | Error)[] = [];

			const tx = sqlite.transaction((queries: Parameters<TransactionProxy>[0]) => {
				for (const query of queries) {
					let result: any[] = [];
					if (query.method === 'values' || query.method === 'get' || query.method === 'all') {
						result = sqlite
							.prepare(query.sql)
							.all();
					} else {
						sqlite.prepare(query.sql).run();
					}
					results.push(result);
				}
			});

			try {
				tx(queries);
			} catch (error) {
				results.push(error as Error);
			}

			return results;
		};

		return { ...db, packageName: 'better-sqlite3', proxy, transactionProxy, migrate: migrateFn };
	}

	console.log(
		"Please install either 'better-sqlite3' or '@libsql/client' for Drizzle Kit to connect to SQLite databases",
	);
	process.exit(1);
};

export const connectToLibSQL = async (credentials: LibSQLCredentials): Promise<
	& LibSQLDB
	& {
		packageName: '@libsql/client';
		migrate: (config: MigrationConfig) => Promise<void>;
		proxy: Proxy;
		transactionProxy: TransactionProxy;
	}
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

		type Transaction = Awaited<ReturnType<typeof client.transaction>>;

		const proxy = async (params: ProxyParams) => {
			const preparedParams = prepareSqliteParams(params.params || []);
			const result = await client.execute({
				sql: params.sql,
				args: preparedParams,
			});

			if (params.mode === 'array') {
				return result.rows.map((row) => Object.values(row));
			} else {
				return result.rows;
			}
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: (any[] | Error)[] = [];
			let transaction: Transaction | null = null;
			try {
				transaction = await client.transaction();
				for (const query of queries) {
					const result = await transaction.execute(query.sql);
					results.push(result.rows);
				}
				await transaction.commit();
			} catch (error) {
				results.push(error as Error);
				await transaction?.rollback();
			} finally {
				transaction?.close();
			}
			return results;
		};

		return { ...db, packageName: '@libsql/client', proxy, transactionProxy, migrate: migrateFn };
	}

	console.log(
		"Please install '@libsql/client' for Drizzle Kit to connect to LibSQL databases",
	);
	process.exit(1);
};
