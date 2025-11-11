import { defineRelations, eq, sql } from 'drizzle-orm';
import { relations as oldRels } from 'drizzle-orm/_relations';
import { drizzle, type NeonHttpDatabase, type NeonHttpQueryResult } from 'drizzle-orm/neon-http';
import { type AnyPgColumn, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf, test as base } from 'vitest';
import { _push, prepareNeonHttpClient } from './instrumentation';

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

const test = base.extend<{ db: NeonHttpDatabase<typeof schema, typeof relations> }>({
	db: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const { client, query } = await prepareNeonHttpClient('db6');
			await _push(query, schema);

			const db = drizzle({ client: client, relations: relations, schema });
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
			NeonHttpQueryResult<never>,
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

	// batch api only relational many
	test('insert + findMany', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db._query.usersTable.findMany({}),
			db.query.usersTable.findMany({}),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			NeonHttpQueryResult<never>,
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

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);
	});

	// batch api relational many + one
	test('insert + findMany + findFirst', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db._query.usersTable.findMany({}),
			db.query.usersTable.findMany({}),
			db._query.usersTable.findFirst({}),
			db.query.usersTable.findFirst({}),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			NeonHttpQueryResult<never>,
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
				name: string;
				verified: number;
				invitedBy: number | null;
			} | undefined,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | undefined,
		]>();

		expect(batchResponse.length).eq(6);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[4]).toEqual(
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
		);

		expect(batchResponse[5]).toEqual(
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
			NeonHttpQueryResult<Record<string, unknown>>,
		]>();

		expect(batchResponse.length).eq(2);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rowAsArray: false, rows: [], rowCount: 1 });
	});

	// batch api combined rqb + raw call
	test('insert + findManyWith + db.all', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db._query.usersTable.findMany({}),
			db.query.usersTable.findMany({}),
			db.execute<typeof usersTable.$inferSelect>(sql`select * from users`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			NeonHttpQueryResult<never>,
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
			NeonHttpQueryResult<{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}>,
		]>();

		expect(batchResponse.length).eq(5);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rowAsArray: true, rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[4]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
				{ id: 2, name: 'Dan', verified: 0, invited_by: null },
			],
		});
	});

	// batch api for insert + update + select
	test('insert + update + select + select partial', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.update(usersTable).set({ name: 'Dan' }).where(eq(usersTable.id, 1)),
			db._query.usersTable.findMany({}),
			db.query.usersTable.findMany({}),
			db.select().from(usersTable).where(eq(usersTable.id, 1)),
			db.select({ id: usersTable.id, invitedBy: usersTable.invitedBy }).from(usersTable),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			NeonHttpQueryResult<never>,
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
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
			{
				id: number;
				invitedBy: number | null;
			}[],
		]>();

		expect(batchResponse.length).eq(6);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual([
			{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[4]).toEqual([
			{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[5]).toEqual([
			{ id: 1, invitedBy: null },
		]);
	});

	// batch api for insert + delete + select
	test('insert + delete + select + select partial', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.delete(usersTable).where(eq(usersTable.id, 1)).returning({
				id: usersTable.id,
				invitedBy: usersTable.invitedBy,
			}),
			db._query.usersTable.findFirst({
				columns: {
					id: true,
					invitedBy: true,
				},
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
			NeonHttpQueryResult<never>,
			{
				id: number;
				invitedBy: number | null;
			}[],
			{
				id: number;
				invitedBy: number | null;
			} | undefined,
			{
				id: number;
				invitedBy: number | null;
			} | undefined,
		]>();

		expect(batchResponse.length).eq(5);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual(
			{ id: 2, invitedBy: null },
		);

		expect(batchResponse[4]).toEqual(
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
			NeonHttpQueryResult<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>,
			NeonHttpQueryResult<{
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
});
