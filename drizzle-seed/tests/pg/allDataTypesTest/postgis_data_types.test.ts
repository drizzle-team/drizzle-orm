import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { seed } from '../../../src/index.ts';
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

		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "postgis_data_types" (
				"geometry" geometry(point, 0)
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "postgis_array_data_types" (
				"geometry_array" geometry(point, 0)[]
			);
		`,
		);

		resolveFunc('');
	}
	await promise;
});

test('postgis data types test', async ({ db }) => {
	await seed(db, { allDataTypes: schema.allDataTypes }, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
