import type { PGlite } from '@electric-sql/pglite';
import type { SQLiteCloudRowset } from '@sqlitecloud/drivers';
import type { AwsDataApiPgQueryResult, AwsDataApiSessionOptions } from 'drizzle-orm/aws-data-api/pg';
import type { MigrationConfig, MigratorInitFailResponse } from 'drizzle-orm/migrator';
import type { PreparedQueryConfig } from 'drizzle-orm/pg-core';
import type { config } from 'mssql';
import type { Connection, ConnectionConfig, Query } from 'mysql2';
import net from 'net';
import fetch from 'node-fetch';
import type { Client as PgClient } from 'pg';
import ws from 'ws';
import type { BenchmarkProxy, QueriesTimings, TransactionProxy } from '../utils';
import { assertUnreachable } from '../utils';
import type { LibSQLDB } from '../utils';
import type { DB, Proxy, SQLiteDB } from '../utils';
import { normaliseSQLiteUrl } from '../utils/utils-node';
import { JSONB } from '../utils/when-json-met-bigint';
import type { ProxyParams } from './commands/studio';
import { assertPackages, checkPackage, QueryError } from './utils';
import type { DuckDbCredentials } from './validations/duckdb';
import type { GelCredentials } from './validations/gel';
import type { LibSQLCredentials } from './validations/libsql';
import type { MssqlCredentials } from './validations/mssql';
import type { MysqlCredentials } from './validations/mysql';
import { withStyle } from './validations/outputs';
import type { PostgresCredentials } from './validations/postgres';
import type { SingleStoreCredentials } from './validations/singlestore';
import type { SqliteCredentials } from './validations/sqlite';

const ms = (a: bigint, b: bigint) => Number(b - a) / 1_000_000;

const normalisePGliteUrl = (it: string) => {
	if (it.startsWith('file:')) {
		return it.substring(5);
	}

	return it;
};

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
			| '@neondatabase/serverless'
			| 'bun';
		proxy: Proxy;
		transactionProxy: TransactionProxy;
		benchmarkProxy?: BenchmarkProxy;
		migrate: (config: string | MigrationConfig) => Promise<void | MigratorInitFailResponse>;
	}
