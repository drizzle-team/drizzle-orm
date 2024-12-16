/// <reference types="@cloudflare/workers-types" />
import 'dotenv/config';
import { D1Database, D1DatabaseAPI } from '@miniflare/d1';
import { createSQLiteDB } from '@miniflare/shared';
import { eq, relations, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';
import { type AnySQLiteColumn, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

export const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	invitedBy: integer('invited_by').references((): AnySQLiteColumn => usersTable.id),
});
export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, {
		fields: [usersTable.invitedBy],
		references: [usersTable.id],
	}),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
}));

export const groupsTable = sqliteTable('groups', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	description: text('description'),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = sqliteTable(
	'users_to_groups',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id', { mode: 'number' }).notNull().references(
			() => usersTable.id,
		),
		groupId: integer('group_id', { mode: 'number' }).notNull().references(
			() => groupsTable.id,
		),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.groupId] }),
	}),
);
export const usersToGroupsConfig = relations(usersToGroupsTable, ({ one }) => ({
	group: one(groupsTable, {
		fields: [usersToGroupsTable.groupId],
		references: [groupsTable.id],
	}),
	user: one(usersTable, {
		fields: [usersToGroupsTable.userId],
		references: [usersTable.id],
	}),
}));

export const postsTable = sqliteTable('posts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	content: text('content').notNull(),
	ownerId: integer('owner_id', { mode: 'number' }).references(
		() => usersTable.id,
	),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const commentsTable = sqliteTable('comments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	content: text('content').notNull(),
	creator: integer('creator', { mode: 'number' }).references(
		() => usersTable.id,
	),
	postId: integer('post_id', { mode: 'number' }).references(() => postsTable.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const commentsConfig = relations(commentsTable, ({ one, many }) => ({
	post: one(postsTable, {
		fields: [commentsTable.postId],
		references: [postsTable.id],
	}),
	author: one(usersTable, {
		fields: [commentsTable.creator],
		references: [usersTable.id],
	}),
	likes: many(commentLikesTable),
}));

export const commentLikesTable = sqliteTable('comment_likes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	creator: integer('creator', { mode: 'number' }).references(
		() => usersTable.id,
	),
	commentId: integer('comment_id', { mode: 'number' }).references(
		() => commentsTable.id,
	),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const commentLikesConfig = relations(commentLikesTable, ({ one }) => ({
	comment: one(commentsTable, {
		fields: [commentLikesTable.commentId],
		references: [commentsTable.id],
	}),
	author: one(usersTable, {
		fields: [commentLikesTable.creator],
		references: [usersTable.id],
	}),
}));

const schema = {
	usersTable,
	postsTable,
	commentsTable,
	usersToGroupsTable,
	groupsTable,
	commentLikesConfig,
	commentsConfig,
	postsConfig,
	usersToGroupsConfig,
	groupsConfig,
	usersConfig,
};

let db: DrizzleD1Database<typeof schema>;

beforeAll(async () => {
	const sqliteDb = await createSQLiteDB(':memory:');
	const d1db = new D1Database(new D1DatabaseAPI(sqliteDb));
	db = drizzle(d1db, { logger: ENABLE_LOGGING, schema });
});

beforeEach(async () => {
	await db.run(sql`drop table if exists \`groups\``);
	await db.run(sql`drop table if exists \`users\``);
	await db.run(sql`drop table if exists \`users_to_groups\``);
	await db.run(sql`drop table if exists \`posts\``);
	await db.run(sql`drop table if exists \`comments\``);
	await db.run(sql`drop table if exists \`comment_likes\``);

	await db.run(
		sql`
			CREATE TABLE \`users\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`name\` text NOT NULL,
			    \`verified\` integer DEFAULT 0 NOT NULL,
			    \`invited_by\` integer
			);
		`,
	);
	await db.run(
		sql`
			CREATE TABLE \`groups\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`name\` text NOT NULL,
			    \`description\` text
			);
		`,
	);
	await db.run(
		sql`
			CREATE TABLE \`users_to_groups\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`user_id\` integer NOT NULL,
			    \`group_id\` integer NOT NULL
			);
		`,
	);
	await db.run(
		sql`
			CREATE TABLE \`posts\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`content\` text NOT NULL,
			    \`owner_id\` integer,
			    \`created_at\` integer DEFAULT current_timestamp NOT NULL
			);
		`,
	);
	await db.run(
		sql`
			CREATE TABLE \`comments\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`content\` text NOT NULL,
			    \`creator\` integer,
			    \`post_id\` integer,
			    \`created_at\` integer DEFAULT current_timestamp NOT NULL
			);
		`,
	);
	await db.run(
		sql`
			CREATE TABLE \`comment_likes\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`creator\` integer,
			    \`comment_id\` integer,
			    \`created_at\` integer DEFAULT current_timestamp NOT NULL
			);
		`,
	);
});

afterAll(async () => {
	await db.run(sql`drop table if exists \`groups\``);
	await db.run(sql`drop table if exists \`users\``);
	await db.run(sql`drop table if exists \`users_to_groups\``);
	await db.run(sql`drop table if exists \`posts\``);
	await db.run(sql`drop table if exists \`comments\``);
	await db.run(sql`drop table if exists \`comment_likes\``);
});

test('batch api example', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({
			id: usersTable.id,
			invitedBy: usersTable.invitedBy,
		}),
		db.insert(usersTable).values({ id: 2, name: 'Dan' }),
		db.select().from(usersTable),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
			invitedBy: number | null;
		}[],
		D1Result,
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
	]>();

	expect(batchResponse.length).eq(3);

	expect(batchResponse[0]).toEqual([{
		id: 1,
		invitedBy: null,
	}]);

	// expect(batchResponse[1]).toEqual({
	// 	results: [],
	// 	success: true,
	// 	meta: {
	// 		duration: 0.027083873748779297,
	// 		last_row_id: 2,
	// 		changes: 1,
	// 		served_by: 'miniflare.db',
	// 		internal_stats: null,
	// 	},
	// });

	expect(batchResponse[2]).toEqual([
		{ id: 1, name: 'John', verified: 0, invitedBy: null },
		{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
	]);
});

// batch api only relational many
test('insert + findMany', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.insert(usersTable).values({ id: 2, name: 'Dan' }),
		db.query.usersTable.findMany({}),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		D1Result,
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
	]>();

	expect(batchResponse.length).eq(3);

	expect(batchResponse[0]).toEqual([{
		id: 1,
	}]);

	// expect(batchResponse[1]).toEqual({ columns: [], rows: [], rowsAffected: 1, lastInsertRowid: 2n });

	expect(batchResponse[2]).toEqual([
		{ id: 1, name: 'John', verified: 0, invitedBy: null },
		{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
	]);
});

