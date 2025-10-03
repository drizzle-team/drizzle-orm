import type { Container } from 'dockerode';
import { sql } from 'drizzle-orm';
import type { NodeCockroachDatabase } from 'drizzle-orm/cockroach';
import { drizzle } from 'drizzle-orm/cockroach';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { createDockerDB } from '../utils.ts';
import * as schema from './cockroachSchema.ts';

let client: Client;
let db: NodeCockroachDatabase;
let cockroachContainer: Container;

beforeAll(async () => {
	const { connectionString, container } = await createDockerDB();
	cockroachContainer = container;

	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = new Client({ connectionString });
			await client.connect();
			db = drizzle(client);
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MsSQL');
		await client?.end().catch(console.error);
		await cockroachContainer?.stop().catch(console.error);
		throw lastError;
	}

	db = drizzle(client);

	await db.execute(sql`CREATE SCHEMA if not exists "seeder_lib_pg";`);

	await db.execute(
		sql`
			CREATE TYPE "seeder_lib_pg"."mood_enum" AS ENUM('sad', 'ok', 'happy');
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."all_data_types" (
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
				"mood_enum" "seeder_lib_pg"."mood_enum",
				"uuid" uuid,
				"inet" inet,
				"geometry" geometry(point, 0),
				"vector" vector(3)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."all_array_data_types" (
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
				"mood_enum_array" "seeder_lib_pg"."mood_enum"[],
				"uuid_array" uuid[],
				"inet_array" inet[],
				"geometry_array" geometry(point, 0)[]
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

afterEach(async () => {
	await reset(db, schema);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await cockroachContainer?.stop().catch(console.error);
});

test('all data types test', async () => {
	await seed(db, { allDataTypes: schema.allDataTypes }, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});

test('all array data types test', async () => {
	await seed(db, { allArrayDataTypes: schema.allArrayDataTypes }, { count: 1 });

	const allArrayDataTypes = await db.select().from(schema.allArrayDataTypes);
	// every value in each rows does not equal undefined.
	const predicate = allArrayDataTypes.every((row) =>
		Object.values(row).every((val) => val !== undefined && val !== null && (val.length === 10 || val.length === 1))
	);

	expect(predicate).toBe(true);
});

test('intervals test', async () => {
	await seed(db, { intervals: schema.intervals }, { count: 1000 });

	const intervals = await db.select().from(schema.intervals);
	// every value in each rows does not equal undefined.
	const predicate = intervals.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
