import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { anotherUsersMigratorTable, tests, usersMigratorTable } from './sqlite-common';

const ENABLE_LOGGING = false;

let db: BetterSQLite3Database;
let client: Database.Database;

beforeAll(async () => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
	client = new Database(dbPath);
	db = drizzle(client, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
	client?.close();
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
});

test('migrator', async () => {
	db.run(sql`drop table if exists another_users`);
	db.run(sql`drop table if exists users12`);
	db.run(sql`drop table if exists __drizzle_migrations`);

	migrate(db, { migrationsFolder: './drizzle2/sqlite' });

	db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = db.select().from(usersMigratorTable).all();

	db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = db.select().from(anotherUsersMigratorTable).all();

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	db.run(sql`drop table another_users`);
	db.run(sql`drop table users12`);
	db.run(sql`drop table __drizzle_migrations`);
});

test('migrator: table-rebuild migration preserves child rows with ON DELETE CASCADE FK', () => {
	const migrationDir = './migrations/sqlite-fk-cascade-test';
	if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
	mkdirSync(migrationDir, { recursive: true });

	db.run(sql`drop table if exists \`child_fk_test\``);
	db.run(sql`drop table if exists \`parent_fk_test\``);
	db.run(sql`drop table if exists \`__drizzle_migrations\``);

	// Initial schema: parent + child with ON DELETE CASCADE
	mkdirSync(`${migrationDir}/20240101000000_initial`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240101000000_initial/migration.sql`,
		[
			"CREATE TABLE `parent_fk_test` (`id` integer PRIMARY KEY NOT NULL, `mode` text DEFAULT 'a');",
			'--> statement-breakpoint',
			"CREATE TABLE `child_fk_test` (`id` integer PRIMARY KEY NOT NULL, `parent_id` integer NOT NULL REFERENCES `parent_fk_test`(`id`) ON DELETE CASCADE);",
		].join('\n'),
	);
	migrate(db, { migrationsFolder: migrationDir });

	db.run(sql`PRAGMA foreign_keys=ON`);
	db.run(sql`INSERT INTO parent_fk_test VALUES (1, 'a')`);
	db.run(sql`INSERT INTO child_fk_test VALUES (1, 1), (2, 1)`);

	// Table-rebuild migration in the exact drizzle-kit output shape
	mkdirSync(`${migrationDir}/20240102000000_rebuild`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240102000000_rebuild/migration.sql`,
		[
			'PRAGMA foreign_keys=OFF;',
			'--> statement-breakpoint',
			"CREATE TABLE `__new_parent_fk_test` (`id` integer PRIMARY KEY NOT NULL, `mode` text DEFAULT 'b');",
			'--> statement-breakpoint',
			'INSERT INTO `__new_parent_fk_test` SELECT `id`, `mode` FROM `parent_fk_test`;',
			'--> statement-breakpoint',
			'DROP TABLE `parent_fk_test`;',
			'--> statement-breakpoint',
			'ALTER TABLE `__new_parent_fk_test` RENAME TO `parent_fk_test`;',
			'--> statement-breakpoint',
			'PRAGMA foreign_keys=ON;',
		].join('\n'),
	);
	migrate(db, { migrationsFolder: migrationDir });

	// Child rows must survive; without the fix they are silently wiped by CASCADE
	const childRows = db.all<{ id: number; parent_id: number }>(
		sql`SELECT id, parent_id FROM child_fk_test ORDER BY id`,
	);
	expect(childRows).toStrictEqual([
		{ id: 1, parent_id: 1 },
		{ id: 2, parent_id: 1 },
	]);

	db.run(sql`DROP TABLE IF EXISTS child_fk_test`);
	db.run(sql`DROP TABLE IF EXISTS parent_fk_test`);
	db.run(sql`DROP TABLE IF EXISTS \`__drizzle_migrations\``);
	rmSync(migrationDir, { recursive: true });
});

skipTests([
	/**
	 * doesn't work properly:
	 * 	Expect: should rollback transaction and don't insert/ update data
	 * 	Received: data inserted/ updated
	 */
	'transaction rollback',
	'nested transaction rollback',
]);
tests();