// batch api relational many + one
test('insert + findMany + findFirst', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.insert(usersTable).values({ id: 2, name: 'Dan' }),
		db.query.usersTable.findMany({}),
		db.query.usersTable.findFirst({}),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		D1Result,
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		} | undefined,
	]>();

	expect(batchResponse.length).eq(4);

	expect(batchResponse[0]).toEqual([{
		id: 1,
	}]);

	// expect(batchResponse[1]).toEqual({ columns: [], rows: [], rowsAffected: 1, lastInsertRowid: 2n });

	expect(batchResponse[2]).toEqual([
		{ id: 1, name: 'John', verified: 0, invitedBy: null },
		{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
	]);

	expect(batchResponse[3]).toEqual(
		{ id: 1, name: 'John', verified: 0, invitedBy: null },
	);
});

test('insert + db.all + db.get + db.values + db.run', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.run(sql`insert into users (id, name) values (2, 'Dan')`),
		db.all<typeof usersTable.$inferSelect>(sql`select * from users`),
		db.values(sql`select * from users`),
		db.get<typeof usersTable.$inferSelect>(sql`select * from users`),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		D1Result,
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
		unknown[][],
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		},
	]>();

	expect(batchResponse.length).eq(5);

	expect(batchResponse[0], 'insert').toEqual([{
		id: 1,
	}]);

	// expect(batchResponse[1]).toEqual({ columns: [], rows: [], rowsAffected: 1, lastInsertRowid: 2n });

	expect(batchResponse[2], 'all').toEqual([
		{ id: 1, name: 'John', verified: 0, invited_by: null },
		{ id: 2, name: 'Dan', verified: 0, invited_by: null },
	]);

	expect(batchResponse[3], 'values').toEqual([[1, 'John', 0, null], [2, 'Dan', 0, null]]);

	expect(batchResponse[4], 'get').toEqual(
		{ id: 1, name: 'John', verified: 0, invited_by: null },
	);
});

