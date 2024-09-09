/* eslint-disable import/extensions */
import type { RDSDataClient, RDSDataClientConfig, RDSDataClientConfig as RDSConfig } from '@aws-sdk/client-rds-data';
import type { Client as LibsqlClient, Config as LibsqlConfig } from '@libsql/client';
import type {
	HTTPTransactionOptions as NeonHttpConfig,
	NeonQueryFunction,
	Pool as NeonServerlessPool,
	PoolConfig as NeonServerlessConfig,
	QueryResult,
	QueryResultRow,
} from '@neondatabase/serverless';
import type { Client as PlanetscaleClient, Config as PlanetscaleConfig } from '@planetscale/database';
import type { Config as TiDBServerlessConfig, Connection as TiDBConnection } from '@tidbcloud/serverless';
import type { VercelPool } from '@vercel/postgres';
import type { Database as BetterSQLite3Database, Options as BetterSQLite3Options } from 'better-sqlite3';
import type { Database as BunDatabase } from 'bun:sqlite';
import type { Pool as Mysql2Pool, PoolOptions as Mysql2Config } from 'mysql2';
import type { Pool as NodePgPool, PoolConfig as NodePgPoolConfig } from 'pg';
import type {
	Options as PostgresJSOptions,
	PostgresType as PostgresJSPostgresType,
	Sql as PostgresJsClient,
} from 'postgres';
import type { AwsDataApiPgDatabase, DrizzleAwsDataApiPgConfig } from './aws-data-api/pg/index.ts';
import type { BetterSQLite3Database as DrizzleBetterSQLite3Database } from './better-sqlite3/index.ts';
import type { BunSQLiteDatabase } from './bun-sqlite/index.ts';
import type { DrizzleD1Database } from './d1/index.ts';
import type { LibSQLDatabase } from './libsql/index.ts';
import type { MySql2Database, MySql2DrizzleConfig } from './mysql2/index.ts';
import type { NeonHttpDatabase } from './neon-http/index.ts';
import type { NeonDatabase } from './neon-serverless/index.ts';
import type { NodePgDatabase } from './node-postgres/driver.ts';
import type { PlanetScaleDatabase } from './planetscale-serverless/index.ts';
import type { PostgresJsDatabase } from './postgres-js/index.ts';
import type { TiDBServerlessDatabase } from './tidb-serverless/index.ts';
import type { DrizzleConfig } from './utils.ts';
import type { VercelPgDatabase } from './vercel-postgres/index.ts';

type BunSqliteDatabaseOptions =
	| number
	| {
		/**
		 * Open the database as read-only (no write operations, no create).
		 *
		 * Equivalent to {@link constants.SQLITE_OPEN_READONLY}
		 */
		readonly?: boolean;
		/**
		 * Allow creating a new database
		 *
		 * Equivalent to {@link constants.SQLITE_OPEN_CREATE}
		 */
		create?: boolean;
		/**
		 * Open the database as read-write
		 *
		 * Equivalent to {@link constants.SQLITE_OPEN_READWRITE}
		 */
		readwrite?: boolean;
	};

type BunSqliteDatabaseConfig =
	| {
		filename?: ':memory:' | (string & {});
		options?: BunSqliteDatabaseOptions;
	}
	| ':memory:'
	| (string & {})
	| undefined;

type BetterSQLite3DatabaseConfig =
	| {
		filename?:
			| ':memory:'
			| (string & {})
			| Buffer;
		options?: BetterSQLite3Options;
	}
	| ':memory:'
	| (string & {})
	| undefined;

type MonodriverNeonHttpConfig = {
	connectionString: string;
	options?: NeonHttpConfig<boolean, boolean>;
} | string;

type DatabaseClient =
	| 'node-postgres'
	| 'postgres-js'
	| 'neon-serverless'
	| 'neon-http'
	| 'vercel-postgres'
	| 'aws-data-api-pg'
	| 'planetscale'
	| 'mysql2'
	| 'tidb-serverless'
	| 'libsql'
	| 'turso'
	| 'd1'
	| 'bun:sqlite'
	| 'better-sqlite3';

