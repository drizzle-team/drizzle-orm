import { sql } from 'drizzle-orm';
import {
	bigint,
	check,
	index,
	integer,
	pgEnum,
	pgSchema,
	pgTable,
	primaryKey,
	text,
	unique,
	varchar,
} from 'drizzle-orm/pg-core';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeResult } from 'src/cli/commands/generate-common';
import { ddlDiffWithDown } from 'src/cli/commands/generate-postgres';
import { runWithCliContext } from 'src/cli/context';
import { toJsonSnapshot } from 'src/dialects/postgres/snapshot';
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

// Writes the migration the way `generate` does and returns the statements of the written down.sql,
// so the stamp, header and banner lines are executed along with the rollback.
const writtenDown = (to: PostgresSchema, up: string[], down: Awaited<ReturnType<typeof diff>>['down']) => {
	const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-pg-down-'));
	try {
		runWithCliContext({ output: 'json', interactive: false }, () =>
			writeResult({
				snapshot: toJsonSnapshot(drizzleToDDL(to).ddl, [], []),
				sqlStatements: up,
				down,
				outFolder: out,
				breakpoints: true,
				generateDownMigrations: true,
				name: 'roundtrip',
				renames: [],
				snapshots: [],
			}));
		const [tag] = readdirSync(out);
		return readFileSync(join(out, tag!, 'down.sql'), 'utf8').split('--> statement-breakpoint');
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
};

const diff = async (from: PostgresSchema, to: PostgresSchema, renames: string[]) => {
	const set = new Set(renames);
	const up = await ddlDiffWithDown(drizzleToDDL(from).ddl, drizzleToDDL(to).ddl, () => mockResolver(set));
	const { sqlStatements, groupedStatements } = await up.down();
	return { up: up.sqlStatements, down: { sqlStatements, statements: groupedStatements } };
};

// Applies `from`, runs the generated up statements and then the written down.sql against the database,
// and checks that introspecting the result matches `from` again.
const roundTrip = async (
	from: PostgresSchema,
	to: PostgresSchema,
	{ renames = [], seed = [] }: { renames?: string[]; seed?: string[] } = {},
) => {
	await push({ db, to: from });
	for (const sql of seed) await db.query(sql);

	const { up, down } = await diff(from, to, renames);
	const downFile = writtenDown(to, up, down);

	for (const sql of up) await db.query(sql);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);

	for (const sql of downFile) await db.query(sql);
	expect((await push({ db, to: from })).sqlStatements).toStrictEqual([]);

	return { up, down: down.sqlStatements, downFile };
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

test('the written down.sql starts with the stamp, header and banner', async () => {
	const { downFile } = await roundTrip(
		{ users: pgTable('users', { id: integer() }), posts: pgTable('posts', { id: integer() }) },
		{ users: pgTable('users', { id: integer() }) },
	);

	const leadingComments = downFile[0]!.split('\n').filter((line) => line.startsWith('--'));
	expect(leadingComments[0]).toMatch(/^-- drizzle:up-hash=[0-9a-f]{64}$/);
	expect(leadingComments.join('\n')).toContain('⚠ REVIEW');
});

test('alter column type', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: varchar({ length: 10 }) }) },
		{ users: pgTable('users', { id: bigint({ mode: 'number' }), name: varchar({ length: 255 }) }) },
		{ seed: [`INSERT INTO "users" VALUES (1, 'ada');`] },
	);

	expect(await db.query(`SELECT "id", "name" FROM "users";`)).toStrictEqual([{ id: 1, name: 'ada' }]);
});

test('alter column not null', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text().notNull() }) },
		{ users: pgTable('users', { id: integer(), name: text() }) },
		{ seed: [`INSERT INTO "users" VALUES (1, 'ada');`] },
	);
	await _.clear();
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text() }) },
		{ users: pgTable('users', { id: integer(), name: text().notNull() }) },
		{ seed: [`INSERT INTO "users" VALUES (1, 'ada');`] },
	);
});

test('alter column default', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), role: text().default('user') }) },
		{ users: pgTable('users', { id: integer(), role: text().default('member') }) },
	);
	await _.clear();
	await roundTrip(
		{ users: pgTable('users', { id: integer(), age: integer() }) },
		{ users: pgTable('users', { id: integer(), age: integer().default(18) }) },
	);
});

test('drop table', async () => {
	const users = pgTable('users', { id: integer().primaryKey() });
	await roundTrip(
		{ users, posts: pgTable('posts', { id: integer(), userId: integer('user_id').references(() => users.id) }) },
		{ users },
	);
});

test('drop index', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), name: text() }, (t) => [index('users_name_idx').on(t.name)]) },
		{ users: pgTable('users', { id: integer(), name: text() }) },
	);
});

test('drop foreign key', async () => {
	const users = pgTable('users', { id: integer().primaryKey() });
	await roundTrip(
		{ users, posts: pgTable('posts', { id: integer(), userId: integer('user_id').references(() => users.id) }) },
		{ users, posts: pgTable('posts', { id: integer(), userId: integer('user_id') }) },
		{ seed: ['INSERT INTO "users" VALUES (1);', 'INSERT INTO "posts" VALUES (1, 1);'] },
	);
});

test('unique constraint and composite index', async () => {
	await roundTrip(
		{ users: pgTable('users', { id: integer(), email: text(), org: integer() }) },
		{
			users: pgTable('users', { id: integer(), email: text(), org: integer() }, (t) => [
				unique('users_email_key').on(t.email),
				index('users_org_email_idx').on(t.org, t.email),
			]),
		},
		{ seed: [`INSERT INTO "users" VALUES (1, 'a@x', 1);`] },
	);
});

test('primary key and check constraint', async () => {
	await roundTrip(
		{ users: pgTable('users', { org: integer(), id: integer(), age: integer() }) },
		{
			users: pgTable('users', { org: integer().notNull(), id: integer().notNull(), age: integer() }, (t) => [
				primaryKey({ columns: [t.org, t.id] }),
				check('users_age_check', sql`${t.age} >= 0`),
			]),
		},
		{ seed: ['INSERT INTO "users" VALUES (1, 1, 30);'] },
	);
});

test('enum value removed', async () => {
	const before = pgEnum('status', ['a', 'b', 'c']);
	const after = pgEnum('status', ['a', 'b']);
	await roundTrip(
		{ before, users: pgTable('users', { status: before() }) },
		{ after, users: pgTable('users', { status: after() }) },
		{ seed: [`INSERT INTO "users" VALUES ('a');`] },
	);

	expect(await db.query(`SELECT "status" FROM "users";`)).toStrictEqual([{ status: 'a' }]);
});
