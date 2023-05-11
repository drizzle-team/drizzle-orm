import 'dotenv/config';
import Docker from 'dockerode';
import { desc, eq, type ExtractTablesWithRelations, gt, or, placeholder, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import { Client } from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import * as schema from './pg.schema';

const { usersTable, postsTable, commentsTable, usersToGroupsTable, groupsTable } = schema;

// Comments
// 1. Search not working tests by "NOT WORKING". Explanations attached
// 2. All types are broken
// 3. If I run test "Get groups with users + orderBy + limit" and "Get users with groups + orderBy + limit"
//    I've got an error about prepared statements. I guess it will be the same for any 2+ tests running simultaneously

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
	db = drizzle(client, { schema, logger: false });
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

/*
	[Find Many] One relation users+posts
*/

test('[Find Many] Get users with posts', async (t) => {
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

test('[Find Many] Get users with posts + limit posts', async (t) => {
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
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

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

test('[Find Many] Get users with posts + limit posts and users', async (t) => {
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
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

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

test('[Find Many] Get users with posts + custom fields', async (t) => {
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
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

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
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }, {
			id: 5,
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
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }, {
			id: 7,
			ownerId: 3,
			content: 'Post3.1',
			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
		}],
	});
});

test('[Find Many] Get users with posts + custom fields + limits', async (t) => {
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
		includeCustom: (usersTable, { sql }) => ({
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

test('[Find Many] Get users with posts + orderBy', async (t) => {
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

test('[Find Many] Get users with posts + where', async (t) => {
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

test('[Find Many] Get users with posts + where + partial', async (t) => {
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
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts + where + partial. Did not select posts id, but used it in where', async (t) => {
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
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts + where + partial(true + false)', async (t) => {
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
		select: {
			id: true,
			name: false,
			posts: {
				select: {
					id: true,
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		posts: [{ id: 1 }],
	});
});

test('[Find Many] Get users with posts + where + partial(false)', async (t) => {
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
		select: {
			name: false,
			posts: {
				select: {
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

/*
	Prepared statements for users+posts
*/
test('[Find Many] Get users with posts + prepared limit', async (t) => {
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

	const prepared = db.query.usersTable.findMany({
		include: {
			posts: {
				limit: placeholder('limit'),
			},
		},
	}).prepare('query');

	const usersWithPosts = await prepared.execute({ limit: 1 });

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared limit + offset', async (t) => {
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

	const prepared = db.query.usersTable.findMany({
		limit: placeholder('uLimit'),
		offset: placeholder('uOffset'),
		include: {
			posts: {
				limit: placeholder('pLimit'),
			},
		},
	}).prepare('query');

	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1 });

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared where', async (t) => {
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

	const prepared = db.query.usersTable.findMany({
		where: (({ id }, { eq }) => eq(id, placeholder('id'))),
		include: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	}).prepare('query');

	const usersWithPosts = await prepared.execute({ id: 1 });

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

test('[Find Many] Get users with posts + prepared + limit + offset + where', async (t) => {
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

	const prepared = db.query.usersTable.findMany({
		limit: placeholder('uLimit'),
		offset: placeholder('uOffset'),
		where: (({ id }, { eq, or }) => or(eq(id, placeholder('id')), eq(id, 3))),
		include: {
			posts: {
				where: (({ id }, { eq }) => eq(id, placeholder('pid'))),
				limit: placeholder('pLimit'),
			},
		},
	}).prepare('query');

	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 });

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

/*
	[Find One] One relation users+posts
*/

test('[Find One] Get users with posts', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: true,
		},
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + limit posts', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: {
				limit: 1,
			},
		},
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts no results found', async (t) => {
	const { db } = t;

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: {
				limit: 1,
			},
		},
	});

	expect(usersWithPosts).toBeUndefined();
});

test('[Find One] Get users with posts + limit posts and users', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: {
				limit: 1,
			},
		},
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + custom fields', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: true,
		},
		includeCustom: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expect(usersWithPosts!.posts.length).toEqual(3);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		lowerName: 'dan',
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.2',
			createdAt: usersWithPosts?.posts[1]?.createdAt,
		}, { id: 3, ownerId: 1, content: 'Post1.3', createdAt: usersWithPosts?.posts[2]?.createdAt }],
	});
});

test('[Find One] Get users with posts + custom fields + limits', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: {
				limit: 1,
			},
		},
		includeCustom: (usersTable, { sql }) => ({
			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	expect(usersWithPosts!.posts.length).toEqual(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + orderBy', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		include: {
			posts: {
				orderBy: (postsTable, { desc }) => [desc(postsTable.content)],
			},
		},
		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
	});

	expect(usersWithPosts!.posts.length).eq(2);

	expect(usersWithPosts).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		where: (({ id }, { eq }) => eq(id, 1)),
		include: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where + partial', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts + where + partial. Did not select posts id, but used it in where', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		select: {
			id: true,
			name: true,
			posts: {
				select: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts + where + partial(true + false)', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		select: {
			id: true,
			name: false,
			posts: {
				select: {
					id: true,
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		posts: [{ id: 1 }],
	});
});

test('[Find One] Get users with posts + where + partial(false)', async (t) => {
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

	const usersWithPosts = await db.query.usersTable.findFirst({
		select: {
			name: false,
			posts: {
				select: {
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

/*
	One relation users+users. Self referencing
*/

test('Get user with invitee', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		include: {
			invitee: true,
		},
	});

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user + limit with invitee', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew', invitedBy: 1 },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		include: {
			invitee: true,
		},
		limit: 2,
	});

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
});

test('Get user with invitee and custom fields', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		includeCustom: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		include: {
			invitee: {
				includeCustom: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	});

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee and custom fields + limits', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		includeCustom: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		limit: 3,
		include: {
			invitee: {
				includeCustom: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	});

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(3);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + order by', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		include: {
			invitee: true,
		},
	});

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[3]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();

	expect(usersWithInvitee[3]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[0]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		include: {
			invitee: true,
		},
	});

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + where + partial', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		select: {
			id: true,
			name: true,
			invitee: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	});

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial.  Did not select users id, but used it in where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		select: {
			name: true,
			invitee: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	});

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial(true+false)', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		select: {
			id: true,
			name: true,
			verified: false,
			invitee: {
				select: {
					id: true,
					name: true,
					verified: false,
				},
			},
		},
	});

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial(false)', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		select: {
			verified: false,
			invitee: {
				select: {
					name: false,
				},
			},
		},
	});

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, verified: false, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, verified: false, invitedBy: null },
	});
});

