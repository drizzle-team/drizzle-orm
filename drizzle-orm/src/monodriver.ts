/* eslint-disable import/extensions */
import type { RDSDataClientConfig, RDSDataClientConfig as RDSConfig } from '@aws-sdk/client-rds-data';
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

type BunSqliteDatabaseConfig =
	| {
		filename?: string;
		options?: BunSqliteDatabaseOptions;
	}
	| string
	| undefined;

type BetterSQLite3DatabaseConfig =
	| {
		filename?: string | Buffer;
		options?: BetterSQLite3Options;
	}
	| string
	| undefined;

type MonodriverNeonHttpConfig = {
	connectionString: string;
	options?: NeonHttpConfig<boolean, boolean>;
};

type DatabaseVendor =
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
	'better-sqlite3': BetterSQLite3Database<TSchema>;
};

type InitializerParams<
	TSchema extends Record<string, unknown> = Record<string, never>,
> =
	| ({
		connection: NodePGPoolConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: NeonServerlessConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: MonodriverNeonHttpConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: VercelPool;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: RDSConfig;
	} & DrizzleAwsDataApiPgConfig<TSchema>)
	| ({
		connection: PlanetscaleConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: Mysql2Config;
	} & MySql2DrizzleConfig<TSchema>)
	| ({
		connection: TiDBServerlessConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: LibsqlConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection: D1Database;
	} & DrizzleConfig<TSchema>)
	| ({
		connection?: BunSqliteDatabaseConfig;
	} & DrizzleConfig<TSchema>)
	| ({
		connection?: BetterSQLite3DatabaseConfig;
	} & DrizzleConfig<TSchema>);

type DetermineClient<
	TVendor extends DatabaseVendor,
	TSchema extends Record<string, unknown>,
> = ClientDrizzleInstanceMap<
	TSchema
>[TVendor];

const importError = (libName: string) => {
	throw new Error(
		`Please install '${libName}' for Drizzle ORM to connect to database`,
	);
};

const removeKey = <TRecord extends Record<string, any>, TKey extends keyof TRecord>(
	obj: TRecord,
	key: TKey,
): Omit<TRecord, TKey> => {
	if (!(key in obj)) return obj;

	delete (<any> obj).key;
	return obj;
};

export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'aws-data-api-pg',
	params: { connection?: RDSConfig } & DrizzleAwsDataApiPgConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'mysql2',
	params: { connection: Mysql2Config | string } & MySql2DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'node-postgres',
	params: { connection: NodePGPoolConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'postgres-js',
	params: { connection: string | PostgresJSOptions<Record<string, PostgresJSPostgresType>> } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'neon-serverless',
	params: { connection: NeonServerlessConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'neon-http',
	params: { connection: MonodriverNeonHttpConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'vercel-postgres',
	params: { connection: VercelPool } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'planetscale',
	params: { connection: PlanetscaleConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'tidb-serverless',
	params: { connection: TiDBServerlessConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'libsql',
	params: { connection: LibsqlConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'd1',
	params: { connection: D1Database } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'bun:sqlite',
	params?: { connection?: BunSqliteDatabaseConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: 'better-sqlite3',
	params?: { connection?: BetterSQLite3DatabaseConfig } & DrizzleConfig<TSchema>,
): Promise<DetermineClient<typeof client, TSchema>>;
export async function drizzle<
	TVendor extends DatabaseVendor,
	TSchema extends Record<string, any>,
	TParams extends InitializerParams<TSchema>,
>(client: TVendor, params?: TParams): Promise<DetermineClient<TVendor, TSchema>> {
	const connection = params?.connection;
	const drizzleConfig = params ? removeKey(params, 'connection') : undefined;

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
			const instance = new RDSDataClient(connection as RDSDataClientConfig);

			return drizzle(instance, drizzleConfig as any as DrizzleAwsDataApiPgConfig) as any;
		}
		case 'better-sqlite3': {
			const { default: Client } = await import('better-sqlite3').catch(() => importError('better-sqlite3'));
			const { drizzle } = await import('./better-sqlite3');

			if (typeof connection === 'object') {
				const { filename, options } = connection as Exclude<BetterSQLite3DatabaseConfig, string | undefined>;

				const instance = new Client(filename, options);

				return drizzle(instance, drizzleConfig) as any;
			}

			const instance = new Client(connection);

			return drizzle(instance, drizzleConfig) as any;
		}
		case 'bun:sqlite': {
			const { Database: Client } = await import('bun:sqlite').catch(() => importError('bun:sqlite'));
			const { drizzle } = await import('./bun-sqlite');

			if (typeof connection === 'object') {
				const { filename, options } = connection as Exclude<BunSqliteDatabaseConfig, string | undefined>;

				const instance = new Client(filename, options);

				return drizzle(instance, drizzleConfig) as any;
			}

			const instance = new Client(connection);

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
		default: {
			throw new Error(
				`Unsupported vendor for Drizzle ORM monodriver: '${client}'. Use dedicated drizzle initializer instead.`,
			);
		}
	}
}

const db = await drizzle('aws-data-api-pg', {
	database: '',
	resourceArn: '',
	secretArn: '',
});
