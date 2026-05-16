import 'dotenv/config';
import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import * as schema from './pg.schema.ts';

const { Client } = pg;

const ENABLE_LOGGING = false;

let pgContainer: Docker.Container;
let db: NodePgDatabase<typeof schema>;
let client: pg.Client;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
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
	db = drizzle(client, { schema, logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
});

beforeEach(async () => {
	await db.execute(sql`drop schema public cascade`);
	await db.execute(sql`create schema public`);

	await db.execute(sql`
		CREATE TABLE "users" (
			"id" bigint PRIMARY KEY,
			"name" text NOT NULL
		);
		CREATE TABLE "posts" (
			"id" bigint PRIMARY KEY,
			"title" text NOT NULL,
			"author_id" bigint NOT NULL REFERENCES "users"("id")
		);
		CREATE TABLE "serials" (
			"id" bigserial PRIMARY KEY,
			"label" text NOT NULL,
			"owner_id" bigint NOT NULL REFERENCES "users"("id")
		);
	`);
});

// Values exceed Number.MAX_SAFE_INTEGER (2^53 - 1 = 9007199254740991);
// JSON.parse on these would silently round if they came back as JSON numbers.
const USER_ID = 1000000000000000001n;
const POST_A_ID = 1000000000000000002n;
const POST_B_ID = 1000000000000000003n;

test('many: bigint ids in nested relation keep precision', async () => {
	await db.insert(schema.usersTable).values({ id: USER_ID, name: 'alice' });
	await db.insert(schema.postsTable).values([
		{ id: POST_A_ID, title: 'foo', authorId: USER_ID },
		{ id: POST_B_ID, title: 'bar', authorId: USER_ID },
	]);

	const result = await db.query.usersTable.findFirst({
		with: { posts: true },
	});

	expect(result).toEqual({
		id: USER_ID,
		name: 'alice',
		posts: [
			{ id: POST_A_ID, title: 'foo', authorId: USER_ID },
			{ id: POST_B_ID, title: 'bar', authorId: USER_ID },
		],
	});
});

test('one: bigint id on parent side of inverse relation keeps precision', async () => {
	await db.insert(schema.usersTable).values({ id: USER_ID, name: 'alice' });
	await db.insert(schema.postsTable).values({ id: POST_A_ID, title: 'foo', authorId: USER_ID });

	const result = await db.query.postsTable.findFirst({
		with: { author: true },
	});

	expect(result).toEqual({
		id: POST_A_ID,
		title: 'foo',
		authorId: USER_ID,
		author: { id: USER_ID, name: 'alice' },
	});
});

test('bigserial id in nested relation keeps precision', async () => {
	await db.insert(schema.usersTable).values({ id: USER_ID, name: 'alice' });
	// Seed bigserial past the safe-integer boundary, then let the sequence
	// allocate the next id naturally.
	await db.execute(sql`SELECT setval('serials_id_seq', 1000000000000000099)`);
	await db.insert(schema.serialsTable).values({ label: 'first', ownerId: USER_ID });

	const result = await db.query.usersTable.findFirst({
		with: { serials: true },
	});

	expect(result?.serials).toHaveLength(1);
	expect(result?.serials[0]!.id).toBe(1000000000000000100n);
	expect(result?.serials[0]!.ownerId).toBe(USER_ID);
});
