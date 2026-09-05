import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate, rollback as coreRollback } from '~/mysql-core/effect/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { EffectMysql2Database } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: EffectMysql2Database<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db.session, config);
}

export function rollback<TRelations extends AnyRelations>(
	db: EffectMysql2Database<TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return coreRollback(migrations, db.session, config, steps);
}
