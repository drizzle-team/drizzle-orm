import Docker from 'dockerode';
import { int, singlestoreTable } from 'drizzle-orm/singlestore-core';
import fs from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { diffTestSchemasPushSingleStore } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';

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
	const connectionString = process.env.MYSQL_CONNECTION_STRING ?? (await createDockerDB());

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
		await singlestoreContainer?.stop().catch(console.error);
		throw lastError;
	}

	await client.query('DROP DATABASE IF EXISTS drizzle;');
	await client.query('CREATE DATABASE drizzle;');
	await client.query('USE drizzle;');
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await singlestoreContainer?.stop().catch(console.error);
});

if (!fs.existsSync('tests/push/singlestore')) {
	fs.mkdirSync('tests/push/singlestore');
}

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: singlestoreTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}),
	};
	const schema2 = {
		test: singlestoreTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);

	await client.query(`DROP TABLE \`test\`;`);
});

// TODO: Unskip this test when views are implemented
/* test.skip.skip('create view', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: singlestoreView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			definition: 'select `id` from `test`',
			name: 'view',
			type: 'singlestore_create_view',
			replace: false,
			sqlSecurity: 'definer',
			withCheckOption: undefined,
			algorithm: 'undefined',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = undefined
SQL SECURITY definer
VIEW \`view\` AS (select \`id\` from \`test\`);`,
	]);

	await client.query(`DROP TABLE \`test\`;`);
}); */

// TODO: Unskip this test when views are implemented
/* test.skip('drop view', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: singlestoreView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			name: 'view',
			type: 'drop_view',
		},
	]);
	expect(sqlStatements).toStrictEqual(['DROP VIEW `view`;']);
	await client.query(`DROP TABLE \`test\`;`);
	await client.query(`DROP VIEW \`view\`;`);
}); */

// TODO: Unskip this test when views are implemented
/* test.skip('alter view ".as"', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: singlestoreView('view').as((qb) =>
			qb
				.select()
				.from(table)
				.where(sql`${table.id} = 1`)
		),
	};

	const schema2 = {
		test: table,
		view: singlestoreView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	await client.query(`DROP TABLE \`test\`;`);
	await client.query(`DROP VIEW \`view\`;`);
}); */

// TODO: Unskip this test when views are implemented
/* test.skip('alter meta options with distinct in definition', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: singlestoreView('view')
			.withCheckOption('cascaded')
			.sqlSecurity('definer')
			.algorithm('merge')
			.as((qb) =>
				qb
					.selectDistinct()
					.from(table)
					.where(sql`${table.id} = 1`)
			),
	};

	const schema2 = {
		test: table,
		view: singlestoreView('view')
			.withCheckOption('cascaded')
			.sqlSecurity('definer')
			.algorithm('undefined')
			.as((qb) => qb.selectDistinct().from(table)),
	};

	await expect(
		diffTestSchemasPushSingleStore(
			client,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		),
	).rejects.toThrowError();

	await client.query(`DROP TABLE \`test\`;`);
}); */
