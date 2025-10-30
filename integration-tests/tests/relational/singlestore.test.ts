// import retry from 'async-retry';
// import Docker from 'dockerode';
// import 'dotenv/config';
// import { desc, DrizzleError, eq, gt, gte, or, placeholder, sql, TransactionRollbackError } from 'drizzle-orm';
// import { drizzle, type SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
// import getPort from 'get-port';
// import * as mysql from 'mysql2/promise';
// import { v4 as uuid } from 'uuid';
// import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
// import * as schema from './singlestore.schema.ts';

// const { usersTable, postsTable, commentsTable, usersToGroupsTable, groupsTable } = schema;

// const ENABLE_LOGGING = false;

// /*
// 	Test cases:
// 	- querying nested relation without PK with additional fields
// */

// declare module 'vitest' {
// 	export interface TestContext {
// 		docker: Docker;
// 		singlestoreContainer: Docker.Container;
// 		singlestoreDb: SingleStoreDriverDatabase<typeof schema>;
// 		singlestoreClient: mysql.Connection;
// 	}
// }

// let globalDocker: Docker;
// let singlestoreContainer: Docker.Container;
// let db: SingleStoreDriverDatabase<typeof schema>;
// let client: mysql.Connection;

// async function createDockerDB(): Promise<string> {
// 	const docker = new Docker();
// 	const port = await getPort({ port: 3306 });
// 	const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

// 	const pullStream = await docker.pull(image);
// 	await new Promise((resolve, reject) =>
// 		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
// 	);

// 	singlestoreContainer = await docker.createContainer({
// 		Image: image,
// 		Env: ['ROOT_PASSWORD=singlestore'],
// 		name: `drizzle-integration-tests-${uuid()}`,
// 		HostConfig: {
// 			AutoRemove: true,
// 			PortBindings: {
// 				'3306/tcp': [{ HostPort: `${port}` }],
// 			},
// 		},
// 	});

// 	await singlestoreContainer.start();
// 	await new Promise((resolve) => setTimeout(resolve, 4000));

// 	return `singlestore://root:singlestore@localhost:${port}/`;
// }

// beforeAll(async () => {
// 	const connectionString = process.env['SINGLESTORE_CONNECTION_STRING'] ?? (await createDockerDB());
// 	client = await retry(async () => {
// 		client = await mysql.createConnection(connectionString);
// 		await client.connect();
// 		return client;
// 	}, {
// 		retries: 20,
// 		factor: 1,
// 		minTimeout: 250,
// 		maxTimeout: 250,
// 		randomize: false,
// 		onRetry() {
// 			client?.end();
// 		},
// 	});

// 	await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
// 	await client.changeUser({ database: 'drizzle' });
// 	db = drizzle(client, { schema, logger: ENABLE_LOGGING });
// });

// afterAll(async () => {
// 	await client?.end().catch(console.error);
// 	await singlestoreContainer?.stop().catch(console.error);
// });

// beforeEach(async (ctx) => {
// 	ctx.singlestoreDb = db;
// 	ctx.singlestoreClient = client;
// 	ctx.docker = globalDocker;
// 	ctx.singlestoreContainer = singlestoreContainer;

// 	await ctx.singlestoreDb.execute(sql`drop table if exists \`users\``);
// 	await ctx.singlestoreDb.execute(sql`drop table if exists \`groups\``);
// 	await ctx.singlestoreDb.execute(sql`drop table if exists \`users_to_groups\``);
// 	await ctx.singlestoreDb.execute(sql`drop table if exists \`posts\``);
// 	await ctx.singlestoreDb.execute(sql`drop table if exists \`comments\``);
// 	await ctx.singlestoreDb.execute(sql`drop table if exists \`comment_likes\``);

// 	await ctx.singlestoreDb.execute(
// 		sql`
// 			CREATE TABLE \`users\` (
// 				\`id\` serial PRIMARY KEY NOT NULL,
// 				\`name\` text NOT NULL,
// 				\`verified\` boolean DEFAULT false NOT NULL,
// 				\`invited_by\` bigint
// 			);
// 		`,
// 	);
// 	await ctx.singlestoreDb.execute(
// 		sql`
// 			CREATE TABLE \`groups\` (
// 				\`id\` serial PRIMARY KEY NOT NULL,
// 				\`name\` text NOT NULL,
// 				\`description\` text
// 			);
// 		`,
// 	);
// 	await ctx.singlestoreDb.execute(
// 		sql`
// 			CREATE TABLE \`users_to_groups\` (
// 				\`id\` serial PRIMARY KEY NOT NULL,
// 				\`user_id\` bigint,
// 				\`group_id\` bigint
// 			);
// 		`,
// 	);
// 	await ctx.singlestoreDb.execute(
// 		sql`
// 			CREATE TABLE \`posts\` (
// 				\`id\` serial PRIMARY KEY NOT NULL,
// 				\`content\` text NOT NULL,
// 				\`owner_id\` bigint,
// 				\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
// 			);
// 		`,
// 	);
// 	await ctx.singlestoreDb.execute(
// 		sql`
// 			CREATE TABLE \`comments\` (
// 				\`id\` serial PRIMARY KEY NOT NULL,
// 				\`content\` text NOT NULL,
// 				\`creator\` bigint,
// 				\`post_id\` bigint,
// 				\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
// 			);
// 		`,
// 	);
// 	await ctx.singlestoreDb.execute(
// 		sql`
// 			CREATE TABLE \`comment_likes\` (
// 				\`id\` serial PRIMARY KEY NOT NULL,
// 				\`creator\` bigint,
// 				\`comment_id\` bigint,
// 				\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
// 			);
// 		`,
// 	);
// });

// /*
// 	[Find Many] One relation users+posts
// */

