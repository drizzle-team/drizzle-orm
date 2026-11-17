import { defineRelations, eq, sql } from 'drizzle-orm';
import { relations as oldRels } from 'drizzle-orm/_relations';
import { type AnyPgColumn, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresHttpDatabase, type PostgresHttpQueryResult } from 'drizzle-orm/postgres/http';
import { Client as ClientNodePostgres } from 'pg';
import { describe, expect, expectTypeOf, test as base } from 'vitest';
import { _push, prepareHttpClient } from './instrumentation';

export const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	invitedBy: integer('invited_by').references((): AnyPgColumn => usersTable.id),
});
export const usersConfig = oldRels(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, {
		fields: [usersTable.invitedBy],
		references: [usersTable.id],
	}),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
}));

export const groupsTable = pgTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});
export const groupsConfig = oldRels(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = pgTable(
	'users_to_groups',
	{
		id: serial('id'),
		userId: integer('user_id').notNull().references(() => usersTable.id),
		groupId: integer('group_id').notNull().references(() => groupsTable.id),
	},
	(t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);
export const usersToGroupsConfig = oldRels(usersToGroupsTable, ({ one }) => ({
	group: one(groupsTable, {
		fields: [usersToGroupsTable.groupId],
		references: [groupsTable.id],
	}),
	user: one(usersTable, {
		fields: [usersToGroupsTable.userId],
		references: [usersTable.id],
	}),
}));

export const postsTable = pgTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: integer('owner_id').references(() => usersTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const postsConfig = oldRels(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const commentsTable = pgTable('comments', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	creator: integer('creator').references(() => usersTable.id),
	postId: integer('post_id').references(() => postsTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const commentsConfig = oldRels(commentsTable, ({ one, many }) => ({
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

export const commentLikesTable = pgTable('comment_likes', {
	id: serial('id').primaryKey(),
	creator: integer('creator').references(() => usersTable.id),
	commentId: integer('comment_id').references(() => commentsTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const commentLikesConfig = oldRels(commentLikesTable, ({ one }) => ({
	comment: one(commentsTable, {
		fields: [commentLikesTable.commentId],
		references: [commentsTable.id],
	}),
	author: one(usersTable, {
		fields: [commentLikesTable.creator],
		references: [usersTable.id],
	}),
}));

export const schema = {
	usersTable,
	postsTable,
	commentsTable,
	commentLikesTable,
	usersToGroupsTable,
	groupsTable,
	commentLikesConfig,
	commentsConfig,
	postsConfig,
	usersToGroupsConfig,
	groupsConfig,
	usersConfig,
};

export const relations = defineRelations(schema);

const DATABASE = 'db25';

const test = base.extend<{ db: PostgresHttpDatabase<typeof relations> }>({
	db: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const admin = new ClientNodePostgres({ connectionString: process.env['PG_CONNECTION_STRING'] });
			await admin.connect();
			await admin.query(`drop database if exists ${DATABASE}`);
			await admin.query(`create database ${DATABASE};`);
			await admin.end();

			const { client, query } = await prepareHttpClient(DATABASE);
			await _push(query, schema);

			const db = drizzle({ client, relations });
			await use(db);
		},
		{ scope: 'file' },
	],
});

describe('batch', () => {
	test.beforeEach(async ({ db }) => {
		await db.execute(
			`truncate table users, groups, users_to_groups, posts, comments, comment_likes RESTART IDENTITY CASCADE;`,
		);
	});

	test('batch api example', async ({ db }) => {
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
			PostgresHttpQueryResult<never>,
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

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);
	});

	test('insert + findMany', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.query.usersTable.findMany({}),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresHttpQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
		]>();

		expect(batchResponse.length).eq(3);

		expect(batchResponse[0]).toEqual([{ id: 1 }]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);
	});

	test('insert + findMany + findFirst', async ({ db }) => {
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
			PostgresHttpQueryResult<never>,
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

		expect(batchResponse[0]).toEqual([{ id: 1 }]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual(
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
		);
	});

	test('insert + db.execute', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.execute(sql`insert into users (id, name) values (2, 'Dan')`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresHttpQueryResult<Record<string, unknown>>,
		]>();

		expect(batchResponse.length).eq(2);

		expect(batchResponse[0]).toEqual([{ id: 1 }]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });
	});

	test('insert + findManyWith + db.all', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.query.usersTable.findMany({}),
			db.execute<typeof usersTable.$inferSelect>(sql`select * from users`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresHttpQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
			PostgresHttpQueryResult<{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}>,
		]>();

		expect(batchResponse.length).eq(4);

		expect(batchResponse[0]).toEqual([{ id: 1 }]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
				{ id: 2, name: 'Dan', verified: 0, invited_by: null },
			],
		});
	});

	test('insert + update + select + select partial', async ({ db }) => {
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
			PostgresHttpQueryResult<never>,
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

		expect(batchResponse[0]).toEqual([{ id: 1 }]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

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

	test('insert + delete + select + select partial', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.delete(usersTable).where(eq(usersTable.id, 1)).returning({
				id: usersTable.id,
				invitedBy: usersTable.invitedBy,
			}),
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
			PostgresHttpQueryResult<never>,
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

		expect(batchResponse[0]).toEqual([{ id: 1 }]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual(
			{ id: 2, invitedBy: null },
		);
	});

	test('select raw', async ({ db }) => {
		await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);
		const batchResponse = await db.batch([
			db.execute<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>(sql`select * from users`),
			db.execute<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>(sql`select * from users where id = 1`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			PostgresHttpQueryResult<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>,
			PostgresHttpQueryResult<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>,
		]>();

		expect(batchResponse.length).eq(2);

		expect(batchResponse[0]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
				{ id: 2, name: 'Dan', verified: 0, invited_by: null },
			],
		});

		expect(batchResponse[1]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
			],
		});
	});

	test('rolls the whole set back on error', async ({ db }) => {
		await db.insert(usersTable).values({ id: 1, name: 'Survivor' });

		await expect(db.batch([
			db.insert(usersTable).values({ id: 2, name: 'Doomed' }),
			db.insert(postsTable).values({ id: 1, content: 'orphan', ownerId: 9999 }),
		])).rejects.toThrow(/foreign key|violates/i);

		expect(await db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
	});

	test('rollback covers DDL', async ({ db }) => {
		await db.execute(sql`drop table if exists http_batch_ddl`);

		await expect(db.batch([
			db.execute(sql`create table http_batch_ddl (id integer primary key)`),
			db.execute(sql`insert into http_batch_ddl values (1)`),
			db.execute(sql`insert into http_batch_ddl values (1)`),
		])).rejects.toThrow(/duplicate key|unique/i);

		const present = await db.execute<{ present: boolean }>(
			sql`select to_regclass('public.http_batch_ddl') is not null as present`,
		);
		expect(present.rows[0]!.present).toBe(false);
	});

	test('honours transaction options', async ({ db }) => {
		await db.insert(usersTable).values({ id: 1, name: 'ReadMe' });

		const res = await db.batch(
			[db.select({ name: usersTable.name }).from(usersTable)],
			{ isolation: 'serializable', readOnly: true },
		);
		expect(res[0]).toEqual([{ name: 'ReadMe' }]);

		await expect(
			db.batch([db.insert(usersTable).values({ id: 2, name: 'Nope' })], { readOnly: true }),
		).rejects.toThrow(/read-only|read only/i);
	});
});
