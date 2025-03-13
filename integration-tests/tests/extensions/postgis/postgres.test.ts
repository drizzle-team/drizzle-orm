import Docker from 'dockerode';
import { defineRelations, sql } from 'drizzle-orm';
import { bigserial, geometry, line, pgTable, point } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import getPort from 'get-port';
import postgres, { type Sql } from 'postgres';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

let pgContainer: Docker.Container;
let docker: Docker;
let client: Sql;
let db: PostgresJsDatabase<never, typeof relations>;

const items = pgTable('items', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	point: point('point'),
	pointObj: point('point_xy', { mode: 'xy' }),
	line: line('line'),
	lineObj: line('line_abc', { mode: 'abc' }),
	geo: geometry('geo', { type: 'point' }),
	geoObj: geometry('geo_obj', { type: 'point', mode: 'xy' }),
	geoSrid: geometry('geo_options', { type: 'point', mode: 'xy', srid: 4000 }),
});

const relations = defineRelations({ items }, (r) => ({
	items: {
		self: r.many.items({
			from: r.items.id,
			to: r.items.id,
		}),
	},
}));

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
			client = postgres(connectionString, {
				max: 1,
				onnotice: () => {
					// disable notices
				},
			});
			await client`select 1`;
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
	db = drizzle(client, { logger: ENABLE_LOGGING, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
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
				  "geo" geometry(point),
				  "geo_obj" geometry(point),
				  "geo_options" geometry(point,4000)
		      );
	`);
});

test('insert + select', async () => {
	const insertedValues = await db.insert(items).values([{
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geo: [1, 2],
		geoObj: { x: 1, y: 2 },
		geoSrid: { x: 1, y: 2 },
	}]).returning();

	const response = await db.select().from(items);

	expect(insertedValues).toStrictEqual([{
		id: 1,
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geo: [1, 2],
		geoObj: { x: 1, y: 2 },
		geoSrid: { x: 1, y: 2 },
	}]);

	expect(response).toStrictEqual([{
		id: 1,
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geo: [1, 2],
		geoObj: { x: 1, y: 2 },
		geoSrid: { x: 1, y: 2 },
	}]);
});

test('RQBv2', async () => {
	await db.insert(items).values([{
		point: [1, 2],
		pointObj: { x: 1, y: 2 },
		line: [1, 2, 3],
		lineObj: { a: 1, b: 2, c: 3 },
		geo: [1, 2],
		geoObj: { x: 1, y: 2 },
		geoSrid: { x: 1, y: 2 },
	}]).returning();

	const rawResponse = await db.select().from(items);
	const rootRqbResponse = await db.query.items.findMany();
	const { self: nestedRqbResponse } = (await db.query.items.findFirst({
		with: {
			self: true,
		},
	}))!;

	expectTypeOf(rootRqbResponse).toEqualTypeOf(rawResponse);
	expectTypeOf(nestedRqbResponse).toEqualTypeOf(rawResponse);

	expect(rootRqbResponse).toStrictEqual(rawResponse);
	expect(nestedRqbResponse).toStrictEqual(rawResponse);
});