// test('[Find Many] Get users with posts', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		with: {
// 			posts: true,
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithPosts.length).eq(3);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);
// 	expect(usersWithPosts[1]?.posts.length).eq(1);
// 	expect(usersWithPosts[2]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[2]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find Many] Get users with posts + limit posts', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithPosts.length).eq(3);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);
// 	expect(usersWithPosts[1]?.posts.length).eq(1);
// 	expect(usersWithPosts[2]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[2]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find Many] Get users with posts + limit posts and users', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		limit: 2,
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithPosts.length).eq(2);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);
// 	expect(usersWithPosts[1]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find Many] Get users with posts + custom fields', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		with: {
// 			posts: true,
// 		},
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		lowerName: string;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithPosts.length).toEqual(3);
// 	expect(usersWithPosts[0]?.posts.length).toEqual(3);
// 	expect(usersWithPosts[1]?.posts.length).toEqual(2);
// 	expect(usersWithPosts[2]?.posts.length).toEqual(2);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		lowerName: 'dan',
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }, {
// 			id: 2,
// 			ownerId: 1,
// 			content: 'Post1.2',
// 			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
// 		}, { id: 3, ownerId: 1, content: 'Post1.3', createdAt: usersWithPosts[0]?.posts[2]?.createdAt }],
// 	});
// 	expect(usersWithPosts[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		lowerName: 'andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }, {
// 			id: 5,
// 			ownerId: 2,
// 			content: 'Post2.1',
// 			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(usersWithPosts[2]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lowerName: 'alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }, {
// 			id: 7,
// 			ownerId: 3,
// 			content: 'Post3.1',
// 			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
// 		}],
// 	});
// });

// test.skip('[Find Many] Get users with posts + custom fields + limits', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		limit: 1,
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 		extras: (usersTable, { sql }) => ({
// 			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		lowerName: string;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).toEqual(1);
// 	expect(usersWithPosts[0]?.posts.length).toEqual(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lowerName: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find Many] Get users with posts + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: '1' },
// 		{ ownerId: 1, content: '2' },
// 		{ ownerId: 1, content: '3' },
// 		{ ownerId: 2, content: '4' },
// 		{ ownerId: 2, content: '5' },
// 		{ ownerId: 3, content: '6' },
// 		{ ownerId: 3, content: '7' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		with: {
// 			posts: {
// 				orderBy: (postsTable, { desc }) => [desc(postsTable.content)],
// 			},
// 		},
// 		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(3);
// 	expect(usersWithPosts[0]?.posts.length).eq(2);
// 	expect(usersWithPosts[1]?.posts.length).eq(2);
// 	expect(usersWithPosts[2]?.posts.length).eq(3);

// 	expect(usersWithPosts[2]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 3, ownerId: 1, content: '3', createdAt: usersWithPosts[2]?.posts[2]?.createdAt }, {
// 			id: 2,
// 			ownerId: 1,
// 			content: '2',
// 			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
// 		}, { id: 1, ownerId: 1, content: '1', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 5,
// 			ownerId: 2,
// 			content: '5',
// 			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
// 		}, { id: 4, ownerId: 2, content: '4', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts[0]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 7,
// 			ownerId: 3,
// 			content: '7',
// 			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
// 		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find Many] Get users with posts + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 		with: {
// 			posts: {
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find Many] Get users with posts + where + partial', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {
// 			id: true,
// 			name: true,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: true,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		posts: {
// 			id: number;
// 			content: string;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		posts: [{ id: 1, content: 'Post1' }],
// 	});
// });

// test('[Find Many] Get users with posts + where + partial. Did not select posts id, but used it in where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {
// 			id: true,
// 			name: true,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: true,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		posts: {
// 			id: number;
// 			content: string;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		posts: [{ id: 1, content: 'Post1' }],
// 	});
// });

// test('[Find Many] Get users with posts + where + partial(true + false)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {
// 			id: true,
// 			name: false,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: false,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		posts: {
// 			id: number;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		posts: [{ id: 1 }],
// 	});
// });

// test('[Find Many] Get users with posts + where + partial(false)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {
// 			name: false,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					content: false,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find Many] Get users with posts in transaction', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	let usersWithPosts: {
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[] = [];

// 	await db.transaction(async (tx) => {
// 		await tx.insert(usersTable).values([
// 			{ id: 1, name: 'Dan' },
// 			{ id: 2, name: 'Andrew' },
// 			{ id: 3, name: 'Alex' },
// 		]);

// 		await tx.insert(postsTable).values([
// 			{ ownerId: 1, content: 'Post1' },
// 			{ ownerId: 1, content: 'Post1.1' },
// 			{ ownerId: 2, content: 'Post2' },
// 			{ ownerId: 3, content: 'Post3' },
// 		]);

// 		usersWithPosts = await tx.query.usersTable.findMany({
// 			where: (({ id }, { eq }) => eq(id, 1)),
// 			with: {
// 				posts: {
// 					where: (({ id }, { eq }) => eq(id, 1)),
// 				},
// 			},
// 		});
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find Many] Get users with posts in rollbacked transaction', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	let usersWithPosts: {
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[] = [];

// 	await expect(db.transaction(async (tx) => {
// 		await tx.insert(usersTable).values([
// 			{ id: 1, name: 'Dan' },
// 			{ id: 2, name: 'Andrew' },
// 			{ id: 3, name: 'Alex' },
// 		]);

// 		await tx.insert(postsTable).values([
// 			{ ownerId: 1, content: 'Post1' },
// 			{ ownerId: 1, content: 'Post1.1' },
// 			{ ownerId: 2, content: 'Post2' },
// 			{ ownerId: 3, content: 'Post3' },
// 		]);

// 		tx.rollback();

// 		usersWithPosts = await tx.query.usersTable.findMany({
// 			where: (({ id }, { eq }) => eq(id, 1)),
// 			with: {
// 				posts: {
// 					where: (({ id }, { eq }) => eq(id, 1)),
// 				},
// 			},
// 		});
// 	})).rejects.toThrowError(new TransactionRollbackError());

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(0);
// });

// // select only custom
// test('[Find Many] Get only custom fields', async () => {
// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ id: 1, ownerId: 1, content: 'Post1' },
// 		{ id: 2, ownerId: 1, content: 'Post1.2' },
// 		{ id: 3, ownerId: 1, content: 'Post1.3' },
// 		{ id: 4, ownerId: 2, content: 'Post2' },
// 		{ id: 5, ownerId: 2, content: 'Post2.1' },
// 		{ id: 6, ownerId: 3, content: 'Post3' },
// 		{ id: 7, ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	// Type Assertion
// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		lowerName: string;
// 		posts: {
// 			lowerName: string;
// 		}[];
// 	}[]>();

// 	// General Assertions
// 	expect(usersWithPosts).toHaveLength(3);

// 	// Helper function to find user by lowerName
// 	const findUser = (lowerName: string) => usersWithPosts.find((user) => user.lowerName === lowerName);

// 	// Assertions for each user
// 	const dan = findUser('dan');
// 	const andrew = findUser('andrew');
// 	const alex = findUser('alex');

// 	expect(dan).toBeDefined();
// 	expect(andrew).toBeDefined();
// 	expect(alex).toBeDefined();

// 	// Verify the number of posts for each user
// 	expect(dan?.posts).toHaveLength(3);
// 	expect(andrew?.posts).toHaveLength(2);
// 	expect(alex?.posts).toHaveLength(2);

// 	// Define expected posts for each user
// 	const expectedDanPosts = ['post1', 'post1.2', 'post1.3'];
// 	const expectedAndrewPosts = ['post2', 'post2.1'];
// 	const expectedAlexPosts = ['post3', 'post3.1'];

// 	// Helper function to extract lowerNames from posts
// 	const getPostLowerNames = (posts: { lowerName: string }[]) => posts.map((post) => post.lowerName);

// 	// Assertions for Dan's posts
// 	expect(getPostLowerNames(dan!.posts)).toEqual(expect.arrayContaining(expectedDanPosts));
// 	expect(getPostLowerNames(dan!.posts)).toHaveLength(expectedDanPosts.length);

// 	// Assertions for Andrew's posts
// 	expect(getPostLowerNames(andrew!.posts)).toEqual(expect.arrayContaining(expectedAndrewPosts));
// 	expect(getPostLowerNames(andrew!.posts)).toHaveLength(expectedAndrewPosts.length);

// 	// Assertions for Alex's posts
// 	expect(getPostLowerNames(alex!.posts)).toEqual(expect.arrayContaining(expectedAlexPosts));
// 	expect(getPostLowerNames(alex!.posts)).toHaveLength(expectedAlexPosts.length);
// });

// // select only custom with where clause (Order Agnostic)
// test('[Find Many] Get only custom fields + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	// Insert Users
// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	// Insert Posts
// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	// Query Users with Posts where users.id = 1 and posts.id >= 2
// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				where: gte(postsTable.id, 2),
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		where: eq(usersTable.id, 1),
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	// Type Assertion
// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		lowerName: string;
// 		posts: {
// 			lowerName: string;
// 		}[];
// 	}[]>();

// 	// General Assertions
// 	expect(usersWithPosts).toHaveLength(1);

// 	// Since we expect only one user, we can extract it directly
// 	const danWithPosts = usersWithPosts[0];

// 	// Assert that the user exists and has the correct lowerName
// 	expect(danWithPosts).toBeDefined();
// 	expect(danWithPosts?.lowerName).toBe('dan');

// 	// Assert that the user has the expected number of posts
// 	expect(danWithPosts?.posts).toHaveLength(2);

// 	// Define the expected posts
// 	const expectedPosts = ['post1.2', 'post1.3'];

// 	// Extract the lowerName of each post
// 	const actualPostLowerNames = danWithPosts?.posts.map((post) => post.lowerName);

// 	// Assert that all expected posts are present, regardless of order
// 	for (const expectedPost of expectedPosts) {
// 		expect(actualPostLowerNames).toContain(expectedPost);
// 	}

// 	// Additionally, ensure no unexpected posts are present
// 	expect(actualPostLowerNames).toHaveLength(expectedPosts.length);
// });

// test.skip('[Find Many] Get only custom fields + where + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				where: gte(postsTable.id, 2),
// 				limit: 1,
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		where: eq(usersTable.id, 1),
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		lowerName: string;
// 		posts: {
// 			lowerName: string;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).toEqual(1);
// 	expect(usersWithPosts[0]?.posts.length).toEqual(1);

// 	expect(usersWithPosts).toContainEqual({
// 		lowerName: 'dan',
// 		posts: [{ lowerName: 'post1.2' }],
// 	});
// });

// test.skip('[Find Many] Get only custom fields + where + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findMany({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				where: gte(postsTable.id, 2),
// 				orderBy: [desc(postsTable.id)],
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		where: eq(usersTable.id, 1),
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		lowerName: string;
// 		posts: {
// 			lowerName: string;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).toEqual(1);
// 	expect(usersWithPosts[0]?.posts.length).toEqual(2);

// 	expect(usersWithPosts).toContainEqual({
// 		lowerName: 'dan',
// 		posts: [{ lowerName: 'post1.3' }, { lowerName: 'post1.2' }],
// 	});
// });

// // select only custom find one (Order Agnostic)
// test('[Find One] Get only custom fields (Order Agnostic)', async () => {
// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	// Query to find the first user without any specific order
// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	// Type Assertion
// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			lowerName: string;
// 			posts: {
// 				lowerName: string;
// 			}[];
// 		} | undefined
// 	>();

// 	// General Assertions
// 	expect(usersWithPosts).toBeDefined();

// 	// Since findFirst without orderBy can return any user, we'll verify the returned user and their posts
// 	if (usersWithPosts) {
// 		// Define expected users and their corresponding posts
// 		const expectedUsers: { [key: string]: string[] } = {
// 			dan: ['post1', 'post1.2', 'post1.3'],
// 			andrew: ['post2', 'post2.1'],
// 			alex: ['post3', 'post3.1'],
// 		};

// 		// Verify that the returned user is one of the expected users
// 		expect(Object.keys(expectedUsers)).toContain(usersWithPosts.lowerName);

// 		// Get the expected posts for the returned user
// 		const expectedPosts = expectedUsers[usersWithPosts.lowerName] as string[];

// 		// Verify the number of posts
// 		expect(usersWithPosts.posts).toHaveLength(expectedPosts.length);

// 		// Extract the lowerName of each post
// 		const actualPostLowerNames = usersWithPosts.posts.map((post) => post.lowerName);

// 		// Assert that all expected posts are present, regardless of order
// 		for (const expectedPost of expectedPosts) {
// 			expect(actualPostLowerNames).toContain(expectedPost.toLowerCase());
// 		}
// 	}
// });

// // select only custom find one with where clause (Order Agnostic)
// test('[Find One] Get only custom fields + where (Order Agnostic)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	// Query to find the first user with id = 1 and posts with id >= 2
// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				where: gte(postsTable.id, 2),
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		where: eq(usersTable.id, 1),
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	// Type Assertion
// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			lowerName: string;
// 			posts: {
// 				lowerName: string;
// 			}[];
// 		} | undefined
// 	>();

// 	// General Assertions
// 	expect(usersWithPosts).toBeDefined();

// 	if (usersWithPosts) {
// 		// Assert that the returned user has the expected lowerName
// 		expect(usersWithPosts.lowerName).toBe('dan');

// 		// Assert that the user has exactly two posts
// 		expect(usersWithPosts.posts).toHaveLength(2);

// 		// Define the expected posts
// 		const expectedPosts = ['post1.2', 'post1.3'];

// 		// Extract the lowerName of each post
// 		const actualPostLowerNames = usersWithPosts.posts.map((post) => post.lowerName);

// 		// Assert that all expected posts are present, regardless of order
// 		for (const expectedPost of expectedPosts) {
// 			expect(actualPostLowerNames).toContain(expectedPost.toLowerCase());
// 		}

// 		// Additionally, ensure no unexpected posts are present
// 		expect(actualPostLowerNames).toHaveLength(expectedPosts.length);
// 	}
// });

// test.skip('[Find One] Get only custom fields + where + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				where: gte(postsTable.id, 2),
// 				limit: 1,
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		where: eq(usersTable.id, 1),
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			lowerName: string;
// 			posts: {
// 				lowerName: string;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts?.posts.length).toEqual(1);

// 	expect(usersWithPosts).toEqual({
// 		lowerName: 'dan',
// 		posts: [{ lowerName: 'post1.2' }],
// 	});
// });

// test.skip('[Find One] Get only custom fields + where + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {},
// 		with: {
// 			posts: {
// 				columns: {},
// 				where: gte(postsTable.id, 2),
// 				orderBy: [desc(postsTable.id)],
// 				extras: ({ content }) => ({
// 					lowerName: sql<string>`lower(${content})`.as('content_lower'),
// 				}),
// 			},
// 		},
// 		where: eq(usersTable.id, 1),
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			lowerName: string;
// 			posts: {
// 				lowerName: string;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts?.posts.length).toEqual(2);

// 	expect(usersWithPosts).toEqual({
// 		lowerName: 'dan',
// 		posts: [{ lowerName: 'post1.3' }, { lowerName: 'post1.2' }],
// 	});
// });

// // columns {}
// test('[Find Many] Get select {}', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await expect(
// 		async () =>
// 			await db.query.usersTable.findMany({
// 				columns: {},
// 			}),
// 	).rejects.toThrow(DrizzleError);
// });

// // columns {}
// test('[Find One] Get select {}', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await expect(async () =>
// 		await db.query.usersTable.findFirst({
// 			columns: {},
// 		})
// 	).rejects.toThrow(DrizzleError);
// });

// // deep select {}
// test('[Find Many] Get deep select {}', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	await expect(async () =>
// 		await db.query.usersTable.findMany({
// 			columns: {},
// 			with: {
// 				posts: {
// 					columns: {},
// 				},
// 			},
// 		})
// 	).rejects.toThrow(DrizzleError);
// });

// // deep select {}
// test('[Find One] Get deep select {}', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	await expect(async () =>
// 		await db.query.usersTable.findFirst({
// 			columns: {},
// 			with: {
// 				posts: {
// 					columns: {},
// 				},
// 			},
// 		})
// 	).rejects.toThrow(DrizzleError);
// });

// /*
// 	Prepared statements for users+posts
// */
// test.skip('[Find Many] Get users with posts + prepared limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const prepared = db.query.usersTable.findMany({
// 		with: {
// 			posts: {
// 				limit: placeholder('limit'),
// 			},
// 		},
// 	}).prepare();

// 	const usersWithPosts = await prepared.execute({ limit: 1 });

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(3);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);
// 	expect(usersWithPosts[1]?.posts.length).eq(1);
// 	expect(usersWithPosts[2]?.posts.length).eq(1);

