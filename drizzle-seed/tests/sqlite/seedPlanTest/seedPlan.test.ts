import BetterSqlite3 from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { defineRelations } from 'drizzle-orm/relations';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expect, test, vi } from 'vitest';
import { seed } from '../../../src/index.ts';

// only column types that survive a driver round trip unchanged are used here, so that the rows a replayed statement
// leaves behind can be compared to the ones a real seed wrote with a plain deep equality
const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
	email: text('email'),
	age: integer('age'),
});

const posts = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	title: text('title'),
	views: integer('views'),
});

const schema = { users, posts };

// there is no foreign key constraint in the ddl below, so this declaration is the only thing tying the two tables
// together: whatever honours it in the seed has to honour it in a dry run as well
const schemaRelations = defineRelations(schema, (r) => ({
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
	},
}));

const ddl = [
	'create table `users` (`id` integer primary key, `name` text, `email` text, `age` integer)',
	'create table `posts` (`id` integer primary key, `author_id` integer, `title` text, `views` integer)',
];

// an autoincrement primary key is the sqlite counterpart of the serial columns a postgres plan emits `setval` for
const events = sqliteTable('events', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title'),
});

const eventsDdl = ['create table `events` (`id` integer primary key autoincrement, `title` text)'];

const makeDb = (statements: string[] = ddl, relations?: any) => {
	const client = new BetterSqlite3(':memory:');
	const db = relations === undefined ? drizzle({ client }) : drizzle({ client, relations });
	for (const query of statements) db.run(sql.raw(query));

	return { client, db };
};

const replay = (db: BetterSQLite3Database<any>, statements: string[]) => {
	for (const statement of statements) db.run(sql.raw(statement));
};

test('replaying the sql of a dry run leaves the same rows behind as a real seed', async () => {
	const { db: seeded } = makeDb(ddl, schemaRelations);
	const { db: replayed } = makeDb(ddl, schemaRelations);

	const statements = await seed(seeded, schema, { count: 12, seed: 1 }).dryRun({ output: 'sql' });

	await seed(seeded, schema, { count: 12, seed: 1 });
	replay(replayed, statements);

	// the statements are meant to be joined with ';\n' by the caller, so none of them carries one already
	expect(statements.every((statement) => !statement.trimEnd().endsWith(';'))).toBe(true);
	expect(await replayed.select().from(users).orderBy(users.id)).toEqual(
		await seeded.select().from(users).orderBy(users.id),
	);
	expect(await replayed.select().from(posts).orderBy(posts.id)).toEqual(
		await seeded.select().from(posts).orderBy(posts.id),
	);
	expect((await replayed.select().from(users)).length).toBe(12);
	expect((await replayed.select().from(posts)).length).toBe(12);
});

test('a dry run issues no statement of its own and leaves the tables empty', async () => {
	const { client, db } = makeDb(ddl, schemaRelations);

	const clientPrepare = vi.spyOn(client, 'prepare');
	const clientExec = vi.spyOn(client, 'exec');
	const dbRun = vi.spyOn(db, 'run');
	const dbInsert = vi.spyOn(db, 'insert');
	const dbUpdate = vi.spyOn(db, 'update');

	const rows = await seed(db, schema, { count: 6, seed: 3 }).dryRun();

	expect(dbInsert).toHaveBeenCalledTimes(0);
	expect(dbUpdate).toHaveBeenCalledTimes(0);

	// rendering statements does go through the drizzle insert builder, but only to ask it for its sql - nothing is
	// ever handed to the driver, which is what the spies below watch
	const statements = await seed(db, schema, { count: 6, seed: 3 }).dryRun({ output: 'sql' });

	expect(clientPrepare).toHaveBeenCalledTimes(0);
	expect(clientExec).toHaveBeenCalledTimes(0);
	expect(dbRun).toHaveBeenCalledTimes(0);

	vi.restoreAllMocks();

	expect(rows.users.length).toBe(6);
	expect(statements.length).toBeGreaterThan(0);
	expect(await db.select().from(users)).toEqual([]);
	expect(await db.select().from(posts)).toEqual([]);
});