/*
	Two first-level relations users+users and users+posts
*/

test('Get user with invitee and posts', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		include: {
			invitee: true,
			posts: true,
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(4);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();
	expect(response[3]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 3,
		include: {
			invitee: true,
			posts: {
				limit: 1,
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + limits + custom fields in each', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 3,
		includeCustom: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		include: {
			invitee: {
				includeCustom: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_invitee_name') }),
			},
			posts: {
				limit: 1,
				includeCustom: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_content') }),
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + custom fields in each', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		includeCustom: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		include: {
			invitee: {
				includeCustom: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
			},
			posts: {
				includeCustom: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_name') }),
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(4);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();
	expect(response[3]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(2);
	expect(response[1]?.posts.length).eq(2);
	expect(response[2]?.posts.length).eq(2);
	expect(response[3]?.posts.length).eq(0);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.1',
			lower: 'post1.1',
			createdAt: response[0]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }, {
			id: 4,
			ownerId: 2,
			content: 'Post2.1',
			lower: 'post2.1',
			createdAt: response[1]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }, {
			id: 6,
			ownerId: 3,
			content: 'Post3.1',
			lower: 'post3.1',
			createdAt: response[2]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		include: {
			invitee: true,
			posts: {
				orderBy: (posts, { desc }) => [desc(posts.id)],
			},
		},
	});

	expect(response.length).eq(4);

	expect(response[3]?.invitee).toBeNull();
	expect(response[2]?.invitee).toBeNull();
	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(2);
	expect(response[3]?.posts.length).eq(2);

	expect(response[3]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 1, content: 'Post1.1', createdAt: response[3]?.posts[0]?.createdAt }, {
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[3]?.posts[1]?.createdAt,
		}],
	});
	expect(response[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2.1', createdAt: response[2]?.posts[0]?.createdAt }, {
			id: 3,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[2]?.posts[1]?.createdAt,
		}],
	});
	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			createdAt: response[3]?.posts[1]?.createdAt,
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 2), eq(users.id, 3))),
		include: {
			invitee: true,
			posts: {
				where: (posts, { eq }) => (eq(posts.ownerId, 2)),
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(2);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(0);

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		limit: 1,
		include: {
			invitee: true,
			posts: {
				where: (posts, { eq }) => (eq(posts.ownerId, 3)),
				limit: 1,
			},
		},
	});

	console.log(JSON.stringify(response, null, 2));

	expect(response.length).eq(1);

	expect(response[0]?.invitee).not.toBeNull();
	expect(response[0]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[0]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + orderBy + where + custom', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: [desc(usersTable.id)],
		where: or(eq(usersTable.id, 3), eq(usersTable.id, 4)),
		includeCustom: {
			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
		},
		include: {
			invitee: true,
			posts: {
				where: eq(postsTable.ownerId, 3),
				orderBy: [desc(postsTable.id)],
				includeCustom: {
					lower: sql<string>`lower(${postsTable.content})`.as('lower_name'),
				},
			},
		},
	});

	expect(response.length).eq(2);

	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);

	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			lower: 'post3',
			createdAt: response[1]?.posts[0]?.createdAt,
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy + where + partial + custom', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: [desc(usersTable.id)],
		where: or(eq(usersTable.id, 3), eq(usersTable.id, 4)),
		includeCustom: {
			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
		},
		select: {
			id: true,
			name: true,
			invitee: {
				select: {
					id: true,
					name: true,
				},
				includeCustom: {
					lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
				},
			},
			posts: {
				select: {
					id: true,
					content: true,
				},
				where: eq(postsTable.ownerId, 3),
				orderBy: [desc(postsTable.id)],
				includeCustom: {
					lower: sql<string>`lower(${postsTable.content})`.as('lower_name'),
				},
			},
		},
	});

	expect(response.length).eq(2);

	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);

	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitee: { id: 1, name: 'Dan', lower: 'dan' },
		posts: [{
			id: 5,
			content: 'Post3',
			lower: 'post3',
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		invitee: { id: 2, name: 'Andrew', lower: 'andrew' },
		posts: [],
	});
});

