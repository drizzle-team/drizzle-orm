import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { ddlDiffWithDown } from 'src/cli/commands/generate-sqlite';
import { mockResolver } from 'src/utils/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { drizzleToDDL, prepareTestDatabase, push, type SqliteSchema, type TestDatabase } from './mocks';

let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

// Applies `from`, runs the generated up then down statements against the database, and checks
// that introspecting the result matches `from` again.
const roundTrip = async (
	from: SqliteSchema,
	to: SqliteSchema,
	{ renames = [], seed = [] }: { renames?: string[]; seed?: string[] } = {},
) => {
	await push({ db, to: from });
	for (const sql of seed) await db.run(sql);

	const set = new Set(renames);
	const up = await ddlDiffWithDown(drizzleToDDL(from).ddl, drizzleToDDL(to).ddl, () => mockResolver(set));
	const down = await up.down();

	for (const sql of up.sqlStatements) await db.run(sql);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);

	for (const sql of down.sqlStatements) await db.run(sql);
	expect((await push({ db, to: from })).sqlStatements).toStrictEqual([]);

	return { up: up.sqlStatements, down: down.sqlStatements, downStatements: down.groupedStatements };
};

test('create table', async () => {
	await roundTrip({}, { users: sqliteTable('users', { id: integer() }) });
});

test('add column', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer() }) },
		{ users: sqliteTable('users', { id: integer(), age: integer() }) },
		{ seed: ['INSERT INTO `users` (`id`) VALUES (1);'] },
	);

	expect(await db.query('SELECT `id` FROM `users`;')).toStrictEqual([{ id: 1 }]);
});

test('drop column', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
		{ users: sqliteTable('users', { id: integer() }) },
	);
});

test('table rename keeps rows', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer() }) },
		{ users: sqliteTable('people', { id: integer() }) },
		{ renames: ['users->people'], seed: ['INSERT INTO `users` (`id`) VALUES (1);'] },
	);

	expect(await db.query('SELECT `id` FROM `users`;')).toStrictEqual([{ id: 1 }]);
});

test('column rename keeps values', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
		{ users: sqliteTable('users', { id: integer(), fullName: text('full_name') }) },
		{ renames: ['users.name->users.full_name'], seed: [`INSERT INTO \`users\` VALUES (1, 'ada');`] },
	);

	expect(await db.query('SELECT `name` FROM `users`;')).toStrictEqual([{ name: 'ada' }]);
});

test('table and column renamed together keep values', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
		{ users: sqliteTable('people', { id: integer(), fullName: text('full_name') }) },
		{ renames: ['users->people', 'people.name->people.full_name'], seed: [`INSERT INTO \`users\` VALUES (1, 'ada');`] },
	);

	expect(await db.query('SELECT `name` FROM `users`;')).toStrictEqual([{ name: 'ada' }]);
});

test('index', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
		{ users: sqliteTable('users', { id: integer(), name: text() }, (t) => [index('users_name_idx').on(t.name)]) },
	);
});

test('foreign key', async () => {
	const users = sqliteTable('users', { id: integer().primaryKey() });
	await roundTrip(
		{ users, posts: sqliteTable('posts', { id: integer(), userId: integer('user_id') }) },
		{ users, posts: sqliteTable('posts', { id: integer(), userId: integer('user_id').references(() => users.id) }) },
		{ seed: ['INSERT INTO `users` VALUES (1);', 'INSERT INTO `posts` VALUES (1, 1);'] },
	);

	expect(await db.query('SELECT `user_id` FROM `posts`;')).toStrictEqual([{ user_id: 1 }]);
});

test('table recreation copies rows back', async () => {
	const { downStatements } = await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
		{ users: sqliteTable('users', { id: integer(), name: text().notNull() }) },
		{ seed: [`INSERT INTO \`users\` VALUES (1, 'ada');`] },
	);

	expect(downStatements.map((it) => it.jsonStatement.type)).toContain('recreate_table');
	expect(await db.query('SELECT `id`, `name` FROM `users`;')).toStrictEqual([{ id: 1, name: 'ada' }]);
});

test('alter column type', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), score: integer() }) },
		{ users: sqliteTable('users', { id: integer(), score: real() }) },
		{ seed: ['INSERT INTO `users` VALUES (1, 2);'] },
	);

	expect(await db.query('SELECT `id`, `score` FROM `users`;')).toStrictEqual([{ id: 1, score: 2 }]);
});

test('alter column not null', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text().notNull() }) },
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
		{ seed: [`INSERT INTO \`users\` VALUES (1, 'ada');`] },
	);
});

test('alter column default', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), role: text().default('user') }) },
		{ users: sqliteTable('users', { id: integer(), role: text().default('member') }) },
		{ seed: [`INSERT INTO \`users\` VALUES (1, 'admin');`] },
	);

	expect(await db.query('SELECT `role` FROM `users`;')).toStrictEqual([{ role: 'admin' }]);
});

test('drop table', async () => {
	const users = sqliteTable('users', { id: integer().primaryKey() });
	await roundTrip(
		{ users, posts: sqliteTable('posts', { id: integer(), userId: integer('user_id').references(() => users.id) }) },
		{ users },
	);
});

test('drop index', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), name: text() }, (t) => [index('users_name_idx').on(t.name)]) },
		{ users: sqliteTable('users', { id: integer(), name: text() }) },
	);
});

test('drop foreign key', async () => {
	const users = sqliteTable('users', { id: integer().primaryKey() });
	await roundTrip(
		{ users, posts: sqliteTable('posts', { id: integer(), userId: integer('user_id').references(() => users.id) }) },
		{ users, posts: sqliteTable('posts', { id: integer(), userId: integer('user_id') }) },
		{ seed: ['INSERT INTO `users` VALUES (1);', 'INSERT INTO `posts` VALUES (1, 1);'] },
	);

	expect(await db.query('SELECT `user_id` FROM `posts`;')).toStrictEqual([{ user_id: 1 }]);
});

test('unique constraint and composite index', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { id: integer(), email: text(), org: integer() }) },
		{
			users: sqliteTable('users', { id: integer(), email: text(), org: integer() }, (t) => [
				unique('users_email_unique').on(t.email),
				index('users_org_email_idx').on(t.org, t.email),
			]),
		},
		{ seed: [`INSERT INTO \`users\` VALUES (1, 'a@x', 1);`] },
	);
});

test('primary key and check constraint', async () => {
	await roundTrip(
		{ users: sqliteTable('users', { org: integer(), id: integer(), age: integer() }) },
		{
			users: sqliteTable('users', { org: integer(), id: integer(), age: integer() }, (t) => [
				primaryKey({ columns: [t.org, t.id] }),
				check('users_age_check', sql`${t.age} >= 0`),
			]),
		},
		{ seed: ['INSERT INTO `users` VALUES (1, 1, 30);'] },
	);

	expect(await db.query('SELECT `org`, `id`, `age` FROM `users`;')).toStrictEqual([{ org: 1, id: 1, age: 30 }]);
});
