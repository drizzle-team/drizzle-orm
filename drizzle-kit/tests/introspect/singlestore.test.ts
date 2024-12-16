import Docker from 'dockerode';
import 'dotenv/config';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	char,
	decimal,
	double,
	float,
	int,
	mediumint,
	singlestoreTable,
	smallint,
	text,
	tinyint,
	varchar,
} from 'drizzle-orm/singlestore-core';
import * as fs from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { introspectSingleStoreToFile } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

let client: Connection;
let singlestoreContainer: Docker.Container;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	singlestoreContainer = await docker.createContainer({
		Image: image,
		Env: ['ROOT_PASSWORD=singlestore'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await singlestoreContainer.start();
	await new Promise((resolve) => setTimeout(resolve, 4000));

	return `singlestore://root:singlestore@localhost:${port}/`;
}

beforeAll(async () => {
	const connectionString = process.env.SINGLESTORE_CONNECTION_STRING ?? await createDockerDB();

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
		console.error('Cannot connect to SingleStore');
		await client?.end().catch(console.error);
		await singlestoreContainer?.stop().catch(console.error);
		throw lastError;
	}
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await singlestoreContainer?.stop().catch(console.error);
});

beforeEach(async () => {
	await client.query(`drop database if exists \`drizzle\`;`);
	await client.query(`create database \`drizzle\`;`);
	await client.query(`use \`drizzle\`;`);
});

if (!fs.existsSync('tests/introspect/singlestore')) {
	fs.mkdirSync('tests/introspect/singlestore');
}

// TODO: Unskip this test when generated column is implemented
/* test.skip('generated always column: link to another column', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
			),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'generated-link-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

// TODO: Unskip this test when generated column is implemented
/* test.skip('generated always column virtual: link to another column', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
				{ mode: 'virtual' },
			),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'generated-link-column-virtual',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

test('Default value of character type column: char', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			sortKey: char('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'default-value-char-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('Default value of character type column: varchar', async () => {
	const schema = {
		users: singlestoreTable('users', {
			id: int('id'),
			sortKey: varchar('sortKey', { length: 255 }).default('0'),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'default-value-varchar-column',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// TODO: Unskip this test when views are implemented
/* test('view #1', async () => {
	const users = singlestoreTable('users', { id: int('id') });
	const testView = singlestoreView('some_view', { id: int('id') }).as(
		sql`select \`drizzle\`.\`users\`.\`id\` AS \`id\` from \`drizzle\`.\`users\``,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'view-1',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

// TODO: Unskip this test when views are implemented
/* test('view #2', async () => {
	const users = singlestoreTable('some_users', { id: int('id') });
	const testView = singlestoreView('some_view', { id: int('id') }).algorithm('temptable').sqlSecurity('definer').as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'view-2',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
}); */

test('handle float type', async () => {
	const schema = {
		table: singlestoreTable('table', {
			col1: float(),
			col2: float({ precision: 2 }),
			col3: float({ precision: 2, scale: 1 }),
		}),
	};

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'handle-float-type',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('handle unsigned numerical types', async () => {
	const schema = {
		table: singlestoreTable('table', {
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

	const { statements, sqlStatements } = await introspectSingleStoreToFile(
		client,
		schema,
		'handle-unsigned-numerical-types',
		'drizzle',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
