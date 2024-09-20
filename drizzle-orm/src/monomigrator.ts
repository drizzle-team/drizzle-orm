/* eslint-disable import/extensions */
import type { AwsDataApiPgDatabase } from './aws-data-api/pg/index.ts';
import type { BetterSQLite3Database } from './better-sqlite3/index.ts';
import type { BunSQLiteDatabase } from './bun-sqlite/index.ts';
import type { DrizzleD1Database } from './d1/index.ts';
import { entityKind } from './entity.ts';
import type { LibSQLDatabase } from './libsql/index.ts';
import type { MigrationConfig } from './migrator.ts';
import type { MySql2Database } from './mysql2/index.ts';
import type { NeonHttpDatabase } from './neon-http/index.ts';
import type { NeonDatabase } from './neon-serverless/index.ts';
import type { NodePgDatabase } from './node-postgres/index.ts';
import type { PlanetScaleDatabase } from './planetscale-serverless/index.ts';
import type { PostgresJsDatabase } from './postgres-js/index.ts';
import type { SingleStore2Database } from './singlestore/driver.ts';
import type { TiDBServerlessDatabase } from './tidb-serverless/index.ts';
import type { VercelPgDatabase } from './vercel-postgres/index.ts';

export async function migrate(
	db:
		| AwsDataApiPgDatabase<any>
		| BetterSQLite3Database<any>
		| BunSQLiteDatabase<any>
		| DrizzleD1Database<any>
		| LibSQLDatabase<any>
		| MySql2Database<any>
		| NeonHttpDatabase<any>
		| NeonDatabase<any>
		| NodePgDatabase<any>
		| PlanetScaleDatabase<any>
		| PostgresJsDatabase<any>
		| VercelPgDatabase<any>
		| TiDBServerlessDatabase<any>
		| SingleStore2Database<any>,
	config:
		| string
		| MigrationConfig,
) {
	switch ((<any> db).constructor[entityKind]) {
		case 'AwsDataApiPgDatabase': {
			const { migrate } = await import('./aws-data-api/pg/migrator');

			return migrate(db as AwsDataApiPgDatabase, config as string | MigrationConfig);
		}
		case 'BetterSQLite3Database': {
			const { migrate } = await import('./better-sqlite3/migrator');

			return migrate(db as BetterSQLite3Database, config as string | MigrationConfig);
		}
		case 'BunSQLiteDatabase': {
			const { migrate } = await import('./bun-sqlite/migrator');

			return migrate(db as BunSQLiteDatabase, config as string | MigrationConfig);
		}
		case 'D1Database': {
			const { migrate } = await import('./d1/migrator');

			return migrate(db as DrizzleD1Database, config as string | MigrationConfig);
		}
		case 'LibSQLDatabase': {
			const { migrate } = await import('./libsql/migrator');

			return migrate(db as LibSQLDatabase, config as string | MigrationConfig);
		}
		case 'MySql2Database': {
			const { migrate } = await import('./mysql2/migrator');

			return migrate(db as MySql2Database, config as string | MigrationConfig);
		}
		case 'NeonHttpDatabase': {
			const { migrate } = await import('./neon-http/migrator');

			return migrate(db as NeonHttpDatabase, config as string | MigrationConfig);
		}
		case 'NeonServerlessDatabase': {
			const { migrate } = await import('./neon-serverless/migrator');

			return migrate(db as NeonDatabase, config as string | MigrationConfig);
		}
		case 'NodePgDatabase': {
			const { migrate } = await import('./node-postgres/migrator');

			return migrate(db as NodePgDatabase, config as string | MigrationConfig);
		}
		case 'PlanetScaleDatabase': {
			const { migrate } = await import('./planetscale-serverless/migrator');

			return migrate(db as PlanetScaleDatabase, config as string | MigrationConfig);
		}
		case 'PostgresJsDatabase': {
			const { migrate } = await import('./postgres-js/migrator');

			return migrate(db as PostgresJsDatabase, config as string | MigrationConfig);
		}
		case 'TiDBServerlessDatabase': {
			const { migrate } = await import('./tidb-serverless/migrator');

			return migrate(db as TiDBServerlessDatabase, config as MigrationConfig);
		}
		case 'VercelPgDatabase': {
			const { migrate } = await import('./vercel-postgres/migrator');

			return migrate(db as VercelPgDatabase, config as string | MigrationConfig);
		}
		case 'SingleStore2Database': {
			const { migrate } = await import('./singlestore/migrator');

			return migrate(db as SingleStore2Database, config as MigrationConfig);
		}
	}
}
