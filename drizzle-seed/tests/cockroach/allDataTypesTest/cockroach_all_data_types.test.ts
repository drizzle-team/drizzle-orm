import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { cockroachTest as test } from '../instrumentation.ts';
import * as schema from './cockroachSchema.ts';

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
			CREATE TYPE "mood_enum" AS ENUM('sad', 'ok', 'happy');
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "all_data_types" (
				"int2" int2,
				"int4" int4,
				"int8" int8,
				"int8_number" int8,
				"numeric" numeric,
				"decimal" numeric,
				"real" real,
				"double_precision" double precision,
				"boolean" boolean,
				"char" char(256),
				"varchar" varchar(256),
				"string" string,
				"bit" bit(11),
				"jsonb" jsonb,
				"time" time,
				"timestamp_date" timestamp,
				"timestamp_string" timestamp,
				"date_string" date,
				"date" date,
				"interval" interval,
				"mood_enum" "mood_enum",
				"uuid" uuid,
				"inet" inet,
				"geometry" geometry(point, 0),
				"vector" vector(3)
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "all_array_data_types" (
				"int2_array" int2[],
				"int4_array" int4[],
				"int8_array" int8[],
				"int8_number_array" int8[],
				"numeric_array" numeric[],
				"decimal_array" numeric[],
				"real_array" real[],
				"double_precision_array" double precision[],
				"boolean_array" boolean[],
				"char_array" char(256)[],
				"varchar_array" varchar(256)[],
				"string_array" string[],
				"bit_array" bit(11)[],
				"time_array" time[],
				"timestamp_date_array" timestamp[],
				"timestamp_string_array" timestamp[],
				"date_string_array" date[],
				"date_array" date[],
				"interval_array" interval[],
				"mood_enum_array" "mood_enum"[],
				"uuid_array" uuid[],
				"inet_array" inet[],
				"geometry_array" geometry(point, 0)[]
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "intervals" (
				"intervalYear" interval year,
				"intervalYearToMonth" interval year to month,
				"intervalMonth" interval month,
				"intervalDay" interval day,
				"intervalDayToHour" interval day to hour,
				"intervalDayToMinute" interval day to minute,
				"intervalDayToSecond" interval day to second,
				"intervalHour" interval hour,
				"intervalHourToMinute" interval hour to minute,
				"intervalHourToSecond" interval hour to second,
				"intervalMinute" interval minute,
				"intervalMinuteToSecond" interval minute to second,
				"intervalSecond" interval second
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

test('all data types test', async ({ db }) => {
	await seed(db, { allDataTypes: schema.allDataTypes }, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});

test('all array data types test', async ({ db }) => {
	await seed(db, { allArrayDataTypes: schema.allArrayDataTypes }, { count: 1 });

	const allArrayDataTypes = await db.select().from(schema.allArrayDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allArrayDataTypes.every((row) =>
		Object.values(row).every((val) => val !== undefined && val !== null && (val.length === 10 || val.length === 1))
	);

	expect(predicate).toBe(true);
});

test('intervals test', async ({ db }) => {
	await seed(db, { intervals: schema.intervals }, { count: 1000 });

	const intervals = await db.select().from(schema.intervals);
	// every value in each rows does not equal undefined.
	const predicate = intervals.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
