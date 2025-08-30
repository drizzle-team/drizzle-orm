import type { Container } from 'dockerode';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Client as ClientT } from 'pg';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { createDockerPostgis } from '../utils.ts';
import * as schema from './pgPostgisSchema.ts';

const { Client } = pg;

let pgContainer: Container;
let pgClient: ClientT;
let db: NodePgDatabase;

beforeAll(async () => {
	const { url, container } = await createDockerPostgis();
	pgContainer = container;
	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError;

	do {
		try {
			pgClient = new Client({ connectionString: url });
			await pgClient.connect();
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
		await pgClient!.end().catch(console.error);
		await pgContainer?.stop().catch(console.error);
		throw lastError;
	}

	await pgClient.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

	db = drizzle(pgClient);

	await db.execute(sql`CREATE SCHEMA if not exists "seeder_lib_pg";`);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."geometry_table" (
				"geometry_point_tuple" geometry(point, 0),
				"geometry_point_xy" geometry(point, 0)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."geometry_unique_table" (
				"geometry_point_tuple" geometry(point, 0) unique,
				"geometry_point_xy" geometry(point, 0) unique
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."geometry_array_table" (
				"geometry_point_tuple" geometry(point, 0)[],
				"geometry_point_xy" geometry(point, 0)[]
			);
		`,
	);
});

afterAll(async () => {
	await pgClient.end().catch(console.error);
	await pgContainer.stop().catch(console.error);
});

const count = 1000;

test('geometry generator test', async () => {
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

test('geometry unique generator test', async () => {
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

test('geometry array generator test', async () => {
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
