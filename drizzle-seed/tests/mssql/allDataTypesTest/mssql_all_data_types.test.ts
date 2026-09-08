import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { mssqlTest as test } from '../instrumentation.ts';
import * as schema from './mssqlSchema.ts';

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
				CREATE TABLE [all_data_types] (
				[integer] int,
				[tinyint] tinyint,
				[smallint] smallint,
				[bigint] bigint,
				[bigint_number] bigint,
				[real] real,
				[decimal] decimal,
				[numeric] numeric,
				[float] float,
				[binary] binary(5),
				[varbinary] varbinary(5),
				[char] char(5),
				[varchar] varchar(5),
				[text] text,
				[bit] bit,
				[date_string] date,
				[date] date,
				[datetime] datetime,
				[datetime_string] datetime,
				[datetime2] datetime2,
				[datetime2_string] datetime2,
				[datetime_offset] datetimeoffset,
				[datetime_offset_string] datetimeoffset,
				[time] time
			);
		`,
		);

		resolveFunc('');
	}
	await promise;
});

test.afterEach(async ({ db }) => {
	await reset(db, schema);
});

test('basic seed test', async ({ db }) => {
	await seed(db, schema, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
