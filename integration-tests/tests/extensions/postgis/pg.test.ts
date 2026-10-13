import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { bigserial, geometry, geography, line, pgTable, point } from 'drizzle-orm/pg-core';
import getPort from 'get-port';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

const { Client } = pg;

const ENABLE_LOGGING = false;

let pgContainer: Docker.Container;
let docker: Docker;
let client: pg.Client;
let db: NodePgDatabase;

async function createDockerDB(): Promise<string> {
	const inDocker = (docker = new Docker());
	const port = await getPort({ port: 5432 });
	const image = 'postgis/postgis:16-3.4';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		inDocker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
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

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

beforeAll(async () => {
	const connectionString = process.env['PG_POSTGIS_CONNECTION_STRING'] ?? (await createDockerDB());

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
	db = drizzle(client, { logger: ENABLE_LOGGING });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
});

const items = pgTable('items', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	point: point('point'),
	pointObj: point('point_xy', { mode: 'xy' }),
	line: line('line'),
	lineObj: line('line_abc', { mode: 'abc' }),
	geometry: geometry('geometry', { type: 'point' }),
	geometryObj: geometry('geometry_obj', { type: 'point', mode: 'xy' }),
	geometrySrid: geometry('geometry_options', { type: 'point', mode: 'xy', srid: 4326 }),
	geography: geometry('geography', { type: 'point' }),
	geographyObj: geography('geography_obj', { type: 'point', mode: 'json' }),
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists items cascade`);
	await db.execute(sql`
		CREATE TABLE items (
		          id bigserial PRIMARY KEY, 
		          "point" point,
		          "point_xy" point,
		          "line" line,
		          "line_abc" line,
				  "geometry" geometry(point),
				  "geometry_obj" geometry(point),
				  "geometry_options" geometry(point,4326),
				  "geography" geography(point),
				  "geography_obj" geography(point)
		      );
	`);
});

test('insert + select', async () => {
	const insertedValues = await db.insert(items).values([{
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geometry: [1, 2],
		geometryObj: { x: 1, y: 2 },
		geometrySrid: { x: 1, y: 2 },
		geography: [1, 2],
		geographyObj: { lon: 1, lat: 2 },
	}]).returning();

	const response = await db.select().from(items);

	expect(insertedValues).toStrictEqual([{
		id: 1,
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geometry: [1, 2],
		geometryObj: { x: 1, y: 2 },
		geometrySrid: { x: 1, y: 2 },
		geography: [1, 2],
		geographyObj: { lon: 1, lat: 2 },
	}]);

	expect(response).toStrictEqual([{
		id: 1,
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geometry: [1, 2],
		geometryObj: { x: 1, y: 2 },
		geometrySrid: { x: 1, y: 2 },
		geography: [1, 2],
		geographyObj: { lon: 1, lat: 2 },
	}]);
});
