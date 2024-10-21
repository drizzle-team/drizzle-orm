import { type Client, createClient } from '@libsql/client/ws';
import retry from 'async-retry';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { drizzle } from 'drizzle-orm/libsql/ws';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { randomString } from '~/utils';
import { anotherUsersMigratorTable, tests, usersMigratorTable, usersOnUpdate } from './sqlite-common';

const ENABLE_LOGGING = false;

let db: LibSQLDatabase;
let client: Client;

beforeAll(async () => {
	const url = process.env['LIBSQL_REMOTE_URL'];
	const authToken = process.env['LIBSQL_REMOTE_TOKEN'];
	if (!url) {
		throw new Error('LIBSQL_REMOTE_URL is not set');
	}
	client = await retry(async () => {
		client = createClient({ url, authToken });
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.close();
		},
	});
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

test('migrator : migrate with custom table', async () => {
	const customTable = randomString();
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists ${sql.identifier(customTable)}`);

	await migrate(db, { migrationsFolder: './drizzle2/sqlite', migrationsTable: customTable });

	// test if the custom migrations table was created
	const res = await db.all(sql`select * from ${sql.identifier(customTable)};`);
	expect(res.length > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table ${sql.identifier(customTable)}`);
});

test('test $onUpdateFn and $onUpdate works as $default', async (ctx) => {
	const { db } = ctx.sqlite;

	await db.run(sql`drop table if exists ${usersOnUpdate}`);

	await db.run(
		sql`
			create table ${usersOnUpdate} (
			id integer primary key autoincrement,
			name text not null,
			update_counter integer default 1 not null,
			updated_at integer,
			always_null text
			)
		`,
	);

	await db.insert(usersOnUpdate).values([
		{ name: 'John' },
		{ name: 'Jane' },
		{ name: 'Jack' },
		{ name: 'Jill' },
	]);
	const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

	const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	expect(response).toEqual([
		{ name: 'John', id: 1, updateCounter: 1, alwaysNull: null },
		{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
		{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
		{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
	]);
	const msDelay = 1250;

	for (const eachUser of justDates) {
		expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
	}
});

test('test $onUpdateFn and $onUpdate works updating', async (ctx) => {
	const { db } = ctx.sqlite;

	await db.run(sql`drop table if exists ${usersOnUpdate}`);

	await db.run(
		sql`
			create table ${usersOnUpdate} (
			id integer primary key autoincrement,
			name text not null,
			update_counter integer default 1,
			updated_at integer,
			always_null text
			)
		`,
	);

	await db.insert(usersOnUpdate).values([
		{ name: 'John', alwaysNull: 'this will be null after updating' },
		{ name: 'Jane' },
		{ name: 'Jack' },
		{ name: 'Jill' },
	]);
	const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

	await db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));
	await db.update(usersOnUpdate).set({ updateCounter: null }).where(eq(usersOnUpdate.id, 2));

	const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	expect(response).toEqual([
		{ name: 'Angel', id: 1, updateCounter: 2, alwaysNull: null },
		{ name: 'Jane', id: 2, updateCounter: null, alwaysNull: null },
		{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
		{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
	]);
	const msDelay = 1250;

	for (const eachUser of justDates) {
		expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
	}
});

skipTests([
	'delete with limit and order by',
	'update with limit and order by',
	'join view as subquery',
	'test $onUpdateFn and $onUpdate works as $default',
	'test $onUpdateFn and $onUpdate works updating',
	'prepared statement reuse',
]);

tests();
