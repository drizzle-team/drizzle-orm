import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { integer, pgSchema, pgTable, pgView, text } from 'drizzle-orm/pg-core';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AnyRelations } from 'drizzle-orm/relations';
import { defineRelations, defineRelationsPart } from 'drizzle-orm/relations';
import { expect, test } from 'vitest';
import { getSchemaInfo } from '../../../src/common.ts';
import { seed } from '../../../src/index.ts';
import { mapPgColumns } from '../../../src/pg-core/index.ts';

const applyDdl = async (db: PgliteDatabase<any>, ddl: SQL[]) => {
	for (const query of ddl) await db.execute(query);
};

const linksOf = (
	relations: { table: string; columns: string[]; refTable: string; refColumns: string[] }[],
) => relations.map((relation) => [relation.table, relation.columns, relation.refTable, relation.refColumns]);

// views ---------------------------------------------------------------------------------------------------------
const viewUsers = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const viewPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	viewerId: integer('viewer_id'),
});
const activeUsers = pgView('active_users', { id: integer('id'), name: text('name') }).as(
	sql`select "id", "name" from "users"`,
);

const viewSchema = { users: viewUsers, posts: viewPosts, activeUsers };
const viewTables = { users: viewUsers, posts: viewPosts };
const viewDdl = [
	sql`create table users (id integer primary key, name text)`,
	sql`create table posts (id integer primary key, author_id integer, viewer_id integer)`,
	sql`create view active_users as select "id", "name" from "users"`,
];

test('a relation whose target is a view is dropped, the rest of the schema still seeds', async () => {
	const relations = defineRelations(viewSchema, (r) => ({
		posts: {
			author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
			viewer: r.one.activeUsers({ from: r.posts.viewerId, to: r.activeUsers.id }),
		},
	}));

	const { relations: mapped } = getSchemaInfo(viewTables, viewTables, mapPgColumns, relations);
	expect(linksOf(mapped)).toEqual([['posts', ['authorId'], 'users', ['id']]]);

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, viewDdl);

	await seed(db, viewSchema, { count: 5, relations });

	const users = await db.select().from(viewUsers);
	const posts = await db.select().from(viewPosts);
	const userIds = new Set(users.map((user) => user.id));

	expect(posts.length).toBe(5);
	expect(posts.every((post) => post.authorId !== null && userIds.has(post.authorId))).toBe(true);
});

test('relations declared under a view key are dropped', async () => {
	const relations = defineRelations(viewSchema, (r) => ({
		activeUsers: {
			posts: r.many.posts({ from: r.activeUsers.id, to: r.posts.authorId }),
		},
	}));

	const { relations: mapped } = getSchemaInfo(viewTables, viewTables, mapPgColumns, relations);
	expect(mapped).toEqual([]);

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, viewDdl);

	await seed(db, viewSchema, { count: 5, relations });

	expect((await db.select().from(viewUsers)).length).toBe(5);
	expect((await db.select().from(viewPosts)).length).toBe(5);
});

// partially exposed schema ---------------------------------------------------------------------------------------
const partialUsers = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const partialPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id').references(() => partialUsers.id),
	title: text('title'),
});

test('a relation to a table that is not being seeded is dropped and its column is null filled', async () => {
	const relations = defineRelations({ users: partialUsers, posts: partialPosts }, (r) => ({
		posts: {
			owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }),
		},
	}));

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, [
		sql`create table users (id integer primary key, name text)`,
		sql`create table posts (id integer primary key, owner_id integer references users(id), title text)`,
	]);

	await seed(db, { posts: partialPosts }, { count: 4, relations });

	const posts = await db.select().from(partialPosts);
	expect(posts.length).toBe(4);
	expect(posts.every((post) => post.ownerId === null)).toBe(true);
	expect(await db.select().from(partialUsers)).toEqual([]);
});

// relations config keyed differently from the seed schema ---------------------------------------------------------
const renamedUsers = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const renamedPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	title: text('title'),
});

