import 'dotenv/config';
import Docker from 'dockerode';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	char,
	check,
	decimal,
	double,
	float,
	int,
	mediumint,
	mysqlEnum,
	mysqlTable,
	mysqlView,
	serial,
	smallint,
	text,
	tinyint,
	varchar,
} from 'drizzle-orm/mysql-core';
import * as fs from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { pushPullDiff } from './mocks';

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

beforeEach(async () => {
	await client.query(`drop database if exists \`drizzle\`;`);
	await client.query(`create database \`drizzle\`;`);
	await client.query(`use \`drizzle\`;`);
});

if (!fs.existsSync('tests/introspect/mysql')) {
	fs.mkdirSync('tests/introspect/mysql');
}

test('generated always column: link to another column', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
			),
		}),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'generated-link-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('generated always column virtual: link to another column', async () => {
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

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'generated-link-column-virtual',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: char', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: char('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'default-value-char-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: varchar', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'default-value-varchar-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks', async () => {
	const schema = {
		users: mysqlTable('users', {
			id: serial('id'),
			name: varchar('name', { length: 255 }),
			age: int('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'introspect-checks',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('view #1', async () => {
	const users = mysqlTable('users', { id: int('id') });
	const testView = mysqlView('some_view', { id: int('id') }).as(
		sql`select \`drizzle\`.\`users\`.\`id\` AS \`id\` from \`drizzle\`.\`users\``,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'view-1',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('view #2', async () => {
	const users = mysqlTable('some_users', { id: int('id') });
	const testView = mysqlView('some_view', { id: int('id') }).algorithm('temptable').sqlSecurity('definer').as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'view-2',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('handle float type', async () => {
	const schema = {
		table: mysqlTable('table', {
			col1: float(),
			col2: float({ precision: 2 }),
			col3: float({ precision: 2, scale: 1 }),
		}),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'handle-float-type',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('handle unsigned numerical types', async () => {
	const schema = {
		table: mysqlTable('table', {
			col1: int({ unsigned: true }),
			col2: tinyint({ unsigned: true }),
			col3: smallint({ unsigned: true }),
			col4: mediumint({ unsigned: true }),
			col5: bigint({ mode: 'number', unsigned: true }),
			col6: float({ unsigned: true }),
			col7: float({ precision: 2, scale: 1, unsigned: true }),
			col8: double({ unsigned: true }),
			col9: double({ precision: 2, scale: 1, unsigned: true }),
			col10: decimal({ unsigned: true }),
			col11: decimal({ precision: 2, scale: 1, unsigned: true }),
		}),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'handle-unsigned-numerical-types',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('instrospect strings with single quotes', async () => {
	const schema = {
		columns: mysqlTable('columns', {
			enum: mysqlEnum('my_enum', ['escape\'s quotes "', 'escape\'s quotes 2 "']).default('escape\'s quotes "'),
			text: text('text').default('escape\'s quotes " '),
			varchar: varchar('varchar', { length: 255 }).default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await pushPullDiff(
		client,
		schema,
		'introspect-strings-with-single-quotes',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	await client.query(`drop table columns;`);
});
