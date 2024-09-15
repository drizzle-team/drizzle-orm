/* eslint-disable import/extensions */
import type { RDSDataClient, RDSDataClientConfig as RDSConfig } from '@aws-sdk/client-rds-data';
import type { PGlite, PGliteOptions } from '@electric-sql/pglite';
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
import type { AnyD1Database, DrizzleD1Database } from './d1/index.ts';
import type { LibSQLDatabase } from './libsql/index.ts';
import type { MySql2Database, MySql2DrizzleConfig } from './mysql2/index.ts';
import type { NeonHttpDatabase } from './neon-http/index.ts';
import type { NeonDatabase } from './neon-serverless/index.ts';
import type { NodePgDatabase } from './node-postgres/driver.ts';
import type { PgliteDatabase } from './pglite/driver.ts';
import type { PlanetScaleDatabase } from './planetscale-serverless/index.ts';
import type { PostgresJsDatabase } from './postgres-js/index.ts';
import type { TiDBServerlessDatabase } from './tidb-serverless/index.ts';
import type { DrizzleConfig, IfNotImported } from './utils.ts';
import type { VercelPgDatabase } from './vercel-postgres/index.ts';

type BunSqliteDatabaseOptions = {
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
	| ({
		source?: string;
	} & BunSqliteDatabaseOptions)
	| string
	| undefined;

type BetterSQLite3DatabaseConfig =
	| ({
		source?:
			| string
			| Buffer;
	} & BetterSQLite3Options)
	| string
	| undefined;

type MonodriverNeonHttpConfig =
	| ({
		connectionString: string;
	} & NeonHttpConfig<boolean, boolean>)
	| string;

type AwsDataApiConnectionConfig = RDSConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;

type DatabaseClient =
	| 'node-postgres'
	| 'postgres-js'
	| 'neon-websocket'
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
	| 'better-sqlite3'
	| 'pglite';

type ClientDrizzleInstanceMap<TSchema extends Record<string, any>> = {
	'node-postgres': NodePgDatabase<TSchema>;
	'postgres-js': PostgresJsDatabase<TSchema>;
	'neon-websocket': NeonDatabase<TSchema>;
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
	pglite: PgliteDatabase<TSchema>;
};

type Primitive = string | number | boolean | undefined | null;

type ClientInstanceMap = {
	'node-postgres': NodePgPool;
	'postgres-js': PostgresJsClient;
	'neon-websocket': NeonServerlessPool;
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
	d1: AnyD1Database;
	'bun:sqlite': BunDatabase;
	'better-sqlite3': BetterSQLite3Database;
	pglite: PGlite;
};

type ClientTypeImportErrorMap = {
	'node-postgres': 'pg`, `@types/pg';
	'postgres-js': 'postgres';
	'neon-websocket': '@neondatabase/serverless';
	'neon-http': '@neondatabase/serverless';
	'vercel-postgres': '@vercel/postgres';
	'aws-data-api-pg': '@aws-sdk/client-rds-data';
	planetscale: '@planetscale/database';
	mysql2: 'mysql2';
	'tidb-serverless': '@tidbcloud/serverless';
	libsql: '@libsql/client';
	turso: '@libsql/client';
	d1: '@cloudflare/workers-types` or `@miniflare/d1';
	'bun:sqlite': 'bun-types';
	'better-sqlite3': 'better-sqlite3';
	pglite: '@electric-sql/pglite';
};

type ImportTypeError<TClient extends DatabaseClient> =
	`Please install \`${ClientTypeImportErrorMap[TClient]}\` for Drizzle ORM to connect to database`;

type InitializerParams = {
	'node-postgres': {
		connection: string | NodePgPoolConfig;
	};
	'postgres-js': {
		connection: string | ({ url?: string } & PostgresJSOptions<Record<string, PostgresJSPostgresType>>);
	};
	'neon-websocket': {
		connection: string | NeonServerlessConfig;
	};
	'neon-http': {
		connection: MonodriverNeonHttpConfig;
	};
	'vercel-postgres': {};
	'aws-data-api-pg': {
		connection: AwsDataApiConnectionConfig;
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
		connection: AnyD1Database;
	};
	'bun:sqlite': {
		connection?: BunSqliteDatabaseConfig;
	};
	'better-sqlite3': {
		connection?: BetterSQLite3DatabaseConfig;
	};
	pglite: {
		connection?: (PGliteOptions & { dataDir?: string }) | string;
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
	...params: TClient extends 'bun:sqlite' | 'better-sqlite3' | 'pglite' ? (
			[] | [
				(
					& IfNotImported<
						ClientInstanceMap[TClient],
						{ connection: ImportTypeError<TClient> },
						InitializerParams[TClient]
					>
					& DrizzleConfig<TSchema>
				),
			] | [string]
		)
		: TClient extends 'vercel-postgres' ? ([] | [
				(
					& IfNotImported<
						ClientInstanceMap[TClient],
						{ connection: ImportTypeError<TClient> },
						InitializerParams[TClient]
					>
					& DrizzleConfig<TSchema>
				),
			])
		: TClient extends
			'postgres-js' | 'tidb-serverless' | 'libsql' | 'turso' | 'planetscale' | 'neon-http' | 'node-postgres' ? (
				[
					(
						& IfNotImported<
							ClientInstanceMap[TClient],
							{ connection: ImportTypeError<TClient> },
							InitializerParams[TClient]
						>
						& DrizzleConfig<TSchema>
					),
				] | [string]
			)
		: TClient extends 'mysql2' ? (
				[
					(
						& IfNotImported<
							ClientInstanceMap[TClient],
							{ connection: ImportTypeError<TClient> },
							InitializerParams[TClient]
						>
						& MySql2DrizzleConfig<TSchema>
					),
				] | [string]
			)
		: TClient extends 'neon-websocket' ? (
				| [
					& IfNotImported<
						ClientInstanceMap[TClient],
						{ connection: ImportTypeError<TClient> },
						InitializerParams[TClient]
					>
					& DrizzleConfig<TSchema>
					& {
						ws?: any;
					},
				]
				| [string]
			)
		: [
			(
				& IfNotImported<
					ClientInstanceMap[TClient],
					{ connection: ImportTypeError<TClient> },
					InitializerParams[TClient]
				>
				& DrizzleConfig<TSchema>
			),
		]
): Promise<DetermineClient<TClient, TSchema>> {
	switch (client) {
		case 'node-postgres': {
			const defpg = await import('pg').catch(() => importError('pg'));
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
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = typeof params[0] === 'string'
				? new defpg.default.Pool({
					connectionString: params[0],
				})
				: new defpg.default.Pool(params[0]);
			const db = drizzle(instance);

			return db as any;
		}
		case 'aws-data-api-pg': {
			const { connection, ...drizzleConfig } = params[0] as {
				connection: AwsDataApiConnectionConfig;
			} & DrizzleConfig<TSchema>;
			const { resourceArn, database, secretArn, ...rdsConfig } = connection;

			const { RDSDataClient } = await import('@aws-sdk/client-rds-data').catch(() =>
				importError('@aws-sdk/client-rds-data')
			);
			const { drizzle } = await import('./aws-data-api/pg');

			const instance = new RDSDataClient(rdsConfig);
			const db = drizzle(instance, { resourceArn, database, secretArn, ...drizzleConfig });

			return db as any;
		}
		case 'better-sqlite3': {
			const { default: Client } = await import('better-sqlite3').catch(() => importError('better-sqlite3'));
			const { drizzle } = await import('./better-sqlite3');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: BetterSQLite3DatabaseConfig;
				} & DrizzleConfig;

				if (typeof connection === 'object') {
					const { source, ...options } = connection;

					const instance = new Client(source, options);
					const db = drizzle(instance, drizzleConfig);

					return db as any;
				}

				const instance = new Client(connection);
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = new Client(params[0]);
			const db = drizzle(instance);

			return db as any;
		}
		case 'bun:sqlite': {
			const { Database: Client } = await import('bun:sqlite').catch(() => {
				throw new Error(`Please use bun to use 'bun:sqlite' for Drizzle ORM to connect to database`);
			});
			const { drizzle } = await import('./bun-sqlite');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: BunSqliteDatabaseConfig | string | undefined;
				} & DrizzleConfig;

				if (typeof connection === 'object') {
					const { source, ...opts } = connection;

					const options = Object.values(opts).filter((v) => v !== undefined).length ? opts : undefined;

					const instance = new Client(source, options);
					const db = drizzle(instance, drizzleConfig);

					return db as any;
				}

				const instance = new Client(connection);
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = new Client(params[0]);
			const db = drizzle(instance);

			return db as any;
		}
		case 'd1': {
			const { connection, ...drizzleConfig } = params[0] as { connection: AnyD1Database } & DrizzleConfig;

			const { drizzle } = await import('./d1');

			const db = drizzle(connection, drizzleConfig);

			return db as any;
		}
		case 'libsql':
		case 'turso': {
			const { createClient } = await import('@libsql/client').catch(() => importError('@libsql/client'));
			const { drizzle } = await import('./libsql');

			if (typeof params[0] === 'string') {
				const instance = createClient({
					url: params[0],
				});
				const db = drizzle(instance);

				return db as any;
			}

			const { connection, ...drizzleConfig } = params[0] as any as { connection: LibsqlConfig } & DrizzleConfig;

			const instance = typeof connection === 'string' ? createClient({ url: connection }) : createClient(connection);
			const db = drizzle(instance, drizzleConfig);

			return db as any;
		}
		case 'mysql2': {
			const { createPool } = await import('mysql2/promise').catch(() => importError('mysql2'));
			const { drizzle } = await import('./mysql2');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as
					& { connection: Mysql2Config | string }
					& MySql2DrizzleConfig;

				const instance = createPool(connection as Mysql2Config);
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const connectionString = params[0]!;
			const instance = createPool(connectionString);

			const db = drizzle(instance);

			return db as any;
		}
		case 'neon-http': {
			const { neon } = await import('@neondatabase/serverless').catch(() => importError('@neondatabase/serverless'));
			const { drizzle } = await import('./neon-http');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as { connection: MonodriverNeonHttpConfig } & DrizzleConfig;

				if (typeof connection === 'object') {
					const { connectionString, ...options } = connection;

					const instance = neon(connectionString, options);
					const db = drizzle(instance, drizzleConfig);

					return db as any;
				}

				const instance = neon(connection);
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = neon(params[0]!);
			const db = drizzle(instance);

			return db as any;
		}
		case 'neon-websocket': {
			const { Pool, neonConfig } = await import('@neondatabase/serverless').catch(() =>
				importError('@neondatabase/serverless')
			);
			const { drizzle } = await import('./neon-serverless');
			if (typeof params[0] === 'string') {
				const instance = new Pool({
					connectionString: params[0],
				});

				const db = drizzle(instance);

				return db as any;
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

				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = new Pool();
			const db = drizzle(instance);

			return db as any;
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
				const db = drizzle(instance, drizzleConfig);
				return db as any;
			}

			const instance = new Client({
				url: params[0],
			});
			const db = drizzle(instance);

			return db as any;
		}
		case 'postgres-js': {
			const { default: client } = await import('postgres').catch(() => importError('postgres'));
			const { drizzle } = await import('./postgres-js');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: { url?: string } & PostgresJSOptions<Record<string, PostgresJSPostgresType>>;
				} & DrizzleConfig;

				if (typeof connection === 'object' && connection.url !== undefined) {
					const { url, ...config } = connection;

					const instance = client(url, config);
					const db = drizzle(instance, drizzleConfig);

					return db as any;
				}

				const instance = client(connection);
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = client(params[0]!);
			const db = drizzle(instance);

			return db as any;
		}
		case 'tidb-serverless': {
			const { connect } = await import('@tidbcloud/serverless').catch(() => importError('@tidbcloud/serverless'));
			const { drizzle } = await import('./tidb-serverless');

			if (typeof params[0] === 'string') {
				const instance = connect({
					url: params[0],
				});
				const db = drizzle(instance);

				return db as any;
			}

			const { connection, ...drizzleConfig } = params[0] as
				& { connection: TiDBServerlessConfig | string }
				& DrizzleConfig;

			const instance = typeof connection === 'string'
				? connect({
					url: connection,
				})
				: connect(connection);
			const db = drizzle(instance, drizzleConfig);

			return db as any;
		}
		case 'vercel-postgres': {
			const drizzleConfig = params[0] as DrizzleConfig | undefined;
			const { sql } = await import('@vercel/postgres').catch(() => importError('@vercel/postgres'));
			const { drizzle } = await import('./vercel-postgres');

			const db = drizzle(sql, drizzleConfig);

			return db as any;
		}

		case 'pglite': {
			const { PGlite } = await import('@electric-sql/pglite').catch(() => importError('@electric-sql/pglite'));
			const { drizzle } = await import('./pglite');

			if (typeof params[0] === 'object') {
				const { connection, ...drizzleConfig } = params[0] as {
					connection: PGliteOptions & { dataDir: string };
				} & DrizzleConfig;

				if (typeof connection === 'object') {
					const { dataDir, ...options } = connection;

					const instance = new PGlite(dataDir, options);
					const db = drizzle(instance, drizzleConfig);

					return db as any;
				}

				const instance = new PGlite(connection);
				const db = drizzle(instance, drizzleConfig);

				return db as any;
			}

			const instance = new PGlite(params[0]);
			const db = drizzle(instance);

			return db as any;
		}
	}

	assertUnreachable(client);
}
