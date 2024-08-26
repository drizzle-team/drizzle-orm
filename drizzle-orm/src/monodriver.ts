import type { ClientConfig as NeonHttpConfig, PoolConfig as NeonServerlessConfig } from '@neondatabase/serverless';
import type { VercelPostgresPoolConfig } from '@vercel/postgres';
import type { PoolConfig } from 'pg';
import type { Options, PostgresType } from 'postgres';
import type { NodePgDatabase } from './node-postgres';
import type { DrizzleConfig } from './utils';

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
	'node-postgres': PoolConfig;
	'postgres.js': Options<Record<string, PostgresType>>;
	'neon-serverless': NeonServerlessConfig;
	'neon-http': NeonHttpConfig;
	'vercel-postgres': {};
	'aws-data-api': {};
	planetscale: {};
	mysql2: {};
	'tidb-serverless': {};
	'mysql-http-proxy': {};
	libsql: {};
	d1: {};
	'bun-sqlite': {};
	'better-sqlite3': {};
	'sqlite-http-proxy': {};
};

type ClientDrizzleInstanceMap<TSchema extends Record<string, any>> = {
	'node-postgres': NodePgDatabase<TSchema>;
	'postgres.js': {};
	'neon-serverless': {};
	'neon-http': {};
	'vercel-postgres': {};
	'aws-data-api': {};
	planetscale: {};
	mysql2: {};
	'tidb-serverless': {};
	'mysql-http-proxy': {};
	libsql: {};
	d1: {};
	'bun-sqlite': {};
	'better-sqlite3': {};
	'sqlite-http-proxy': {};
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
>(params: TParams): DetermineClient<TParams> => {
	return {} as any;
};
