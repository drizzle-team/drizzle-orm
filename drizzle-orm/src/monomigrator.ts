/* eslint-disable import/extensions */
import type { AwsDataApiPgDatabase } from './aws-data-api/pg/index.ts';
import type { BetterSQLite3Database } from './better-sqlite3/index.ts';
import type { BunSQLiteDatabase } from './bun-sqlite/index.ts';
import type { DrizzleD1Database } from './d1/index.ts';
import type { ExpoSQLiteDatabase } from './expo-sqlite/index.ts';
import type { LibSQLDatabase } from './libsql/index.ts';
import type { MigrationConfig } from './migrator.ts';
import type { MySqlRemoteDatabase } from './mysql-proxy/index.ts';
import type { ProxyMigrator as MySqlProxyMigrator } from './mysql-proxy/migrator.ts';
import type { MySql2Database } from './mysql2/index.ts';
import type { NeonHttpDatabase } from './neon-http/index.ts';
import type { NeonDatabase } from './neon-serverless/index.ts';
import type { NodePgDatabase } from './node-postgres/index.ts';
import type { OPSQLiteDatabase } from './op-sqlite/index.ts';
import type { PgRemoteDatabase } from './pg-proxy/index.ts';
import type { ProxyMigrator as PgProxyMigrator } from './pg-proxy/migrator.ts';
import type { PgliteDatabase } from './pglite/index.ts';
import type { PlanetScaleDatabase } from './planetscale-serverless/index.ts';
import type { ProxyMigrator as SQLiteProxyMigrator } from './sqlite-proxy/migrator.ts';
import type { VercelPgDatabase } from './vercel-postgres/index.ts';
import type { XataHttpDatabase } from './xata-http/index.ts';
import type { MigrationConfig as XataHttpMigrationConfig } from './xata-http/migrator.ts';

type OPSQLiteMigrationConfig = {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
};

type ExpoSQLiteMigrationConfig = {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
};

type DatabaseType =
	| 'aws-data-api-pg'
	| 'better-sqlite3'
	| 'bun:sqlite'
	| 'd1'
	| 'expo-sqlite'
	| 'libsql'
	| 'mysql-proxy'
	| 'mysql2'
	| 'neon-http'
	| 'neon-serverless'
	| 'node-postgres'
	| 'op-sqlite'
	| 'pg-proxy'
	| 'pglite'
	| 'planetscale'
	| 'postgres-js'
	| 'sqlite-proxy'
	| 'tidb-serverless'
	| 'vercel-postgres'
	| 'xata-http';

export async function migrate(
	type: 'aws-data-api-pg',
	db: AwsDataApiPgDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'better-sqlite3',
	db: BetterSQLite3Database<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'bun:sqlite',
	db: BunSQLiteDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(type: 'd1', db: DrizzleD1Database<any>, config: string | MigrationConfig): Promise<void>;
export async function migrate(
	type: 'expo-sqlite',
	db: ExpoSQLiteDatabase<any>,
	config: ExpoSQLiteMigrationConfig,
): Promise<void>;
export async function migrate(type: 'libsql', db: LibSQLDatabase<any>, config: MigrationConfig): Promise<void>;
export async function migrate(
	type: 'mysql-proxy',
	db: MySqlRemoteDatabase<any>,
	callback: MySqlProxyMigrator,
	config: MigrationConfig,
): Promise<void>;
export async function migrate(type: 'mysql2', db: MySql2Database<any>, config: MigrationConfig): Promise<void>;
export async function migrate(
	type: 'neon-http',
	db: NeonHttpDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'neon-serverless',
	db: NeonDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'node-postgres',
	db: NodePgDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'op-sqlite',
	db: OPSQLiteDatabase<any>,
	config: OPSQLiteMigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'pg-proxy',
	db: PgRemoteDatabase<any>,
	callback: PgProxyMigrator,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(type: 'pglite', db: PgliteDatabase<any>, config: string | MigrationConfig): Promise<void>;
export async function migrate(
	type: 'planetscale',
	db: PlanetScaleDatabase<any>,
	config: MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'postgres-js',
	db: PlanetScaleDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'sqlite-proxy',
	db: PgRemoteDatabase<any>,
	callback: SQLiteProxyMigrator,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'tidb-serverless',
	db: PlanetScaleDatabase<any>,
	config: MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'vercel-postgres',
	db: VercelPgDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	type: 'xata-http',
	db: XataHttpDatabase<any>,
	config: string | XataHttpMigrationConfig,
): Promise<void>;
export async function migrate(
	type: DatabaseType,
	db: any,
	config:
		| string
		| MigrationConfig
		| ExpoSQLiteMigrationConfig
		| OPSQLiteMigrationConfig
		| XataHttpMigrationConfig
		| PgProxyMigrator
		| MySqlProxyMigrator
		| SQLiteProxyMigrator,
	extraConfig?: string | MigrationConfig | undefined,
) {
	const rest = [db, config, extraConfig];

	switch (type) {
		case 'aws-data-api-pg': {
			const { migrate } = await import('./aws-data-api/pg/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'better-sqlite3': {
			const { migrate } = await import('./better-sqlite3/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'bun:sqlite': {
			const { migrate } = await import('./bun-sqlite/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'd1': {
			const { migrate } = await import('./d1/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'expo-sqlite': {
			const { migrate } = await import('./expo-sqlite/migrator');

			return migrate(rest[0], rest[1] as ExpoSQLiteMigrationConfig);
		}
		case 'libsql': {
			const { migrate } = await import('./libsql/migrator');

			return migrate(rest[0], rest[1] as MigrationConfig);
		}
		case 'mysql-proxy': {
			const { migrate } = await import('./mysql-proxy/migrator');

			return migrate(rest[0], rest[1] as MySqlProxyMigrator, rest[2] as MigrationConfig);
		}
		case 'mysql2': {
			const { migrate } = await import('./mysql2/migrator');

			return migrate(rest[0], rest[1] as MigrationConfig);
		}
		case 'neon-http': {
			const { migrate } = await import('./neon-http/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'neon-serverless': {
			const { migrate } = await import('./neon-serverless/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'node-postgres': {
			const { migrate } = await import('./node-postgres/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'op-sqlite': {
			const { migrate } = await import('./op-sqlite/migrator');

			return migrate(rest[0], rest[1] as OPSQLiteMigrationConfig);
		}
		case 'pg-proxy': {
			const { migrate } = await import('./pg-proxy/migrator');

			return migrate(rest[0], rest[1] as PgProxyMigrator, rest[2] as string | MigrationConfig);
		}
		case 'pglite': {
			const { migrate } = await import('./pglite/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'planetscale': {
			const { migrate } = await import('./planetscale-serverless/migrator');

			return migrate(rest[0], rest[1] as MigrationConfig);
		}
		case 'postgres-js': {
			const { migrate } = await import('./postgres-js/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'sqlite-proxy': {
			const { migrate } = await import('./sqlite-proxy/migrator');

			return migrate(rest[0], rest[1] as SQLiteProxyMigrator, rest[2] as string | MigrationConfig);
		}
		case 'tidb-serverless': {
			const { migrate } = await import('./tidb-serverless/migrator');

			return migrate(rest[0], rest[1] as MigrationConfig);
		}
		case 'vercel-postgres': {
			const { migrate } = await import('./vercel-postgres/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
		case 'xata-http': {
			const { migrate } = await import('./xata-http/migrator');

			return migrate(rest[0], rest[1] as string | MigrationConfig);
		}
	}
}
