import { index, integer, pgEnum, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import { ddlDiffWithDown } from 'src/cli/commands/generate-postgres';
import { mockResolver } from 'src/utils/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { drizzleToDDL, type PostgresSchema, prepareTestDatabase, push, type TestDatabase } from './mocks';

let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
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
	from: PostgresSchema,
	to: PostgresSchema,
	{ renames = [], seed = [] }: { renames?: string[]; seed?: string[] } = {},
) => {
	await push({ db, to: from });
	for (const sql of seed) await db.query(sql);

	const set = new Set(renames);
	const up = await ddlDiffWithDown(drizzleToDDL(from).ddl, drizzleToDDL(to).ddl, () => mockResolver(set));
	const down = await up.down();

	for (const sql of up.sqlStatements) await db.query(sql);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);

	for (const sql of down.sqlStatements) await db.query(sql);
	expect((await push({ db, to: from })).sqlStatements).toStrictEqual([]);

	return { up: up.sqlStatements, down: down.sqlStatements };
};

test('create table', async () => {
	await roundTrip({}, { users: pgTable('users', { id: integer() }) });
});

test('add column', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer() }) },
		{ users: pgTable('users', { id: integer(), age: integer() }) },
		{ seed: [`INSERT INTO "users" ("id") VALUES (1);`] },
	);

	expect(await db.query(`SELECT "id" FROM "users";`)).toStrictEqual([{ id: 1 }]);
});

test('drop column', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text() }) },
		{ users: pgTable('users', { id: integer() }) },
	);
});

test('table rename keeps rows', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer() }) },
		{ users: pgTable('people', { id: integer() }) },
		{ renames: ['public.users->public.people'], seed: [`INSERT INTO "users" ("id") VALUES (1);`] },
	);

	expect(await db.query(`SELECT "id" FROM "users";`)).toStrictEqual([{ id: 1 }]);
});

test('column rename keeps values', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text() }) },
		{ users: pgTable('users', { id: integer(), fullName: text('full_name') }) },
		{ renames: ['public.users.name->public.users.full_name'], seed: [`INSERT INTO "users" VALUES (1, 'ada');`] },
	);

	expect(await db.query(`SELECT "name" FROM "users";`)).toStrictEqual([{ name: 'ada' }]);
});

test('table and column renamed together keep values', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text() }) },
		{ users: pgTable('people', { id: integer(), fullName: text('full_name') }) },
		{
			renames: ['public.users->public.people', 'public.people.name->public.people.full_name'],
			seed: [`INSERT INTO "users" VALUES (1, 'ada');`],
		},
	);

	expect(await db.query(`SELECT "name" FROM "users";`)).toStrictEqual([{ name: 'ada' }]);
});

test('schema, table and column renamed together keep values', async () => {
	const before = pgSchema('app');
	const after = pgSchema('core');
	await roundTrip(
		{ before, users: before.table('users', { id: integer(), name: text() }) },
		{ after, users: after.table('people', { id: integer(), fullName: text('full_name') }) },
		{
			renames: ['app->core', 'core.users->core.people', 'core.people.name->core.people.full_name'],
			seed: [`INSERT INTO "app"."users" VALUES (1, 'ada');`],
		},
	);

	expect(await db.query(`SELECT "name" FROM "app"."users";`)).toStrictEqual([{ name: 'ada' }]);
});

test('index', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text() }) },
		{ users: pgTable('users', { id: integer(), name: text() }, (t) => [index('users_name_idx').on(t.name)]) },
	);
});

test('foreign key', async () => {
	const users = pgTable('users', { id: integer().primaryKey() });
	await roundTrip(
		{ users, posts: pgTable('posts', { id: integer(), userId: integer('user_id') }) },
		{ users, posts: pgTable('posts', { id: integer(), userId: integer('user_id').references(() => users.id) }) },
	);
});

test('enum value added', async () => {
	const before = pgEnum('status', ['a', 'b']);
	const after = pgEnum('status', ['a', 'b', 'c']);
	await roundTrip(
		{ before, users: pgTable('users', { status: before() }) },
		{ after, users: pgTable('users', { status: after() }) },
		{ seed: [`INSERT INTO "users" VALUES ('b');`] },
	);

	expect(await db.query(`SELECT "status" FROM "users";`)).toStrictEqual([{ status: 'b' }]);
});