type ClientDrizzleInstanceMap<TSchema extends Record<string, any>> = {
	'node-postgres': NodePgDatabase<TSchema>;
	'postgres-js': PostgresJsDatabase<TSchema>;
	'neon-serverless': NeonDatabase<TSchema>;
	'neon-http': NeonHttpDatabase<TSchema>;
	'vercel-postgres': VercelPgDatabase<TSchema>;
	'aws-data-api-pg': AwsDataApiPgDatabase<TSchema>;
	planetscale: PlanetScaleDatabase<TSchema>;
	mysql2: MySql2Database<TSchema>;
	'tidb-serverless': TiDBServerlessDatabase<TSchema>;
	libsql: LibSQLDatabase<TSchema>;
	turso: LibSQLDatabase<TSchema>;
	d1: DrizzleD1Database<TSchema>;
	'bun:sqlite': BunSQLiteDatabase<TSchema>;
	'better-sqlite3': DrizzleBetterSQLite3Database<TSchema>;
};

type Primitive = string | number | boolean | undefined | null;

type ClientInstanceMap = {
	'node-postgres': NodePgPool;
	'postgres-js': PostgresJsClient;
	'neon-serverless': NeonServerlessPool;
	'neon-http': NeonQueryFunction<boolean, boolean>;
	'vercel-postgres':
		& VercelPool
		& (<O extends QueryResultRow>(strings: TemplateStringsArray, ...values: Primitive[]) => Promise<QueryResult<O>>);
	'aws-data-api-pg': RDSDataClient;
	planetscale: PlanetscaleClient;
	mysql2: Mysql2Pool;
	'tidb-serverless': TiDBConnection;
	libsql: LibsqlClient;
	turso: LibsqlClient;
	d1: D1Database;
	'bun:sqlite': BunDatabase;
	'better-sqlite3': BetterSQLite3Database;
};

type InitializerParams = {
	'node-postgres': {
		connection?: string | NodePgPoolConfig;
	};
	'postgres-js': {
		connection: string | PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
	};
	'neon-serverless': {
		connection?: string | NeonServerlessConfig;
	};
	'neon-http': {
		connection: MonodriverNeonHttpConfig;
	};
	'vercel-postgres': {};
	'aws-data-api-pg': {
		connection?: RDSConfig;
	};
	planetscale: {
		connection: PlanetscaleConfig | string;
	};
	mysql2: {
		connection: Mysql2Config | string;
	};
	'tidb-serverless': {
		connection: TiDBServerlessConfig | string;
	};
	libsql: {
		connection: LibsqlConfig | string;
	};
	turso: {
		connection: LibsqlConfig | string;
	};
	d1: {
		connection: D1Database;
	};
	'bun:sqlite': {
		connection?: BunSqliteDatabaseConfig;
	};
	'better-sqlite3': {
		connection?: BetterSQLite3DatabaseConfig;
	};
};

type DetermineClient<
	TClient extends DatabaseClient,
	TSchema extends Record<string, unknown>,
> =
	& ClientDrizzleInstanceMap<
		TSchema
	>[TClient]
	& {
		$client: ClientInstanceMap[TClient];
	};

const importError = (libName: string) => {
	throw new Error(
		`Please install '${libName}' for Drizzle ORM to connect to database`,
	);
};

