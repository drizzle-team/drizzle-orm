import 'dotenv/config';
import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schema from './pg.duplicates.ts';

const { Client } = pg;

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

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
	await db.execute(sql`drop table if exists "members"`);
	await db.execute(sql`drop table if exists "artist_to_member"`);
	await db.execute(sql`drop table if exists "artists"`);
	await db.execute(sql`drop table if exists "albums"`);

	await db.execute(
		sql`
			CREATE TABLE "members" (
			    "id" serial PRIMARY KEY NOT NULL,
			    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
				);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE "artist_to_member" (
			    "id" serial PRIMARY KEY NOT NULL,
			    "member_id" int NOT NULL,
			    "artist_id" int NOT NULL);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE "artists" (
			    "id" serial PRIMARY KEY NOT NULL,
			    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    "company_id" int NOT NULL);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE "albums" (
			    "id" serial PRIMARY KEY NOT NULL,
			    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    "artist_id" int NOT NULL);
		`,
	);
});

test('Simple case from GH', async () => {
	await db.insert(schema.artists).values([
		{
			id: 1,
			companyId: 1,
		},
		{
			id: 2,
			companyId: 1,
		},
		{
			id: 3,
			companyId: 1,
		},
	]);

	await db.insert(schema.albums).values([
		{ id: 1, artistId: 1 },
		{ id: 2, artistId: 2 },
		{ id: 3, artistId: 3 },
	]);

	await db.insert(schema.members).values([
		{ id: 1 },
		{ id: 2 },
		{ id: 3 },
	]);

	await db.insert(schema.artistsToMembers).values([
		{ memberId: 1, artistId: 1 },
		{ memberId: 2, artistId: 1 },
		{ memberId: 2, artistId: 2 },
		{ memberId: 3, artistId: 3 },
	]);

	const response = await db.query.artists.findFirst({
		where: (artists, { eq }) => eq(artists.id, 1),
		with: {
			albums: true,
			members: {
				columns: {},
				with: {
					member: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			createdAt: Date;
			updatedAt: Date;
			companyId: number;
			albums: {
				id: number;
				createdAt: Date;
				updatedAt: Date;
				artistId: number;
			}[];
			members: {
				member: {
					id: number;
					createdAt: Date;
					updatedAt: Date;
				};
			}[];
		} | undefined
	>();

	expect(response?.members.length).eq(2);
	expect(response?.albums.length).eq(1);

	expect(response?.albums[0]).toEqual({
		id: 1,
		createdAt: response?.albums[0]?.createdAt,
		updatedAt: response?.albums[0]?.updatedAt,
		artistId: 1,
	});
});
