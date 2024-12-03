import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { seed } from '../../../index.ts';
import * as schema from './pgSchema.ts';

let client: PGlite;
let db: PgliteDatabase;

beforeAll(async () => {
	client = new PGlite();

	db = drizzle(client);

	await db.execute(sql`CREATE SCHEMA "seeder_lib_pg";`);

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
				"serial" serial NOT NULL,
				"smallserial" "smallserial" NOT NULL,
				"bigserial" bigserial,
				"bigserial_number" bigserial NOT NULL,
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
				"mood_enum" "seeder_lib_pg"."mood_enum"
			);
		`,
	);
});

afterAll(async () => {
	await client.close();
});

test('all data types test', async () => {
	await seed(db, schema, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