// 	expect(usersWithPosts).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find Many] Get users with posts + prepared limit + offset', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const prepared = db.query.usersTable.findMany({
// 		limit: placeholder('uLimit'),
// 		offset: placeholder('uOffset'),
// 		with: {
// 			posts: {
// 				limit: placeholder('pLimit'),
// 			},
// 		},
// 	}).prepare();

// 	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1 });

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(2);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);
// 	expect(usersWithPosts[1]?.posts.length).eq(1);

// 	expect(usersWithPosts).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(usersWithPosts).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find Many] Get users with posts + prepared where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const prepared = db.query.usersTable.findMany({
// 		where: (({ id }, { eq }) => eq(id, placeholder('id'))),
// 		with: {
// 			posts: {
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 	}).prepare();

// 	const usersWithPosts = await prepared.execute({ id: 1 });

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find Many] Get users with posts + prepared + limit + offset + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const prepared = db.query.usersTable.findMany({
// 		limit: placeholder('uLimit'),
// 		offset: placeholder('uOffset'),
// 		where: (({ id }, { eq, or }) => or(eq(id, placeholder('id')), eq(id, 3))),
// 		with: {
// 			posts: {
// 				where: (({ id }, { eq }) => eq(id, placeholder('pid'))),
// 				limit: placeholder('pLimit'),
// 			},
// 		},
// 	}).prepare();

// 	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 });

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 		}[];
// 	}[]>();

// 	expect(usersWithPosts.length).eq(1);
// 	expect(usersWithPosts[0]?.posts.length).eq(1);

// 	expect(usersWithPosts).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
// 	});
// });

// /*
// 	[Find One] One relation users+posts
// */

// test.only('[Find One] Get users with posts', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: true,
// 		},
// 	});

// 	// Type Assertion
// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	// General Assertions
// 	expect(usersWithPosts).toBeDefined();

// 	if (usersWithPosts) {
// 		const { id, name, posts } = usersWithPosts;

// 		// Verify that the user is one of the inserted users
// 		const validUsers: { [key: number]: string } = {
// 			1: 'dan',
// 			2: 'andrew',
// 			3: 'alex',
// 		};
// 		expect(validUsers[id]).toBe(name.toLowerCase());

// 		// Assert that the user has exactly one post
// 		expect(posts).toHaveLength(1);

// 		const post = posts[0];

// 		// Verify that the post belongs to the user
// 		expect(post?.ownerId).toBe(id);

// 		// Verify that the post content matches the user
// 		const expectedPostContent = `Post${id}`;
// 		expect(post?.content.toLowerCase()).toBe(expectedPostContent.toLowerCase());

// 		// Optionally, verify the presence of `createdAt`
// 		expect(post?.createdAt).toBeInstanceOf(Date);
// 	}
// });

// test.skip('[Find One] Get users with posts + limit posts', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find One] Get users with posts no results found', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts).toBeUndefined();
// });

// test.skip('[Find One] Get users with posts + limit posts and users', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find One] Get users with posts + custom fields', async () => {
// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: true,
// 		},
// 		extras: ({ name }) => ({
// 			lowerName: sql<string>`lower(${name})`.as('name_lower'),
// 		}),
// 	});

// 	// Type Assertion
// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			lowerName: string;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	// General Assertions
// 	expect(usersWithPosts).toBeDefined();

// 	if (usersWithPosts) {
// 		const { id, lowerName, posts } = usersWithPosts;

// 		// Define valid users and their expected lower names
// 		const validUsers: { [key: number]: string } = {
// 			1: 'dan',
// 			2: 'andrew',
// 			3: 'alex',
// 		};

// 		// Verify that the returned user's lowerName matches the expected value
// 		expect(validUsers[id]).toBe(lowerName);

// 		// Define the expected posts based on the user ID
// 		const expectedPostsByUser: Record<number, string[]> = {
// 			1: ['post1', 'post1.2', 'post1.3'],
// 			2: ['post2', 'post2.1'],
// 			3: ['post3', 'post3.1'],
// 		};

// 		// Get the expected posts for the returned user
// 		const expectedPosts = expectedPostsByUser[id] || [];

// 		// Extract the lowerName of each post
// 		const actualPostContents = posts.map((post) => post.content.toLowerCase());

// 		// Assert that all expected posts are present, regardless of order
// 		for (const expectedPost of expectedPosts) {
// 			expect(actualPostContents).toContain(expectedPost.toLowerCase());
// 		}

// 		// Optionally, ensure that no unexpected posts are present
// 		expect(actualPostContents).toHaveLength(expectedPosts.length);
// 	}
// });

// test.skip('[Find One] Get users with posts + custom fields + limits', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.2' },
// 		{ ownerId: 1, content: 'Post1.3' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 		extras: (usersTable, { sql }) => ({
// 			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
// 		}),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			lowerName: string;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).toEqual(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lowerName: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('[Find One] Get users with posts + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: '1' },
// 		{ ownerId: 1, content: '2' },
// 		{ ownerId: 1, content: '3' },
// 		{ ownerId: 2, content: '4' },
// 		{ ownerId: 2, content: '5' },
// 		{ ownerId: 3, content: '6' },
// 		{ ownerId: 3, content: '7' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		with: {
// 			posts: {
// 				orderBy: (postsTable, { desc }) => [desc(postsTable.content)],
// 			},
// 		},
// 		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(2);

// 	expect(usersWithPosts).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 7,
// 			ownerId: 3,
// 			content: '7',
// 			createdAt: usersWithPosts?.posts[1]?.createdAt,
// 		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find One] Get users with posts + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 		with: {
// 			posts: {
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
// 	});
// });

// test('[Find One] Get users with posts + where + partial', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {
// 			id: true,
// 			name: true,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: true,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			posts: {
// 				id: number;
// 				content: string;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		posts: [{ id: 1, content: 'Post1' }],
// 	});
// });

// test.skip('[Find One] Get users with posts + where + partial. Did not select posts id, but used it in where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {
// 			id: true,
// 			name: true,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: true,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			posts: {
// 				id: number;
// 				content: string;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		posts: [{ id: 1, content: 'Post1' }],
// 	});
// });

// test.skip('[Find One] Get users with posts + where + partial(true + false)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {
// 			id: true,
// 			name: false,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: false,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			posts: {
// 				id: number;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		posts: [{ id: 1 }],
// 	});
// });

// test.skip('[Find One] Get users with posts + where + partial(false)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const usersWithPosts = await db.query.usersTable.findFirst({
// 		columns: {
// 			name: false,
// 		},
// 		with: {
// 			posts: {
// 				columns: {
// 					content: false,
// 				},
// 				where: (({ id }, { eq }) => eq(id, 1)),
// 			},
// 		},
// 		where: (({ id }, { eq }) => eq(id, 1)),
// 	});

// 	expectTypeOf(usersWithPosts).toEqualTypeOf<
// 		{
// 			id: number;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				ownerId: number | null;
// 				createdAt: Date;
// 			}[];
// 		} | undefined
// 	>();

// 	expect(usersWithPosts!.posts.length).eq(1);

// 	expect(usersWithPosts).toEqual({
// 		id: 1,
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts?.posts[0]?.createdAt }],
// 	});
// });