> => {
	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'aws-data-api') {
			assertPackages('@aws-sdk/client-rds-data');
			const { RDSDataClient } = await import(
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
				{},
				undefined,
				config,
				undefined,
			);

			const db = drizzle({ client: rdsClient, ...config });
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
			const transactionProxy: TransactionProxy = async (_queries) => {
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
			const drzl = drizzle({ client: pglite });
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
				}).catch((e) => {
					throw new QueryError(e, sql, params);
				});
				return result.rows as T[];
			};

			const proxy = async (params: ProxyParams) => {
				const preparedParams = preparePGliteParams(params.params || []);
				const result = await pglite.query(params.sql, preparedParams, {
					rowMode: params.mode,
					parsers,
				}).catch((e) => {
					throw new QueryError(e, params.sql, params.params || []);
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

			return {
				packageName: 'pglite',
				query,
				proxy,
				transactionProxy,
				migrate: migrateFn,
			};
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
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.TIMESTAMP) {
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.DATE) {
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.INTERVAL) {
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.JSON || typeId === pg.types.builtins.JSONB) {
					return (val: any) => JSONB.parse(val);
				}
				// @ts-ignore
				return pg.types.getTypeParser(typeId, format);
			},
		};

		const pool = 'url' in credentials
			? new pg.Pool({ connectionString: credentials.url, max: 1 })
			: new pg.Pool({ ...credentials, ssl, max: 1 });

		const db = drizzle({ client: pool });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await pool.query({
				text: sql,
				values: params ?? [],
				types,
			}).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return result.rows;
		};

		const proxy: Proxy = async (params) => {
			const result = await pool.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			}).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
			});
			return result.rows;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			const tx = await pool.connect();
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

		const benchmarkQuery = async (
			client: PgClient,
			sql: string,
			params?: any[],
		): Promise<QueriesTimings['queries'][number]> => {
			const explainResult = await pool.query({
				text: `EXPLAIN ANALYZE ${sql}`,
				values: params ?? [],
				types,
			});
			const stringifiedResult = JSON.stringify(explainResult.rows);
			const planningMatch = stringifiedResult.match(/Planning Time:\s*([\d.]+)\s*ms/i)!;
			const executionMatch = stringifiedResult.match(/Execution Time:\s*([\d.]+)\s*ms/i)!;

			let planningTime = Number(planningMatch[1]);
			let executionTime = Number(executionMatch[1]);
			let querySentAt: bigint = 0n;
			let firstDataAt: bigint = 0n;
			let lastDataAt: bigint = 0n;
			let lastRowParsedAt: bigint = 0n;
			let queryCompletedAt: bigint = 0n;
			let bytesReceived = 0;
			let rowCount = 0;
			let parseTime = 0;
			let lastParseTime = 0;

			const rowDescriptionListener = (data: { length: number }) => {
				if (firstDataAt === 0n) {
					firstDataAt = process.hrtime.bigint();
				}
				bytesReceived += data.length;
			};

			const originalRowListener = client.connection.listeners('dataRow')[0] as (...args: any[]) => void;
			const wrappedRowListener = (data: { length: number }) => {
				rowCount += 1;
				const start = process.hrtime.bigint();
				lastDataAt = start;
				originalRowListener.apply(client.connection, [data]);
				const end = process.hrtime.bigint();
				lastRowParsedAt = end;
				lastParseTime = ms(start, end);
				parseTime += lastParseTime;
				bytesReceived += data.length;
			};
			client.connection.removeAllListeners('dataRow');
			client.connection.addListener('dataRow', wrappedRowListener);

			client.connection.prependListener('rowDescription', rowDescriptionListener);

			querySentAt = process.hrtime.bigint();
			await client.query({
				text: sql,
				values: params,
				types,
			});
			queryCompletedAt = process.hrtime.bigint();

			client.connection.removeListener('rowDescription', rowDescriptionListener);
			client.connection.removeAllListeners('dataRow');
			client.connection.addListener('dataRow', originalRowListener);

			let querySentTime = ms(querySentAt, firstDataAt) - executionTime - planningTime;
			if (querySentTime < 0) {
				// Adjust planning and execution times proportionally to accommodate negative query sent time (10% for network)
				const percent = 0.10;
				const overflow = -querySentTime;
				const keepForSent = overflow * percent;
				const adjustedOverflow = overflow * (1 + percent);
				const total = planningTime + executionTime;
				const ratioPlanning = planningTime / total;
				const ratioExecution = executionTime / total;
				planningTime -= adjustedOverflow * ratioPlanning;
				executionTime -= adjustedOverflow * ratioExecution;
				querySentTime = keepForSent;
			}

			const networkLatencyBefore = querySentTime / 2;
			const networkLatencyAfter = querySentTime / 2;
			// Minus parse time divided by row count to remove last row parse time overlap
			const downloadTime = ms(firstDataAt, lastDataAt) - (rowCount > 1 ? parseTime - lastParseTime : 0);
			const total = ms(querySentAt, queryCompletedAt);
			const calculatedTotal = networkLatencyBefore + planningTime + executionTime + networkLatencyAfter + downloadTime
				+ parseTime + ms(lastRowParsedAt, queryCompletedAt);
			const errorMargin = Math.abs(total - calculatedTotal);

			return {
				networkLatencyBefore,
				planning: planningTime,
				execution: executionTime,
				networkLatencyAfter,
				dataDownload: downloadTime,
				dataParse: parseTime,
				total,
				errorMargin,
				dataSize: bytesReceived,
			};
		};

		const benchmarkProxy: BenchmarkProxy = async ({ sql, params }, repeats) => {
			let startAt: bigint = 0n;
			let tcpConnectedAt: bigint = 0n;
			let tlsConnectedAt: bigint | null = null;
			let dbReadyAt: bigint = 0n;

			const client = 'url' in credentials
				? new pg.Client({ connectionString: credentials.url })
				: new pg.Client({ ...credentials, ssl });

			client.connection.once('connect', () => {
				tcpConnectedAt = process.hrtime.bigint();
			});
			client.connection.prependOnceListener('sslconnect', () => {
				tlsConnectedAt = process.hrtime.bigint();
			});
			client.connection.prependOnceListener('readyForQuery', () => {
				dbReadyAt = process.hrtime.bigint();
			});

			startAt = process.hrtime.bigint();
			await client.connect();

			const results = [];
			for (let i = 0; i < repeats; i++) {
				const r = await benchmarkQuery(client, sql, params);
				results.push(r);
			}
			await client.end();

			return {
				tcpHandshake: ms(startAt, tcpConnectedAt),
				tlsHandshake: tlsConnectedAt ? ms(tcpConnectedAt, tlsConnectedAt) : null,
				dbHandshake: ms(tlsConnectedAt ?? tcpConnectedAt, dbReadyAt),
				queries: results,
			};
		};

		return { packageName: 'pg', query, proxy, transactionProxy, benchmarkProxy, migrate: migrateFn };
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

		const db = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.unsafe(sql, params ?? []).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return result as any[];
		};

		const proxy: Proxy = async (params) => {
			if (params.mode === 'array') {
				return client.unsafe(params.sql, params.params).values().catch((e) => {
					throw new QueryError(e, params.sql, params.params || []);
				});
			}
			return client.unsafe(params.sql, params.params).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
			});
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

		return {
			packageName: 'postgres',
			query,
			proxy,
			transactionProxy,
			migrate: migrateFn,
		};
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

		const db = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query({
				text: sql,
				values: params ?? [],
				types,
			}).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return result.rows;
		};

		const proxy: Proxy = async (params) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			}).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
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

		return {
			packageName: '@vercel/postgres',
			query,
			proxy,
			transactionProxy,
			migrate: migrateFn,
		};
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
		const {
			Pool,
			neonConfig,
			types: pgTypes,
		} = await import('@neondatabase/serverless');
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

		const db = drizzle({ client: client as any });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query({
				text: sql,
				values: params ?? [],
				types,
			}).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return result.rows;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			}).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
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

		return {
			packageName: '@neondatabase/serverless',
			query,
			proxy,
			transactionProxy,
			migrate: migrateFn,
		};
	}

	if (await checkPackage('bun')) {
		console.log(withStyle.info(`Using 'bun' driver for database querying`));
		const { SQL } = await import('bun');
		const { drizzle } = await import('drizzle-orm/bun-sql/postgres');
		const { migrate } = await import('drizzle-orm/bun-sql/postgres/migrator');

		const ssl = 'ssl' in credentials
			? credentials.ssl === 'prefer'
					|| credentials.ssl === 'require'
					|| credentials.ssl === 'allow'
				? true
				: false
			: undefined;

		const client = new SQL({
			adapter: 'postgres',
			...credentials,
			ssl,
			max: 1,
		});
		const db = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.unsafe(sql, params ?? []);
			return result;
		};

		const proxy: Proxy = async (params) => {
			const query = client.unsafe(params.sql, params.params);
			if (params.mode === 'array') {
				return await query.values();
			}
			return await query;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await client.transaction(async (tx) => {
					for (const query of queries) {
						const result = await tx.unsafe(query.sql);
						results.push(result);
					}
				});
			} catch (error) {
				results.push(error as Error);
			}
			return results;
		};

		return { packageName: 'bun', query, proxy, transactionProxy, migrate: migrateFn };
	}

	console.error(
		"To connect to Postgres database - please install either of 'pg', 'postgres', 'bun', '@neondatabase/serverless' or '@vercel/postgres' drivers",
	);
	console.warn("For the 'bun' driver, run your script using: bun --bun");
	process.exit(1);
};

