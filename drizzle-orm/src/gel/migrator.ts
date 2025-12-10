// import type { MigrationConfig } from '~/migrator.ts';
// import { readMigrationFiles } from '~/migrator.ts';
// import type { GelJsDatabase } from './driver.ts';
import type { AnyRelations } from '~/relations.ts';

// not supported
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	// db: GelJsDatabase<TSchema, TRelations>,
	// config: MigrationConfig,
) {
	return {};
	// const migrations = readMigrationFiles(config);
	// return await db.dialect.migrate(migrations, db.session, config);
}
