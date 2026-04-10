import type { MigrationConfig } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { SqliteRemoteDatabase } from './driver.ts';
import { migrateInternal } from './migrator.internal.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SqliteRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	return migrateInternal(db, callback, config, 'transaction');
}
