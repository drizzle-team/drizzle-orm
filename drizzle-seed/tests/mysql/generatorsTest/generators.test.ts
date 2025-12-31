import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
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

	let data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	const min = '2025-03-07 13:12:13Z';
	const max = '2025-03-09 15:12:13Z';
	await reset(db, { datetimeTable: schema.datetimeTable });
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime({
					min,
					max,
				}),
			},
		},
	}));

	data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) =>
				val !== null && val >= new Date(min)
				&& val <= new Date(max)
			)
		);

	expect(predicate).toBe(true);

	await reset(db, { datetimeTable: schema.datetimeTable });
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime({
					min,
					max: min,
				}),
			},
		},
	}));

	data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(min).getTime())
		);

	expect(predicate).toBe(true);

	await reset(db, { datetimeTable: schema.datetimeTable });
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime({
					min: new Date(min),
					max: new Date(min),
				}),
			},
		},
	}));

	data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(min).getTime())
		);

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
