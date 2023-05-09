import 'source-map-support/register';
import Docker from 'dockerode';
import { type ExtractTablesWithRelations, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import { Client } from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import * as schema from './pg.schema';

const { usersTable, postsTable } = schema;

declare module 'vitest' {
	export interface TestContext {
		docker: Docker;
		pgContainer: Docker.Container;
		db: NodePgDatabase<ExtractTablesWithRelations<typeof schema>>;
		client: Client;
	}
}

let globalDocker: Docker;
let pgContainer: Docker.Container;
let db: NodePgDatabase<ExtractTablesWithRelations<typeof schema>>;
let client: Client;

async function createDockerDB(): Promise<string> {
	const docker = (globalDocker = new Docker());
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	pgContainer = await docker.createContainer({
		Image: image,
		Env: [
			'POSTGRES_PASSWORD=postgres',
			'POSTGRES_USER=postgres',
			'POSTGRES_DB=postgres',
		],
		name: `drizzle-integration-tests-${uuid()}`,
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

beforeAll(async () => {
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? (await createDockerDB());

	const sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = new Client(connectionString);
			await client.connect();
			connected = true;
			console.log('connected');
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to Postgres');
		await client?.end().catch(console.error);
		await pgContainer?.stop().catch(console.error);
		throw lastError;
	}
	db = drizzle(client, { schema, logger: true });
});

afterAll(async () => {
	console.log('deleting');
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
	console.log('deleted');
});

beforeEach(async (ctx) => {
	ctx.db = db;
	ctx.client = client;
	ctx.docker = globalDocker;
	ctx.pgContainer = pgContainer;

	await ctx.db.execute(sql`drop schema public cascade`);
	await ctx.db.execute(sql`create schema public`);
	await ctx.db.execute(
		sql`
			CREATE TABLE "users" (
				"id" serial PRIMARY KEY NOT NULL,
				"name" text NOT NULL,
				"verified" boolean DEFAULT false NOT NULL,
				"invited_by" bigint REFERENCES "users"("id")
			);
		`,
	);
	await ctx.db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "groups" (
				"id" serial PRIMARY KEY NOT NULL,
				"name" text NOT NULL,
				"description" text
			);
		`,
	);
	await ctx.db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "users_to_groups" (
				"id" serial PRIMARY KEY NOT NULL,
				"user_id" bigint REFERENCES "users"("id"),
				"group_id" bigint REFERENCES "groups"("id")
			);
		`,
	);
	await ctx.db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "posts" (
				"id" serial PRIMARY KEY NOT NULL,
				"content" text NOT NULL,
				"owner_id" bigint REFERENCES "users"("id"),
				"created_at" timestamp with time zone DEFAULT now() NOT NULL
			);
		`,
	);
	await ctx.db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "comments" (
				"id" serial PRIMARY KEY NOT NULL,
				"content" text NOT NULL,
				"creator" bigint REFERENCES "users"("id"),
				"post_id" bigint REFERENCES "posts"("id"),
				"created_at" timestamp with time zone DEFAULT now() NOT NULL
			);
		`,
	);
	await ctx.db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "comment_likes" (
				"id" serial PRIMARY KEY NOT NULL,
				"creator" bigint REFERENCES "users"("id"),
				"comment_id" bigint REFERENCES "comments"("id"),
				"created_at" timestamp with time zone DEFAULT now() NOT NULL
			);
		`,
	);
});

// insert user and 3 posts
// check all
// check with limit
// check with custom field
// check with order by

// check with where
// check with partial select

test('Get users with posts', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		include: {
			posts: true,
		},
	});

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('Get users with posts + limit posts', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		include: {
			posts: {
				limit: 1,
			},
		},
	});

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('Get users with posts + limit posts and users', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		limit: 2,
		include: {
			posts: {
				limit: 1,
			},
		},
	});

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

// NOT WORKING
test.only('Get users with posts + custom fields', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		include: {
			posts: true,
		},
		includeCustom: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).toEqual(3);
	expect(usersWithPosts[0]?.posts.length).toEqual(3);
	expect(usersWithPosts[1]?.posts.length).toEqual(2);
	expect(usersWithPosts[2]?.posts.length).toEqual(2);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		lowerName: 'dan',
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.2',
			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
		}, { id: 3, ownerId: 1, content: 'Post1.3', createdAt: usersWithPosts[0]?.posts[2]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lowerName: 'andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 2,
			content: 'Post2.1',
			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
		}],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		lowerName: 'alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 3,
			content: 'Post3.1',
			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
		}],
	});
});

// NOT WORKING
test('Get users with posts + custom fields + limits', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		limit: 1,
		include: {
			posts: {
				limit: 1,
			},
		},
		includeCustom: () => ({
			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('Get users with posts + orderBy', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		include: {
			posts: {
				orderBy: (postsTable, { desc }) => [desc(postsTable.content)],
			},
		},
		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
	});

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(2);
	expect(usersWithPosts[1]?.posts.length).eq(2);
	expect(usersWithPosts[2]?.posts.length).eq(3);

	expect(usersWithPosts[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 3, ownerId: 1, content: '3', createdAt: usersWithPosts[2]?.posts[2]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: '2',
			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
		}, { id: 1, ownerId: 1, content: '1', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 5,
			ownerId: 2,
			content: '5',
			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
		}, { id: 4, ownerId: 2, content: '4', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('Get users with posts + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		where: (({ id }, { eq }) => eq(id, 1)),
		include: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	});

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});