// /*
// 	One relation users+users. Self referencing
// */

// test.skip('Get user with invitee', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		with: {
// 			invitee: true,
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithInvitee.length).eq(4);
// 	expect(usersWithInvitee[0]?.invitee).toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).toBeNull();
// 	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[2]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 	});
// 	expect(usersWithInvitee[3]).toEqual({
// 		id: 4,
// 		name: 'John',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
// 	});
// });

// test.skip('Get user + limit with invitee', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew', invitedBy: 1 },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		with: {
// 			invitee: true,
// 		},
// 		limit: 2,
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithInvitee.length).eq(2);
// 	expect(usersWithInvitee[0]?.invitee).toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 	});
// });

// test.skip('Get user with invitee and custom fields', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
// 		with: {
// 			invitee: {
// 				extras: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			lower: string;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				lower: string;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithInvitee.length).eq(4);
// 	expect(usersWithInvitee[0]?.invitee).toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).toBeNull();
// 	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lower: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		lower: 'andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[2]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
// 	});
// 	expect(usersWithInvitee[3]).toEqual({
// 		id: 4,
// 		name: 'John',
// 		lower: 'john',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
// 	});
// });

// test.skip('Get user with invitee and custom fields + limits', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
// 		limit: 3,
// 		with: {
// 			invitee: {
// 				extras: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			lower: string;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				lower: string;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(usersWithInvitee.length).eq(3);
// 	expect(usersWithInvitee[0]?.invitee).toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).toBeNull();
// 	expect(usersWithInvitee[2]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lower: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		lower: 'andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[2]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
// 	});
// });

// test.skip('Get user with invitee + order by', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		orderBy: (users, { desc }) => [desc(users.id)],
// 		with: {
// 			invitee: true,
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	expect(usersWithInvitee.length).eq(4);
// 	expect(usersWithInvitee[3]?.invitee).toBeNull();
// 	expect(usersWithInvitee[2]?.invitee).toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[0]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee[3]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[2]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 	});
// 	expect(usersWithInvitee[1]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 	});
// 	expect(usersWithInvitee[0]).toEqual({
// 		id: 4,
// 		name: 'John',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
// 	});
// });