export const prepareDuckDb = async (
	credentials: DuckDbCredentials,
): Promise<
	DB & {
		packageName: 'duckdb' | '@duckdb/node-api';
		proxy: Proxy;
		transactionProxy: TransactionProxy;
		migrate: (config: string | MigrationConfig) => Promise<void>;
	}
> => {
	// ! Cannot find module node_modules/duckdb/lib/duckdb-binding.js
	// if (await checkPackage('duckdb')) {
	// 	console.log(withStyle.info(`Using 'duckdb' driver for database querying`));
	// 	const duckdb = await import('duckdb');

	// 	const client = await new Promise<InstanceType<typeof duckdb.Database>>((resolve, reject) => {
	// 		const db = new duckdb.Database(credentials.url, (err) => {
	// 			if (err) {
	// 				reject(err);
	// 			}
	// 			resolve(db);
	// 		});
	// 	});

	// 	const query = async (sql: string, params: any[] = []) =>
	// 		new Promise<any[]>((resolve, reject) => {
	// 			client.all(sql, ...params, (err, rows) => {
	// 				if (err) {
	// 					reject(err);
	// 				}
	// 				resolve(rows);
	// 			});
	// 		});

	// 	const proxy: Proxy = async (params) => {
	// 		const rows = await query(params.sql, params.params);
	// 		return params.mode === 'array'
	// 			// not safe, but DuckDB does not support array mode
	// 			? rows.map((row) => Object.values(row))
	// 			: rows;
	// 	};

	// 	const transactionProxy: TransactionProxy = async (queries) => {
	// 		const results: any[] = [];
	// 		const tx = client.connect();
	// 		try {
	// 			tx.run('BEGIN');
	// 			for (const query of queries) {
	// 				const rows = await new Promise<any[]>((resolve, reject) => {
	// 					client.all(query.sql, (err, rows) => {
	// 						if (err) {
	// 							reject(err);
	// 						}
	// 						resolve(rows);
	// 					});
	// 				});
	// 				results.push(rows);
	// 			}
	// 			tx.run('COMMIT');
	// 		} catch (error) {
	// 			tx.run('ROLLBACK');
	// 			results.push(error as Error);
	// 		} finally {
	// 			tx.close();
	// 		}
	// 		return results;
	// 	};

	// 	return {
	// 		packageName: 'duckdb',
	// 		query,
	// 		proxy,
	// 		transactionProxy,
	// 		migrate: () => {
	// 			throw new Error('DuckDB does not support migrations');
	// 		},
	// 	};
	// }

	if (await checkPackage('@duckdb/node-api')) {
		console.log(
			withStyle.info(`Using '@duckdb/node-api' driver for database querying`),
		);
		const { DuckDBInstance } = await import('@duckdb/node-api');

		const instance = await DuckDBInstance.create(credentials.url);
		const client = await instance.connect();

		const query = async (sql: string, params: any[] = []) => {
			const result = await client.run(sql, params);
			const rows = await result.getRowObjectsJson();
			return rows as any[];
		};

		const proxy: Proxy = async (params) => {
			const result = await client.run(params.sql, params.params);
			return params.mode === 'array' ? await result.getRowsJson() : await result.getRowObjectsJson();
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await client.run('BEGIN');
				for (const query of queries) {
					const result = await client.run(query.sql);
					results.push(await result.getRowObjectsJson());
				}
				await client.run('COMMIT');
			} catch (error) {
				await client.run('ROLLBACK');
				results.push(error as Error);
			}
			return results;
		};

		return {
			packageName: '@duckdb/node-api',
			query,
			proxy,
			transactionProxy,
			migrate: () => {
				throw new Error('DuckDB does not support migrations');
			},
		};
	}

	console.error(
		// "To connect to DuckDb database - please install either of 'duckdb', '@duckdb/node-api' drivers",
		"To connect to DuckDb database - please install '@duckdb/node-api' driver",
	);
	process.exit(1);
};

