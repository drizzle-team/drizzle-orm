import { PgClient } from '@effect/sql-pg';
import { expect, it } from '@effect/vitest';
import { defineRelations, sql } from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { bigserial, customType, geometry, integer, line, pgTable, point } from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import { beforeEach } from 'vitest';

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

const connectionStr = Redacted.make(
	process.env['PG_POSTGIS_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:54322/drizzle',
);
const PgClientLive = PgClient.layer({ url: connectionStr });
const TestLive = PgClientLive;

const withDb = <A, E, R>(f: (db: PgDrizzle.EffectPgDatabase<typeof relations>) => Effect.Effect<A, E, R>) =>
	Effect.gen(function*() {
		const db = yield* PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices));
		return yield* f(db as any);
	}).pipe(Effect.provide(TestLive));

beforeEach(async () => {
	await Effect.runPromise(
		withDb((db) =>
			Effect.gen(function*() {
				yield* db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
				yield* db.execute(sql`drop table if exists items cascade`);
				yield* db.execute(sql`drop table if exists geofences cascade`);
				yield* db.execute(sql`
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
			})
		) as Effect.Effect<void, any, never>,
	);
});

const seed = {
	point: [1, 2] as [number, number],
	pointObj: { x: 1, y: 2 },
	line: [1, 2, 3] as [number, number, number],
	lineObj: { a: 1, b: 2, c: 3 },
	geo: [1, 2] as [number, number],
	geoObj: { x: 1, y: 2 },
	geoSrid: { x: 1, y: 2 },
};
const expected = { id: 1, ...seed };

it.effect('insert + select', () =>
	withDb((db) =>
		Effect.gen(function*() {
			const insertedValues = yield* db.insert(items).values([seed]).returning();
			const response = yield* db.select().from(items);

			expect(insertedValues).toStrictEqual([expected]);
			expect(response).toStrictEqual([expected]);
		})
	));

it.effect('null geometries survive driver-side parsing', () =>
	withDb((db) =>
		Effect.gen(function*() {
			yield* db.insert(items).values([{}]);
			const response = yield* db.select().from(items);

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
		})
	));

it.effect('geometry arrays are parsed item by item', () =>
	withDb((db) =>
		Effect.gen(function*() {
			const geoArrays = pgTable('geo_arrays', {
				id: integer('id').primaryKey(),
				geos: geometry('geos', { type: 'point', mode: 'xy' }).array(),
				pts: point('pts', { mode: 'xy' }).array(),
			});

			yield* db.execute(sql`drop table if exists geo_arrays cascade`);
			yield* db.execute(sql`
				CREATE TABLE geo_arrays (
					id integer PRIMARY KEY,
					"geos" geometry(point)[],
					"pts" point[]
				);
			`);
			yield* db.insert(geoArrays).values({
				id: 1,
				geos: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
				pts: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
			});

			const response = yield* db.select().from(geoArrays);
			expect(response).toStrictEqual([{
				id: 1,
				geos: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
				pts: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
			}]);

			yield* db.execute(sql`drop table geo_arrays cascade`);
		})
	));

it.effect('RQBv2', () =>
	withDb((db) =>
		Effect.gen(function*() {
			yield* db.insert(items).values([seed]).returning();

			const rawResponse = yield* db.select().from(items);
			const rootRqbResponse = yield* db.query.items.findMany();
			const nested = yield* db.query.items.findFirst({ with: { self: true } });

			expect(rootRqbResponse).toStrictEqual(rawResponse);
			expect(nested!.self).toStrictEqual(rawResponse);
		})
	));

// https://github.com/drizzle-team/drizzle-orm/issues/5711
it.effect('No wrong codec autoresolution', () =>
	withDb((db) =>
		Effect.gen(function*() {
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
					if ((typeWithFlags & 0x20000000) !== 0) getUint32();

					const numRings = getUint32();
					const rings: [number, number][][] = [];
					for (let i = 0; i < numRings; i++) {
						const numPoints = getUint32();
						const ring: [number, number][] = [];
						for (let j = 0; j < numPoints; j++) ring.push([getFloat64(), getFloat64()]);
						rings.push(ring);
					}
					return rings;
				},
			});

			const Geofence = pgTable('geofences', {
				id: integer().primaryKey(),
				polygon: polygon('polygon').notNull(),
			});

			yield* db.execute(sql`CREATE TABLE IF NOT EXISTS geofences (
				id INTEGER PRIMARY KEY,
				polygon geometry(Polygon, 4326)
			)`);

			yield* db.insert(Geofence).values({
				id: 1,
				polygon: [[[30.0, 50.0], [30.1, 50.0], [30.1, 50.1], [30.0, 50.1], [30.0, 50.0]]],
			});

			const res = yield* db.select().from(Geofence);
			expect(res).toStrictEqual([{
				id: 1,
				polygon: [[[30.0, 50.0], [30.1, 50.0], [30.1, 50.1], [30.0, 50.1], [30.0, 50.0]]],
			}]);
		})
	));
