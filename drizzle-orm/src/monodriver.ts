/* eslint-disable import/extensions */
import type { RDSDataClient, RDSDataClientConfig, RDSDataClientConfig as RDSConfig } from '@aws-sdk/client-rds-data';
import type { Client as LibsqlClient, Config as LibsqlConfig } from '@libsql/client';
import type {
	HTTPTransactionOptions as NeonHttpConfig,
	NeonQueryFunction,
	Pool as NeonServerlessPool,
	PoolConfig as NeonServerlessConfig,
} from '@neondatabase/serverless';
import type { Client as PlanetscaleClient, Config as PlanetscaleConfig } from '@planetscale/database';
import type { Config as TiDBServerlessConfig, Connection as TiDBConnection } from '@tidbcloud/serverless';
import type { Database as BetterSQLite3Database, Options as BetterSQLite3Options } from 'better-sqlite3';
import type { Database as BunDatabase } from 'bun:sqlite';
import type { Pool as Mysql2Pool, PoolOptions as Mysql2Config } from 'mysql2';
import type { Pool as NodePgPool, PoolConfig as NodePGPoolConfig } from 'pg';
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
import type { NodePgDatabase } from './node-postgres/index.ts';
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
};

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
	d1: DrizzleD1Database<TSchema>;
	'bun:sqlite': BunSQLiteDatabase<TSchema>;
	'better-sqlite3': DrizzleBetterSQLite3Database<TSchema>;
};

type ClientInstanceMap = {
	'node-postgres': NodePgPool;
	'postgres-js': PostgresJsClient;
	'neon-serverless': NeonServerlessPool;
	'neon-http': NeonQueryFunction<boolean, boolean>;
	'vercel-postgres': undefined;
	'aws-data-api-pg': RDSDataClient;
	planetscale: PlanetscaleClient;
	mysql2: Mysql2Pool;
	'tidb-serverless': TiDBConnection;
	libsql: LibsqlClient;
	d1: D1Database;
	'bun:sqlite': BunDatabase;
	'better-sqlite3': BetterSQLite3Database;
};