function assertUnreachable(_: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

export async function drizzle<
	TClient extends DatabaseClient,
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	client: TClient,
	...params: TClient extends 'bun:sqlite' | 'better-sqlite3' ? (
			[] | [
				(
					& InitializerParams[TClient]
					& DrizzleConfig<TSchema>
				),
			] | [
				':memory:',
			] | [
				(string & {}),
			]
		)
		: TClient extends 'vercel-postgres' ? ([] | [
				(
					& InitializerParams[TClient]
					& DrizzleConfig<TSchema>
				),
			])
		: TClient extends 'node-postgres' ? (
				[
					(
						& InitializerParams[TClient]
						& DrizzleConfig<TSchema>
					),
				] | [
					string,
				]
			)
		: TClient extends 'postgres-js' | 'tidb-serverless' | 'libsql' | 'turso' | 'planetscale' ? (
				[
					(
						& InitializerParams[TClient]
						& DrizzleConfig<TSchema>
					),
				] | [
					string,
				]
			)
		: TClient extends 'mysql2' ? (
				[
					(
						& InitializerParams[TClient]
						& MySql2DrizzleConfig<TSchema>
					),
				] | [
					string,
				]
			)
		: TClient extends 'aws-data-api-pg' ? [
				InitializerParams[TClient] & DrizzleAwsDataApiPgConfig<TSchema>,
			]
		: TClient extends 'neon-serverless' ? (
				| [
					InitializerParams[TClient] & DrizzleConfig<TSchema> & {
						ws?: any;
					},
				]
				| [string]
				| []
			)
		: TClient extends 'neon-http' ? ([
				InitializerParams[TClient] & DrizzleConfig<TSchema>,
			] | [
				string,
			])
		: [
			(
				& InitializerParams[TClient]
				& DrizzleConfig<TSchema>
			),
		]
): Promise<DetermineClient<TClient, TSchema>> {
	switch (client) {
		case 'node-postgres': {
			const defpg = await import('pg');
			const { drizzle } = await import('./node-postgres');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as
					& { connection: NodePgPoolConfig | string }
					& DrizzleConfig;

				const instance = typeof connection === 'string'
					? new defpg.default.Pool({
						connectionString: connection,
					})
					: new defpg.default.Pool(connection);
				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = typeof params[0] === 'string'
				? new defpg.default.Pool({
					connectionString: params[0],
				})
				: new defpg.default.Pool(params[0]);
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'aws-data-api-pg': {
			const { connection, ...drizzleConfig } = params[0] as
				& { connection: RDSDataClientConfig | undefined }
				& DrizzleAwsDataApiPgConfig;

			const { RDSDataClient } = await import('@aws-sdk/client-rds-data').catch(() =>
				importError('@aws-sdk/client-rds-data')
			);
			const { drizzle } = await import('./aws-data-api/pg');

			const instance = connection ? new RDSDataClient(connection) : new RDSDataClient();
			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'better-sqlite3': {
			const { default: Client } = await import('better-sqlite3').catch(() => importError('better-sqlite3'));
			const { drizzle } = await import('./better-sqlite3');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: BetterSQLite3DatabaseConfig;
				} & DrizzleConfig;

				if (typeof connection === 'object') {
					const { filename, options } = connection;

					const instance = new Client(filename, options);
					const db = drizzle(instance, drizzleConfig) as any;
					db.$client = instance;

					return db;
				}

				const instance = new Client(connection);
				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = new Client(params[0]);
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'bun:sqlite': {
			const { Database: Client } = await import('bun:sqlite').catch(() => importError('bun:sqlite'));
			const { drizzle } = await import('./bun-sqlite');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: BunSqliteDatabaseConfig | string | undefined;
				} & DrizzleConfig;

				if (typeof connection === 'object') {
					const { filename, options } = connection;

					const instance = new Client(filename, options);
					const db = drizzle(instance, drizzleConfig) as any;
					db.$client = instance;

					return db;
				}

				const instance = new Client(connection);
				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = new Client(params[0]);
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'd1': {
			const { connection, ...drizzleConfig } = params[0] as { connection: D1Database } & DrizzleConfig;

			const { drizzle } = await import('./d1');

			const db = drizzle(connection, drizzleConfig) as any;
			db.$client = connection;

			return db;
		}
		case 'libsql':
		case 'turso': {
			const { createClient } = await import('@libsql/client').catch(() => importError('@libsql/client'));
			const { drizzle } = await import('./libsql');

			if (typeof params[0] === 'string') {
				const instance = createClient({
					url: params[0],
				});
				const db = drizzle(instance) as any;
				db.$client = instance;

				return db;
			}

			const { connection, ...drizzleConfig } = params[0] as any as { connection: LibsqlConfig } & DrizzleConfig;

			const instance = typeof connection === 'string' ? createClient({ url: connection }) : createClient(connection);
			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'mysql2': {
			const { createPool } = await import('mysql2/promise').catch(() => importError('mysql2/promise'));
			const { drizzle } = await import('./mysql2');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as
					& { connection: Mysql2Config | string }
					& MySql2DrizzleConfig;

				const instance = createPool(connection as Mysql2Config);
				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const connectionString = params[0]!;
			const instance = createPool(connectionString);

			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'neon-http': {
			const { neon } = await import('@neondatabase/serverless').catch(() => importError('@neondatabase/serverless'));
			const { drizzle } = await import('./neon-http');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as { connection: MonodriverNeonHttpConfig } & DrizzleConfig;

				if (typeof connection === 'object') {
					const { connectionString, options } = connection;

					const instance = neon(connectionString, options);
					const db = drizzle(instance, drizzleConfig) as any;
					db.$client = instance;

					return db;
				}

				const instance = neon(connection);
				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = neon(params[0]!);
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'neon-serverless': {
			const { Pool, neonConfig } = await import('@neondatabase/serverless').catch(() =>
				importError('@neondatabase/serverless')
			);
			const { drizzle } = await import('./neon-serverless');
			if (typeof params[0] === 'string') {
				const instance = new Pool({
					connectionString: params[0],
				});

				const db = drizzle(instance) as any;
				db.$client = instance;

				return db;
			}

			if (typeof params[0] === 'object') {
				const { connection, ws, ...drizzleConfig } = params[0] as {
					connection?: NeonServerlessConfig | string;
					ws?: any;
				} & DrizzleConfig;

				if (ws) {
					neonConfig.webSocketConstructor = ws;
				}

				const instance = typeof connection === 'string'
					? new Pool({
						connectionString: connection,
					})
					: new Pool(connection);

				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = new Pool();
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'planetscale': {
			const { Client } = await import('@planetscale/database').catch(() => importError('@planetscale/database'));
			const { drizzle } = await import('./planetscale-serverless');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as
					& { connection: PlanetscaleConfig | string }
					& DrizzleConfig;

				const instance = typeof connection === 'string'
					? new Client({
						url: connection,
					})
					: new Client(
						connection,
					);
				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = new Client({
				url: params[0],
			});
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'postgres-js': {
			const { default: client } = await import('postgres').catch(() => importError('postgres'));
			const { drizzle } = await import('./postgres-js');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
				} & DrizzleConfig;

				const instance = client(connection);

				const db = drizzle(instance, drizzleConfig) as any;
				db.$client = instance;

				return db;
			}

			const instance = client(params[0]!);
			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'tidb-serverless': {
			const { connect } = await import('@tidbcloud/serverless').catch(() => importError('@tidbcloud/serverless'));
			const { drizzle } = await import('./tidb-serverless');

			if (typeof params[0] === 'string') {
				const instance = connect({
					url: params[0],
				});
				const db = drizzle(instance) as any;
				db.$client = instance;

				return db;
			}

			const { connection, ...drizzleConfig } = params[0] as
				& { connection: TiDBServerlessConfig | string }
				& DrizzleConfig;

			const instance = typeof connection === 'string'
				? connect({
					url: connection,
				})
				: connect(connection);
			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'vercel-postgres': {
			const drizzleConfig = params[0] as DrizzleConfig | undefined;
			const { sql } = await import('@vercel/postgres').catch(() => importError('@vercel/postgres'));
			const { drizzle } = await import('./vercel-postgres');

			const db = drizzle(sql, drizzleConfig) as any;
			db.$client = sql;

			return db;
		}
	}

	assertUnreachable(client);
}
