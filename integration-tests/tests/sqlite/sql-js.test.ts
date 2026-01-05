import { sql } from 'drizzle-orm';
import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import type { Database } from 'sql.js';
import initSqlJs from 'sql.js';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { anotherUsersMigratorTable, tests, usersMigratorTable } from './sqlite-common';

const ENABLE_LOGGING = false;

let db: SQLJsDatabase;
let client: Database;

beforeAll(async () => {
	const SQL = await initSqlJs();
	client = new SQL.Database();
	db = drizzle(client, { logger: ENABLE_LOGGING });
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
});

afterAll(async () => {
	client?.close();
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

test('migrator: migrations table has correct schema for SQLite', async () => {
	db.run(sql`drop table if exists another_users`);
	db.run(sql`drop table if exists users12`);
	db.run(sql`drop table if exists __drizzle_migrations`);

	migrate(db, { migrationsFolder: './drizzle2/sqlite' });

	// Verify the __drizzle_migrations table uses proper SQLite syntax
	// The id column should be "integer PRIMARY KEY" (which auto-increments in SQLite),
	// not "SERIAL PRIMARY KEY" (which is PostgreSQL syntax)
	const tableInfo = db.all<{ cid: number; name: string; type: string; notnull: number; pk: number }>(
		sql`PRAGMA table_info(__drizzle_migrations)`,
	);

	const idColumn = tableInfo.find((col: { name: string }) => col.name === 'id');
	expect(idColumn).toBeDefined();
	// In SQLite, the type should be "integer" (case-insensitive) for proper auto-increment behavior
	// "SERIAL" is PostgreSQL syntax and should not be used
	expect(idColumn!.type.toLowerCase()).toBe('integer');
	expect(idColumn!.pk).toBe(1);

	db.run(sql`drop table another_users`);
	db.run(sql`drop table users12`);
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
	'delete with limit and order by',
	'update with limit and order by',
]);
tests();
