import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import type { DurableObjectSQLiteDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: DurableObjectSQLiteDatabase<TSchema>,
	migrations: MigrationMeta[],
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
) {
	db.dialect.migrate(migrations, db.session, {
		...(typeof config !== 'string' && config),
		migrationsFolder: '',
	});
}
