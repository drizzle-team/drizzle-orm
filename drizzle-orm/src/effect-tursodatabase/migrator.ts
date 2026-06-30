import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrate as coreMigrate } from '~/sqlite-core/effect/session.ts';
import type { EffectTursoDatabaseDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: EffectTursoDatabaseDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db.session, config);
}
