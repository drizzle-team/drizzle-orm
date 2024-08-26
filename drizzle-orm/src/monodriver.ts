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
import type { AwsDataApiPgDatabase } from './aws-data-api/pg';
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
	| 'aws-data-api'
	| 'planetscale'
	| 'mysql2'
	| 'tidb-serverless'
	| 'libsql'
	| 'd1'
	| 'bun-sqlite'
	| 'better-sqlite3';

type ClientConfigMap = {
	'node-postgres': NodePGPoolConfig;
	'postgres.js': PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
	'neon-serverless': NeonServerlessConfig;
	'neon-http': NeonHttpConfig;
	'vercel-postgres': VercelPostgresConfig;
	'aws-data-api': RDSConfig;
	planetscale: PlanetscaleConfig;
	mysql2: Mysql2Config;
	'tidb-serverless': TiDBServerlessConfig;
	libsql: LibsqlConfig;
	d1: D1Database;
	'bun-sqlite': BunSqliteDatabaseConfig;
	'better-sqlite3': BetterSQLite3DatabaseConfig;
};

type ClientDrizzleInstanceMap<TSchema extends Record<string, any>> = {
	'node-postgres': NodePgDatabase<TSchema>;
	'postgres.js': PostgresJsDatabase<TSchema>;
	'neon-serverless': NeonDatabase<TSchema>;
	'neon-http': NeonHttpDatabase<TSchema>;
	'vercel-postgres': VercelPgDatabase<TSchema>;
	'aws-data-api': AwsDataApiPgDatabase<TSchema>;
	planetscale: PlanetScaleDatabase<TSchema>;
	mysql2: MySql2Database<TSchema>;
	'tidb-serverless': TiDBServerlessDatabase<TSchema>;
	libsql: LibSQLDatabase<TSchema>;
	d1: DrizzleD1Database<TSchema>;
	'bun-sqlite': BunSQLiteDatabase<TSchema>;
	'better-sqlite3': BetterSQLite3Database<TSchema>;
};

type ClientParams<TClientType extends DatabaseClientType> = ClientConfigMap[TClientType];

type InitializerParams<
	TClientType extends DatabaseClientType,
	TSchema extends Record<string, unknown> = Record<string, never>,
> = {
	client: TClientType;
	connection: ClientParams<TClientType>;
} & DrizzleConfig<TSchema>;

type DetermineClient<
	TParams extends InitializerParams<any, any>,
	TSchema extends Record<string, unknown> = TParams['schema'] extends Record<string, unknown> ? TParams['schema']
		: Record<string, never>,
> = ClientDrizzleInstanceMap<TSchema>[TParams['client']];

export const drizzle = <
	TClientType extends DatabaseClientType,
	TSchema extends Record<string, any>,
	TParams extends InitializerParams<TClientType, TSchema>,
>({
	client,
	connection,
	logger,
	schema,
}: TParams): DetermineClient<TParams> => {
	return {} as any;
};