test('no sequence statement is planned for sqlite, which keeps its own rowid counter', async () => {
	const { db: seeded } = makeDb(eventsDdl);
	const { db: replayed } = makeDb(eventsDdl);

	const statements = await seed(seeded, { events }, { count: 5, seed: 7 }).dryRun({ output: 'sql' });

	expect(statements.length).toBeGreaterThan(0);
	expect(statements.every((statement) => !statement.includes('setval'))).toBe(true);

	// nothing has to be resynchronised afterwards either: replaying the statements is enough on its own
	await seed(seeded, { events }, { count: 5, seed: 7 });
	replay(replayed, statements);

	expect(await replayed.select().from(events).orderBy(events.id)).toEqual(
		await seeded.select().from(events).orderBy(events.id),
	);
});

test('values are written into the statements, and a text value with a quote in it replays unchanged', async () => {
	const { db } = makeDb(ddl, schemaRelations);
	const { db: replayed } = makeDb(ddl, schemaRelations);

	const name = "Tim O'Reilly";

	const statements = await seed(db, schema, { count: 3, seed: 11 }).refine((funcs) => ({
		users: {
			count: 3,
			columns: {
				name: funcs.default({ defaultValue: name }),
				email: funcs.default({ defaultValue: 'a@b.c' }),
				age: funcs.default({ defaultValue: 42 }),
			},
		},
		posts: { count: 0 },
	})).dryRun({ output: 'sql' });

	expect(statements.some((statement) => statement.includes("'Tim O''Reilly'"))).toBe(true);
	// a value left as a placeholder would never make it into the statement at all
	expect(statements.every((statement) => !statement.includes('?'))).toBe(true);

	replay(replayed, statements);

	const replayedUsers = await replayed.select().from(users).orderBy(users.id);
	expect(replayedUsers.length).toBe(3);
	expect(replayedUsers.every((row) => row.name === name && row.email === 'a@b.c' && row.age === 42)).toBe(true);
	expect(await replayed.select().from(posts)).toEqual([]);
});

test('iterating a dry run yields inserts whose rows add up to the awaited result', async () => {
	const { db } = makeDb(ddl, schemaRelations);

	const awaited = await seed(db, schema, { count: 9, seed: 13 }).dryRun();

	const streamed: { [tableName: string]: Record<string, unknown>[] } = { users: [], posts: [] };
	const tableOrder: string[] = [];
	for await (const write of seed(db, schema, { count: 9, seed: 13 }).dryRun()) {
		expect(write.type).toBe('insert');
		if (write.type !== 'insert') continue;

		if (!tableOrder.includes(write.tableName)) tableOrder.push(write.tableName);
		streamed[write.tableName]!.push(...write.rows as Record<string, unknown>[]);
	}

	expect(streamed).toEqual({ users: awaited.users, posts: awaited.posts });
	// parents are generated before the children that point at them, and the awaited result keeps that order
	expect(tableOrder).toEqual(Object.keys(awaited));
});

test('iterating the sql of a dry run yields the same statements as awaiting it', async () => {
	const { db } = makeDb(ddl, schemaRelations);

	const awaited = await seed(db, schema, { count: 9, seed: 17 }).dryRun({ output: 'sql' });

	const streamed: string[] = [];
	for await (const statement of seed(db, schema, { count: 9, seed: 17 }).dryRun({ output: 'sql' })) {
		expect(typeof statement).toBe('string');
		streamed.push(statement);
	}

	expect(streamed).toEqual(awaited);
	expect(streamed.length).toBeGreaterThan(0);
});

test('a relation declared with defineRelations is honoured in both the rows and the sql of a dry run', async () => {
	const { db } = makeDb(ddl, schemaRelations);
	const { db: replayed } = makeDb(ddl, schemaRelations);

	const rows = await seed(db, schema, { count: 10, seed: 19 }).dryRun();
	const statements = await seed(db, schema, { count: 10, seed: 19 }).dryRun({ output: 'sql' });

	const userIds = new Set(rows.users.map((row) => row.id));
	expect(rows.posts.length).toBe(10);
	expect(rows.posts.every((row) => row.authorId !== null && userIds.has(row.authorId!))).toBe(true);

	replay(replayed, statements);

	const replayedUserIds = new Set((await replayed.select().from(users)).map((row) => row.id));
	const replayedPosts = await replayed.select().from(posts);

	expect(replayedPosts.length).toBe(10);
	expect(replayedPosts.every((row) => row.authorId !== null && replayedUserIds.has(row.authorId!))).toBe(true);
});
