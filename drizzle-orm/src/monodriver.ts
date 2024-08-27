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
	'postgres.js': PostgresJsDatabase<TSchema>;
	'neon-serverless': NeonDatabase<TSchema>;
	'neon-http': NeonHttpDatabase<TSchema>;
	'vercel-postgres': VercelPgDatabase<TSchema>;
	'aws-data-api-pg': AwsDataApiPgDatabase<TSchema>;
	planetscale: PlanetScaleDatabase<TSchema>;
	mysql2: Promise<MySql2Database<TSchema>>;
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
		client: 'postgres.js';
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

import { drizzle as rdsPgDrizzle } from './aws-data-api/pg/index.ts';
import { drizzle as betterSqliteDrizzle } from './better-sqlite3/index.ts';
import { drizzle as bunSqliteDrizzle } from './bun-sqlite/index.ts';
import { drizzle as d1Drizzle } from './d1/index.ts';
import { drizzle as libsqlDrizzle } from './libsql/index.ts';
import { drizzle as mysql2Drizzle } from './mysql2/index.ts';
import { drizzle as neonHttpDrizzle } from './neon-http/index.ts';
import { drizzle as neonDrizzle } from './neon-serverless/index.ts';
import { drizzle as pgDrizzle } from './node-postgres/index.ts';
import { drizzle as planetscaleDrizzle } from './planetscale-serverless/index.ts';
import { drizzle as postgresJSDrizzle } from './postgres-js/index.ts';
import { drizzle as tidbDrizzle } from './tidb-serverless/index.ts';
import { drizzle as vercelDrizzle } from './vercel-postgres/index.ts';

export const drizzle = <
	TSchema extends Record<string, any>,
	TParams extends InitializerParams<TSchema>,
>(params: TParams): Promise<DetermineClient<TParams>> => {
	const { client, connection } = params;
	const drizzleConfig = params as DrizzleConfig;
	delete (<any> drizzleConfig).client;
	delete (<any> drizzleConfig).connection;

	switch (client) {
		case 'node-postgres': {
			const { Pool } = require('pg') as typeof import('pg');
			const instance = new Pool(connection as NodePGPoolConfig);

			return pgDrizzle(instance, drizzleConfig) as any;
		}
		case 'aws-data-api-pg': {
			const { RDSDataClient } = require('@aws-sdk/client-rds-data') as typeof import('@aws-sdk/client-rds-data');
			const instance = new RDSDataClient(connection);

			return rdsPgDrizzle(instance, drizzleConfig as any as DrizzleAwsDataApiPgConfig) as any;
		}
		case 'better-sqlite3': {
			const Client = require('better-sqlite3') as typeof import('better-sqlite3');
			const { filename, options } = connection as BetterSQLite3DatabaseConfig;
			const instance = new Client(filename, options);

			return betterSqliteDrizzle(instance, drizzleConfig) as any;
		}
		case 'bun-sqlite': {
			const { Database: Client } = require('bun:sqlite') as typeof import('bun:sqlite');
			const { filename, options } = connection as BunSqliteDatabaseConfig;
			const instance = new Client(filename, options);

			return bunSqliteDrizzle(instance, drizzleConfig) as any;
		}
		case 'd1': {
			return d1Drizzle(connection as D1Database, drizzleConfig) as any;
		}
		case 'libsql': {
			const { createClient } = require('@libsql/client') as typeof import('@libsql/client');
			const instance = createClient(connection as LibsqlConfig);

			return libsqlDrizzle(instance, drizzleConfig) as any;
		}
		case 'mysql2': {
			const { createConnection } = require('mysql2/promise') as typeof import('mysql2/promise');

			return new Promise((res, rej) => {
				createConnection(connection as Mysql2Config).then((instance) => {
					try {
						res(mysql2Drizzle(instance, drizzleConfig as MySql2DrizzleConfig) as any);
					} catch (e) {
						rej(e);
					}
				}).catch((e) => rej(e));
			});
		}
		case 'neon-http': {
			const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');
			const { connectionString, options } = connection as MonodriverNeonHttpConfig;
			const instance = neon(connectionString, options);

			return neonHttpDrizzle(instance, drizzleConfig) as any;
		}
		case 'neon-serverless': {
			const { Pool } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');
			const instance = new Pool(connection as NeonServerlessConfig);

			return neonDrizzle(instance, drizzleConfig) as any;
		}
		case 'planetscale': {
			const { Client } = require('@planetscale/database') as typeof import('@planetscale/database');
			const instance = new Client(
				connection as PlanetscaleConfig,
			);

			return planetscaleDrizzle(instance, drizzleConfig) as any;
		}
		case 'postgres.js': {
			const client = require('postgres') as typeof import('postgres');
			const instance = client(connection as PostgresJSOptions<Record<string, PostgresJSPostgresType>>);

			return postgresJSDrizzle(instance, drizzleConfig) as any;
		}
		case 'tidb-serverless': {
			const { connect } = require('@tidbcloud/serverless') as typeof import('@tidbcloud/serverless');
			const instance = connect(connection as TiDBServerlessConfig);

			return tidbDrizzle(instance, drizzleConfig) as any;
		}
		case 'vercel-postgres': {
			const { sql } = require('@vercel/postgres') as typeof import('@vercel/postgres');

			return vercelDrizzle(sql, drizzleConfig) as any;
		}
	}
};
