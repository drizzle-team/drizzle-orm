/* eslint-disable import/extensions */
import type { AwsDataApiPgDatabase } from './aws-data-api/pg/index.ts';
import type { BetterSQLite3Database } from './better-sqlite3/index.ts';
import type { BunSQLiteDatabase } from './bun-sqlite/index.ts';
import type { DrizzleD1Database } from './d1/index.ts';
import { entityKind } from './entity.ts';
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
import type { PostgresJsDatabase } from './postgres-js/driver.ts';
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

export async function migrate(
	db: AwsDataApiPgDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: BetterSQLite3Database<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: BunSQLiteDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(db: DrizzleD1Database<any>, config: string | MigrationConfig): Promise<void>;
export async function migrate(
	db: ExpoSQLiteDatabase<any>,
	config: ExpoSQLiteMigrationConfig,
): Promise<void>;
export async function migrate(db: LibSQLDatabase<any>, config: MigrationConfig): Promise<void>;
export async function migrate(
	db: MySqlRemoteDatabase<any>,
	callback: MySqlProxyMigrator,
	config: MigrationConfig,
): Promise<void>;
export async function migrate(db: MySql2Database<any>, config: MigrationConfig): Promise<void>;
export async function migrate(
	db: NeonHttpDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: NeonDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: NodePgDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: OPSQLiteDatabase<any>,
	config: OPSQLiteMigrationConfig,
): Promise<void>;
export async function migrate(
	db: PgRemoteDatabase<any>,
	callback: PgProxyMigrator,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(db: PgliteDatabase<any>, config: string | MigrationConfig): Promise<void>;
export async function migrate(db: PostgresJsDatabase<any>, config: string | MigrationConfig): Promise<void>;
export async function migrate(
	db: PlanetScaleDatabase<any>,
	config: MigrationConfig,
): Promise<void>;
export async function migrate(
	db: PlanetScaleDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: PgRemoteDatabase<any>,
	callback: SQLiteProxyMigrator,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: PlanetScaleDatabase<any>,
	config: MigrationConfig,
): Promise<void>;
export async function migrate(
	db: VercelPgDatabase<any>,
	config: string | MigrationConfig,
): Promise<void>;
export async function migrate(
	db: XataHttpDatabase<any>,
	config: string | XataHttpMigrationConfig,
): Promise<void>;
export async function migrate(
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
	switch (db[entityKind]) {
		case 'AwsDataApiPgDatabase': {
			const { migrate } = await import('./aws-data-api/pg/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'BetterSQLite3Database': {
			const { migrate } = await import('./better-sqlite3/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'BunSQLiteDatabase': {
			const { migrate } = await import('./bun-sqlite/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'D1Database': {
			const { migrate } = await import('./d1/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'ExpoSQLiteDatabase': {
			const { migrate } = await import('./expo-sqlite/migrator');

			return migrate(db, config as ExpoSQLiteMigrationConfig);
		}
		case 'LibSQLDatabase': {
			const { migrate } = await import('./libsql/migrator');

			return migrate(db, config as MigrationConfig);
		}
		case 'MySqlRemoteDatabase': {
			const { migrate } = await import('./mysql-proxy/migrator');

			return migrate(db, config as MySqlProxyMigrator, extraConfig as MigrationConfig);
		}
		case 'MySql2Driver': {
			const { migrate } = await import('./mysql2/migrator');

			return migrate(db, config as MigrationConfig);
		}
		case 'NeonHttpDatabase': {
			const { migrate } = await import('./neon-http/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'NeonServerlessDatabase': {
			const { migrate } = await import('./neon-serverless/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'NodePgDriver': {
			const { migrate } = await import('./node-postgres/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'OPSQLiteDatabase': {
			const { migrate } = await import('./op-sqlite/migrator');

			return migrate(db, config as OPSQLiteMigrationConfig);
		}
		case 'PgRemoteDatabase': {
			const { migrate } = await import('./pg-proxy/migrator');

			return migrate(db, config as PgProxyMigrator, extraConfig as string | MigrationConfig);
		}
		case 'PgliteDatabase': {
			const { migrate } = await import('./pglite/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'PlanetScaleDatabase': {
			const { migrate } = await import('./planetscale-serverless/migrator');

			return migrate(db, config as MigrationConfig);
		}
		case 'PostgresJsDatabase': {
			const { migrate } = await import('./postgres-js/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'SqliteRemoteDatabase': {
			const { migrate } = await import('./sqlite-proxy/migrator');

			return migrate(db, config as SQLiteProxyMigrator, extraConfig as string | MigrationConfig);
		}
		case 'TiDBServerlessDatabase': {
			const { migrate } = await import('./tidb-serverless/migrator');

			return migrate(db, config as MigrationConfig);
		}
		case 'VercelPgDatabase': {
			const { migrate } = await import('./vercel-postgres/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
		case 'XataHttpDatabase': {
			const { migrate } = await import('./xata-http/migrator');

			return migrate(db, config as string | MigrationConfig);
		}
	}
}
