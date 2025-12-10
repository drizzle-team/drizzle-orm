import { defineRelations, sql } from 'drizzle-orm';
import { bigserial, geometry, line, pgTable, point } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

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

beforeAll(async () => {
	const connectionString = process.env['PG_POSTGIS_CONNECTION_STRING'];
	if (!connectionString) throw new Error('PG_POSTGIS_CONNECTION_STRING is not set in env variables');

	client = postgres(connectionString, {
		max: 1,
		onnotice: () => {
			// disable notices
		},
	});
	await client`select 1`;
	db = drizzle({ client, logger: ENABLE_LOGGING, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
});

afterAll(async () => {
	await client?.end().catch(console.error);
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
