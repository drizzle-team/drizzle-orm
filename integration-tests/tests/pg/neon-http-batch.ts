import Docker from 'dockerode';
import type { InferSelectModel } from 'drizzle-orm';
import { eq, relations, sql } from 'drizzle-orm';
import type { NeonHttpQueryResult } from 'drizzle-orm/neon-http';
import { integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';
import { afterAll, beforeEach, describe, expect, expectTypeOf, test } from 'vitest';

export const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	invitedBy: integer('invited_by').references((): AnyPgColumn => usersTable.id),
});
export const usersConfig = relations(usersTable, ({ one, many }) => ({
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
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = pgTable(
	'users_to_groups',
	{
		id: serial('id'),
		userId: integer('user_id').notNull().references(() => usersTable.id),
		groupId: integer('group_id').notNull().references(() => groupsTable.id),
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

export const postsTable = pgTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: integer('owner_id').references(() => usersTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const postsConfig = relations(postsTable, ({ one, many }) => ({
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

export const commentLikesTable = pgTable('comment_likes', {
	id: serial('id').primaryKey(),
	creator: integer('creator').references(() => usersTable.id),
	commentId: integer('comment_id').references(() => commentsTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
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

let pgContainer: Docker.Container;
export async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	pgContainer = await docker.createContainer({
		Image: image,
		Env: ['POSTGRES_PASSWORD=postgres', 'POSTGRES_USER=postgres', 'POSTGRES_DB=postgres'],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

afterAll(async () => {
	await pgContainer?.stop().catch(console.error);
});

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db } = ctx.pg;
			await db.execute(sql`drop schema if exists public cascade`);
			await db.execute(sql`drop schema if exists mySchema cascade`);

			await db.execute(
				sql`
					create table users (
					    id serial primary key,
					    name text not null,
					    verified int not null default 0,
					    invited_by int references users(id)
					)
				`,
			);
			await db.execute(
				sql`
					create table groups (
					    id serial primary key,
					    name text not null,
					    description text
					)
				`,
			);
			await db.execute(
				sql`
					create table users_to_groups (
					    id serial,
					    user_id int not null references users(id),
					    group_id int not null references groups(id),
					    primary key (user_id, group_id)
					)
				`,
			);
			await db.execute(
				sql`
					create table posts (
					    id serial primary key,
					    content text not null,
					    owner_id int references users(id),
					    created_at timestamp not null default now()
					)
				`,
			);
			await db.execute(
				sql`
					create table comments (
					    id serial primary key,
					    content text not null,
					    creator int references users(id),
					    post_id int references posts(id),
					    created_at timestamp not null default now()
					)
				`,
			);
			await db.execute(
				sql`
					create table comment_likes (
					    id serial primary key,
					    creator int references users(id),
					    comment_id int references comments(id),
					    created_at timestamp not null default now()
					)
				`,
			);
		});

		test('batch api example', async (ctx) => {
			const { db } = ctx.neonPg;

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
		test('insert + findMany', async (ctx) => {
			const { db } = ctx.neonPg;

			const batchResponse = await db.batch([
				db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
				db.insert(usersTable).values({ id: 2, name: 'Dan' }),
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
			]>();

			expect(batchResponse.length).eq(3);

			expect(batchResponse[0]).toEqual([{
				id: 1,
			}]);

			expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

			expect(batchResponse[2]).toEqual([
				{ id: 1, name: 'John', verified: 0, invitedBy: null },
				{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
			]);
		});

		// batch api relational many + one
		test('insert + findMany + findFirst', async (ctx) => {
			const { db } = ctx.neonPg;

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
				} | undefined,
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

			expect(batchResponse[3]).toEqual(
				{ id: 1, name: 'John', verified: 0, invitedBy: null },
			);
		});

		test('insert + db.execute', async (ctx) => {
			const { db } = ctx.neonPg;

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
		test('insert + findManyWith + db.all', async (ctx) => {
			const { db } = ctx.neonPg;

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
				NeonHttpQueryResult<never>,
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

			expect(batchResponse.length).eq(4);

			expect(batchResponse[0]).toEqual([{
				id: 1,
			}]);

			expect(batchResponse[1]).toMatchObject({ rowAsArray: true, rows: [], rowCount: 1 });

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

		// batch api for insert + update + select
		test('insert + update + select + select partial', async (ctx) => {
			const { db } = ctx.neonPg;

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
					invitedBy: number | null;
				}[],
			]>();

			expect(batchResponse.length).eq(5);

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
				{ id: 1, invitedBy: null },
			]);
		});

		// batch api for insert + delete + select
		test('insert + delete + select + select partial', async (ctx) => {
			const { db } = ctx.neonPg;

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
				NeonHttpQueryResult<never>,
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

			expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

			expect(batchResponse[2]).toEqual([
				{ id: 1, invitedBy: null },
			]);

			expect(batchResponse[3]).toEqual(
				{ id: 2, invitedBy: null },
			);
		});

		test('select raw', async (ctx) => {
			const { db } = ctx.neonPg;

			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);
			const batchResponse = await db.batch([
				db.execute<InferSelectModel<typeof usersTable, { dbColumnNames: true }>>(sql`select * from users`),
				db.execute<InferSelectModel<typeof usersTable, { dbColumnNames: true }>>(sql`select * from users where id = 1`),
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
}
