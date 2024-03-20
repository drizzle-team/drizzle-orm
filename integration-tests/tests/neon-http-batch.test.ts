import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import type { FullQueryResults, NeonQueryFunction } from '@neondatabase/serverless';
import type { InferSelectModel } from 'drizzle-orm';
import { eq, relations, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonHttpDatabase, NeonHttpQueryResult } from 'drizzle-orm/neon-http';
import { type AnyPgColumn, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

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

declare module 'vitest' {
	export interface TestContext {
		neonHttpDb: NeonHttpDatabase<typeof schema>;
		neonHttpClient: NeonQueryFunction<false, true>;
	}
}

let db: NeonHttpDatabase<typeof schema>;
let client: NeonQueryFunction<false, true>;

beforeAll(async () => {
	const connectionString = process.env['NEON_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error('NEON_CONNECTION_STRING is not defined');
	}

	client = neon(connectionString);
	db = drizzle(client, { schema, logger: ENABLE_LOGGING });
});

beforeEach(async (ctx) => {
	ctx.neonHttpDb = db;
	ctx.neonHttpClient = client;

	await db.execute(sql`drop table if exists comment_likes`);
	await db.execute(sql`drop table if exists comments`);
	await db.execute(sql`drop table if exists posts`);
	await db.execute(sql`drop table if exists users_to_groups`);
	await db.execute(sql`drop table if exists groups`);
	await db.execute(sql`drop table if exists users`);

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

afterAll(async () => {
	await db.execute(sql`drop table if exists comment_likes`);
	await db.execute(sql`drop table if exists comments`);
	await db.execute(sql`drop table if exists posts`);
	await db.execute(sql`drop table if exists users_to_groups`);
	await db.execute(sql`drop table if exists groups`);
	await db.execute(sql`drop table if exists users`);
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

test('insert + db.execute', async () => {
	const batchResponse = await db.batch([
		db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
		db.execute(sql`insert into users (id, name) values (2, 'Dan')`),
	]);

	expectTypeOf(batchResponse).toEqualTypeOf<[
		{
			id: number;
		}[],
		FullQueryResults<false>,
	]>();

	expect(batchResponse.length).eq(2);

	expect(batchResponse[0]).toEqual([{
		id: 1,
	}]);

	expect(batchResponse[1]).toMatchObject({ rowAsArray: false, rows: [], rowCount: 1 });
});

// batch api combined rqb + raw call
test('insert + findManyWith + db.all', async () => {
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

test('select raw', async () => {
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

test('dynamic array select', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Dan' },
	]);

	const batchResponse = await db.batch(
		[1, 2].map((id) => db.query.usersTable.findFirst({
			where: eq(usersTable.id, id),
		})),
	);

	expectTypeOf(batchResponse).toEqualTypeOf<({
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	} | undefined)[]>();

	expect(batchResponse.length).eq(2);

	expect(batchResponse[0]).toEqual([{ id: 1 }]);

	expect(batchResponse[1]).toEqual([{ id: 2 }]);
});

test('dynamic array insert + select', async () => {
	const queries = [];

	queries.push(db.insert(usersTable).values([
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Dan' },
	]));
	queries.push(db.query.usersTable.findMany({}));

	const batchResponse = await db.batch(queries);

	expectTypeOf(batchResponse).toEqualTypeOf<(
		NeonHttpQueryResult<never> | {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[]
	)[]>();

	expect(batchResponse.length).eq(2);

	expect(batchResponse[0]).toEqual({ changes: 2, lastInsertRowid: 2 });

	expect(batchResponse[1]).toEqual([{ id: 1 }, { id: 2 }]);
});

// * additionally
// batch for all neon cases, just replace simple calls with batch calls
// batch for all rqb cases, just replace simple calls with batch calls