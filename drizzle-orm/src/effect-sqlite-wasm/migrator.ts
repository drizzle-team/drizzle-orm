import { readMigrationsFromRecord } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrate as coreMigrate } from '~/sqlite-core/effect/session.ts';
import type { EffectSQLiteWasmDatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	migrationsTable?: string;
	/** @internal */
	init?: boolean;
}

export function migrate<TRelations extends AnyRelations>(
	db: EffectSQLiteWasmDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationsFromRecord(config.migrations);
	return coreMigrate(migrations, db.session, config);
}