// test.skip('Get user with invitee + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
// 		with: {
// 			invitee: true,
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	expect(usersWithInvitee.length).eq(2);
// 	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 	});
// 	expect(usersWithInvitee).toContainEqual({
// 		id: 4,
// 		name: 'John',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
// 	});
// });

// test.skip('Get user with invitee + where + partial', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
// 		columns: {
// 			id: true,
// 			name: true,
// 		},
// 		with: {
// 			invitee: {
// 				columns: {
// 					id: true,
// 					name: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			invitee: {
// 				id: number;
// 				name: string;
// 			} | null;
// 		}[]
// 	>();

// 	expect(usersWithInvitee.length).eq(2);
// 	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		invitee: { id: 1, name: 'Dan' },
// 	});
// 	expect(usersWithInvitee).toContainEqual({
// 		id: 4,
// 		name: 'John',
// 		invitee: { id: 2, name: 'Andrew' },
// 	});
// });

// test.skip('Get user with invitee + where + partial.  Did not select users id, but used it in where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
// 		columns: {
// 			name: true,
// 		},
// 		with: {
// 			invitee: {
// 				columns: {
// 					id: true,
// 					name: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			name: string;
// 			invitee: {
// 				id: number;
// 				name: string;
// 			} | null;
// 		}[]
// 	>();

// 	expect(usersWithInvitee.length).eq(2);
// 	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee).toContainEqual({
// 		name: 'Alex',
// 		invitee: { id: 1, name: 'Dan' },
// 	});
// 	expect(usersWithInvitee).toContainEqual({
// 		name: 'John',
// 		invitee: { id: 2, name: 'Andrew' },
// 	});
// });

// test.skip('Get user with invitee + where + partial(true+false)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
// 		columns: {
// 			id: true,
// 			name: true,
// 			verified: false,
// 		},
// 		with: {
// 			invitee: {
// 				columns: {
// 					id: true,
// 					name: true,
// 					verified: false,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			invitee: {
// 				id: number;
// 				name: string;
// 			} | null;
// 		}[]
// 	>();

// 	expect(usersWithInvitee.length).eq(2);
// 	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		invitee: { id: 1, name: 'Dan' },
// 	});
// 	expect(usersWithInvitee).toContainEqual({
// 		id: 4,
// 		name: 'John',
// 		invitee: { id: 2, name: 'Andrew' },
// 	});
// });

// test.skip('Get user with invitee + where + partial(false)', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	const usersWithInvitee = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
// 		columns: {
// 			verified: false,
// 		},
// 		with: {
// 			invitee: {
// 				columns: {
// 					name: false,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(usersWithInvitee).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			invitedBy: number | null;
// 			invitee: {
// 				id: number;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	expect(usersWithInvitee.length).eq(2);
// 	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
// 	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

// 	expect(usersWithInvitee).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		invitedBy: 1,
// 		invitee: { id: 1, verified: false, invitedBy: null },
// 	});
// 	expect(usersWithInvitee).toContainEqual({
// 		id: 4,
// 		name: 'John',
// 		invitedBy: 2,
// 		invitee: { id: 2, verified: false, invitedBy: null },
// 	});
// });

// /*
// 	Two first-level relations users+users and users+posts
// */

// test.skip('Get user with invitee and posts', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		with: {
// 			invitee: true,
// 			posts: true,
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(4);

// 	expect(response[0]?.invitee).toBeNull();
// 	expect(response[1]?.invitee).toBeNull();
// 	expect(response[2]?.invitee).not.toBeNull();
// 	expect(response[3]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(1);
// 	expect(response[1]?.posts.length).eq(1);
// 	expect(response[2]?.posts.length).eq(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 4,
// 		name: 'John',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
// 		posts: [],
// 	});
// });

// test.skip('Get user with invitee and posts + limit posts and users', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		limit: 3,
// 		with: {
// 			invitee: true,
// 			posts: {
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(3);

// 	expect(response[0]?.invitee).toBeNull();
// 	expect(response[1]?.invitee).toBeNull();
// 	expect(response[2]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(1);
// 	expect(response[1]?.posts.length).eq(1);
// 	expect(response[2]?.posts.length).eq(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 3, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('Get user with invitee and posts + limits + custom fields in each', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		limit: 3,
// 		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
// 		with: {
// 			invitee: {
// 				extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_invitee_name') }),
// 			},
// 			posts: {
// 				limit: 1,
// 				extras: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_content') }),
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			lower: string;
// 			invitedBy: number | null;
// 			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				lower: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(3);

// 	expect(response[0]?.invitee).toBeNull();
// 	expect(response[1]?.invitee).toBeNull();
// 	expect(response[2]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(1);
// 	expect(response[1]?.posts.length).eq(1);
// 	expect(response[2]?.posts.length).eq(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lower: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		lower: 'andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
// 		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('Get user with invitee and posts + custom fields in each', async () => {
// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
// 		with: {
// 			invitee: {
// 				extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
// 			},
// 			posts: {
// 				extras: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_name') }),
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			lower: string;
// 			invitedBy: number | null;
// 			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				lower: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	response[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	response[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
// 	response[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(4);

// 	expect(response[0]?.invitee).toBeNull();
// 	expect(response[1]?.invitee).toBeNull();
// 	expect(response[2]?.invitee).not.toBeNull();
// 	expect(response[3]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(2);
// 	expect(response[1]?.posts.length).eq(2);
// 	expect(response[2]?.posts.length).eq(2);
// 	expect(response[3]?.posts.length).eq(0);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lower: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }, {
// 			id: 2,
// 			ownerId: 1,
// 			content: 'Post1.1',
// 			lower: 'post1.1',
// 			createdAt: response[0]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		lower: 'andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }, {
// 			id: 4,
// 			ownerId: 2,
// 			content: 'Post2.1',
// 			lower: 'post2.1',
// 			createdAt: response[1]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
// 		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }, {
// 			id: 6,
// 			ownerId: 3,
// 			content: 'Post3.1',
// 			lower: 'post3.1',
// 			createdAt: response[2]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(response).toContainEqual({
// 		id: 4,
// 		name: 'John',
// 		lower: 'john',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
// 		posts: [],
// 	});
// });

// test.skip('Get user with invitee and posts + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		orderBy: (users, { desc }) => [desc(users.id)],
// 		with: {
// 			invitee: true,
// 			posts: {
// 				orderBy: (posts, { desc }) => [desc(posts.id)],
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	expect(response.length).eq(4);

// 	expect(response[3]?.invitee).toBeNull();
// 	expect(response[2]?.invitee).toBeNull();
// 	expect(response[1]?.invitee).not.toBeNull();
// 	expect(response[0]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(0);
// 	expect(response[1]?.posts.length).eq(1);
// 	expect(response[2]?.posts.length).eq(2);
// 	expect(response[3]?.posts.length).eq(2);

// 	expect(response[3]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 2, ownerId: 1, content: 'Post1.1', createdAt: response[3]?.posts[0]?.createdAt }, {
// 			id: 1,
// 			ownerId: 1,
// 			content: 'Post1',
// 			createdAt: response[3]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(response[2]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 4, ownerId: 2, content: 'Post2.1', createdAt: response[2]?.posts[0]?.createdAt }, {
// 			id: 3,
// 			ownerId: 2,
// 			content: 'Post2',
// 			createdAt: response[2]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(response[1]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 		posts: [{
// 			id: 5,
// 			ownerId: 3,
// 			content: 'Post3',
// 			createdAt: response[3]?.posts[1]?.createdAt,
// 		}],
// 	});
// 	expect(response[0]).toEqual({
// 		id: 4,
// 		name: 'John',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
// 		posts: [],
// 	});
// });

// test.skip('Get user with invitee and posts + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 2), eq(users.id, 3))),
// 		with: {
// 			invitee: true,
// 			posts: {
// 				where: (posts, { eq }) => (eq(posts.ownerId, 2)),
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(2);