type InitializerParams = {
	'node-postgres': {
		connection: NodePGPoolConfig;
	};
	'postgres-js': {
		connection: string | PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
	};
	'neon-serverless': {
		connection: NeonServerlessConfig;
	};
	'neon-http': {
		connection: MonodriverNeonHttpConfig;
	};
	'vercel-postgres': {};
	'aws-data-api-pg': {
		connection?: RDSConfig;
	};
	planetscale: {
		connection: PlanetscaleConfig;
	};
	mysql2: {
		connection: Mysql2Config | string;
	};
	'tidb-serverless': {
		connection: TiDBServerlessConfig;
	};
	libsql: {
		connection: LibsqlConfig;
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
	...params: TClient extends 'bun:sqlite' | 'better-sqlite3' ? ([
			[] | [
				(
					& InitializerParams[TClient]
					& DrizzleConfig<TSchema>
				),
			] | [
				':memory:',
			] | [
				(string & {}),
			],
		])
		: TClient extends 'vercel-postgres' ? ([] | [
				(
					& InitializerParams[TClient]
					& DrizzleConfig<TSchema>
				),
			])
		: [
			(
				& InitializerParams[TClient]
				& (TClient extends 'mysql2' ? MySql2DrizzleConfig<TSchema>
					: TClient extends 'aws-data-api-pg' ? DrizzleAwsDataApiPgConfig<TSchema>
					: TClient extends 'neon-serverless' ? DrizzleConfig<TSchema> & {
							ws?: any;
						}
					: DrizzleConfig<TSchema>)
			),
		]
): Promise<DetermineClient<TClient, TSchema>> {
	switch (client) {
		case 'node-postgres': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { Pool } = await import('pg').catch(() => importError('pg'));
			const { drizzle } = await import('./node-postgres');
			const instance = new Pool(connection as NodePGPoolConfig);

			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'aws-data-api-pg': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { RDSDataClient } = await import('@aws-sdk/client-rds-data').catch(() =>
				importError('@aws-sdk/client-rds-data')
			);
			const { drizzle } = await import('./aws-data-api/pg');
			const instance = new RDSDataClient(connection as RDSDataClientConfig);

			const db = drizzle(instance, drizzleConfig as any as DrizzleAwsDataApiPgConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'better-sqlite3': {
			const { default: Client } = await import('better-sqlite3').catch(() => importError('better-sqlite3'));
			const { drizzle } = await import('./better-sqlite3');

			const paramType = typeof params[0];

			if (paramType === 'object') {
				const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

				if (typeof connection === 'object') {
					const { filename, options } = connection as Exclude<BetterSQLite3DatabaseConfig, string | undefined>;

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

			if (paramType === 'string') {
				const instance = new Client(params[0] as string);

				const db = drizzle(instance) as any;
				db.$client = instance;

				return db;
			}

			const instance = new Client();

			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'bun:sqlite': {
			const { Database: Client } = await import('bun:sqlite').catch(() => importError('bun:sqlite'));
			const { drizzle } = await import('./bun-sqlite');

			const paramType = typeof params[0];

			if (paramType === 'object') {
				const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

				if (typeof connection === 'object') {
					const { filename, options } = connection as Exclude<BunSqliteDatabaseConfig, string | undefined>;

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

			if (paramType === 'string') {
				const instance = new Client(params[0] as string);

				const db = drizzle(instance) as any;
				db.$client = instance;

				return db;
			}

			const instance = new Client();

			const db = drizzle(instance) as any;
			db.$client = instance;

			return db;
		}
		case 'd1': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { drizzle } = await import('./d1');

			const db = drizzle(connection as D1Database, drizzleConfig) as any;
			db.$client = connection;

			return db;
		}
		case 'libsql': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { createClient } = await import('@libsql/client').catch(() => importError('@libsql/client'));
			const { drizzle } = await import('./libsql');
			const instance = createClient(connection as LibsqlConfig);

			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'mysql2': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { createPool } = await import('mysql2/promise').catch(() => importError('mysql2/promise'));
			const instance = createPool(connection as Mysql2Config);
			const { drizzle } = await import('./mysql2');

			const db = drizzle(instance, drizzleConfig as MySql2DrizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'neon-http': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { neon } = await import('@neondatabase/serverless').catch(() => importError('@neondatabase/serverless'));
			const { connectionString, options } = connection as MonodriverNeonHttpConfig;
			const { drizzle } = await import('./neon-http');
			const instance = neon(connectionString, options);

			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'neon-serverless': {
			const { connection, ws, ...drizzleConfig } = params as any as { connection: any; ws: any } & DrizzleConfig;

			const { Pool, neonConfig } = await import('@neondatabase/serverless').catch(() =>
				importError('@neondatabase/serverless')
			);
			const { drizzle } = await import('./neon-serverless');
			const instance = new Pool(connection as NeonServerlessConfig);

			if (ws) {
				neonConfig.webSocketConstructor = ws;
			}

			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'planetscale': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { Client } = await import('@planetscale/database').catch(() => importError('@planetscale/database'));
			const { drizzle } = await import('./planetscale-serverless');
			const instance = new Client(
				connection as PlanetscaleConfig,
			);

			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'postgres-js': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { default: client } = await import('postgres').catch(() => importError('postgres'));
			const { drizzle } = await import('./postgres-js');
			const instance = client(connection as PostgresJSOptions<Record<string, PostgresJSPostgresType>>);

			const db = drizzle(instance, drizzleConfig) as any;
			db.$client = instance;

			return db;
		}
		case 'tidb-serverless': {
			const { connection, ...drizzleConfig } = params as any as { connection: any } & DrizzleConfig;

			const { connect } = await import('@tidbcloud/serverless').catch(() => importError('@tidbcloud/serverless'));
			const { drizzle } = await import('./tidb-serverless');
			const instance = connect(connection as TiDBServerlessConfig);

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
