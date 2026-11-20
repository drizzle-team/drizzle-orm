import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate } from '~/pg-core/effect/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { EffectPostgresDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: EffectPostgresDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db.session, config);
}
