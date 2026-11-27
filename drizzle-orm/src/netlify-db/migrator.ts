import { is } from '~/entity.ts';
import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as nodePgMigrate } from '~/node-postgres/migrator.ts';
import { NodePgDatabase } from '../node-postgres/driver.ts';
import type { NetlifyDbDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: NetlifyDbDatabase<TSchema> | NodePgDatabase<TSchema>,
	config: MigrationConfig,
) {
	if (is(db, NodePgDatabase)) {
		return nodePgMigrate(db, config);
	}

	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}
