import type { RDSDataClientConfig as RDSConfig } from '@aws-sdk/client-rds-data';
import type { Config as LibsqlConfig } from '@libsql/client';
import type { ClientConfig as NeonHttpConfig, PoolConfig as NeonServerlessConfig } from '@neondatabase/serverless';
import type { Config as PlanetscaleConfig } from '@planetscale/database';
import type { Config as TiDBServerlessConfig } from '@tidbcloud/serverless';
import type { VercelPostgresPoolConfig as VercelPostgresConfig } from '@vercel/postgres';
import type { Options as BetterSQLite3Options } from 'better-sqlite3';
import type { ConnectionConfig as Mysql2Config } from 'mysql2';
import type { PoolConfig as NodePGPoolConfig } from 'pg';
import type { Options as PostgresJSOptions, PostgresType as PostgresJSPostgresType } from 'postgres';
import type { AwsDataApiPgDatabase, DrizzleAwsDataApiPgConfig } from './aws-data-api/pg';
import type { BetterSQLite3Database } from './better-sqlite3';
import type { BunSQLiteDatabase } from './bun-sqlite';
import type { DrizzleD1Database } from './d1';
import type { LibSQLDatabase } from './libsql';
import type { MySql2Database } from './mysql2';
import type { NeonHttpDatabase } from './neon-http';
import type { NeonDatabase } from './neon-serverless';
import type { NodePgDatabase } from './node-postgres';
import type { PlanetScaleDatabase } from './planetscale-serverless';
import type { PostgresJsDatabase } from './postgres-js';
import type { TiDBServerlessDatabase } from './tidb-serverless';
import type { DrizzleConfig } from './utils';
import type { VercelPgDatabase } from './vercel-postgres';

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

type DatabaseClientType =
	| 'node-postgres'
	| 'postgres.js'
	| 'neon-serverless'
	| 'neon-http'
	| 'vercel-postgres'
	| 'aws-data-api-pg'
	| 'planetscale'
	| 'mysql2'
	| 'tidb-serverless'
	| 'libsql'
	| 'd1'
	| 'bun-sqlite'
	| 'better-sqlite3';

type ClientConnectionConfigMap = {
	'node-postgres': NodePGPoolConfig;
	'postgres.js': PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
	'neon-serverless': NeonServerlessConfig;
	'neon-http': NeonHttpConfig;
	'vercel-postgres': VercelPostgresConfig;
	'aws-data-api-pg': RDSConfig;
	planetscale: PlanetscaleConfig;
	mysql2: Mysql2Config;
	'tidb-serverless': TiDBServerlessConfig;
	libsql: LibsqlConfig;
	d1: D1Database;
	'bun-sqlite': BunSqliteDatabaseConfig;
	'better-sqlite3': BetterSQLite3DatabaseConfig;
};

// type ClientDrizzleConfigMap<TSchema extends Record<string, unknown>> = {
// 	'node-postgres': DrizzleConfig<TSchema>;
// 	'postgres.js': DrizzleConfig<TSchema>;
// 	'neon-serverless': DrizzleConfig<TSchema>;
// 	'neon-http': DrizzleConfig<TSchema>;
// 	'vercel-postgres': DrizzleConfig<TSchema>;
// 	'aws-data-api-pg': DrizzleAwsDataApiPgConfig<TSchema>;
// 	planetscale: DrizzleConfig<TSchema>;
// 	mysql2: DrizzleConfig<TSchema>;
// 	'tidb-serverless': DrizzleConfig<TSchema>;
// 	libsql: DrizzleConfig<TSchema>;
// 	d1: DrizzleConfig<TSchema>;
// 	'bun-sqlite': DrizzleConfig<TSchema>;
// 	'better-sqlite3': DrizzleConfig<TSchema>;
// };

type ClientDrizzleInstanceMap<TSchema extends Record<string, any>> = {
	'node-postgres': NodePgDatabase<TSchema>;
	'postgres.js': PostgresJsDatabase<TSchema>;
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

type ClientParams<TClientType extends DatabaseClientType> = ClientConnectionConfigMap[TClientType];

type InitializerParams<
	TClientType extends DatabaseClientType,
	TSchema extends Record<string, unknown> = Record<string, never>,
> = {
	client: TClientType;
	connection: ClientParams<TClientType>;
} & DrizzleConfig<TSchema>;

type DetermineClient<
	TParams extends InitializerParams<any, any>,
	TSchema extends Record<string, unknown> = TParams extends { schema: Record<string, unknown> } ? TParams['schema']
		: Record<string, never>,
> = TParams extends { client: DatabaseClientType } ? ClientDrizzleInstanceMap<TSchema>[TParams['client']]
	: never;

import { drizzle as rdsPgDrizzle } from './aws-data-api/pg/index.ts';
import { drizzle as pgDrizzle } from './node-postgres/index.ts';

export const drizzle = async <
	TClientType extends DatabaseClientType,
	TSchema extends Record<string, any>,
	TParams extends InitializerParams<TClientType, TSchema>,
>(params: TParams): Promise<DetermineClient<TParams>> => {
	const { client, connection } = params;
	const drizzleConfig = params as Omit<typeof params, 'client' | 'connection'>;
	// @ts-expect-error
	delete drizzleConfig.client;
	// @ts-expect-error
	delete drizzleConfig.connection;

	switch (client) {
		case 'node-postgres': {
			const { Pool } = await import('pg');
			const instance = new Pool(connection as NodePGPoolConfig);

			return pgDrizzle(instance, drizzleConfig) as any;
		}
		case 'aws-data-api-pg': {
			const { RDSDataClient } = await import('@aws-sdk/client-rds-data');
			const instance = new RDSDataClient(connection);

			return rdsPgDrizzle(instance, drizzleConfig as any as DrizzleAwsDataApiPgConfig) as any;
		}
	}

	// @ts-ignore
	return {};
};
