import type { MigrationConfig } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { BunMySqlDatabase } from './mysql/driver.ts';
import { migrate as mysqlMigrator } from './mysql/migrator.ts';
import type { BunSQLDatabase } from './postgres/driver.ts';
import { migrate as pgMigrator } from './postgres/migrator.ts';
import type { BunSQLiteDatabase } from './sqlite/driver.ts';
import { migrate as sqliteMigrator } from './sqlite/migrator.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: BunSQLDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	return pgMigrator(db, config);
}

export namespace migrate {
	export async function postgres<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
		db: BunSQLDatabase<TSchema, TRelations>,
		config: MigrationConfig,
	) {
		return pgMigrator(db, config);
	}

	export async function sqlite<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
		db: BunSQLiteDatabase<TSchema, TRelations>,
		config: MigrationConfig,
	) {
		return sqliteMigrator(db, config);
	}

	export async function mysql<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
		db: BunMySqlDatabase<TSchema, TRelations>,
		config: MigrationConfig,
	) {
		return mysqlMigrator(db, config);
	}
}
