import { Database } from '@sqlitecloud/drivers';
import { sql } from 'drizzle-orm';
import type { SQLiteCloudDatabase } from 'drizzle-orm/sqlite-cloud';
import { drizzle } from 'drizzle-orm/sqlite-cloud';
import { migrate } from 'drizzle-orm/sqlite-cloud/migrator';
import { type BaseSQLiteDatabase, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import relations from './relations';
import { tests } from './sqlite-common';

declare module 'vitest' {
	interface TestContext {
		sqlite: {
			db: BaseSQLiteDatabase<'async' | 'sync', any, Record<string, never>, typeof relations>;
		};
	}
}

const ENABLE_LOGGING = false;

let db: SQLiteCloudDatabase<never, typeof relations>;
let client: Database | undefined;

beforeAll(async () => {
	const connectionString = process.env['SQLITE_CLOUD_CONNECTION_STRING'];
	if (!connectionString) throw new Error('SQLITE_CLOUD_CONNECTION_STRING is not set');

	client = new Database(connectionString);
	db = drizzle(connectionString, { logger: ENABLE_LOGGING, relations });
});

afterAll(async () => {
	client?.close();
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
});

export const usersMigratorTable = sqliteTable('users12', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const anotherUsersMigratorTable = sqliteTable('another_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

test('migrator', async () => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/sqlite' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = await db.select().from(usersMigratorTable).all();
	await db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = await db.select().from(anotherUsersMigratorTable).all();

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table __drizzle_migrations`);
});

skipTests([
	// Currently not supported by provider
	'update with limit and order by',
	'delete with limit and order by',
]);
tests();
