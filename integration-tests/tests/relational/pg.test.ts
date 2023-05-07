import type { TestFn } from 'ava';
import anyTest from 'ava';
import Docker from 'dockerode';
import { type ExtractTablesWithRelations, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import { Client } from 'pg';
import { v4 as uuid } from 'uuid';
import * as schema from './pg.schema';

type t = ExtractTablesWithRelations<typeof schema>;

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

test.serial('Get users with posts', async (t) => {
	const { db } = t.context;

	// insert user and 5 posts
	// check all
	// check with limit
	// check with custom field
	// check with order by
	// check with where
	// check with partial select

	const usersWithPosts = await db.query.usersTable.findMany({
		include: {
			groups: true,
			posts: true,
			invitee: true,
		},
	});
});