// 	expect(response[0]?.invitee).toBeNull();
// 	expect(response[1]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(1);
// 	expect(response[1]?.posts.length).eq(0);

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		invitee: null,
// 		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[0]?.posts[0]?.createdAt }],
// 	});
// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 		posts: [],
// 	});
// });

// test.skip('Get user with invitee and posts + limit posts and users + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 		{ ownerId: 3, content: 'Post3.1' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
// 		limit: 1,
// 		with: {
// 			invitee: true,
// 			posts: {
// 				where: (posts, { eq }) => (eq(posts.ownerId, 3)),
// 				limit: 1,
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	expect(response.length).eq(1);

// 	expect(response[0]?.invitee).not.toBeNull();
// 	expect(response[0]?.posts.length).eq(1);

// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[0]?.posts[0]?.createdAt }],
// 	});
// });

// test.skip('Get user with invitee and posts + orderBy + where + custom', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		orderBy: [desc(usersTable.id)],
// 		where: or(eq(usersTable.id, 3), eq(usersTable.id, 4)),
// 		extras: {
// 			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
// 		},
// 		with: {
// 			invitee: true,
// 			posts: {
// 				where: eq(postsTable.ownerId, 3),
// 				orderBy: [desc(postsTable.id)],
// 				extras: {
// 					lower: sql<string>`lower(${postsTable.content})`.as('lower_name'),
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			lower: string;
// 			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			} | null;
// 		}[]
// 	>();

// 	expect(response.length).eq(2);

// 	expect(response[1]?.invitee).not.toBeNull();
// 	expect(response[0]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(0);
// 	expect(response[1]?.posts.length).eq(1);

// 	expect(response[1]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		verified: false,
// 		invitedBy: 1,
// 		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
// 		posts: [{
// 			id: 5,
// 			ownerId: 3,
// 			content: 'Post3',
// 			lower: 'post3',
// 			createdAt: response[1]?.posts[0]?.createdAt,
// 		}],
// 	});
// 	expect(response[0]).toEqual({
// 		id: 4,
// 		name: 'John',
// 		lower: 'john',
// 		verified: false,
// 		invitedBy: 2,
// 		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
// 		posts: [],
// 	});
// });

// test.skip('Get user with invitee and posts + orderBy + where + partial + custom', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex', invitedBy: 1 },
// 		{ id: 4, name: 'John', invitedBy: 2 },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ ownerId: 1, content: 'Post1' },
// 		{ ownerId: 1, content: 'Post1.1' },
// 		{ ownerId: 2, content: 'Post2' },
// 		{ ownerId: 2, content: 'Post2.1' },
// 		{ ownerId: 3, content: 'Post3' },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		orderBy: [desc(usersTable.id)],
// 		where: or(eq(usersTable.id, 3), eq(usersTable.id, 4)),
// 		extras: {
// 			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
// 		},
// 		columns: {
// 			id: true,
// 			name: true,
// 		},
// 		with: {
// 			invitee: {
// 				columns: {
// 					id: true,
// 					name: true,
// 				},
// 				extras: {
// 					lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
// 				},
// 			},
// 			posts: {
// 				columns: {
// 					id: true,
// 					content: true,
// 				},
// 				where: eq(postsTable.ownerId, 3),
// 				orderBy: [desc(postsTable.id)],
// 				extras: {
// 					lower: sql<string>`lower(${postsTable.content})`.as('lower_name'),
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			lower: string;
// 			posts: { id: number; lower: string; content: string }[];
// 			invitee: {
// 				id: number;
// 				name: string;
// 				lower: string;
// 			} | null;
// 		}[]
// 	>();

// 	expect(response.length).eq(2);

// 	expect(response[1]?.invitee).not.toBeNull();
// 	expect(response[0]?.invitee).not.toBeNull();

// 	expect(response[0]?.posts.length).eq(0);
// 	expect(response[1]?.posts.length).eq(1);

// 	expect(response[1]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		invitee: { id: 1, name: 'Dan', lower: 'dan' },
// 		posts: [{
// 			id: 5,
// 			content: 'Post3',
// 			lower: 'post3',
// 		}],
// 	});
// 	expect(response[0]).toEqual({
// 		id: 4,
// 		name: 'John',
// 		lower: 'john',
// 		invitee: { id: 2, name: 'Andrew', lower: 'andrew' },
// 		posts: [],
// 	});
// });

// /*
// 	One two-level relation users+posts+comments
// */

// test.skip('Get user with posts and posts with comments', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ id: 1, ownerId: 1, content: 'Post1' },
// 		{ id: 2, ownerId: 2, content: 'Post2' },
// 		{ id: 3, ownerId: 3, content: 'Post3' },
// 	]);

// 	await db.insert(commentsTable).values([
// 		{ postId: 1, content: 'Comment1', creator: 2 },
// 		{ postId: 2, content: 'Comment2', creator: 2 },
// 		{ postId: 3, content: 'Comment3', creator: 3 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		with: {
// 			posts: {
// 				with: {
// 					comments: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			posts: {
// 				id: number;
// 				content: string;
// 				ownerId: number | null;
// 				createdAt: Date;
// 				comments: {
// 					id: number;
// 					content: string;
// 					createdAt: Date;
// 					creator: number | null;
// 					postId: number | null;
// 				}[];
// 			}[];
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(3);
// 	expect(response[0]?.posts.length).eq(1);
// 	expect(response[1]?.posts.length).eq(1);
// 	expect(response[2]?.posts.length).eq(1);

// 	expect(response[0]?.posts[0]?.comments.length).eq(1);
// 	expect(response[1]?.posts[0]?.comments.length).eq(1);
// 	expect(response[2]?.posts[0]?.comments.length).eq(1);

// 	expect(response[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 1,
// 			ownerId: 1,
// 			content: 'Post1',
// 			createdAt: response[0]?.posts[0]?.createdAt,
// 			comments: [
// 				{
// 					id: 1,
// 					content: 'Comment1',
// 					creator: 2,
// 					postId: 1,
// 					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
// 				},
// 			],
// 		}],
// 	});
// 	expect(response[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 2,
// 			ownerId: 2,
// 			content: 'Post2',
// 			createdAt: response[1]?.posts[0]?.createdAt,
// 			comments: [
// 				{
// 					id: 2,
// 					content: 'Comment2',
// 					creator: 2,
// 					postId: 2,
// 					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
// 				},
// 			],
// 		}],
// 	});
// 	// expect(response[2]).toEqual({
// 	// 	id: 3,
// 	// 	name: 'Alex',
// 	// 	verified: false,
// 	// 	invitedBy: null,
// 	// 	posts: [{
// 	// 		id: 3,
// 	// 		ownerId: 3,
// 	// 		content: 'Post3',
// 	// 		createdAt: response[2]?.posts[0]?.createdAt,
// 	// 		comments: [
// 	// 			{
// 	// 				id: ,
// 	// 				content: 'Comment3',
// 	// 				creator: 3,
// 	// 				postId: 3,
// 	// 				createdAt: response[2]?.posts[0]?.comments[0]?.createdAt,
// 	// 			},
// 	// 		],
// 	// 	}],
// 	// });
// });

// // Get user with limit posts and limit comments

// // Get user with custom field + post + comment with custom field

// // Get user with limit + posts orderBy + comment orderBy

// // Get user with where + posts where + comment where

// // Get user with where + posts partial where + comment where

// // Get user with where + posts partial where + comment partial(false) where

// // Get user with where partial(false) + posts partial where partial(false) + comment partial(false+true) where

// // Get user with where + posts partial where + comment where. Didn't select field from where in posts

// // Get user with where + posts partial where + comment where. Didn't select field from where for all

// // Get with limit+offset in each

// /*
// 	One two-level + One first-level relation users+posts+comments and users+users
// */

// /*
// 	One three-level relation users+posts+comments+comment_owner
// */

// test.skip('Get user with posts and posts with comments and comments with owner', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ id: 1, ownerId: 1, content: 'Post1' },
// 		{ id: 2, ownerId: 2, content: 'Post2' },
// 		{ id: 3, ownerId: 3, content: 'Post3' },
// 	]);