test('relation names come from the seed schema keys, not from the relations config keys', async () => {
	const relations = defineRelations({ user: renamedUsers, post: renamedPosts }, (r) => ({
		post: {
			author: r.one.user({ from: r.post.authorId, to: r.user.id }),
		},
	}));

	const schema = { users: renamedUsers, posts: renamedPosts };
	const { relations: mapped } = getSchemaInfo(schema, schema, mapPgColumns, relations);
	expect(linksOf(mapped)).toEqual([['posts', ['authorId'], 'users', ['id']]]);

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, [
		sql`create table users (id integer primary key, name text)`,
		sql`create table posts (id integer primary key, author_id integer, title text)`,
	]);

	await seed(db, schema, { count: 5, relations });

	const userIds = new Set((await db.select().from(renamedUsers)).map((user) => user.id));
	const posts = await db.select().from(renamedPosts);
	expect(posts.every((post) => post.authorId !== null && userIds.has(post.authorId))).toBe(true);
});

// same database name in two database schemas ----------------------------------------------------------------------
const schemaA = pgSchema('a');
const schemaB = pgSchema('b');
const usersA = schemaA.table('users', { id: integer('id').primaryKey(), name: text('name') });
const usersB = schemaB.table('users', { id: integer('id').primaryKey(), name: text('name') });
const twoSchemaPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	aUserId: integer('a_user_id'),
	bUserId: integer('b_user_id'),
});

test('two tables sharing a database name in different database schemas keep their own relation', async () => {
	const schema = { usersA, usersB, posts: twoSchemaPosts };
	const relations = defineRelations(schema, (r) => ({
		posts: {
			aUser: r.one.usersA({ from: r.posts.aUserId, to: r.usersA.id }),
			bUser: r.one.usersB({ from: r.posts.bUserId, to: r.usersB.id }),
		},
	}));

	const { relations: mapped } = getSchemaInfo(schema, schema, mapPgColumns, relations);
	expect(linksOf(mapped)).toEqual([
		['posts', ['aUserId'], 'usersA', ['id']],
		['posts', ['bUserId'], 'usersB', ['id']],
	]);

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, [
		sql`create schema a`,
		sql`create schema b`,
		sql`create table a.users (id integer primary key, name text)`,
		sql`create table b.users (id integer primary key, name text)`,
		sql`create table posts (id integer primary key, a_user_id integer, b_user_id integer)`,
	]);

	await seed(db, schema, { count: 6, relations });

	const aIds = new Set((await db.select().from(usersA)).map((user) => user.id));
	const bIds = new Set((await db.select().from(usersB)).map((user) => user.id));
	const posts = await db.select().from(twoSchemaPosts);

	expect(posts.length).toBe(6);
	expect(posts.every((post) => post.aUserId !== null && aIds.has(post.aUserId))).toBe(true);
	expect(posts.every((post) => post.bUserId !== null && bIds.has(post.bUserId))).toBe(true);
});

// empty relations configs -----------------------------------------------------------------------------------------
const emptyUsers = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const emptyPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id').notNull().references(() => emptyUsers.id),
	title: text('title'),
});
const emptySchema = { users: emptyUsers, posts: emptyPosts };

test('an empty relations config adds nothing and leaves foreign key derived seeding untouched', async () => {
	const foreignKeyLink = [['posts', ['authorId'], 'users', ['id']]];

	const withoutCallback = getSchemaInfo(emptySchema, emptySchema, mapPgColumns, defineRelations(emptySchema));
	const withEmptyObject = getSchemaInfo(emptySchema, emptySchema, mapPgColumns, {});
	const withUndefinedEntry = getSchemaInfo(
		emptySchema,
		emptySchema,
		mapPgColumns,
		{ posts: undefined } as unknown as AnyRelations,
	);

	expect(linksOf(withoutCallback.relations)).toEqual(foreignKeyLink);
	expect(linksOf(withEmptyObject.relations)).toEqual(foreignKeyLink);
	expect(linksOf(withUndefinedEntry.relations)).toEqual(foreignKeyLink);

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, [
		sql`create table users (id integer primary key, name text)`,
		sql`create table posts (id integer primary key, author_id integer not null references users(id), title text)`,
	]);

	await seed(db, emptySchema, { count: 5, relations: defineRelations(emptySchema) });

	const userIds = new Set((await db.select().from(emptyUsers)).map((user) => user.id));
	const posts = await db.select().from(emptyPosts);
	expect(posts.length).toBe(5);
	expect(posts.every((post) => userIds.has(post.authorId))).toBe(true);
});

