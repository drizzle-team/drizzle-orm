import { defineRelations, eq, sql } from 'drizzle-orm';
import { bigserial, customType, geometry, integer, line, pgTable, point } from 'drizzle-orm/pg-core';
import type { PostgresDatabase } from 'drizzle-orm/postgres';
import { drizzle } from 'drizzle-orm/postgres';
import type { Pool } from 'minipg';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

let db: PostgresDatabase<typeof relations> & { $client: Pool };

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

	db = drizzle(connectionString, { logger: ENABLE_LOGGING, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
});

afterAll(async () => {
	await db?.$client.end().catch(console.error);
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists items cascade`);
	await db.execute(sql`drop table if exists geofences cascade`);
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

test('null geometries survive driver-side parsing', async () => {
	await db.insert(items).values([{}]);

	const response = await db.select().from(items);

	expect(response).toStrictEqual([{
		id: 1,
		point: null,
		pointObj: null,
		line: null,
		lineObj: null,
		geo: null,
		geoObj: null,
		geoSrid: null,
	}]);
});

test('point arrays are parsed item by item', async () => {
	await db.execute(sql`drop table if exists point_arrays cascade`);
	await db.execute(sql`
		CREATE TABLE point_arrays (
			id integer PRIMARY KEY,
			"points" point[],
			"points_xy" point[]
		);
	`);

	const pointArrays = pgTable('point_arrays', {
		id: integer('id').primaryKey(),
		points: point('points').array(),
		pointsXy: point('points_xy', { mode: 'xy' }).array(),
	});

	await db.insert(pointArrays).values({
		id: 1,
		points: [[1, 2], [3, 4]],
		pointsXy: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
	});

	const response = await db.select().from(pointArrays);

	expect(response).toStrictEqual([{
		id: 1,
		points: [[1, 2], [3, 4]],
		pointsXy: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
	}]);

	await db.execute(sql`drop table point_arrays cascade`);
});

test('a custom column over a geometry codec decodes on top of the parsed geometry', async () => {
	await db.execute(sql`drop table if exists custom_geo cascade`);
	await db.execute(sql`
		CREATE TABLE custom_geo (
			id integer PRIMARY KEY,
			"xy" geometry(point),
			"tup" geometry(point),
			"xys" geometry(point)[]
		);
	`);

	const labelled = customType<{ data: string; driverData: { x: number; y: number } }>({
		dataType: () => 'geometry(point)',
		codec: 'geometry(point)',
		toDriver: (value) => sql`ST_GeomFromText(${`POINT(${value})`})`,
		fromDriver: (value) => `${value.x}/${value.y}`,
	});

	const labelledTuple = customType<{ data: string; driverData: [number, number] }>({
		dataType: () => 'geometry(point)',
		codec: 'geometry(point):tuple',
		toDriver: (value) => sql`ST_GeomFromText(${`POINT(${value})`})`,
		fromDriver: ([x, y]) => `${x}/${y}`,
	});

	const customGeo = pgTable('custom_geo', {
		id: integer('id').primaryKey(),
		xy: labelled('xy'),
		tup: labelledTuple('tup'),
		xys: labelled('xys').array(),
	});

	await db.execute(sql`
		INSERT INTO custom_geo (id, xy, tup, xys) VALUES (
			1,
			ST_GeomFromText('POINT(1 2)'),
			ST_GeomFromText('POINT(3 4)'),
			ARRAY[ST_GeomFromText('POINT(5 6)'), ST_GeomFromText('POINT(7 8)')]
		)
	`);

	const response = await db.select().from(customGeo);
	expect(response).toStrictEqual([{ id: 1, xy: '1/2', tup: '3/4', xys: ['5/6', '7/8'] }]);

	await db.execute(sql`INSERT INTO custom_geo (id) VALUES (2)`);
	const withNulls = await db.select().from(customGeo).where(eq(customGeo.id, 2));
	expect(withNulls).toStrictEqual([{ id: 2, xy: null, tup: null, xys: null }]);

	await db.execute(sql`drop table custom_geo cascade`);
});

test('geometry arrays are parsed item by item', async () => {
	await db.execute(sql`drop table if exists geo_arrays cascade`);
	await db.execute(sql`
		CREATE TABLE geo_arrays (
			id integer PRIMARY KEY,
			"geos" geometry(point)[]
		);
	`);

	const geoArrays = pgTable('geo_arrays', {
		id: integer('id').primaryKey(),
		geos: geometry('geos', { type: 'point', mode: 'xy' }).array(),
	});

	await db.insert(geoArrays).values({
		id: 1,
		geos: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
	});

	const response = await db.select().from(geoArrays);
	expect(response).toStrictEqual([{ id: 1, geos: [{ x: 5, y: 6 }, { x: 7, y: 8 }] }]);

	await db.execute(sql`drop table geo_arrays cascade`);
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

// https://github.com/drizzle-team/drizzle-orm/issues/5711
test('No wrong codec autoresolution', async () => {
	const polygon = customType<{ data: [number, number][][]; driverData: string }>({
		dataType() {
			return 'geometry(Polygon, 4326)';
		},
		toDriver(value) {
			return sql`ST_GeomFromText(
				'POLYGON(${
				sql.raw(
					value.map((v) => `(${v.map((v1) => `${v1[0]!} ${v1[1]!}`).join(', ')})`).join(', '),
				)
			})',
				4326
			)`;
		},
		fromDriver(ewkb: string) {
			const buffer = Buffer.from(ewkb, 'hex');
			const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

			let offset = 0;

			const littleEndian = view.getUint8(offset) === 1;
			offset += 1;

			const getUint32 = () => {
				const val = view.getUint32(offset, littleEndian);
				offset += 4;
				return val;
			};

			const getFloat64 = () => {
				const val = view.getFloat64(offset, littleEndian);
				offset += 8;
				return val;
			};

			const typeWithFlags = getUint32();
			const hasSRID = (typeWithFlags & 0x20000000) !== 0;
			if (hasSRID) {
				getUint32();
			}

			const numRings = getUint32();
			const rings: [number, number][][] = [];

			for (let i = 0; i < numRings; i++) {
				const numPoints = getUint32();
				const ring: [number, number][] = [];

				for (let j = 0; j < numPoints; j++) {
					const x = getFloat64();
					const y = getFloat64();
					ring.push([x, y]);
				}

				rings.push(ring);
			}

			return rings;
		},
	});

	const Geofence = pgTable('geofences', {
		id: integer().primaryKey(),
		polygon: polygon('polygon').notNull(),
	});

	await db.execute(sql`CREATE TABLE IF NOT EXISTS geofences (
		id INTEGER PRIMARY KEY,
		polygon geometry(Polygon, 4326)
	)`);

	await db.insert(Geofence).values({
		id: 1,
		polygon: [[[30.0, 50.0], [30.1, 50.0], [30.1, 50.1], [30.0, 50.1], [30.0, 50.0]]],
	});

	const res = await db.select().from(Geofence);

	expect(res).toStrictEqual([{
		id: 1,
		polygon: [[[30.0, 50.0], [30.1, 50.0], [30.1, 50.1], [30.0, 50.1], [30.0, 50.0]]],
	}]);
});
