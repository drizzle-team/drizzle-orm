import 'dotenv/config';
import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import getPort from 'get-port';
import * as mysql from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schema from './mysql.schema.ts';

const { usersTable, citiesTable, publicUsersTable, parentTable1, childTable1 } = schema;

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

declare module 'vitest' {
	export interface TestContext {
		docker: Docker;
		mysqlContainer: Docker.Container;
		mysqlRelationsSchemaDb: MySql2Database<typeof schema>;
		mysqlClient: mysql.Connection;
	}
}

let globalDocker: Docker;
let mysqlContainer: Docker.Container;
let db: MySql2Database<typeof schema>;
let client: mysql.Connection;

async function createDockerDB(): Promise<string> {
	const docker = (globalDocker = new Docker());
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

beforeAll(async () => {
	const connectionString = process.env['MYSQL_CONNECTION_STRING'] ?? await createDockerDB();

	const sleep = 1000;
	let timeLeft = 30000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await mysql.createConnection(connectionString);
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
		console.error('Cannot connect to MySQL');
		await client?.end().catch(console.error);
		await mysqlContainer?.stop().catch(console.error);
		throw lastError;
	}
	db = drizzle(client, { schema, logger: ENABLE_LOGGING, mode: 'default' });
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await mysqlContainer?.stop().catch(console.error);
});

beforeEach(async (ctx) => {
	ctx.mysqlRelationsSchemaDb = db;
	ctx.mysqlClient = client;
	ctx.docker = globalDocker;
	ctx.mysqlContainer = mysqlContainer;

	await ctx.mysqlRelationsSchemaDb.execute(sql`drop schema if exists public`);
	await ctx.mysqlRelationsSchemaDb.execute(sql`drop schema if exists \`private\``);
	await ctx.mysqlRelationsSchemaDb.execute(sql`drop schema if exists \`Test\``);
	await ctx.mysqlRelationsSchemaDb.execute(sql`drop schema if exists \`Schema2\``);
	await ctx.mysqlRelationsSchemaDb.execute(sql`drop table if exists \`publicUsers\``);
	await ctx.mysqlRelationsSchemaDb.execute(sql`create schema public`);
	await ctx.mysqlRelationsSchemaDb.execute(sql`create schema \`Test\``);
	await ctx.mysqlRelationsSchemaDb.execute(sql`create schema \`Schema2\``);
	await ctx.mysqlRelationsSchemaDb.execute(sql`create schema \`private\``);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE \`private\`.\`users\` (
				\`id\` integer PRIMARY KEY NOT NULL,
				\`password\` text NOT NULL
			);
		`,
	);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE IF NOT EXISTS \`private\`.\`cities\` (
				\`id\` serial PRIMARY KEY NOT NULL,
				\`name\` text NOT NULL,
				\`state\` char(2)
			);
		`,
	);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE if not exists \`publicUsers\` (
				\`id\` serial PRIMARY KEY NOT NULL,
				\`name\` text NOT NULL,
				\`verified\` boolean DEFAULT false NOT NULL,
				\`city_id\` int NOT NULL
			);
		`,
	);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE \`Test\`.\`ParentTable\` (
			  \`Id\` serial PRIMARY KEY NOT NULL,
			  \`Name\` text NOT NULL
			)
		`,
	);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE \`Test\`.\`ChildTable\` (
			  \`Id\` serial PRIMARY KEY NOT NULL,
			  \`ParentId\` int NOT NULL,
			  \`Name\` text NOT NULL
			)
		`,
	);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE \`Schema2\`.\`ParentTable\` (
			  \`Id\` serial PRIMARY KEY NOT NULL,
			  \`Name\` text NOT NULL
			)
		`,
	);
	await ctx.mysqlRelationsSchemaDb.execute(
		sql`
			CREATE TABLE \`Schema2\`.\`ChildTable\` (
			  \`Id\` serial PRIMARY KEY NOT NULL,
			  \`ParentId\` int NOT NULL,
			  \`Name\` text NOT NULL
			)
		`,
	);
});

test('[Find Many] users with private password', async (t) => {
	const { mysqlRelationsSchemaDb: db } = t;

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
	const { mysqlRelationsSchemaDb: db } = t;

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