// defineRelationsPart ---------------------------------------------------------------------------------------------
const partUsers = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const partPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	title: text('title'),
});
const partComments = pgTable('comments', {
	id: integer('id').primaryKey(),
	postId: integer('post_id'),
	body: text('body'),
});
const partSchema = { users: partUsers, posts: partPosts, comments: partComments };

test('defineRelationsPart contributes relations only for the tables it covers', async () => {
	const relations = defineRelationsPart(partSchema, (r) => ({
		posts: {
			author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
		},
	}));

	expect(Object.keys(relations)).toEqual(['posts']);

	const { relations: mapped } = getSchemaInfo(partSchema, partSchema, mapPgColumns, relations);
	expect(linksOf(mapped)).toEqual([['posts', ['authorId'], 'users', ['id']]]);

	const client = new PGlite();
	const db = drizzle({ client });
	await applyDdl(db, [
		sql`create table users (id integer primary key, name text)`,
		sql`create table posts (id integer primary key, author_id integer, title text)`,
		sql`create table comments (id integer primary key, post_id integer, body text)`,
	]);

	await seed(db, partSchema, { count: 5, relations });

	const userIds = new Set((await db.select().from(partUsers)).map((user) => user.id));
	const posts = await db.select().from(partPosts);
	expect(posts.every((post) => post.authorId !== null && userIds.has(post.authorId))).toBe(true);
	expect((await db.select().from(partComments)).length).toBe(5);
});

// where the config comes from -------------------------------------------------------------------------------------
const optionUsers = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const optionPosts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	editorId: integer('editor_id'),
	title: text('title'),
});
const optionSchema = { users: optionUsers, posts: optionPosts };
const optionDdl = [
	sql`create table users (id integer primary key, name text)`,
	sql`create table posts (id integer primary key, author_id integer, editor_id integer, title text)`,
];

const byAuthor = defineRelations(optionSchema, (r) => ({
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
	},
}));

const byEditor = defineRelations(optionSchema, (r) => ({
	posts: {
		editor: r.one.users({ from: r.posts.editorId, to: r.users.id }),
	},
}));

test('relations taken off the db produce the same rows as relations passed as an option', async () => {
	const fromDbClient = new PGlite();
	const fromDb = drizzle({ client: fromDbClient, relations: byAuthor });
	await applyDdl(fromDb, optionDdl);

	const fromOptionClient = new PGlite();
	const fromOption = drizzle({ client: fromOptionClient });
	await applyDdl(fromOption, optionDdl);

	await seed(fromDb, optionSchema, { count: 7, seed: 3 });
	await seed(fromOption, optionSchema, { count: 7, seed: 3, relations: byAuthor });

	const dbUsers = await fromDb.select().from(optionUsers);
	const dbPosts = await fromDb.select().from(optionPosts);

	expect(await fromOption.select().from(optionUsers)).toEqual(dbUsers);
	expect(await fromOption.select().from(optionPosts)).toEqual(dbPosts);

	// the relation has to have been applied, otherwise both sides are equal only because nothing linked them
	const userIds = new Set(dbUsers.map((user) => user.id));
	expect(dbPosts.every((post) => post.authorId !== null && userIds.has(post.authorId))).toBe(true);
});

test('the relations option overrides the relations the db was built with', async () => {
	const client = new PGlite();
	const authorDb = drizzle({ client, relations: byAuthor });
	const editorDb = drizzle({ client, relations: byEditor });
	await applyDdl(authorDb, optionDdl);

	const withAuthorRelations = await seed(authorDb, optionSchema, { count: 7, seed: 3 }).dryRun();
	const withEditorRelations = await seed(editorDb, optionSchema, { count: 7, seed: 3 }).dryRun();
	const overridden = await seed(authorDb, optionSchema, { count: 7, seed: 3, relations: byEditor }).dryRun();

	expect(overridden).toEqual(withEditorRelations);
	expect(overridden).not.toEqual(withAuthorRelations);

	const userIds = new Set(overridden.users.map((user) => user.id));
	expect(overridden.posts.every((post) => post.editorId !== null && userIds.has(post.editorId!))).toBe(true);
});
