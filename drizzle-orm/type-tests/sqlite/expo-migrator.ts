import type { ExpoSQLiteDatabase } from '~/expo-sqlite/driver.ts';
import { useMigrations } from '~/expo-sqlite/migrator.ts';

declare const db: ExpoSQLiteDatabase;

const migrations = {
	migrations: {
		'20260923131213_example': 'CREATE TABLE example (id integer);',
	},
};

useMigrations(db, migrations);
