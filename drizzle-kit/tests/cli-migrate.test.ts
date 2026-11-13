import Docker from 'dockerode';
import getPort from 'get-port';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createConnection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { migrate } from '../src/cli/schema';
import { connectToMySQL } from '../src/cli/connections';

async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err))),
	);

	const container = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-kit-mysql-cuid-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await container.start();

	return {
		connectionString: `mysql://root:mysql@127.0.0.1:${port}/drizzle`,
		container,
	};
}

async function waitForMySQL(connectionString: string) {
	const maxAttempts = 20;
	const delay = 1000;
	let lastError: unknown;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		try {
			const connection = await createConnection(connectionString);
			await connection.connect();
			await connection.end();
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

// good:
// #1 drizzle-kit generate
// #2 drizzle-kit generate --config=turso.config.ts
// #3 drizzle-kit generate --config=d1http.config.ts
// #4 drizzle-kit generate --config=postgres.config.ts ## spread connection params
// #5 drizzle-kit generate --config=drizzle2.config.ts ## custom schema and table for migrations journal

// errors:
// #1 drizzle-kit generate --config=expo.config.ts
// TODO: missing required params in config?

test('migrate #1', async (t) => {
	const res = await brotest(migrate, '');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
		schema: undefined, // drizzle migrations table schema
		table: undefined, // drizzle migrations table name
	});
});

test('migrate #2', async (t) => {
	const res = await brotest(migrate, '--config=turso.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'turso',
		out: 'drizzle',
		credentials: {
			authToken: 'token',
			url: 'turso.dev',
		},
		schema: undefined, // drizzle migrations table schema
		table: undefined, // drizzle migrations table name
	});
});

test('migrate #3', async (t) => {
	const res = await brotest(migrate, '--config=d1http.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'sqlite',
		out: 'drizzle',
		credentials: {
			driver: 'd1-http',
			accountId: 'accid',
			databaseId: 'dbid',
			token: 'token',
		},
		schema: undefined, // drizzle migrations table schema
		table: undefined, // drizzle migrations table name
	});
});

test('migrate #4', async (t) => {
	const res = await brotest(migrate, '--config=postgres.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		schema: undefined, // drizzle migrations table schema
		table: undefined, // drizzle migrations table name
	});
});

// catched a bug
test('migrate #5', async (t) => {
	const res = await brotest(migrate, '--config=postgres2.config.ts');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			database: 'db',
			host: '127.0.0.1',
			password: 'postgres',
			port: 5432,
			user: 'postgresql',
		},
		schema: 'custom', // drizzle migrations table schema
		table: 'custom', // drizzle migrations table name
	});
});

test('mysql migrate should throw when a SQL migration contains CUID()', async () => {
	const { connectionString, container } = await createDockerDB();
	try {
		await waitForMySQL(connectionString);

		const tempFolder = await fs.mkdtemp(join(tmpdir(), 'drizzle-mysql-cuid-'));
		const metaFolder = join(tempFolder, 'meta');
		await fs.mkdir(metaFolder, { recursive: true });

		await fs.writeFile(
			join(metaFolder, '_journal.json'),
			JSON.stringify({
				version: '1',
				dialect: 'mysql',
				entries: [
					{
						idx: 0,
						version: '1',
						when: Date.now(),
						tag: '0000_cuid',
						breakpoints: false,
					},
				],
			}, null, 2),
		);

		await fs.writeFile(
			join(tempFolder, '0000_cuid.sql'),
			'CREATE TABLE `users` (\n' +
				'`id` varchar(255) NOT NULL DEFAULT (CUID()),\n' +
				'`name` varchar(255) NOT NULL,\n' +
				'PRIMARY KEY (`id`)\n' +
			');\n',
		);

		const { migrate } = await connectToMySQL({ url: connectionString });

		await expect(migrate({ migrationsFolder: tempFolder })).rejects.toThrow();
	} finally {
		await container.stop().catch(() => undefined);
	}
});

// --- errors ---
test('err #1', async (t) => {
	const res = await brotest(migrate, '--config=expo.config.ts');
	assert.equal(res.type, 'error');
});
