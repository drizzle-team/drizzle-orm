import type { MigrationConfig, RollbackOptions } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { BunMySqlDatabase } from './mysql/driver.ts';
import { migrate as mysqlMigrator, rollback as mysqlRollback } from './mysql/migrator.ts';
import type { BunSQLDatabase } from './postgres/driver.ts';
import { migrate as pgMigrator, rollback as pgRollback } from './postgres/migrator.ts';
import type { BunSQLiteDatabase } from './sqlite/driver.ts';
import { migrate as sqliteMigrator, rollback as sqliteRollback } from './sqlite/migrator.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: BunSQLDatabase<TRelations>,
	config: MigrationConfig,
) {
	return pgMigrator(db, config);
}

export namespace migrate {
	export async function postgres<TRelations extends AnyRelations>(
		db: BunSQLDatabase<TRelations>,
		config: MigrationConfig,
	) {
		return pgMigrator(db, config);
	}

	export async function sqlite<TRelations extends AnyRelations>(
		db: BunSQLiteDatabase<TRelations>,
		config: MigrationConfig,
	) {
		return sqliteMigrator(db, config);
	}

	export async function mysql<TRelations extends AnyRelations>(
		db: BunMySqlDatabase<TRelations>,
		config: MigrationConfig,
	) {
		return mysqlMigrator(db, config);
	}
}

export async function rollback<TRelations extends AnyRelations>(
	db: BunSQLDatabase<TRelations>,
	config: MigrationConfig,
	options?: RollbackOptions,
) {
	return pgRollback(db, config, options);
}

export namespace rollback {
	export async function postgres<TRelations extends AnyRelations>(
		db: BunSQLDatabase<TRelations>,
		config: MigrationConfig,
		options?: RollbackOptions,
	) {
		return pgRollback(db, config, options);
	}

	export async function sqlite<TRelations extends AnyRelations>(
		db: BunSQLiteDatabase<TRelations>,
		config: MigrationConfig,
		options?: RollbackOptions,
	) {
		return sqliteRollback(db, config, options);
	}

	export async function mysql<TRelations extends AnyRelations>(
		db: BunMySqlDatabase<TRelations>,
		config: MigrationConfig,
		options?: RollbackOptions,
	) {
		return mysqlRollback(db, config, options);
	}
}