/*
	One two-level relation users+posts+comments
*/

test('Get user with posts and posts with comments', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
		include: {
			posts: {
				include: {
					comments: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);
	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);
	expect(response[1]?.posts[0]?.comments.length).eq(1);
	expect(response[2]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[1]?.posts[0]?.createdAt,
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	// expect(response[2]).toEqual({
	// 	id: 3,
	// 	name: 'Alex',
	// 	verified: false,
	// 	invitedBy: null,
	// 	posts: [{
	// 		id: 3,
	// 		ownerId: 3,
	// 		content: 'Post3',
	// 		createdAt: response[2]?.posts[0]?.createdAt,
	// 		comments: [
	// 			{
	// 				id: ,
	// 				content: 'Comment3',
	// 				creator: 3,
	// 				postId: 3,
	// 				createdAt: response[2]?.posts[0]?.comments[0]?.createdAt,
	// 			},
	// 		],
	// 	}],
	// });
});

// Get user with limit posts and limit comments

// Get user with custom field + post + comment with custom field

// Get user with limit + posts orderBy + comment orderBy

// Get user with where + posts where + comment where

// Get user with where + posts partial where + comment where

// Get user with where + posts partial where + comment partial(false) where

// Get user with where partial(false) + posts partial where partial(false) + comment partial(false+true) where

// Get user with where + posts partial where + comment where. Didn't select field from where in posts

// Get user with where + posts partial where + comment where. Didn't select field from where for all

// Get with limit+offset in each

/*
	One two-level + One first-level relation users+posts+comments and users+users
*/

/*
	One three-level relation users+posts+comments+comment_owner
*/

test('Get user with posts and posts with comments and comments with owner', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
		include: {
			posts: {
				include: {
					comments: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);
	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);
	expect(response[1]?.posts[0]?.comments.length).eq(1);
	expect(response[2]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[1]?.posts[0]?.createdAt,
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	// expect(response[2]).toEqual({
	// 	id: 3,
	// 	name: 'Alex',
	// 	verified: false,
	// 	invitedBy: null,
	// 	posts: [{
	// 		id: 3,
	// 		ownerId: 3,
	// 		content: 'Post3',
	// 		createdAt: response[2]?.posts[0]?.createdAt,
	// 		comments: [
	// 			{
	// 				id: ,
	// 				content: 'Comment3',
	// 				creator: 3,
	// 				postId: 3,
	// 				createdAt: response[2]?.posts[0]?.comments[0]?.createdAt,
	// 			},
	// 		],
	// 	}],
	// });
});

/*
	One three-level relation + 1 first-level relatioon
	1. users+posts+comments+comment_owner
	2. users+users
*/

/*
	One four-level relation users+posts+comments+coment_likes
*/

/*
	[Find Many] Many-to-many cases

	Users+users_to_groups+groups
*/

test('[Find Many] Get users with groups', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		include: {
			usersToGroups: {
				select: {
					group: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		include: {
			usersToGroups: {
				select: {
					user: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 2,
		include: {
			usersToGroups: {
				limit: 1,
				select: {
					group: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		limit: 2,
		include: {
			usersToGroups: {
				limit: 1,
				select: {
					user: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 1,
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 1),
				select: {
					group: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(1);

	expect(response[0]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + limit + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		limit: 1,
		where: gt(groupsTable.id, 1),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				limit: 1,
				select: {
					user: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(1);

	expect(response[0]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 2),
				select: {
					group: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(0);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		where: gt(groupsTable.id, 1),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				select: {
					user: true,
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(0);

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [],
	});
});

test('[Find Many] Get users with groups + orderBy', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		include: {
			usersToGroups: {
				orderBy: [desc(usersToGroupsTable.groupId)],
				select: {
					group: true,
				},
			},
		},
	});

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(2);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + orderBy', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		orderBy: [desc(groupsTable.id)],
		include: {
			usersToGroups: {
				orderBy: (utg, { desc }) => [desc(utg.userId)],
				select: {
					user: true,
				},
			},
		},
	});

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response[2]).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response[1]).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + orderBy + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		limit: 2,
		include: {
			usersToGroups: {
				limit: 1,
				orderBy: [desc(usersToGroupsTable.groupId)],
				select: {
					group: true,
				},
			},
		},
	});

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}],
	});
});

/*
	[Find One] Many-to-many cases

	Users+users_to_groups+groups
*/

test('[Find One] Get users with groups', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		include: {
			usersToGroups: {
				select: {
					group: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		include: {
			usersToGroups: {
				select: {
					user: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		include: {
			usersToGroups: {
				limit: 1,
				select: {
					group: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		include: {
			usersToGroups: {
				limit: 1,
				select: {
					user: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 1),
				select: {
					group: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + limit + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		where: gt(groupsTable.id, 1),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				limit: 1,
				select: {
					user: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 2),
				select: {
					group: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(0);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [],
	});
});

test('[Find One] Get groups with users + where', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		where: gt(groupsTable.id, 1),
		include: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				select: {
					user: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		orderBy: (users, { desc }) => [desc(users.id)],
		include: {
			usersToGroups: {
				orderBy: [desc(usersToGroupsTable.groupId)],
				select: {
					group: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(2);

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + orderBy', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		orderBy: [desc(groupsTable.id)],
		include: {
			usersToGroups: {
				orderBy: (utg, { desc }) => [desc(utg.userId)],
				select: {
					user: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		orderBy: (users, { desc }) => [desc(users.id)],
		include: {
			usersToGroups: {
				limit: 1,
				orderBy: [desc(usersToGroupsTable.groupId)],
				select: {
					group: true,
				},
			},
		},
	});

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}],
	});
});

test('Get groups with users + orderBy + limit', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		orderBy: [desc(groupsTable.id)],
		limit: 2,
		include: {
			usersToGroups: {
				limit: 1,
				orderBy: (utg, { desc }) => [desc(utg.userId)],
				select: {
					user: true,
				},
			},
		},
	});

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response[1]).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('Get users with groups + custom', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		includeCustom: {
			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
		},
		include: {
			usersToGroups: {
				select: {
					group: {
						includeCustom: {
							lower: sql<string>`lower(${groupsTable.name})`.as('lower_name'),
						},
					},
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				lower: 'group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				lower: 'group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}],
	});
});

test('Get groups with users + custom', async (t) => {
	const { db } = t;

	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		includeCustom: (table, { sql }) => ({
			lower: sql<string>`lower(${table.name})`.as('lower_name'),
		}),
		include: {
			usersToGroups: {
				select: {
					user: {
						includeCustom: (table, { sql }) => ({
							lower: sql<string>`lower(${table.name})`.as('lower_name'),
						}),
					},
				},
			},
		},
	});

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		lower: 'group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				lower: 'dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		lower: 'group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				lower: 'andrew',
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		lower: 'group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

// + custom + where + orderby

// + custom + where + orderby + limit

// + partial

// + partial(false)

// + partial + orderBy + where (all not selected)

/*
	One four-level relation users+posts+comments+coment_likes
	+ users+users_to_groups+groups
*/

/*
	Really hard case
	1. users+posts+comments+coment_likes
	2. users+users_to_groups+groups
	3. users+users
*/
