/* eslint-disable unicorn/template-indent */
import type { TestFn } from 'ava';
import anyTest from 'ava';
import Docker from 'dockerode';
import { type ExtractTablesWithRelations, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import { Client } from 'pg';
import { v4 as uuid } from 'uuid';
import * as schema from './pg.schema';

const { usersTable, postsTable } = schema;

interface Context {
	docker: Docker;
	pgContainer: Docker.Container;
	db: NodePgDatabase<ExtractTablesWithRelations<typeof schema>>;
	client: Client;
}

const test = anyTest as TestFn<Context>;

async function createDockerDB(ctx: Context): Promise<string> {
	const docker = (ctx.docker = new Docker());
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	ctx.pgContainer = await docker.createContainer({
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

	await ctx.pgContainer.start();

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

test.before(async (t) => {
	console.log('here');
	const ctx = t.context;
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? (await createDockerDB(ctx));

	const sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.client = new Client(connectionString);
			await ctx.client.connect();
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
		await ctx.client?.end().catch(console.error);
		await ctx.pgContainer?.stop().catch(console.error);
		throw lastError;
	}
	ctx.db = drizzle(ctx.client, { schema });
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.end().catch(console.error);
	await ctx.pgContainer?.stop().catch(console.error);
});

test.beforeEach(async (t) => {
	const ctx = t.context;
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

test.serial.only('Get users with posts', async (t) => {
	const { db } = t.context;

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

	t.is(usersWithPosts.length, 3);
	t.is(usersWithPosts[0]?.posts.length, 1);
	t.is(usersWithPosts[1]?.posts.length, 1);
	t.is(usersWithPosts[2]?.posts.length, 1);

	t.deepEqual(usersWithPosts[0], {
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test.serial('Get users with posts + limit posts', async (t) => {
	const { db } = t.context;

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

	t.is(usersWithPosts.length, 3);
	t.is(usersWithPosts[0]?.posts.length, 1);
	t.is(usersWithPosts[1]?.posts.length, 1);
	t.is(usersWithPosts[2]?.posts.length, 1);

	//   t.is(usersWithPosts[0]?.posts[0].ownerId, )
});

test.serial('Get users with posts + limit posts and users', async (t) => {
	const { db } = t.context;

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

	t.is(usersWithPosts.length, 2);
	t.is(usersWithPosts[0]?.posts.length, 1);
	t.is(usersWithPosts[1]?.posts.length, 1);

	//   t.is(usersWithPosts[0]?.posts[0].ownerId, )
});

test.serial('Get users with posts + custom fields', async (t) => {
	const { db } = t.context;

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
		includeCustom: () => ({
			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	t.is(usersWithPosts.length, 3);
	t.is(usersWithPosts[0]?.posts.length, 3);
	t.is(usersWithPosts[1]?.posts.length, 2);
	t.is(usersWithPosts[2]?.posts.length, 2);

	//   t.is(usersWithPosts[0]?.posts[0].ownerId, )
});

test.serial('Get users with posts + custom fields + limits', async (t) => {
	const { db } = t.context;

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

	t.is(usersWithPosts.length, 1);
	t.is(usersWithPosts[0]?.posts.length, 1);

	//   t.is(usersWithPosts[0]?.posts[0].ownerId, )
});

test.serial('Get users with posts + orderBy', async (t) => {
	const { db } = t.context;

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
				orderBy: (postsTable, { asc }) => [asc(postsTable.content)],
			},
		},
		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
	});

	t.is(usersWithPosts.length, 3);
	t.is(usersWithPosts[0]?.posts.length, 3);
	t.is(usersWithPosts[1]?.posts.length, 2);
	t.is(usersWithPosts[2]?.posts.length, 2);

	// check order
});
