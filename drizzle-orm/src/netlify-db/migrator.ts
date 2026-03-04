import { is } from '~/entity.ts';
import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as nodePgMigrate } from '~/node-postgres/migrator.ts';
import { migrate as coreMigrate } from '~/pg-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { NodePgDatabase } from '../node-postgres/driver.ts';
import type { NetlifyDbDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: NetlifyDbDatabase<TSchema, TRelations> | NodePgDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	if (is(db, NodePgDatabase)) {
		return nodePgMigrate(db, config);
	}

	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db.session, config);
}
