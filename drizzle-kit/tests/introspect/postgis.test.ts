import 'dotenv/config';
import Docker from 'dockerode';
import { geometry, integer, pgTable } from 'drizzle-orm/pg-core';
import fs from 'fs';
import getPort from 'get-port';
import { Client } from 'pg';
import { introspectPgToFile } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';

if (!fs.existsSync('tests/introspect/postgres')) {
	fs.mkdirSync('tests/introspect/postgres');
}

let client: Client;
let pgContainer: Docker.Container;
const ignoreTables = ['public.spatial_ref_sys', 'public.geography_columns', 'public.geometry_columns'];

export async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 5432 });
	const image = 'postgis/postgis:14-3.5';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	pgContainer = await docker.createContainer({
		Image: image,
		Env: ['POSTGRES_PASSWORD=postgres', 'POSTGRES_USER=postgres', 'POSTGRES_DB=postgres'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return { connectionString: `postgres://postgres:postgres@localhost:${port}/postgres`, container: pgContainer };
}

beforeAll(async () => {
	const connectionString = process.env.PG_POSTGIS_CONNECTION_STRING ?? await createDockerDB();

	const sleep = 1000;
	let timeLeft = 20000;
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
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
});

test('geometry column', async () => {
	await client.query('drop table if exists "users"');

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
			geometry1: geometry('geometry1', { type: 'point' }),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'geometry-column',
		['public'],
		undefined,
		undefined,
		ignoreTables,
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('geometry column with default', async () => {
	await client.query('drop table if exists "users"');

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
			geometry1: geometry('geometry1', { type: 'point', mode: 'xy' }).default({ x: 1, y: 2 }),
			geometry2: geometry('geometry2', { type: 'point', mode: 'tuple' }).default([3, 4]),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'geometry-column-with-default',
		['public'],
		undefined,
		undefined,
		ignoreTables,
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
