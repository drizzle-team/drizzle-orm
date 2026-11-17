import BetterSqlite3 from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { AnyRelations } from 'drizzle-orm/relations';
import { defineRelations } from 'drizzle-orm/relations';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { getSchemaInfo } from '../../../src/common.ts';
import { seed } from '../../../src/index.ts';
import { mapSqliteColumns } from '../../../src/sqlite-core/index.ts';

// normalized relations carry `refTableRels` back-references, so only the four fields describing the direction of a
// link are compared
const links = (schema: { [key: string]: SQLiteTable }, relations?: AnyRelations) =>
	getSchemaInfo(schema, schema, mapSqliteColumns, relations).relations
		.map(({ table, columns, refTable, refColumns }) => ({ table, columns, refTable, refColumns }))
		.sort((rel1, rel2) =>
			`${rel1.table}.${rel1.columns.join(',')}`.localeCompare(`${rel2.table}.${rel2.columns.join(',')}`)
		);

const createDb = (ddl: string[], relations?: AnyRelations) => {
	const client = new BetterSqlite3(':memory:');
	const db = relations === undefined ? drizzle({ client }) : drizzle({ client, relations });
	for (const query of ddl) db.run(sql.raw(query));

	return db;
};

const users1 = sqliteTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts1 = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id'),
	title: text('title'),
});
const schema1 = { users: users1, posts: posts1 };
const relations1 = defineRelations(schema1, (r) => ({
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));
const ddl1 = [
	'create table `users` (`id` integer primary key, `name` text)',
	'create table `posts` (`id` integer primary key, `owner_id` integer, `title` text)',
];

test('one({ from, to }) on the foreign key side links posts to users without a constraint', async () => {
	expect(links(schema1, relations1)).toEqual([
		{ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] },
	]);

	const db = createDb(ddl1);
	await seed(db, schema1, { count: 8, relations: relations1 });

	const userRows = await db.select().from(users1);
	const postRows = await db.select().from(posts1);
	const userIds = new Set(userRows.map((user) => user.id));

	expect(userRows.length).toBe(8);
	expect(postRows.length).toBe(8);
	expect(postRows.every((post) => post.ownerId !== null && userIds.has(post.ownerId))).toBe(true);
});

const users2 = sqliteTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts2 = sqliteTable('posts', { id: integer('id').primaryKey(), ownerId: integer('owner_id') });
const schema2 = { users: users2, posts: posts2 };
const relations2 = defineRelations(schema2, (r) => ({
	users: { posts: r.many.posts() },
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));

test('bare many() on the parent yields a single relation, not a cycle', () => {
	const schemaInfo = getSchemaInfo(schema2, schema2, mapSqliteColumns, relations2);

	expect(schemaInfo.relations.length).toBe(1);
	expect(links(schema2, relations2)).toEqual([
		{ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] },
	]);
	expect(schemaInfo.relations[0]!.isCyclic).toBe(false);
});

const users3 = sqliteTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts3 = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id').references(() => users3.id),
});
const schema3 = { users: users3, posts: posts3 };
const relations3 = defineRelations(schema3, (r) => ({
	users: { posts: r.many.posts() },
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));

test('a v2 relation duplicating a foreign key constraint contributes nothing', () => {
	const withoutV2 = links(schema3);

	expect(withoutV2).toEqual([
		{ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] },
	]);
	expect(links(schema3, relations3)).toEqual(withoutV2);
});

const users4 = sqliteTable('users', { id: integer('id').primaryKey(), name: text('name') });
const groups4 = sqliteTable('groups', { id: integer('id').primaryKey(), title: text('title') });
const usersToGroups4 = sqliteTable('users_to_groups', {
	userId: integer('user_id').notNull(),
	groupId: integer('group_id').notNull(),
});
const schema4 = { users: users4, groups: groups4, usersToGroups: usersToGroups4 };
const relations4 = defineRelations(schema4, (r) => ({
	users: {
		groups: r.many.groups({
			from: r.users.id.through(r.usersToGroups.userId),
			to: r.groups.id.through(r.usersToGroups.groupId),
		}),
	},
}));
const ddl4 = [
	'create table `users` (`id` integer primary key, `name` text)',
	'create table `groups` (`id` integer primary key, `title` text)',
	'create table `users_to_groups` (`user_id` integer not null, `group_id` integer not null)',
];

test('many().through() makes the junction table the child of both ends', async () => {
	expect(links(schema4, relations4)).toEqual([
		{ table: 'usersToGroups', columns: ['groupId'], refTable: 'groups', refColumns: ['id'] },
		{ table: 'usersToGroups', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);

	const db = createDb(ddl4);
	await seed(db, schema4, { count: 6, relations: relations4 });

	const userIds = new Set((await db.select().from(users4)).map((user) => user.id));
	const groupIds = new Set((await db.select().from(groups4)).map((group) => group.id));
	const junctionRows = await db.select().from(usersToGroups4);

	expect(junctionRows.length).toBe(6);
	expect(junctionRows.every((row) => userIds.has(row.userId) && groupIds.has(row.groupId))).toBe(true);
});

test('relations handed to drizzle are picked up from db._.relations', async () => {
	const db = createDb(ddl1, relations1);

	await seed(db, schema1, { count: 7 });

	const userIds = new Set((await db.select().from(users1)).map((user) => user.id));
	const postRows = await db.select().from(posts1);

	expect(postRows.length).toBe(7);
	expect(postRows.every((post) => post.ownerId !== null && userIds.has(post.ownerId))).toBe(true);
});

test('dryRun returns exactly the rows a real seed inserts', async () => {
	const db = createDb(ddl1, relations1);

	const generated = await seed(db, schema1, { count: 8, seed: 1 }).dryRun();

	expect(Object.keys(generated).sort()).toEqual(['posts', 'users']);
	expect(await db.select().from(users1)).toEqual([]);

	await seed(db, schema1, { count: 8, seed: 1 });

	// `integer primary key` is a rowid alias, so the inserted ids are read back in ascending order regardless of the
	// order the rows were generated in
	const byId = <T extends { id?: number | null }>(rows: T[]) =>
		[...rows].sort((row1, row2) => (row1.id ?? 0) - (row2.id ?? 0));

	expect(byId(await db.select().from(users1))).toEqual(byId(generated.users));
	expect(byId(await db.select().from(posts1))).toEqual(byId(generated.posts));
	expect(generated.users.length).toBe(8);
	expect(generated.posts.length).toBe(8);
});

test('refine().dryRun() applies refinements and writes nothing', async () => {
	const db = createDb(ddl1, relations1);

	const generated = await seed(db, schema1, { count: 8, seed: 2 }).refine((funcs) => ({
		users: {
			count: 3,
			columns: { name: funcs.default({ defaultValue: 'refined name' }) },
		},
		posts: { count: 2 },
	})).dryRun();

	expect(generated.users.length).toBe(3);
	expect(generated.posts.length).toBe(2);
	expect(generated.users.every((user) => user.name === 'refined name')).toBe(true);

	expect(await db.select().from(users1)).toEqual([]);
	expect(await db.select().from(posts1)).toEqual([]);
});
