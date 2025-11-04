import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { seed } from '../../../src/index.ts';
import { mysqlTest as test } from '../instrumentation.ts';
import * as schema from './mysqlSchema.ts';

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
			    CREATE TABLE \`datetime_table\` (
				\`datetime\` datetime
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE \`year_table\` (
				\`year\` year
			);
		`,
		);

		resolveFunc('');
	}

	await promise;
});

const count = 10000;
test('datetime generator test', async ({ db }) => {
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime(),
			},
		},
	}));

	const data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('year generator test', async ({ db }) => {
	await seed(db, { yearTable: schema.yearTable }).refine((funcs) => ({
		yearTable: {
			count,
			columns: {
				year: funcs.year(),
			},
		},
	}));

	const data = await db.select().from(schema.yearTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});
