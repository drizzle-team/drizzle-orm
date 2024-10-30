import 'dotenv/config';
import Docker from 'dockerode';
import { SQL, sql } from 'drizzle-orm';
import { char, check, int, mysqlTable, mysqlView, serial, text, varchar } from 'drizzle-orm/mysql-core';
import * as fs from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { introspectMySQLToFile } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';

let client: Connection;
let mysqlContainer: Docker.Container;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
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
	const connectionString = process.env.MYSQL_CONNECTION_STRING ?? await createDockerDB();

	const sleep = 1000;
	let timeLeft = 20000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await createConnection(connectionString);
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
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await mysqlContainer?.stop().catch(console.error);
});

if (!fs.existsSync('tests/introspect/mysql')) {
	fs.mkdirSync('tests/introspect/mysql');
}

test('generated always column: link to another column', async () => {
	await client.query(`drop table if exists users;`);

	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
			),
		}),
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'generated-link-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('generated always column virtual: link to another column', async () => {
	await client.query(`drop table if exists users;`);

	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
				{ mode: 'virtual' },
			),
		}),
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'generated-link-column-virtual',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: char', async () => {
	await client.query(`drop table if exists users;`);

	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: char('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'default-value-char-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: varchar', async () => {
	await client.query(`drop table if exists users;`);

	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'default-value-varchar-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks', async () => {
	await client.query(`drop view if exists some_view;`);
	await client.query(`drop table if exists users;`);

	const schema = {
		users: mysqlTable('users', {
			id: serial('id'),
			name: varchar('name', { length: 255 }),
			age: int('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'introspect-checks',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('view #1', async () => {
	await client.query(`drop table if exists users;`);
	await client.query(`drop view if exists some_view;`);

	const users = mysqlTable('users', { id: int('id') });
	const testView = mysqlView('some_view', { id: int('id') }).as(
		sql`select \`drizzle\`.\`users\`.\`id\` AS \`id\` from \`drizzle\`.\`users\``,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'view-1',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('view #2', async () => {
	await client.query(`drop table if exists some_users;`);
	await client.query(`drop view if exists some_view;`);

	const users = mysqlTable('some_users', { id: int('id') });
	const testView = mysqlView('some_view', { id: int('id') }).algorithm('temptable').sqlSecurity('definer').as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectMySQLToFile(
		client,
		schema,
		'view-2',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
