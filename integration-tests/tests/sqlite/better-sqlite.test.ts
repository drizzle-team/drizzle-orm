import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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

test('migrator skips blank statement chunks', () => {
	db.run(sql`drop table if exists blank_statements`);
	db.run(sql`drop table if exists __drizzle_migrations`);

	migrate(db, { migrationsFolder: './drizzle2/sqlite-blank-statements' });

	const tables = db.all<{ name: string }>(
		sql`select name from sqlite_master where type = 'table' and name = 'blank_statements'`,
	);
	const migrationRecords = db.all(sql`select hash, created_at from __drizzle_migrations`);

	expect(tables).toEqual([{ name: 'blank_statements' }]);
	expect(migrationRecords).toHaveLength(1);

	db.run(sql`drop table blank_statements`);
	db.run(sql`drop table __drizzle_migrations`);
});

test('migrator rejects a migration with no statements', () => {
	db.run(sql`drop table if exists empty_migration_probe`);
	db.run(sql`drop table if exists __drizzle_migrations`);

	expect(() => migrate(db, { migrationsFolder: './drizzle2/sqlite-empty-migration' })).toThrow(
		/contains no SQL statements/,
	);

	const tables = db.all<{ name: string }>(
		sql`select name from sqlite_master where type = 'table' and name = 'empty_migration_probe'`,
	);
	const migrationRecords = db.all(sql`select hash, created_at from __drizzle_migrations`);

	expect(tables).toEqual([]);
	expect(migrationRecords).toHaveLength(0);

	db.run(sql`drop table __drizzle_migrations`);
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
