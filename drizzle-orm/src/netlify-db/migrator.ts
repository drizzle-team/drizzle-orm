import { is } from '~/entity.ts';
import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as nodePgMigrate, rollback as nodePgRollback } from '~/node-postgres/migrator.ts';
import { migrate as coreMigrate, rollback as coreRollback } from '~/pg-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { NodePgDatabase } from '../node-postgres/driver.ts';
import type { NetlifyDbDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: NetlifyDbDatabase<TRelations> | NodePgDatabase<TRelations>,
	config: MigrationConfig,
) {
	if (is(db, NodePgDatabase)) {
		return nodePgMigrate(db, config);
	}

	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db, config);
}

export async function rollback<TRelations extends AnyRelations>(
	db: NetlifyDbDatabase<TRelations> | NodePgDatabase<TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	if (is(db, NodePgDatabase)) {
		return nodePgRollback(db, config, steps);
	}

	const migrations = readMigrationFiles(config);
	return coreRollback(migrations, db, config, steps);
}
