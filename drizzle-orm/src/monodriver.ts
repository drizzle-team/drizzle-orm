/* eslint-disable import/extensions */
import type { RDSDataClientConfig as RDSConfig } from '@aws-sdk/client-rds-data';
import type { Config as LibsqlConfig } from '@libsql/client';
import type {
	HTTPTransactionOptions as NeonHttpConfig,
	PoolConfig as NeonServerlessConfig,
} from '@neondatabase/serverless';
import type { Config as PlanetscaleConfig } from '@planetscale/database';
import type { Config as TiDBServerlessConfig } from '@tidbcloud/serverless';
import type { VercelPool } from '@vercel/postgres';
import type { Options as BetterSQLite3Options } from 'better-sqlite3';
import type { PoolOptions as Mysql2Config } from 'mysql2';
import type { PoolConfig as NodePGPoolConfig } from 'pg';
import type { Options as PostgresJSOptions, PostgresType as PostgresJSPostgresType } from 'postgres';
import type { AwsDataApiPgDatabase, DrizzleAwsDataApiPgConfig } from './aws-data-api/pg/index.ts';
import type { BetterSQLite3Database } from './better-sqlite3/index.ts';
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

type BunSqliteDatabaseConfig = {
	filename?: string;
	options?: BunSqliteDatabaseOptions;
};

type BetterSQLite3DatabaseConfig = {
	filename?: string | Buffer;
	options?: BetterSQLite3Options;
};

type MonodriverNeonHttpConfig = {
	connectionString: string;
	options?: NeonHttpConfig<boolean, boolean>;
};

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
	'bun-sqlite': BunSQLiteDatabase<TSchema>;
	'better-sqlite3': BetterSQLite3Database<TSchema>;
};

type InitializerParams<
	TSchema extends Record<string, unknown> = Record<string, never>,
> =
	| ({
		client: 'node-postgres';
		connection: NodePGPoolConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'postgres-js';
		connection: PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'neon-serverless';
		connection: NeonServerlessConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'neon-http';
		connection: MonodriverNeonHttpConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'vercel-postgres';
		connection: VercelPool;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'aws-data-api-pg';
		connection: RDSConfig;
	} & DrizzleAwsDataApiPgConfig<TSchema>)
	| ({
		client: 'planetscale';
		connection: PlanetscaleConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'mysql2';
		connection: Mysql2Config;
	} & MySql2DrizzleConfig<TSchema>)
	| ({
		client: 'tidb-serverless';
		connection: TiDBServerlessConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'libsql';
		connection: LibsqlConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'd1';
		connection: D1Database;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'bun-sqlite';
		connection: BunSqliteDatabaseConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		client: 'better-sqlite3';
		connection: BetterSQLite3DatabaseConfig;
	} & DrizzleConfig<TSchema>);

type DetermineClient<
	TParams extends InitializerParams<any>,
> = ClientDrizzleInstanceMap<TParams['schema']>[TParams['client']];

const importError = (libName: string) => {
	throw new Error(
		`Please install '${libName}' for Drizzle ORM to connect to database`,
	);
};

export const drizzle = async <
	TSchema extends Record<string, any>,
	TParams extends InitializerParams<TSchema>,
>(params: TParams): Promise<DetermineClient<TParams>> => {
	const { client, connection, ...drizzleConfig } = params;

	switch (client) {
		case 'node-postgres': {
			const { Pool } = await import('pg').catch(() => importError('pg'));
			const { drizzle } = await import('./node-postgres');
			const instance = new Pool(connection as NodePGPoolConfig);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'aws-data-api-pg': {
			const { RDSDataClient } = await import('@aws-sdk/client-rds-data').catch(() =>
				importError('@aws-sdk/client-rds-data')
			);
			const { drizzle } = await import('./aws-data-api/pg');
			const instance = new RDSDataClient(connection);

			return drizzle(instance, drizzleConfig as any as DrizzleAwsDataApiPgConfig) as any;
		}
		case 'better-sqlite3': {
			const { default: Client } = await import('better-sqlite3').catch(() => importError('better-sqlite3'));
			const { filename, options } = connection as BetterSQLite3DatabaseConfig;
			const { drizzle } = await import('./better-sqlite3');
			const instance = new Client(filename, options);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'bun-sqlite': {
			const { Database: Client } = await import('bun:sqlite').catch(() => importError('bun:sqlite'));
			const { filename, options } = connection as BunSqliteDatabaseConfig;
			const { drizzle } = await import('./bun-sqlite');
			const instance = new Client(filename, options);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'd1': {
			const { drizzle } = await import('./d1');
			return drizzle(connection as D1Database, drizzleConfig) as any;
		}
		case 'libsql': {
			const { createClient } = await import('@libsql/client').catch(() => importError('@libsql/client'));
			const { drizzle } = await import('./libsql');
			const instance = createClient(connection as LibsqlConfig);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'mysql2': {
			const { createConnection } = await import('mysql2/promise').catch(() => importError('mysql2/promise'));
			const instance = await createConnection(connection as Mysql2Config);
			const { drizzle } = await import('./mysql2');

			return drizzle(instance, drizzleConfig as MySql2DrizzleConfig) as any;
		}
		case 'neon-http': {
			const { neon } = await import('@neondatabase/serverless').catch(() => importError('@neondatabase/serverless'));
			const { connectionString, options } = connection as MonodriverNeonHttpConfig;
			const { drizzle } = await import('./neon-http');
			const instance = neon(connectionString, options);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'neon-serverless': {
			const { Pool } = await import('@neondatabase/serverless').catch(() => importError('@neondatabase/serverless'));
			const { drizzle } = await import('./neon-serverless');
			const instance = new Pool(connection as NeonServerlessConfig);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'planetscale': {
			const { Client } = await import('@planetscale/database').catch(() => importError('@planetscale/database'));
			const { drizzle } = await import('./planetscale-serverless');
			const instance = new Client(
				connection as PlanetscaleConfig,
			);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'postgres-js': {
			const { default: client } = await import('postgres').catch(() => importError('postgres'));
			const { drizzle } = await import('./postgres-js');
			const instance = client(connection as PostgresJSOptions<Record<string, PostgresJSPostgresType>>);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'tidb-serverless': {
			const { connect } = await import('@tidbcloud/serverless').catch(() => importError('@tidbcloud/serverless'));
			const { drizzle } = await import('./tidb-serverless');
			const instance = connect(connection as TiDBServerlessConfig);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'vercel-postgres': {
			const { sql } = await import('@vercel/postgres').catch(() => importError('@vercel/postgres'));
			const { drizzle } = await import('./vercel-postgres');

			return drizzle(sql, drizzleConfig) as any;
		}
	}
};
