import 'dotenv/config';

import type { TestFn } from 'ava';
import anyTest from 'ava';
import Docker from 'dockerode';
import { DefaultLogger, sql } from 'drizzle-orm';
import { boolean, json, mysqlTable, serial, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import getPort from 'get-port';
import * as mysql from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

const ENABLE_LOGGING = false;

const usersTable = mysqlTable('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

interface Context {
	docker: Docker;
	mysqlContainer: Docker.Container;
	db: MySql2Database;
	client: mysql.Connection;
}

const test = anyTest as TestFn<Context>;

async function createDockerDB(ctx: Context): Promise<string> {
	const docker = (ctx.docker = new Docker());
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	ctx.mysqlContainer = await docker.createContainer({
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

	await ctx.mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

test.before(async (t) => {
	const ctx = t.context;
	const connectionString = process.env['MYSQL_CONNECTION_STRING'] ?? await createDockerDB(ctx);

	const sleep = 1000;
	let timeLeft = 20000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.client = await mysql.createConnection(connectionString);
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
		console.error('Cannot connect to MySQL');
		await ctx.client?.end().catch(console.error);
		await ctx.mysqlContainer?.stop().catch(console.error);
		throw lastError;
	}
	ctx.db = drizzle(ctx.client, { logger: ENABLE_LOGGING ? new DefaultLogger() : undefined });
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.end().catch(console.error);
	await ctx.mysqlContainer?.stop().catch(console.error);
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop table if exists \`userstest\``);
	await ctx.db.execute(sql`drop table if exists \`users2\``);
	await ctx.db.execute(sql`drop table if exists \`cities\``);

	await ctx.db.execute(
		sql`
			create table \`userstest\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`verified\` boolean not null default false,
				\`jsonb\` json,
				\`created_at\` timestamp not null default now()
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table \`users2\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references \`cities\`(\`id\`)
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table \`cities\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);
});

async function setupReturningFunctionsTest(db: MySql2Database) {
	await db.execute(sql`drop table if exists \`users_default_fn\``);
	await db.execute(
		sql`
			create table \`users_default_fn\` (
				\`id\` varchar(256) primary key,
				\`name\` text not null
			);
		`,
	);
}

test.serial('insert $returningId: serail as id', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values({ name: 'John' }).$returningId();
	//    ^?
	t.deepEqual(result, [{ id: 1 }]);
});

test.serial('insert $returningId: serail as id, batch insert', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).$returningId();
	//    ^?
	t.deepEqual(result, [{ id: 1 }, { id: 2 }]);
});

test.serial('insert $returningId: $default as primary key', async (t) => {
	const { db } = t.context;

	const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
	let iterator = 0;

	const usersTableDefFn = mysqlTable('users_default_fn', {
		customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
			const value = uniqueKeys[iterator]!;
			iterator++;
			return value;
		}),
		name: text('name').notNull(),
	});

	await setupReturningFunctionsTest(db);

	const result = await db.insert(usersTableDefFn).values([{ name: 'John' }, { name: 'John1' }])
		//    ^?
		.$returningId();
	t.deepEqual(result, [{ customId: 'ao865jf3mcmkfkk8o5ri495z' }, { customId: 'dyqs529eom0iczo2efxzbcut' }]);
});

test.serial('insert $returningId: $default as primary key with value', async (t) => {
	const { db } = t.context;

	const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
	let iterator = 0;

	const usersTableDefFn = mysqlTable('users_default_fn', {
		customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
			const value = uniqueKeys[iterator]!;
			iterator++;
			return value;
		}),
		name: text('name').notNull(),
	});

	await setupReturningFunctionsTest(db);

	const result = await db.insert(usersTableDefFn).values([{ name: 'John', customId: 'test' }, { name: 'John1' }])
		//    ^?
		.$returningId();
	t.deepEqual(result, [{ customId: 'test' }, { customId: 'ao865jf3mcmkfkk8o5ri495z' }]);
});