// batch api combined rqb + raw call
test('insert + findManyWith + db.all', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.insert(usersTable).values({ id: 2, name: 'Dan' }),
		db.query.usersTable.findMany({}),
		db.all<typeof usersTable.$inferSelect>(sql`select * from users`),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		D1Result,
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
	]>();

	expect(batchResponse.length).eq(4);

	expect(batchResponse[0]).toEqual([{
		id: 1,
	}]);

	// expect(batchResponse[1]).toEqual({ columns: [], rows: [], rowsAffected: 1, lastInsertRowid: 2n });

	expect(batchResponse[2]).toEqual([
		{ id: 1, name: 'John', verified: 0, invitedBy: null },
		{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
	]);

	expect(batchResponse[3]).toEqual([
		{ id: 1, name: 'John', verified: 0, invited_by: null },
		{ id: 2, name: 'Dan', verified: 0, invited_by: null },
	]);
});

// batch api for insert + update + select
test('insert + update + select + select partial', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.update(usersTable).set({ name: 'Dan' }).where(eq(usersTable.id, 1)),
		db.query.usersTable.findMany({}),
		db.select().from(usersTable).where(eq(usersTable.id, 1)),
		db.select({ id: usersTable.id, invitedBy: usersTable.invitedBy }).from(usersTable),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		D1Result,
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[],
		{
			id: number;
			invitedBy: number | null;
		}[],
	]>();

	expect(batchResponse.length).eq(5);

	expect(batchResponse[0]).toEqual([{
		id: 1,
	}]);

	// expect(batchResponse[1]).toEqual({ columns: [], rows: [], rowsAffected: 1, lastInsertRowid: 1n });

	expect(batchResponse[2]).toEqual([
		{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
	]);

	expect(batchResponse[3]).toEqual([
		{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
	]);

	expect(batchResponse[4]).toEqual([
		{ id: 1, invitedBy: null },
	]);
});

// batch api for insert + delete + select
test('insert + delete + select + select partial', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.insert(usersTable).values({ id: 2, name: 'Dan' }),
		db.delete(usersTable).where(eq(usersTable.id, 1)).returning({ id: usersTable.id, invitedBy: usersTable.invitedBy }),
		db.query.usersTable.findFirst({
			columns: {
				id: true,
				invitedBy: true,
			},
		}),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		D1Result,
		{
			id: number;
			invitedBy: number | null;
		}[],
		{
			id: number;
			invitedBy: number | null;
		} | undefined,
	]>();

	expect(batchResponse.length).eq(4);

	expect(batchResponse[0]).toEqual([{
		id: 1,
	}]);

	// expect(batchResponse[1]).toEqual({ columns: [], rows: [], rowsAffected: 1, lastInsertRowid: 2n });

	expect(batchResponse[2]).toEqual([
		{ id: 1, invitedBy: null },
	]);

	expect(batchResponse[3]).toEqual(
		{ id: 2, invitedBy: null },
	);
});