export const prepareCockroach = async (
	credentials: PostgresCredentials,
): Promise<
	DB & {
		proxy: Proxy;
		migrate: (config: string | MigrationConfig) => Promise<void | MigratorInitFailResponse>;
	}
> => {
	if (await checkPackage('pg')) {
		const { default: pg } = await import('pg');
		const { drizzle } = await import('drizzle-orm/cockroach');
		const { migrate } = await import('drizzle-orm/cockroach/migrator');

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
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.TIMESTAMP) {
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.DATE) {
					return (val: any) => val;
				}
				if (typeId === pg.types.builtins.INTERVAL) {
					return (val: any) => val;
				}
				// @ts-ignore
				return pg.types.getTypeParser(typeId, format);
			},
		};

		const client = 'url' in credentials
			? new pg.Pool({ connectionString: credentials.url, max: 1 })
			: new pg.Pool({ ...credentials, ssl, max: 1 });

		const db = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.query({
				text: sql,
				values: params ?? [],
				types,
			}).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return result.rows;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await client.query({
				text: params.sql,
				values: params.params,
				...(params.mode === 'array' && { rowMode: 'array' }),
				types,
			}).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
			});
			return result.rows;
		};

		return { query, proxy, migrate: migrateFn };
	}

	console.error("To connect to Cockroach - please install 'pg' package");
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
			client = 'tlsSecurity' in credentials
				? gel.createClient({ dsn: credentials.url, tlsSecurity: credentials.tlsSecurity, concurrency: 1 })
				: gel.createClient({ dsn: credentials.url, concurrency: 1 });
		} else {
			gel.createClient({ ...credentials, concurrency: 1 });
		}

		const query = async (sql: string, params?: any[]) => {
			const result = params?.length
				? await client.querySQL(sql, params)
				: await client.querySQL(sql);
			return result as any[];
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const { mode, params: sqlParams, sql } = params;

			let result: any[];
			switch (mode) {
				case 'array':
					result = sqlParams?.length
						? await client.withSQLRowMode('array').querySQL(sql, sqlParams)
						: await client.withSQLRowMode('array').querySQL(sql);
					break;
				case 'object':
					result = sqlParams?.length
						? await client.querySQL(sql, sqlParams)
						: await client.querySQL(sql);
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

	console.error("To connect to gel database - please install 'edgedb' driver");
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
	migrate: (config: string | MigrationConfig) => Promise<void | MigratorInitFailResponse>;
}> => {
	const result = parseSingleStoreCredentials(it);

	if (await checkPackage('mysql2')) {
		const { createConnection } = await import('mysql2/promise');
		const { drizzle } = await import('drizzle-orm/singlestore');
		const { migrate } = await import('drizzle-orm/singlestore/migrator');

		const connection = result.url
			? await createConnection(result.url)
			: await createConnection(result.credentials!); // needed for some reason!

		const db = drizzle({ client: connection });
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
	packageName: 'mysql2' | '@planetscale/database' | 'bun';
	proxy: Proxy;
	transactionProxy: TransactionProxy;
	benchmarkProxy?: BenchmarkProxy;
	database: string;
	migrate: (config: string | MigrationConfig) => Promise<void | MigratorInitFailResponse>;
}> => {
	const result = parseMysqlCredentials(it);

	if (await checkPackage('mysql2')) {
		console.log(withStyle.info(`Using 'mysql2' driver for database querying`));
		const { createConnection } = await import('mysql2/promise');
		const { drizzle } = await import('drizzle-orm/mysql2');
		const { migrate } = await import('drizzle-orm/mysql2/migrator');

		const connection = result.url
			? await createConnection(result.url)
			: await createConnection(result.credentials!); // needed for some reason!

		const db = drizzle({ client: connection });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const typeCast = (field: any, next: any) => {
			if (
				field.type === 'TIMESTAMP'
				|| field.type === 'DATETIME'
				|| field.type === 'DATE'
			) {
				return field.string();
			}
			return next();
		};

		const query: DB['query'] = async <T>(
			sql: string,
			params?: any[],
		): Promise<T[]> => {
			const res = await connection.execute({
				sql,
				values: params,
				typeCast,
			}).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return res[0] as any;
		};

		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await connection.query({
				sql: params.sql,
				values: params.params,
				rowsAsArray: params.mode === 'array',
				typeCast,
			}).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
			});
			return result[0] as any[];
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await connection.beginTransaction();
				for (const query of queries) {
					const res = await connection.query({
						sql: query.sql,
						typeCast,
					});
					results.push(res[0]);
				}
				await connection.commit();
			} catch (error) {
				await connection.rollback();
				results.push(error as Error);
			}
			return results;
		};

		const benchmarkQuery = async (
			newConnection: Connection,
			sql: string,
			params?: any[],
		): Promise<QueriesTimings['queries'][number]> => {
			const explainResult = await connection.query({
				sql: `EXPLAIN ANALYZE ${sql}`,
				values: params ?? [],
				typeCast,
			});
			const stringifiedResult = JSON.stringify(explainResult[0]);
			const timeMatch = stringifiedResult.match(
				/actual time=([0-9.eE+-]+)\.\.([0-9.eE+-]+)/,
			)!;
			// const firstRowTime = Number(timeMatch[1]);
			const lastRowTime = Number(timeMatch[2]);
			let executionTime = lastRowTime;

			let querySentAt: bigint = 0n;
			let firstDataAt: bigint = 0n;
			let lastDataAt: bigint = 0n;
			let lastRowParsedAt: bigint = 0n;
			let queryCompletedAt: bigint = 0n;
			let bytesReceived = 0;
			let rowCount = 0;
			let parseTime = 0;
			let lastParseTime = 0;

			querySentAt = process.hrtime.bigint();
			await new Promise<void>((resolve, reject) => {
				const query = newConnection.query({
					sql,
					values: params ?? [],
					typeCast,
				}) as Query & {
					row: (...args: any[]) => any;
				};
				const originalRowHandler = query.row;
				let packets = 0;
				const wrappedRowListener = (
					packet: { buffer: Buffer; isEOF: () => {}; length: () => number; start: number },
					connection: any,
				) => {
					packets += 1;
					if (firstDataAt === 0n) {
						firstDataAt = process.hrtime.bigint();
						// First packet also contains some bytes before row data starts
						bytesReceived += packet.start;
					}
					const start = process.hrtime.bigint();
					lastDataAt = start;
					const res = originalRowHandler.apply(query, [packet, connection]);
					const end = process.hrtime.bigint();
					lastRowParsedAt = end;
					lastParseTime = ms(start, end);
					parseTime += lastParseTime;
					bytesReceived += packet.length();
					if (!res || packet.isEOF()) {
						return res;
					}
					return wrappedRowListener;
				};
				query.row = wrappedRowListener;

				query.on('result', () => {
					rowCount += 1;
				});
				query.on('error', (err) => {
					reject(err);
				});
				query.on('end', () => {
					resolve();
				});
			});
			queryCompletedAt = process.hrtime.bigint();

			let querySentTime = ms(querySentAt, firstDataAt) - executionTime;
			if (querySentTime < 0) {
				// Adjust planning and execution times proportionally to accommodate negative query sent time (10% for network)
				const percent = 0.10;
				const overflow = -querySentTime;
				const keepForSent = overflow * percent;
				const adjustedOverflow = overflow * (1 + percent);
				const total = executionTime;
				const ratioExecution = executionTime / total;
				executionTime -= adjustedOverflow * ratioExecution;
				querySentTime = keepForSent;
			}

			const networkLatencyBefore = querySentTime / 2;
			const networkLatencyAfter = querySentTime / 2;
			// Minus parse time divided by row count to remove last row parse time overlap
			const downloadTime = ms(firstDataAt, lastDataAt) - (rowCount > 1 ? parseTime - lastParseTime : 0);
			const total = ms(querySentAt, queryCompletedAt);
			const calculatedTotal = networkLatencyBefore + executionTime + networkLatencyAfter + downloadTime
				+ parseTime + ms(lastRowParsedAt, queryCompletedAt);
			const errorMargin = Math.abs(total - calculatedTotal);

			return {
				networkLatencyBefore,
				planning: null,
				execution: executionTime,
				networkLatencyAfter,
				dataDownload: downloadTime,
				dataParse: parseTime,
				total,
				errorMargin,
				dataSize: bytesReceived,
			};
		};

		const benchmarkProxy: BenchmarkProxy = async ({ sql, params }, repeats) => {
			const { createConnection } = await import('mysql2');

			let startAt: bigint = 0n;
			let tcpConnectedAt: bigint = 0n;
			let tlsConnectedAt: bigint | null = null;

			const createStream = ({ config }: { config: ConnectionConfig }) => {
				let stream: net.Socket;
				if (config.socketPath) {
					stream = net.connect(config.socketPath);
				} else {
					stream = net.connect(config.port!, config.host);
				}
				if (config.enableKeepAlive) {
					stream.on('connect', () => {
						stream.setKeepAlive(true, config.keepAliveInitialDelay);
					});
				}
				stream.setNoDelay(true);
				stream.once('connect', () => {
					tcpConnectedAt = process.hrtime.bigint();
				});
				return stream;
			};

			startAt = process.hrtime.bigint();
			const connection = result.url
				? createConnection({
					uri: result.url,
					stream: createStream,
				})
				: createConnection({
					...result.credentials!,
					stream: createStream,
				});
			await new Promise<void>((resolve, reject) => {
				connection.connect((err) => {
					tlsConnectedAt = process.hrtime.bigint();
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			});

			const results = [];
			for (let i = 0; i < repeats; i++) {
				const r = await benchmarkQuery(connection, sql, params);
				results.push(r);
			}
			connection.end();

			return {
				tcpHandshake: ms(startAt, tcpConnectedAt),
				tlsHandshake: tlsConnectedAt ? ms(tcpConnectedAt, tlsConnectedAt) : null,
				dbHandshake: null,
				queries: results,
			};
		};

		return {
			db: { query },
			packageName: 'mysql2',
			proxy,
			transactionProxy,
			benchmarkProxy,
			database: result.database,
			migrate: migrateFn,
		};
	}

	if (await checkPackage('@planetscale/database')) {
		console.log(withStyle.info(`Using '@planetscale/database' driver for database querying`));
		const { Client } = await import('@planetscale/database');
		const { drizzle } = await import('drizzle-orm/planetscale-serverless');
		const { migrate } = await import(
			'drizzle-orm/planetscale-serverless/migrator'
		);

		const connection = new Client(result);

		const db = drizzle({ client: connection });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async <T>(sql: string, params?: any[]): Promise<T[]> => {
			const res = await connection.execute(sql, params).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return res.rows as T[];
		};
		const proxy: Proxy = async (params: ProxyParams) => {
			const result = await connection.execute(
				params.sql,
				params.params,
				params.mode === 'array' ? { as: 'array' } : undefined,
			).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
			});
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

	if (await checkPackage('bun')) {
		console.log(withStyle.info(`Using 'bun' driver for database querying`));
		const { SQL } = await import('bun');
		const { drizzle } = await import('drizzle-orm/bun-sql/mysql');
		const { migrate } = await import('drizzle-orm/bun-sql/mysql/migrator');

		const ssl = result.credentials && 'ssl' in result.credentials
			? result.credentials.ssl === 'prefer'
					|| result.credentials.ssl === 'require'
					|| result.credentials.ssl === 'allow'
				? true
				: false
			: undefined;

		const client = result.url
			? new SQL(result.url)
			: new SQL({
				adapter: 'mysql',
				...result.credentials,
				ssl,
			});

		const db = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.unsafe(sql, params ?? []);
			return result;
		};

		const proxy: Proxy = async (params) => {
			const query = client.unsafe(params.sql, params.params);
			if (params.mode === 'array') {
				return await query.values();
			}
			return await query;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await client.transaction(async (tx) => {
					for (const query of queries) {
						const result = await tx.unsafe(query.sql);
						results.push(result);
					}
				});
			} catch (error) {
				results.push(error as Error);
			}
			return results;
		};

		return {
			packageName: 'bun',
			db: { query },
			proxy,
			transactionProxy,
			migrate: migrateFn,
			database: result.database,
		};
	}

	console.error(
		"To connect to MySQL database - please install either of 'mysql2', 'bun' or '@planetscale/database' drivers",
	);
	console.warn("For the 'bun' driver, run your script using: bun --bun");
	process.exit(1);
};

