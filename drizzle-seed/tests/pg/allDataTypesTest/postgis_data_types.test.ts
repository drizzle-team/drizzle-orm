import type { Container } from 'dockerode';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Client as ClientT } from 'pg';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';
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
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."postgis_data_types" (
				"geometry" geometry(point, 0)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."postgis_array_data_types" (
				"geometry_array" geometry(point, 0)[]
			);
		`,
	);
});

afterAll(async () => {
	await pgClient.end().catch(console.error);
	await pgContainer.stop().catch(console.error);
});

test('postgis data types test', async () => {
	await seed(db, { allDataTypes: schema.allDataTypes }, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