// 	await db.insert(commentsTable).values([
// 		{ postId: 1, content: 'Comment1', creator: 2 },
// 		{ postId: 2, content: 'Comment2', creator: 2 },
// 		{ postId: 3, content: 'Comment3', creator: 3 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		with: {
// 			posts: {
// 				with: {
// 					comments: {
// 						with: {
// 							author: true,
// 						},
// 					},
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 			comments: {
// 				id: number;
// 				content: string;
// 				createdAt: Date;
// 				creator: number | null;
// 				postId: number | null;
// 				author: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				} | null;
// 			}[];
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).eq(3);
// 	expect(response[0]?.posts.length).eq(1);
// 	expect(response[1]?.posts.length).eq(1);
// 	expect(response[2]?.posts.length).eq(1);

// 	expect(response[0]?.posts[0]?.comments.length).eq(1);
// 	expect(response[1]?.posts[0]?.comments.length).eq(1);
// 	expect(response[2]?.posts[0]?.comments.length).eq(1);

// 	expect(response[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 1,
// 			ownerId: 1,
// 			content: 'Post1',
// 			createdAt: response[0]?.posts[0]?.createdAt,
// 			comments: [
// 				{
// 					id: 1,
// 					content: 'Comment1',
// 					creator: 2,
// 					author: {
// 						id: 2,
// 						name: 'Andrew',
// 						verified: false,
// 						invitedBy: null,
// 					},
// 					postId: 1,
// 					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
// 				},
// 			],
// 		}],
// 	});
// 	expect(response[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 2,
// 			ownerId: 2,
// 			content: 'Post2',
// 			createdAt: response[1]?.posts[0]?.createdAt,
// 			comments: [
// 				{
// 					id: 2,
// 					content: 'Comment2',
// 					creator: 2,
// 					author: {
// 						id: 2,
// 						name: 'Andrew',
// 						verified: false,
// 						invitedBy: null,
// 					},
// 					postId: 2,
// 					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
// 				},
// 			],
// 		}],
// 	});
// });

// test.skip('Get user with posts and posts with comments and comments with owner where exists', async () => {
// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(postsTable).values([
// 		{ id: 1, ownerId: 1, content: 'Post1' },
// 		{ id: 2, ownerId: 2, content: 'Post2' },
// 		{ id: 3, ownerId: 3, content: 'Post3' },
// 	]);

