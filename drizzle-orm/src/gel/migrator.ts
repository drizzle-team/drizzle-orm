// import type { MigrationConfig } from '~/migrator.ts';
// import { readMigrationFiles } from '~/migrator.ts';
// import type { GelJsDatabase } from './driver.ts';

// not supported
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function migrate<TSchema extends Record<string, unknown>>(
	// db: GelJsDatabase<TSchema>,
	// config: MigrationConfig,
) {
	return {};
	// const migrations = readMigrationFiles(config);
	// await db.dialect.migrate(migrations, db.session, config);
}
