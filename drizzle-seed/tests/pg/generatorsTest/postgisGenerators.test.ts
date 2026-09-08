import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { pgPostgisTest as test } from '../instrumentation.ts';
import * as schema from './pgPostgisSchema.ts';

let firstTime = true;
let resolveFunc: (val: any) => void;
const promise = new Promise((resolve) => {
	resolveFunc = resolve;
});
test.beforeEach(async ({ db }) => {
	if (firstTime) {
		firstTime = false;

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "geometry_table" (
				"geometry_point_tuple" geometry(point, 0),
				"geometry_point_xy" geometry(point, 0)
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "geometry_unique_table" (
				"geometry_point_tuple" geometry(point, 0) unique,
				"geometry_point_xy" geometry(point, 0) unique
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "geometry_array_table" (
				"geometry_point_tuple" geometry(point, 0)[],
				"geometry_point_xy" geometry(point, 0)[]
			);
		`,
		);

		await db.execute(
			sql`
			CREATE TABLE IF NOT EXISTS "composite_unique_key_table" (
			"id" integer,
			"geometry_point" geometry(point, 0),
			CONSTRAINT "custom_name" UNIQUE("id","geometry_point")
			);
		`,
		);

		resolveFunc('');
	}

	await promise;
});

const count = 1000;

test('geometry generator test', async ({ db }) => {
	await reset(db, { geometryTable: schema.geometryTable });
	await seed(db, { geometryTable: schema.geometryTable }).refine((funcs) => ({
		geometryTable: {
			count,
			columns: {
				geometryPointTuple: funcs.geometry({
					type: 'point',
					srid: 4326,
					decimalPlaces: 5,
				}),
				geometryPointXy: funcs.geometry({
					type: 'point',
					srid: 4326,
					decimalPlaces: 5,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.geometryTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('geometry unique generator test', async ({ db }) => {
	await reset(db, { geometryUniqueTable: schema.geometryUniqueTable });
	await seed(db, { geometryUniqueTable: schema.geometryUniqueTable }).refine((funcs) => ({
		geometryUniqueTable: {
			count,
			columns: {
				geometryPointTuple: funcs.geometry({
					isUnique: true,
					type: 'point',
					srid: 4326,
					decimalPlaces: 5,
				}),
				geometryPointXy: funcs.geometry({
					isUnique: true,
					type: 'point',
					srid: 4326,
					decimalPlaces: 5,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.geometryUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('geometry array generator test', async ({ db }) => {
	await reset(db, { geometryArrayTable: schema.geometryArrayTable });
	await seed(db, { geometryArrayTable: schema.geometryArrayTable }).refine((funcs) => ({
		geometryArrayTable: {
			count,
			columns: {
				geometryPointTuple: funcs.geometry({
					arraySize: 1,
					type: 'point',
					srid: 4326,
					decimalPlaces: 5,
				}),
				geometryPointXy: funcs.geometry({
					arraySize: 1,
					type: 'point',
					srid: 4326,
					decimalPlaces: 5,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.geometryArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('composite unique key generator test', async ({ db }) => {
	await reset(db, { compositeUniqueKeyTable: schema.compositeUniqueKeyTable });
	await seed(db, { compositeUniqueKeyTable: schema.compositeUniqueKeyTable }, { count: 10000 }).refine((funcs) => ({
		compositeUniqueKeyTable: {
			columns: {
				id: funcs.int(),
				geometryPoint: funcs.geometry({ type: 'point', srid: 4326 }),
			},
		},
	}));

	const data = await db.select().from(schema.compositeUniqueKeyTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});
