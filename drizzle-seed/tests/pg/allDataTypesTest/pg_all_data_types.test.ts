import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';
import * as schema from './pgSchema.ts';

let client: PGlite;
let db: PgliteDatabase;

beforeAll(async () => {
	client = new PGlite();

	db = drizzle(client);

	await db.execute(sql`CREATE SCHEMA if not exists "seeder_lib_pg";`);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 CREATE TYPE "seeder_lib_pg"."mood_enum" AS ENUM('sad', 'ok', 'happy');
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."all_data_types" (
				"integer" integer,
				"smallint" smallint,
				"bigint" bigint,
				"bigint_number" bigint,
				"serial" serial,
				"smallserial" smallserial,
				"bigserial" bigserial,
				"bigserial_number" bigserial,
				"boolean" boolean,
				"text" text,
				"varchar" varchar(256),
				"char" char(256),
				"numeric" numeric,
				"decimal" numeric,
				"real" real,
				"double_precision" double precision,
				"json" json,
				"jsonb" jsonb,
				"time" time,
				"timestamp_date" timestamp,
				"timestamp_string" timestamp,
				"date_string" date,
				"date" date,
				"interval" interval,
				"point" "point",
				"point_tuple" "point",
				"line" "line",
				"line_tuple" "line",
				"mood_enum" "seeder_lib_pg"."mood_enum",
				"uuid" "uuid"
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."all_array_data_types" (
				"integer_array" integer[],
				"smallint_array" smallint[],
				"bigint_array" bigint[],
				"bigint_number_array" bigint[],
				"boolean_array" boolean[],
				"text_array" text[],
				"varchar_array" varchar(256)[],
				"char_array" char(256)[],
				"numeric_array" numeric[],
				"decimal_array" numeric[],
				"real_array" real[],
				"double_precision_array" double precision[],
				"json_array" json[],
				"jsonb_array" jsonb[],
				"time_array" time[],
				"timestamp_date_array" timestamp[],
				"timestamp_string_array" timestamp[],
				"date_string_array" date[],
				"date_array" date[],
				"interval_array" interval[],
				"point_array" "point"[],
				"point_tuple_array" "point"[],
				"line_array" "line"[],
				"line_tuple_array" "line"[],
				"mood_enum_array" "seeder_lib_pg"."mood_enum"[]
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."nd_arrays" (
				"integer_1d_array" integer[3],
				"integer_2d_array" integer[3][4],
				"integer_3d_array" integer[3][4][5],
				"integer_4d_array" integer[3][4][5][6]
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."intervals" (
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
});

afterAll(async () => {
	await client.close();
});

test('all data types test', async () => {
	await seed(db, { allDataTypes: schema.allDataTypes }, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});

test('all array data types test', async () => {
	await seed(db, { allArrayDataTypes: schema.allArrayDataTypes }, { count: 1000 });

	const allArrayDataTypes = await db.select().from(schema.allArrayDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allArrayDataTypes.every((row) =>
		Object.values(row).every((val) => val !== undefined && val !== null && val.length === 10)
	);

	expect(predicate).toBe(true);
});

test('nd arrays', async () => {
	await seed(db, { ndArrays: schema.ndArrays }, { count: 1000 });

	const ndArrays = await db.select().from(schema.ndArrays);
	// every value in each rows does not equal undefined.
	const predicate0 = ndArrays.every((row) =>
		Object.values(row).every((val) => val !== undefined && val !== null && val.length !== 0)
	);
	let predicate1 = true, predicate2 = true, predicate3 = true, predicate4 = true;

	for (const row of ndArrays) {
		predicate1 = predicate1 && (row.integer1DArray?.length === 3);

		predicate2 = predicate2 && (row.integer2DArray?.length === 4) && (row.integer2DArray[0]?.length === 3);

		predicate3 = predicate3 && (row.integer3DArray?.length === 5) && (row.integer3DArray[0]?.length === 4)
			&& (row.integer3DArray[0][0]?.length === 3);

		predicate4 = predicate4 && (row.integer4DArray?.length === 6) && (row.integer4DArray[0]?.length === 5)
			&& (row.integer4DArray[0][0]?.length === 4) && (row.integer4DArray[0][0][0]?.length === 3);
	}

	expect(predicate0 && predicate1 && predicate2 && predicate3 && predicate4).toBe(true);
});

test('intervals test', async () => {
	await seed(db, { intervals: schema.intervals }, { count: 1000 });

	const intervals = await db.select().from(schema.intervals);
	// every value in each rows does not equal undefined.
	const predicate = intervals.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