// 	await db.insert(commentsTable).values([
// 		{ postId: 1, content: 'Comment1', creator: 2 },
// 		{ postId: 2, content: 'Comment2', creator: 2 },
// 		{ postId: 3, content: 'Comment3', creator: 3 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		with: {
// 			posts: {
// 				with: {
// 					comments: {
// 						with: {
// 							author: true,
// 						},
// 					},
// 				},
// 			},
// 		},
// 		where: (table, { exists, eq }) => exists(db.select({ one: sql`1` }).from(usersTable).where(eq(sql`1`, table.id))),
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		posts: {
// 			id: number;
// 			content: string;
// 			ownerId: number | null;
// 			createdAt: Date;
// 			comments: {
// 				id: number;
// 				content: string;
// 				createdAt: Date;
// 				creator: number | null;
// 				postId: number | null;
// 				author: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				} | null;
// 			}[];
// 		}[];
// 	}[]>();

// 	expect(response.length).eq(1);
// 	expect(response[0]?.posts.length).eq(1);

// 	expect(response[0]?.posts[0]?.comments.length).eq(1);

// 	expect(response[0]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		posts: [{
// 			id: 1,
// 			ownerId: 1,
// 			content: 'Post1',
// 			createdAt: response[0]?.posts[0]?.createdAt,
// 			comments: [
// 				{
// 					id: 1,
// 					content: 'Comment1',
// 					creator: 2,
// 					author: {
// 						id: 2,
// 						name: 'Andrew',
// 						verified: false,
// 						invitedBy: null,
// 					},
// 					postId: 1,
// 					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
// 				},
// 			],
// 		}],
// 	});
// });

// /*
// 	One three-level relation + 1 first-level relatioon
// 	1. users+posts+comments+comment_owner
// 	2. users+users
// */

// /*
// 	One four-level relation users+posts+comments+coment_likes
// */

// /*
// 	[Find Many] Many-to-many cases

// 	Users+users_to_groups+groups
// */

// test.skip('[Find Many] Get users with groups', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		with: {
// 			usersToGroups: {
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		usersToGroups: {
// 			group: {
// 				id: number;
// 				name: string;
// 				description: string | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(3);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);
// 	expect(response[2]?.usersToGroups.length).toEqual(2);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 3,
// 				name: 'Group3',
// 				description: null,
// 			},
// 		}, {
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get groups with users', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		with: {
// 			usersToGroups: {
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		description: string | null;
// 		usersToGroups: {
// 			user: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(3);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(2);
// 	expect(response[2]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Group1',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 1,
// 				name: 'Dan',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}, {
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Group3',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get users with groups + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 2, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		limit: 2,
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		usersToGroups: {
// 			group: {
// 				id: number;
// 				name: string;
// 				description: string | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(2);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get groups with users + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		limit: 2,
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		description: string | null;
// 		usersToGroups: {
// 			user: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(2);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Group1',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 1,
// 				name: 'Dan',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get users with groups + limit + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 2, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		limit: 1,
// 		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.groupId, 1),
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		usersToGroups: {
// 			group: {
// 				id: number;
// 				name: string;
// 				description: string | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(1);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get groups with users + limit + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		limit: 1,
// 		where: gt(groupsTable.id, 1),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.userId, 2),
// 				limit: 1,
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		description: string | null;
// 		usersToGroups: {
// 			user: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(1);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get users with groups + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 2, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.groupId, 2),
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		usersToGroups: {
// 			group: {
// 				id: number;
// 				name: string;
// 				description: string | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(2);

// 	expect(response[0]?.usersToGroups.length).toEqual(0);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get groups with users + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		where: gt(groupsTable.id, 1),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.userId, 2),
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		description: string | null;
// 		usersToGroups: {
// 			user: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			};
// 		}[];
// 	}[]>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(2);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(0);

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Group3',
// 		description: null,
// 		usersToGroups: [],
// 	});
// });

// test.skip('[Find Many] Get users with groups + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		orderBy: (users, { desc }) => [desc(users.id)],
// 		with: {
// 			usersToGroups: {
// 				orderBy: [desc(usersToGroupsTable.groupId)],
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		usersToGroups: {
// 			group: {
// 				id: number;
// 				name: string;
// 				description: string | null;
// 			};
// 		}[];
// 	}[]>();

// 	expect(response.length).toEqual(3);

// 	expect(response[0]?.usersToGroups.length).toEqual(2);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);
// 	expect(response[2]?.usersToGroups.length).toEqual(1);

// 	expect(response[2]).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response[0]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 3,
// 				name: 'Group3',
// 				description: null,
// 			},
// 		}, {
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get groups with users + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		orderBy: [desc(groupsTable.id)],
// 		with: {
// 			usersToGroups: {
// 				orderBy: (utg, { desc }) => [desc(utg.userId)],
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		description: string | null;
// 		usersToGroups: {
// 			user: {
// 				id: number;
// 				name: string;
// 				verified: boolean;
// 				invitedBy: number | null;
// 			};
// 		}[];
// 	}[]>();

// 	expect(response.length).toEqual(3);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(2);
// 	expect(response[2]?.usersToGroups.length).toEqual(1);

// 	expect(response[2]).toEqual({
// 		id: 1,
// 		name: 'Group1',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 1,
// 				name: 'Dan',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response[1]).toEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}, {
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response[0]).toEqual({
// 		id: 3,
// 		name: 'Group3',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find Many] Get users with groups + orderBy + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		orderBy: (users, { desc }) => [desc(users.id)],
// 		limit: 2,
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				orderBy: [desc(usersToGroupsTable.groupId)],
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<{
// 		id: number;
// 		name: string;
// 		verified: boolean;
// 		invitedBy: number | null;
// 		usersToGroups: {
// 			group: {
// 				id: number;
// 				name: string;
// 				description: string | null;
// 			};
// 		}[];
// 	}[]>();

// 	expect(response.length).toEqual(2);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);

// 	expect(response[1]).toEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response[0]).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 3,
// 				name: 'Group3',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// /*
// 	[Find One] Many-to-many cases

// 	Users+users_to_groups+groups
// */

// test.skip('[Find One] Get users with groups', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findFirst({
// 		with: {
// 			usersToGroups: {
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get groups with users', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findFirst({
// 		with: {
// 			usersToGroups: {
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 1,
// 		name: 'Group1',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 1,
// 				name: 'Dan',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get users with groups + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 2, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findFirst({
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get groups with users + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findFirst({
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 1,
// 		name: 'Group1',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 1,
// 				name: 'Dan',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get users with groups + limit + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 2, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findFirst({
// 		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.groupId, 1),
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get groups with users + limit + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findFirst({
// 		where: gt(groupsTable.id, 1),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.userId, 2),
// 				limit: 1,
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get users with groups + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 2, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findFirst({
// 		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.groupId, 2),
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(0);

// 	expect(response).toEqual({
// 		id: 1,
// 		name: 'Dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [],
// 	});
// });

// test.skip('[Find One] Get groups with users + where', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findFirst({
// 		where: gt(groupsTable.id, 1),
// 		with: {
// 			usersToGroups: {
// 				where: eq(usersToGroupsTable.userId, 2),
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get users with groups + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findFirst({
// 		orderBy: (users, { desc }) => [desc(users.id)],
// 		with: {
// 			usersToGroups: {
// 				orderBy: [desc(usersToGroupsTable.groupId)],
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(2);

// 	expect(response).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 3,
// 				name: 'Group3',
// 				description: null,
// 			},
// 		}, {
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get groups with users + orderBy', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findFirst({
// 		orderBy: [desc(groupsTable.id)],
// 		with: {
// 			usersToGroups: {
// 				orderBy: (utg, { desc }) => [desc(utg.userId)],
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 3,
// 		name: 'Group3',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('[Find One] Get users with groups + orderBy + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findFirst({
// 		orderBy: (users, { desc }) => [desc(users.id)],
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				orderBy: [desc(usersToGroupsTable.groupId)],
// 				columns: {},
// 				with: {
// 					group: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 				};
// 			}[];
// 		} | undefined
// 	>();

// 	expect(response?.usersToGroups.length).toEqual(1);

// 	expect(response).toEqual({
// 		id: 3,
// 		name: 'Alex',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 3,
// 				name: 'Group3',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('Get groups with users + orderBy + limit', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		orderBy: [desc(groupsTable.id)],
// 		limit: 2,
// 		with: {
// 			usersToGroups: {
// 				limit: 1,
// 				orderBy: (utg, { desc }) => [desc(utg.userId)],
// 				columns: {},
// 				with: {
// 					user: true,
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 				};
// 			}[];
// 		}[]
// 	>();

// 	expect(response.length).toEqual(2);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);

// 	expect(response[1]).toEqual({
// 		id: 2,
// 		name: 'Group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response[0]).toEqual({
// 		id: 3,
// 		name: 'Group3',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test.skip('Get users with groups + custom', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.usersTable.findMany({
// 		extras: {
// 			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
// 		},
// 		with: {
// 			usersToGroups: {
// 				columns: {},
// 				with: {
// 					group: {
// 						extras: {
// 							lower: sql<string>`lower(${groupsTable.name})`.as('lower_name'),
// 						},
// 					},
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			verified: boolean;
// 			invitedBy: number | null;
// 			lower: string;
// 			usersToGroups: {
// 				group: {
// 					id: number;
// 					name: string;
// 					description: string | null;
// 					lower: string;
// 				};
// 			}[];
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(3);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(1);
// 	expect(response[2]?.usersToGroups.length).toEqual(2);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Dan',
// 		lower: 'dan',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 1,
// 				name: 'Group1',
// 				lower: 'group1',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Andrew',
// 		lower: 'andrew',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				lower: 'group2',
// 				description: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Alex',
// 		lower: 'alex',
// 		verified: false,
// 		invitedBy: null,
// 		usersToGroups: [{
// 			group: {
// 				id: 3,
// 				name: 'Group3',
// 				lower: 'group3',
// 				description: null,
// 			},
// 		}, {
// 			group: {
// 				id: 2,
// 				name: 'Group2',
// 				lower: 'group2',
// 				description: null,
// 			},
// 		}],
// 	});
// });

// test.skip('Get groups with users + custom', async (t) => {
// 	const { singlestoreDb: db } = t;

// 	await db.insert(usersTable).values([
// 		{ id: 1, name: 'Dan' },
// 		{ id: 2, name: 'Andrew' },
// 		{ id: 3, name: 'Alex' },
// 	]);

// 	await db.insert(groupsTable).values([
// 		{ id: 1, name: 'Group1' },
// 		{ id: 2, name: 'Group2' },
// 		{ id: 3, name: 'Group3' },
// 	]);

// 	await db.insert(usersToGroupsTable).values([
// 		{ userId: 1, groupId: 1 },
// 		{ userId: 2, groupId: 2 },
// 		{ userId: 3, groupId: 3 },
// 		{ userId: 3, groupId: 2 },
// 	]);

// 	const response = await db.query.groupsTable.findMany({
// 		extras: (table, { sql }) => ({
// 			lower: sql<string>`lower(${table.name})`.as('lower_name'),
// 		}),
// 		with: {
// 			usersToGroups: {
// 				columns: {},
// 				with: {
// 					user: {
// 						extras: (table, { sql }) => ({
// 							lower: sql<string>`lower(${table.name})`.as('lower_name'),
// 						}),
// 					},
// 				},
// 			},
// 		},
// 	});

// 	expectTypeOf(response).toEqualTypeOf<
// 		{
// 			id: number;
// 			name: string;
// 			description: string | null;
// 			lower: string;
// 			usersToGroups: {
// 				user: {
// 					id: number;
// 					name: string;
// 					verified: boolean;
// 					invitedBy: number | null;
// 					lower: string;
// 				};
// 			}[];
// 		}[]
// 	>();

// 	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

// 	expect(response.length).toEqual(3);

// 	expect(response[0]?.usersToGroups.length).toEqual(1);
// 	expect(response[1]?.usersToGroups.length).toEqual(2);
// 	expect(response[2]?.usersToGroups.length).toEqual(1);

// 	expect(response).toContainEqual({
// 		id: 1,
// 		name: 'Group1',
// 		lower: 'group1',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 1,
// 				name: 'Dan',
// 				lower: 'dan',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 2,
// 		name: 'Group2',
// 		lower: 'group2',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 2,
// 				name: 'Andrew',
// 				lower: 'andrew',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}, {
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				lower: 'alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});

// 	expect(response).toContainEqual({
// 		id: 3,
// 		name: 'Group3',
// 		lower: 'group3',
// 		description: null,
// 		usersToGroups: [{
// 			user: {
// 				id: 3,
// 				name: 'Alex',
// 				lower: 'alex',
// 				verified: false,
// 				invitedBy: null,
// 			},
// 		}],
// 	});
// });

// test('.toSQL()', () => {
// 	const query = db.query.usersTable.findFirst().toSQL();

// 	expect(query).toHaveProperty('sql', expect.any(String));
// 	expect(query).toHaveProperty('params', expect.any(Array));
// });

// // + custom + where + orderby

// // + custom + where + orderby + limit

// // + partial

// // + partial(false)

// // + partial + orderBy + where (all not selected)

// /*
// 	One four-level relation users+posts+comments+coment_likes
// 	+ users+users_to_groups+groups
// */

// /*
// 	Really hard case
// 	1. users+posts+comments+coment_likes
// 	2. users+users_to_groups+groups
// 	3. users+users
// */
// eslint-disable-next-line unicorn/no-empty-file