function parseMssqlUrl(url: URL): config {
	return {
		user: url.username,
		password: url.password,
		server: url.hostname,
		port: Number.parseInt(url.port, 10),
		database: url.pathname.replace(/^\//, ''),
		options: {
			encrypt: url.searchParams.get('encrypt') === 'true',
			trustServerCertificate: url.searchParams.get('trustServerCertificate') === 'true',
		},
	};
}

const parseMssqlCredentials = (credentials: MssqlCredentials) => {
	if ('url' in credentials) {
		try {
			const url = new URL(credentials.url);
			const parsedCredentials = parseMssqlUrl(url);
			return {
				database: parsedCredentials.database,
				credentials: parsedCredentials,
			};
		} catch {
			return { url: credentials.url };
		}
	} else {
		return {
			database: credentials.database,
			credentials,
		};
	}
};

export const connectToMsSQL = async (
	it: MssqlCredentials,
): Promise<{
	db: DB;
	migrate: (config: MigrationConfig) => Promise<void | MigratorInitFailResponse>;
}> => {
	const result = parseMssqlCredentials(it);

	if (await checkPackage('mssql')) {
		const mssql = await import('mssql');
		const { drizzle } = await import('drizzle-orm/node-mssql');
		const { migrate } = await import('drizzle-orm/node-mssql/migrator');
		const connection = result.url
			? await mssql.default.connect(result.url)
			: await mssql.default.connect(result.credentials!);

		const db = drizzle({ client: connection });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query: DB['query'] = async <T>(
			sql: string,
		): Promise<T[]> => {
			const res = await connection.query(sql).catch((e) => {
				throw new QueryError(e, sql, []);
			});
			return res.recordset as any;
		};

		return {
			db: { query },
			migrate: migrateFn,
		};
	}

	console.error("To connect to MsSQL database - please install 'mssql' driver");
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
		packageName:
			| 'd1-http'
			| '@libsql/client'
			| 'better-sqlite3'
			| '@sqlitecloud/drivers'
			| '@tursodatabase/database'
			| 'bun';
		migrate: (config: string | MigrationConfig) => Promise<void | MigratorInitFailResponse>;
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
				).catch((e) => {
					throw new QueryError(e, sql, params || []);
				});

				const data = (await res.json()) as D1Response;

				if (!data.success) {
					throw new QueryError(
						new Error(data.errors.map((it) => `${it.code}: ${it.message}`).join('\n')),
						sql,
						params || [],
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

			const query = async <T>(sql: string, params?: any[]) => {
				const res = await remoteCallback(sql, params || [], 'all');
				return res.rows as T[];
			};
			const run = async (query: string) => {
				await remoteCallback(query, [], 'run');
			};

			const proxy: Proxy = async (params) => {
				const preparedParams = prepareSqliteParams(
					params.params || [],
					'd1-http',
				);
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
			return { query, run, packageName: 'd1-http', proxy, transactionProxy, migrate: migrateFn };
		} else if (driver === 'sqlite-cloud') {
			assertPackages('@sqlitecloud/drivers');
			const { Database } = await import('@sqlitecloud/drivers');
			const { drizzle } = await import('drizzle-orm/sqlite-cloud');
			const { migrate } = await import('drizzle-orm/sqlite-cloud/migrator');

			const client = new Database(credentials.url);
			const drzl = drizzle({ client });
			const migrateFn = async (config: MigrationConfig) => {
				return migrate(drzl, config);
			};

			const query = async <T>(sql: string, params?: any[]) => {
				const stmt = client.prepare(sql).bind(params || []);
				return await new Promise<T[]>((resolve, reject) => {
					stmt.all((e: Error | null, d: SQLiteCloudRowset) => {
						if (e) return reject(e);

						return resolve(d.map((v) => Object.fromEntries(Object.entries(v))));
					});
				});
			};
			const run = async (query: string) => {
				return await new Promise<void>((resolve, reject) => {
					client.exec(query, (e: Error | null) => {
						if (e) return reject(e);
						return resolve();
					});
				});
			};

			const proxy = async (params: ProxyParams) => {
				const preparedParams = prepareSqliteParams(params.params || []);
				const stmt = client.prepare(params.sql).bind(preparedParams);
				return await new Promise<any[]>((resolve, reject) => {
					stmt.all((e: Error | null, d: SQLiteCloudRowset | undefined) => {
						if (e) return reject(e);

						if (params.mode === 'array') {
							return resolve((d || []).map((v) => v.getData()));
						} else {
							return resolve((d || []).map((v) => Object.fromEntries(Object.entries(v))));
						}
					});
				});
			};

			const transactionProxy: TransactionProxy = async (queries) => {
				const results: (any[] | Error)[] = [];
				try {
					await new Promise<void>((resolve, reject) => {
						client.exec('BEGIN', (e: Error | null) => {
							if (e) return reject(e);
							return resolve();
						});
					});
					for (const query of queries) {
						const result = await new Promise<any[]>((resolve, reject) => {
							client.all(query.sql, (e: Error | null, d: SQLiteCloudRowset | undefined) => {
								if (e) return reject(e);
								return resolve((d || []).map((v) => Object.fromEntries(Object.entries(v))));
							});
						});
						results.push(result);
					}
					await new Promise<void>((resolve, reject) => {
						client.exec('COMMIT', (e: Error | null) => {
							if (e) return reject(e);
							return resolve();
						});
					});
				} catch (error) {
					results.push(error as Error);
					await new Promise<void>((resolve, reject) => {
						client.exec('ROLLBACK', (e: Error | null) => {
							if (e) return reject(e);
							return resolve();
						});
					});
				}
				return results;
			};

			return { query, run, packageName: '@sqlitecloud/drivers', proxy, transactionProxy, migrate: migrateFn };
		} else {
			assertUnreachable(driver);
		}
	}

	if (await checkPackage('@libsql/client')) {
		console.log(withStyle.info(`Using '@libsql/client' driver for database querying`));
		const { createClient } = await import('@libsql/client');
		const { drizzle } = await import('drizzle-orm/libsql');
		const { migrate } = await import('drizzle-orm/libsql/migrator');

		const client = createClient({
			url: normaliseSQLiteUrl(credentials.url, 'libsql'),
		});
		const drzl = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(drzl, config);
		};

		const query = async <T>(sql: string, params?: any[]) => {
			const res = await client.execute({ sql, args: params || [] });
			return res.rows as T[];
		};
		const run = async (query: string) => {
			await client.execute(query);
		};

		type Transaction = Awaited<ReturnType<typeof client.transaction>>;

		const proxy = async (params: ProxyParams) => {
			const preparedParams = prepareSqliteParams(params.params || []);
			const result = await client.execute({
				sql: params.sql,
				args: preparedParams,
			}).catch((e) => {
				throw new QueryError(e, params.sql, params.params || []);
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

		return { query, run, packageName: '@libsql/client', proxy, transactionProxy, migrate: migrateFn };
	}

	if (await checkPackage('@tursodatabase/database')) {
		console.log(withStyle.info(`Using '@tursodatabase/database' driver for database querying`));
		const { Database } = await import('@tursodatabase/database');
		const { drizzle } = await import('drizzle-orm/tursodatabase/database');
		const { migrate } = await import('drizzle-orm/tursodatabase/migrator');

		const client = new Database(normaliseSQLiteUrl(credentials.url, '@tursodatabase/database'));
		const drzl = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(drzl, config);
		};

		const query = async <T>(sql: string, params?: any[]) => {
			const stmt = client.prepare(sql).bind(preparePGliteParams(params || []));
			const res = await stmt.all();
			return res as T[];
		};

		const proxy = async (params: ProxyParams) => {
			const preparedParams = prepareSqliteParams(params.params || []);
			const stmt = client.prepare(params.sql).bind(preparedParams);

			return stmt.raw(params.mode === 'array').all();
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: (any[] | Error)[] = [];
			try {
				const tx = client.transaction(async () => {
					for (const query of queries) {
						const result = await client.prepare(query.sql).all();
						results.push(result);
					}
				});
				await tx();
			} catch (error) {
				results.push(error as Error);
			}
			return results;
		};

		return {
			query,
			packageName: '@tursodatabase/database',
			proxy,
			transactionProxy,
			migrate: migrateFn,
			run: async (query: string) => {
				await client.exec(query).catch((e) => {
					throw new QueryError(e, query, []);
				});
			},
		};
	}

	if (await checkPackage('better-sqlite3')) {
		console.log(withStyle.info(`Using 'better-sqlite3' driver for database querying`));
		const { default: Database } = await import('better-sqlite3');
		const { drizzle } = await import('drizzle-orm/better-sqlite3');
		const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');

		const sqlite = new Database(
			normaliseSQLiteUrl(credentials.url, 'better-sqlite'),
		);
		const drzl = drizzle({ client: sqlite });
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

			const tx = sqlite.transaction(
				(queries: Parameters<TransactionProxy>[0]) => {
					for (const query of queries) {
						let result: any[] = [];
						if (
							query.method === 'values'
							|| query.method === 'get'
							|| query.method === 'all'
						) {
							result = sqlite.prepare(query.sql).all();
						} else {
							sqlite.prepare(query.sql).run();
						}
						results.push(result);
					}
				},
			);

			try {
				tx(queries);
			} catch (error) {
				results.push(error as Error);
			}

			return results;
		};

		return {
			...db,
			packageName: 'better-sqlite3',
			proxy,
			transactionProxy,
			migrate: migrateFn,
		};
	}

	if (await checkPackage('bun')) {
		console.log(withStyle.info(`Using 'bun' driver for database querying`));
		const { SQL } = await import('bun');
		const { drizzle } = await import('drizzle-orm/bun-sql/sqlite');
		const { migrate } = await import('drizzle-orm/bun-sql/sqlite/migrator');

		const client = new SQL({
			adapter: 'sqlite',
			filename: normaliseSQLiteUrl(credentials.url, 'bun'),
		});

		const db = drizzle({ client });
		const migrateFn = async (config: MigrationConfig) => {
			return migrate(db, config);
		};

		const query = async (sql: string, params?: any[]) => {
			const result = await client.unsafe(sql, params ?? []);
			return result;
		};
		const run = async (sql: string) => {
			await client.unsafe(sql);
		};

		const proxy: Proxy = async (params) => {
			const query = client.unsafe(params.sql, params.params);
			if (params.mode === 'array') {
				return await query.values();
			}
			return await query;
		};

		const transactionProxy: TransactionProxy = async (queries) => {
			const results: any[] = [];
			try {
				await client.transaction(async (tx) => {
					for (const query of queries) {
						const result = await tx.unsafe(query.sql);
						results.push(result);
					}
				});
			} catch (error) {
				results.push(error as Error);
			}
			return results;
		};

		return {
			packageName: 'bun',
			query,
			run,
			proxy,
			transactionProxy,
			migrate: migrateFn,
		};
	}

	console.log(
		"Please install either 'better-sqlite3', 'bun', '@libsql/client' or '@tursodatabase/database' for Drizzle Kit to connect to SQLite databases",
	);
	console.warn("For the 'bun' driver, run your script using: bun --bun");
	process.exit(1);
};

export const connectToLibSQL = async (
	credentials: LibSQLCredentials,
): Promise<
	LibSQLDB & {
		packageName: '@libsql/client';
		migrate: (config: string | MigrationConfig) => Promise<void | MigratorInitFailResponse>;
		proxy: Proxy;
		transactionProxy: TransactionProxy;
	}
> => {
	if (!(await checkPackage('@libsql/client'))) {
		console.log(
			"Please install '@libsql/client' for Drizzle Kit to connect to LibSQL databases",
		);
		process.exit(1);
	}

	const { createClient } = await import('@libsql/client');
	const { drizzle } = await import('drizzle-orm/libsql');
	const { migrate } = await import('drizzle-orm/libsql/migrator');

	const client = createClient({
		url: normaliseSQLiteUrl(credentials.url, 'libsql'),
		authToken: credentials.authToken,
	});
	const drzl = drizzle({ client });
	const migrateFn = async (config: MigrationConfig) => {
		return migrate(drzl, config);
	};

	const db: LibSQLDB = {
		query: async <T>(sql: string, params?: any[]) => {
			const res = await client.execute({ sql, args: params || [] }).catch((e) => {
				throw new QueryError(e, sql, params || []);
			});
			return res.rows as T[];
		},
		run: async (query: string) => {
			await client.execute(query).catch((e) => {
				throw new QueryError(e, query, []);
			});
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
};
