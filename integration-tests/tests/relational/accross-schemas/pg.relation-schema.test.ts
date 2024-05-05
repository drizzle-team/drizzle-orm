import 'dotenv/config';
import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schema from './pg.schema.ts';

const { Client } = pg;

const { usersTable, citiesTable, publicUsersTable, parentTable1, childTable1 } = schema;

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

declare module 'vitest' {
	export interface TestContext {
		docker: Docker;
		pgContainer: Docker.Container;
		pgRelationsSchemaDb: NodePgDatabase<typeof schema>;
		pgClient: pg.Client;
	}
}

let globalDocker: Docker;
let pgContainer: Docker.Container;
let db: NodePgDatabase<typeof schema>;
let client: pg.Client;

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

beforeEach(async (ctx) => {
	ctx.pgRelationsSchemaDb = db;
	ctx.pgClient = client;
	ctx.docker = globalDocker;
	ctx.pgContainer = pgContainer;

	await ctx.pgRelationsSchemaDb.execute(sql`drop schema if exists public cascade`);
	await ctx.pgRelationsSchemaDb.execute(sql`drop schema if exists "private" cascade`);
	await ctx.pgRelationsSchemaDb.execute(sql`drop schema if exists "Test" cascade`);
	await ctx.pgRelationsSchemaDb.execute(sql`drop schema if exists "Schema2" cascade`);
	await ctx.pgRelationsSchemaDb.execute(sql`create schema public`);
	await ctx.pgRelationsSchemaDb.execute(sql`create schema "Test"`);
	await ctx.pgRelationsSchemaDb.execute(sql`create schema "Schema2"`);
	await ctx.pgRelationsSchemaDb.execute(
		sql`create schema "private"`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE "private"."users" (
				"id" integer PRIMARY KEY NOT NULL,
				"password" text NOT NULL
			);
		`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "private"."cities" (
				"id" serial PRIMARY KEY NOT NULL,
				"name" text NOT NULL,
				"state" char(2)
			);
		`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE "public"."users" (
				"id" serial PRIMARY KEY NOT NULL,
				"name" text NOT NULL,
				"verified" boolean DEFAULT false NOT NULL,
				"city_id" integer NOT NULL
			);
		`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE "Test"."ParentTable" (
			  "Id" serial PRIMARY KEY NOT NULL,
			  "Name" text NOT NULL
			)
		`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE "Test"."ChildTable" (
			  "Id" serial PRIMARY KEY NOT NULL,
			  "ParentId" integer NOT NULL,
			  "Name" text NOT NULL
			)
		`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE "Schema2"."ParentTable" (
			  "Id" serial PRIMARY KEY NOT NULL,
			  "Name" text NOT NULL
			)
		`,
	);
	await ctx.pgRelationsSchemaDb.execute(
		sql`
			CREATE TABLE "Schema2"."ChildTable" (
			  "Id" serial PRIMARY KEY NOT NULL,
			  "ParentId" integer NOT NULL,
			  "Name" text NOT NULL
			)
		`,
	);
});

test('[Find Many] users with private password', async (t) => {
	const { pgRelationsSchemaDb: db } = t;

	await db.insert(citiesTable).values([
		{ id: 1, name: 'Tampa', state: 'FL' },
		{ id: 2, name: 'Philadelphia', state: 'PA' },
	]);

	await db.insert(publicUsersTable).values([
		{ id: 1, name: 'Dan', cityId: 1 },
		{ id: 2, name: 'Andrew', cityId: 2 },
		{ id: 3, name: 'Alex', cityId: 1 },
	]);

	await db.insert(usersTable).values([
		{ id: 1, password: 'secret' },
		{ id: 2, password: 'secret' },
		{ id: 3, password: 'secret' },
	]);

	const userWithEverything = await db.query.publicUsersTable.findMany({
		with: {
			city: true,
			private: true,
		},
	});

	expectTypeOf(userWithEverything).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		cityId: number | null;
		private: {
			id: number;
			password: string;
		};
		city: {
			id: number;
			name: string;
			state: string | null;
		} | null;
	}[]>();

	expect(userWithEverything.length).eq(3);

	expect(userWithEverything).toEqual(
		[
			{
				id: 1,
				name: 'Dan',
				verified: false,
				cityId: 1,
				city: { id: 1, name: 'Tampa', state: 'FL' },
				private: { id: 1, password: 'secret' },
			},
			{
				id: 2,
				name: 'Andrew',
				verified: false,
				cityId: 2,
				city: { id: 2, name: 'Philadelphia', state: 'PA' },
				private: { id: 2, password: 'secret' },
			},
			{
				id: 3,
				name: 'Alex',
				verified: false,
				cityId: 1,
				city: { id: 1, name: 'Tampa', state: 'FL' },
				private: { id: 3, password: 'secret' },
			},
		],
	);
});

test('[Find Many] parent table with children, repeated names', async (t) => {
	const { pgRelationsSchemaDb: db } = t;

	await db.insert(parentTable1).values([
		{ id: 1, name: 'parent1' },
		{ id: 2, name: 'parent2' },
	]);

	await db.insert(childTable1).values([
		{ id: 1, name: 'child1', parentId: 1 },
		{ id: 2, name: 'child2', parentId: 2 },
		{ id: 3, name: 'child3', parentId: 2 },
	]);

	const parentWithChildren = await db.query.parentTable1.findMany({
		with: {
			children: true,
		},
	});

	expectTypeOf(parentWithChildren).toEqualTypeOf<{
		id: number;
		name: string;
		children: {
			id: number;
			name: string;
			parentId: number;
		}[];
	}[]>();

	expect(parentWithChildren.length).eq(2);

	expect(parentWithChildren).toEqual(
		[
			{
				id: 1,
				name: 'parent1',
				children: [{ id: 1, name: 'child1', parentId: 1 }],
			},
			{
				id: 2,
				name: 'parent2',
				children: [{ id: 2, name: 'child2', parentId: 2 }, { id: 3, name: 'child3', parentId: 2 }],
			},
		],
	);
});
