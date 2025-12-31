import { afterAll, beforeAll, expect, test } from 'vitest';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { reset, seed } from '../../../src/index.ts';
import * as schema from './pgSchema.ts';

import { sql } from 'drizzle-orm';
import cities from '../../../src/datasets/cityNames.ts';
import countries from '../../../src/datasets/countries.ts';
import firstNames from '../../../src/datasets/firstNames.ts';
import lastNames from '../../../src/datasets/lastNames.ts';

let client: PGlite;
let db: PgliteDatabase;

beforeAll(async () => {
	client = new PGlite({ extensions: { vector } });

	await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

	db = drizzle({ client });

	await db.execute(sql`CREATE SCHEMA "seeder_lib_pg";`);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 CREATE TYPE "seeder_lib_pg"."enum" AS ENUM('sad', 'ok', 'happy');
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;  
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."default_table" (
				"default_string" text
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."default_array_table" (
				"default_string" text[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."boolean_table" (
				"boolean" boolean
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."boolean_array_table" (
				"boolean" boolean[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."city_table" (
				"city" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."city_unique_table" (
				"city_unique" varchar(256),
				CONSTRAINT "city_unique_table_city_unique_unique" UNIQUE("city_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."city_array_table" (
				"city" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."company_name_table" (
				"company_name" text
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."company_name_unique_table" (
				"company_name_unique" varchar(256),
				CONSTRAINT "company_name_unique_table_company_name_unique_unique" UNIQUE("company_name_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."company_name_array_table" (
				"company_name" text[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."country_table" (
				"country" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."country_unique_table" (
				"country_unique" varchar(256),
				CONSTRAINT "country_unique_table_country_unique_unique" UNIQUE("country_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."country_array_table" (
				"country" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."date_table" (
				"date" date
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."date_array_table" (
				"date" date[],
				"date_string" date[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."email_table" (
				"email" varchar(256),
				CONSTRAINT "email_table_email_unique" UNIQUE("email")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."email_array_table" (
				"email" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."enum_table" (
				"mood_enum" "seeder_lib_pg"."enum"
			);  
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."first_name_table" (
				"first_name" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."first_name_unique_table" (
				"first_name_unique" varchar(256),
				CONSTRAINT "first_name_unique_table_first_name_unique_unique" UNIQUE("first_name_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."first_name_array_table" (
				"first_name" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."full_name__table" (
				"full_name_" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."full_name_unique_table" (
				"full_name_unique" varchar(256),
				CONSTRAINT "full_name_unique_table_full_name_unique_unique" UNIQUE("full_name_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."full_name_array_table" (
				"full_name" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."int_primary_key_table" (
				"int_primary_key" integer,
				CONSTRAINT "int_primary_key_table_int_primary_key_unique" UNIQUE("int_primary_key")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."int_table" (
				"int" integer
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."int_unique_table" (
				"int_unique" integer,
				CONSTRAINT "int_unique_table_int_unique_unique" UNIQUE("int_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."int_array_table" (
				"int" integer[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."interval_table" (
				"interval" interval
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."interval_unique_table" (
				"interval_unique" interval,
				CONSTRAINT "interval_unique_table_interval_unique_unique" UNIQUE("interval_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."interval_array_table" (
				"interval" interval[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."job_Title_table" (
				"job_title" text
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."job_title_array_table" (
				"job_title" text[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."json_table" (
				"json" json
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."json_array_table" (
				"json" json[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."last_name_table" (
				"last_name" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."last_name_unique_table" (
				"last_name_unique" varchar(256),
				CONSTRAINT "last_name_unique_table_last_name_unique_unique" UNIQUE("last_name_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."last_name_array_table" (
				"last_name" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."line_table" (
				"line" "line"
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."line_array_table" (
				"line" "line"[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."lorem_ipsum_table" (
				"lorem_ipsum" text
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."lorem_ipsum_array_table" (
				"lorem_ipsum" text[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."number_table" (
				"number" real
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."number_unique_table" (
				"number_unique" real,
				CONSTRAINT "number_unique_table_number_unique_unique" UNIQUE("number_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."number_array_table" (
				"number" real[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."phone_number_table" (
				"phoneNumber" varchar(256),
				"phone_number_template" varchar(256),
				"phone_number_prefixes" varchar(256),
				CONSTRAINT "phone_number_table_phoneNumber_unique" UNIQUE("phoneNumber"),
				CONSTRAINT "phone_number_table_phone_number_template_unique" UNIQUE("phone_number_template"),
				CONSTRAINT "phone_number_table_phone_number_prefixes_unique" UNIQUE("phone_number_prefixes")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."phone_number_array_table" (
				"phoneNumber" varchar(256)[],
				"phone_number_template" varchar(256)[],
				"phone_number_prefixes" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."point_table" (
				"point" "point"
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."point_array_table" (
				"point" "point"[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."postcode_table" (
				"postcode" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."postcode_unique_table" (
				"postcode_unique" varchar(256),
				CONSTRAINT "postcode_unique_table_postcode_unique_unique" UNIQUE("postcode_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."postcode_array_table" (
				"postcode" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."state_table" (
				"state" text
			);   
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."state_array_table" (
				"state" text[]
			);   
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."street_address_table" (
				"street_address" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."street_address_unique_table" (
				"street_address_unique" varchar(256),
				CONSTRAINT "street_address_unique_table_street_address_unique_unique" UNIQUE("street_address_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."street_address_array_table" (
				"street_address" varchar(256)[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."string_table" (
				"string" text
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."string_unique_table" (
				"string_unique" varchar(256),
				CONSTRAINT "string_unique_table_string_unique_unique" UNIQUE("string_unique")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."string_array_table" (
				"string" text[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."time_table" (
				"time" time
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."time_array_table" (
				"time" time[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."timestamp_table" (
				"timestamp" timestamp
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."timestamp_array_table" (
				"timestamp" timestamp[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."values_from_array_table" (
				"values_from_array_not_null" varchar(256) NOT NULL,
				"values_from_array_weighted_not_null" varchar(256) NOT NULL
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."values_from_array_unique_table" (
				"values_from_array" varchar(256),
				"values_from_array_not_null" varchar(256) NOT NULL,
				"values_from_array_weighted" varchar(256),
				"values_from_array_weighted_not_null" varchar(256) NOT NULL,
				CONSTRAINT "values_from_array_unique_table_values_from_array_unique" UNIQUE("values_from_array"),
				CONSTRAINT "values_from_array_unique_table_values_from_array_not_null_unique" UNIQUE("values_from_array_not_null"),
				CONSTRAINT "values_from_array_unique_table_values_from_array_weighted_unique" UNIQUE("values_from_array_weighted"),
				CONSTRAINT "values_from_array_unique_table_values_from_array_weighted_not_null_unique" UNIQUE("values_from_array_weighted_not_null")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."values_from_array_array_table" (
				"values_from_array" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."weighted_random_table" (
				"weighted_random" varchar(256)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."weighted_random_with_unique_gens_table" (
				"weighted_random_with_unique_gens" varchar(256),
				CONSTRAINT "weighted_random_with_unique_gens_table_weighted_random_with_unique_gens_unique" UNIQUE("weighted_random_with_unique_gens")
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."uuid_table" (
				"uuid" uuid
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."uuid_array_table" (
				"uuid" uuid[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."bit_string_table" (
				"bit" bit(12)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."bit_string_unique_table" (
				"bit" bit(12) unique
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."bit_string_array_table" (
				"bit" bit(12)[]
			);    
		`,
	);
	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."inet_table" (
				"inet" inet
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."inet_unique_table" (
				"inet" inet unique
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."inet_array_table" (
				"inet" inet[]
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."vector_table" (
				"vector" vector(12)
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."vector_unique_table" (
				"vector" vector(12) unique
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."vector_array_table" (
				"vector" vector(12)[]
			);    
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."composite_unique_key_table" (
			"number" real,
			"int" integer,
			"interval" interval,
			"string" varchar(256),
			"first_name" varchar(256),
			"last_name" varchar(256),
			"full_name" varchar(256),
			"country" varchar(256),
			"city" varchar(256),
			"street_address" varchar(256),
			"postcode" varchar(256),
			"company_name" varchar(256),
			"phone_number" varchar(256),
			"email" varchar(256),
			"uuid" uuid,
			"bit" bit(12),
			"inet" inet,
			"vector" vector(12),
			"values_from_array" varchar(256),
			-- "point" "point",
			-- "line" "line",
			CONSTRAINT "custom_name" UNIQUE("number","int","interval","string","first_name","last_name","full_name","country","city","street_address","postcode","company_name","phone_number","email","uuid","bit","inet","vector","values_from_array")
			);
		`,
	);
});

afterAll(async () => {
	await client.close();
});

const count = 1000;

test('enum generator test', async () => {
	await seed(db, { enumTable: schema.enumTable }).refine(() => ({
		enumTable: {
			count,
		},
	}));

	const data = await db.select().from(schema.enumTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('default generator test', async () => {
	await seed(db, { defaultTable: schema.defaultTable }).refine((funcs) => ({
		defaultTable: {
			count,
			columns: {
				defaultString: funcs.default({ defaultValue: 'default string' }),
			},
		},
	}));

	const data = await db.select().from(schema.defaultTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('default array generator test', async () => {
	await seed(db, { defaultTable: schema.defaultArrayTable }).refine((funcs) => ({
		defaultTable: {
			count,
			columns: {
				defaultString: funcs.default({ defaultValue: 'default string', arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.defaultArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('valuesFromArray generator test', async () => {
	await seed(db, { valuesFromArrayTable: schema.valuesFromArrayTable }).refine((funcs) => ({
		valuesFromArrayTable: {
			count,
			columns: {
				valuesFromArrayNotNull: funcs.valuesFromArray({ values: lastNames }),
				valuesFromArrayWeightedNotNull: funcs.valuesFromArray({
					values: [
						{ values: lastNames, weight: 0.3 },
						{ values: firstNames, weight: 0.7 },
					],
				}),
			},
		},
	}));

	const data = await db.select().from(schema.valuesFromArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('valuesFromArray unique generator test', async () => {
	// valuesFromArrayUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { valuesFromArrayUniqueTable: schema.valuesFromArrayUniqueTable }, { seed: 1 }).refine((funcs) => ({
		valuesFromArrayUniqueTable: {
			count: 49998,
			columns: {
				valuesFromArray: funcs.valuesFromArray({ values: lastNames.slice(0, 20), isUnique: true }),
				valuesFromArrayNotNull: funcs.valuesFromArray({ values: lastNames, isUnique: true }),
				valuesFromArrayWeighted: funcs.valuesFromArray({
					values: [
						{ values: lastNames.slice(0, 20000), weight: 0.3 },
						{ values: lastNames.slice(20000), weight: 0.7 },
					],
					isUnique: true,
				}),
				valuesFromArrayWeightedNotNull: funcs.valuesFromArray({
					values: [
						{ values: lastNames.slice(0, 14894), weight: 0.3 },
						{ values: lastNames.slice(14894), weight: 0.7 },
					],
					isUnique: true,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.valuesFromArrayUniqueTable);
	// console.log(valuesFromArrayUniqueTableData);
	const predicate = data.length !== 0 && data.every((row) =>
		row['valuesFromArrayWeightedNotNull'] !== null
		&& row['valuesFromArrayNotNull'] !== null
	);
	expect(predicate).toBe(true);

	await expect(
		seed(db, { valuesFromArrayUniqueTable: schema.valuesFromArrayUniqueTable }).refine((funcs) => ({
			valuesFromArrayUniqueTable: {
				count: 49998,
				columns: {
					valuesFromArrayWeightedNotNull: funcs.valuesFromArray({
						values: [
							{ values: lastNames.slice(0, 20000), weight: 0.3 },
							{ values: lastNames.slice(20000), weight: 0.7 },
						],
						isUnique: true,
					}),
				},
			},
		})),
	).rejects.toThrow(
		/^weighted values arrays is too small to generate values with specified probability for unique not null column\..+/,
	);

	await expect(
		seed(db, { valuesFromArrayUniqueTable: schema.valuesFromArrayUniqueTable }).refine((funcs) => ({
			valuesFromArrayUniqueTable: {
				count: 49998,
				columns: {
					valuesFromArrayNotNull: funcs.valuesFromArray({
						values: lastNames.slice(20),
						isUnique: true,
					}),
				},
			},
		})),
	).rejects.toThrow('There are no enough values to fill unique column.');

	await expect(
		seed(db, { valuesFromArrayUniqueTable: schema.valuesFromArrayUniqueTable }, { seed: 1 }).refine((funcs) => ({
			valuesFromArrayUniqueTable: {
				count: 49999,
				columns: {
					valuesFromArrayNotNull: funcs.valuesFromArray({
						values: lastNames,
						isUnique: true,
					}),
					valuesFromArrayWeightedNotNull: funcs.valuesFromArray({
						values: [
							{ values: lastNames.slice(0, 14854), weight: 0.3 },
							{ values: lastNames.slice(14854), weight: 0.7 },
						],
						isUnique: true,
					}),
				},
			},
		})),
	).rejects.toThrow('There are no enough values to fill unique column.');
});

test('valuesFromArray array generator test', async () => {
	await seed(db, { valuesFromArrayTable: schema.valuesFromArrayArrayTable }).refine((funcs) => ({
		valuesFromArrayTable: {
			count,
			columns: {
				valuesFromArray: funcs.valuesFromArray({ values: lastNames, arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.valuesFromArrayArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('intPrimaryKey generator test', async () => {
	await seed(db, { intPrimaryKeyTable: schema.intPrimaryKeyTable }).refine((funcs) => ({
		intPrimaryKeyTable: {
			count,
			columns: {
				intPrimaryKey: funcs.intPrimaryKey(),
			},
		},
	}));

	const data = await db.select().from(schema.intPrimaryKeyTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('number generator test', async () => {
	await seed(db, { numberTable: schema.numberTable }).refine((funcs) => ({
		numberTable: {
			count,
			columns: {
				number: funcs.number(),
			},
		},
	}));

	const data = await db.select().from(schema.numberTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('number unique generator test', async () => {
	// numberUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { numberUniqueTable: schema.numberUniqueTable }).refine((funcs) => ({
		numberUniqueTable: {
			count: 20070,
			columns: {
				numberUnique: funcs.number({ isUnique: true, minValue: -100.23, maxValue: 100.46 }),
			},
		},
	}));

	const data = await db.select().from(schema.numberUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== undefined && val !== null && val >= -100.23 && val <= 100.46)
		);
	expect(predicate).toBe(true);

	await expect(
		seed(db, { numberUniqueTable: schema.numberUniqueTable }).refine((funcs) => ({
			numberUniqueTable: {
				count: 20071,
				columns: {
					numberUnique: funcs.number({ isUnique: true, minValue: -100.23, maxValue: 100.46 }),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique integers in given range(min, max), try to make range wider.');
});

test('number array generator test', async () => {
	await seed(db, { numberTable: schema.numberArrayTable }).refine((funcs) => ({
		numberTable: {
			count,
			columns: {
				number: funcs.number({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.numberArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('int generator test', async () => {
	await seed(db, { intTable: schema.intTable }).refine((funcs) => ({
		intTable: {
			count,
			columns: {
				int: funcs.int(),
			},
		},
	}));

	const data = await db.select().from(schema.intTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('int unique generator test', async () => {
	// intUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { intUniqueTable: schema.intUniqueTable }).refine((funcs) => ({
		intUniqueTable: {
			count: 201,
			columns: {
				intUnique: funcs.int({ isUnique: true, minValue: -100, maxValue: 100 }),
			},
		},
	}));

	const data = await db.select().from(schema.intUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	await expect(
		seed(db, { intUniqueTable: schema.intUniqueTable }).refine((funcs) => ({
			intUniqueTable: {
				count: 202,
				columns: {
					intUnique: funcs.int({ isUnique: true, minValue: -100, maxValue: 100 }),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique integers in given range(min, max), try to make range wider.');
});

test('int array generator test', async () => {
	await seed(db, { intTable: schema.intArrayTable }).refine((funcs) => ({
		intTable: {
			count,
			columns: {
				int: funcs.int({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.intArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('boolean generator test', async () => {
	await seed(db, { booleanTable: schema.booleanTable }).refine((funcs) => ({
		booleanTable: {
			count,
			columns: {
				boolean: funcs.boolean(),
			},
		},
	}));

	const data = await db.select().from(schema.booleanTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('boolean array generator test', async () => {
	await seed(db, { booleanTable: schema.booleanArrayTable }).refine((funcs) => ({
		booleanTable: {
			count,
			columns: {
				boolean: funcs.boolean({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.booleanArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('date generator test', async () => {
	await seed(db, { dateTable: schema.dateTable }).refine((funcs) => ({
		dateTable: {
			count,
			columns: {
				date: funcs.date(),
			},
		},
	}));

	let data = await db.select().from(schema.dateTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== null));
	expect(predicate).toBe(true);

	// seed with parameters
	const minDate = '2025-03-07';
	const maxDate = '2025-03-09';
	await reset(db, { dateTable: schema.dateTable });
	await seed(db, { dateTable: schema.dateTable }).refine((funcs) => ({
		dateTable: {
			count,
			columns: {
				date: funcs.date({
					minDate,
					maxDate,
				}),
			},
		},
	}));

	data = await db.select().from(schema.dateTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val >= new Date(minDate) && val <= new Date(maxDate))
		);

	expect(predicate).toBe(true);

	await reset(db, { dateTable: schema.dateTable });
	await seed(db, { dateTable: schema.dateTable }).refine((funcs) => ({
		dateTable: {
			count,
			columns: {
				date: funcs.date({
					minDate,
					maxDate: minDate,
				}),
			},
		},
	}));

	data = await db.select().from(schema.dateTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(minDate).getTime())
		);
	expect(predicate).toBe(true);

	await reset(db, { dateTable: schema.dateTable });
	await seed(db, { dateTable: schema.dateTable }).refine((funcs) => ({
		dateTable: {
			count,
			columns: {
				date: funcs.date({
					minDate: new Date(minDate),
					maxDate: new Date(minDate),
				}),
			},
		},
	}));

	data = await db.select().from(schema.dateTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(minDate).getTime())
		);
	expect(predicate).toBe(true);
});

test('date array generator test', async () => {
	await seed(db, { dateTable: schema.dateArrayTable }).refine((funcs) => ({
		dateTable: {
			count,
			columns: {
				date: funcs.date({ arraySize: 3 }),
				dateString: funcs.date({ arraySize: 4 }),
			},
		},
	}));

	const data = await db.select().from(schema.dateArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== undefined && val !== null && [3, 4].includes(val.length))
		);
	expect(predicate).toBe(true);
});

test('time generator test', async () => {
	await seed(db, { timeTable: schema.timeTable }).refine((funcs) => ({
		timeTable: {
			count,
			columns: {
				time: funcs.time(),
			},
		},
	}));

	let data = await db.select().from(schema.timeTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	// seed with parameters
	const min = '13:12:13';
	const max = '15:12:13';
	await reset(db, { timeTable: schema.timeTable });
	await seed(db, { timeTable: schema.timeTable }).refine((funcs) => ({
		timeTable: {
			count,
			columns: {
				time: funcs.time({
					min,
					max,
				}),
			},
		},
	}));

	const anchorDate = new Date();
	const getDateFromTime = (val: string) => new Date(anchorDate.toISOString().replace(/\d{2}:\d{2}:\d{2}/, val));
	data = await db.select().from(schema.timeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) =>
				val !== null && getDateFromTime(val) >= getDateFromTime(min)
				&& getDateFromTime(val) <= getDateFromTime(max)
			)
		);

	expect(predicate).toBe(true);

	await reset(db, { timeTable: schema.timeTable });
	await seed(db, { timeTable: schema.timeTable }).refine((funcs) => ({
		timeTable: {
			count,
			columns: {
				time: funcs.time({
					min,
					max: min,
				}),
			},
		},
	}));

	data = await db.select().from(schema.timeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) =>
				val !== null && getDateFromTime(val).getTime() === getDateFromTime(min).getTime()
			)
		);
	expect(predicate).toBe(true);

	await reset(db, { timeTable: schema.timeTable });
	await seed(db, { timeTable: schema.timeTable }).refine((funcs) => ({
		timeTable: {
			count,
			columns: {
				time: funcs.time({
					min: getDateFromTime(min),
					max: getDateFromTime(min),
				}),
			},
		},
	}));

	data = await db.select().from(schema.timeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) =>
				val !== null && getDateFromTime(val).getTime() === getDateFromTime(min).getTime()
			)
		);
	expect(predicate).toBe(true);
});

test('time array generator test', async () => {
	await seed(db, { timeTable: schema.timeArrayTable }).refine((funcs) => ({
		timeTable: {
			count,
			columns: {
				time: funcs.time({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.timeArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('timestamp generator test', async () => {
	await seed(db, { timestampTable: schema.timestampTable }).refine((funcs) => ({
		timestampTable: {
			count,
			columns: {
				timestamp: funcs.timestamp(),
			},
		},
	}));

	let data = await db.select().from(schema.timestampTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	// seed with parameters
	const min = '2025-03-07 13:12:13.123Z';
	const max = '2025-03-09 15:12:13.456Z';
	await reset(db, { timestampTable: schema.timestampTable });
	await seed(db, { timestampTable: schema.timestampTable }).refine((funcs) => ({
		timestampTable: {
			count,
			columns: {
				timestamp: funcs.timestamp({
					min,
					max,
				}),
			},
		},
	}));

	data = await db.select().from(schema.timestampTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) =>
				val !== null && val >= new Date(min)
				&& val <= new Date(max)
			)
		);

	expect(predicate).toBe(true);

	await reset(db, { timestampTable: schema.timestampTable });
	await seed(db, { timestampTable: schema.timestampTable }).refine((funcs) => ({
		timestampTable: {
			count,
			columns: {
				timestamp: funcs.timestamp({
					min,
					max: min,
				}),
			},
		},
	}));

	data = await db.select().from(schema.timestampTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(min).getTime())
		);

	expect(predicate).toBe(true);

	await reset(db, { timestampTable: schema.timestampTable });
	await seed(db, { timestampTable: schema.timestampTable }).refine((funcs) => ({
		timestampTable: {
			count,
			columns: {
				timestamp: funcs.timestamp({
					min: new Date(min),
					max: new Date(min),
				}),
			},
		},
	}));

	data = await db.select().from(schema.timestampTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(min).getTime())
		);

	expect(predicate).toBe(true);
});

test('timestamp array generator test', async () => {
	await seed(db, { timestampTable: schema.timestampArrayTable }).refine((funcs) => ({
		timestampTable: {
			count,
			columns: {
				timestamp: funcs.timestamp({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.timestampArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('json generator test', async () => {
	await seed(db, { jsonTable: schema.jsonTable }).refine((funcs) => ({
		jsonTable: {
			count,
			columns: {
				json: funcs.json(),
			},
		},
	}));

	const data = await db.select().from(schema.jsonTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('json array generator test', async () => {
	await seed(db, { jsonTable: schema.jsonArrayTable }).refine((funcs) => ({
		jsonTable: {
			count,
			columns: {
				json: funcs.json({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.jsonArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('interval generator test', async () => {
	await seed(db, { intervalTable: schema.intervalTable }).refine((funcs) => ({
		intervalTable: {
			count,
			columns: {
				interval: funcs.interval(),
			},
		},
	}));

	const data = await db.select().from(schema.intervalTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('interval unique generator test', async () => {
	// intervalUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { intervalUniqueTable: schema.intervalUniqueTable }).refine((funcs) => ({
		intervalUniqueTable: {
			count,
			columns: {
				intervalUnique: funcs.interval({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.intervalUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('interval array generator test', async () => {
	await seed(db, { intervalTable: schema.intervalArrayTable }).refine((funcs) => ({
		intervalTable: {
			count,
			columns: {
				interval: funcs.interval({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.intervalArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('string generator test', async () => {
	await seed(db, { stringTable: schema.stringTable }).refine((funcs) => ({
		stringTable: {
			count,
			columns: {
				string: funcs.string(),
			},
		},
	}));

	const data = await db.select().from(schema.stringTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('string unique generator test', async () => {
	await seed(db, { stringUniqueTable: schema.stringUniqueTable }).refine((funcs) => ({
		stringUniqueTable: {
			count,
			columns: {
				stringUnique: funcs.string({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.stringUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('string array generator test', async () => {
	await seed(db, { stringTable: schema.stringArrayTable }).refine((funcs) => ({
		stringTable: {
			count,
			columns: {
				string: funcs.string({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.stringArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('email generator test', async () => {
	await seed(db, { emailTable: schema.emailTable }).refine((funcs) => ({
		emailTable: {
			count,
			columns: {
				email: funcs.email(),
			},
		},
	}));

	const data = await db.select().from(schema.emailTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('email array generator test', async () => {
	await seed(db, { emailTable: schema.emailArrayTable }).refine((funcs) => ({
		emailTable: {
			count,
			columns: {
				email: funcs.email({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.emailArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('firstName generator test', async () => {
	await seed(db, { firstNameTable: schema.firstNameTable }).refine((funcs) => ({
		firstNameTable: {
			count,
			columns: {
				firstName: funcs.firstName(),
			},
		},
	}));

	const data = await db.select().from(schema.firstNameTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('firstName unique generator test', async () => {
	// firstNameUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { firstNameUniqueTable: schema.firstNameUniqueTable }).refine((funcs) => ({
		firstNameUniqueTable: {
			count: 30274,
			columns: {
				firstNameUnique: funcs.firstName({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.firstNameUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	await expect(
		seed(db, { firstNameUniqueTable: schema.firstNameUniqueTable }, { count: 30275 }).refine((funcs) => ({
			firstNameUniqueTable: {
				count: 30275,
				columns: {
					firstNameUnique: funcs.firstName({ isUnique: true }),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique first names.');
});

test('firstName array generator test', async () => {
	await seed(db, { firstNameTable: schema.firstNameArrayTable }).refine((funcs) => ({
		firstNameTable: {
			count,
			columns: {
				firstName: funcs.firstName({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.firstNameArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('lastName generator test', async () => {
	await seed(db, { lastNameTable: schema.lastNameTable }).refine((funcs) => ({
		lastNameTable: {
			count,
			columns: {
				lastName: funcs.lastName(),
			},
		},
	}));

	const data = await db.select().from(schema.lastNameTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('lastName unique generator test', async () => {
	// lastNameUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { lastNameUniqueTable: schema.lastNameUniqueTable }).refine((funcs) => ({
		lastNameUniqueTable: {
			count: 49998,
			columns: {
				lastNameUnique: funcs.lastName({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.lastNameUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	await expect(
		seed(db, { lastNameUniqueTable: schema.lastNameUniqueTable }).refine((funcs) => ({
			lastNameUniqueTable: {
				count: 49999,
				columns: {
					lastNameUnique: funcs.lastName({ isUnique: true }),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique last names.');
});

test('lastName array generator test', async () => {
	await seed(db, { lastNameTable: schema.lastNameArrayTable }).refine((funcs) => ({
		lastNameTable: {
			count,
			columns: {
				lastName: funcs.lastName({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.lastNameArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('fullName generator test', async () => {
	await seed(db, { fullNameTable: schema.fullNameTable }).refine((funcs) => ({
		fullNameTable: {
			count,
			columns: {
				fullName: funcs.fullName(),
			},
		},
	}));

	const data = await db.select().from(schema.fullNameTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('fullName unique generator test', async () => {
	// fullNameUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { fullNameUniqueTable: schema.fullNameUniqueTable }).refine((funcs) => ({
		fullNameUniqueTable: {
			count,
			columns: {
				fullNameUnique: funcs.fullName({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.fullNameUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('fullName array generator test', async () => {
	await seed(db, { fullNameTable: schema.fullNameArrayTable }).refine((funcs) => ({
		fullNameTable: {
			count,
			columns: {
				fullName: funcs.fullName({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.fullNameArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('country generator test', async () => {
	await seed(db, { countryTable: schema.countryTable }).refine((funcs) => ({
		countryTable: {
			count,
			columns: {
				country: funcs.country(),
			},
		},
	}));

	const data = await db.select().from(schema.countryTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('country unique generator test', async () => {
	// countryUniqueTable-----------------------------------------------------------------------------------
	await seed(db, { countryUniqueTable: schema.countryUniqueTable }).refine((funcs) => ({
		countryUniqueTable: {
			count: countries.length,
			columns: {
				countryUnique: funcs.country({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.countryUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	await expect(
		seed(db, { countryUniqueTable: schema.countryUniqueTable }).refine((funcs) => ({
			countryUniqueTable: {
				count: countries.length + 1,
				columns: {
					countryUnique: funcs.country({ isUnique: true }),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique countries.');
});

test('country array generator test', async () => {
	await seed(db, { countryTable: schema.countryArrayTable }).refine((funcs) => ({
		countryTable: {
			count,
			columns: {
				country: funcs.country({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.countryArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('city generator test', async () => {
	await seed(db, { cityTable: schema.cityTable }).refine((funcs) => ({
		cityTable: {
			count,
			columns: {
				city: funcs.city(),
			},
		},
	}));

	const data = await db.select().from(schema.cityTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('city unique generator test', async () => {
	// cityUniqueTable-----------------------------------------------------------------------------------
	await reset(db, { cityUniqueTable: schema.cityUniqueTable });
	await seed(db, { cityUniqueTable: schema.cityUniqueTable }).refine((funcs) => ({
		cityUniqueTable: {
			count: cities.length,
			columns: {
				cityUnique: funcs.city({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.cityUniqueTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	await expect(
		seed(db, { cityUniqueTable: schema.cityUniqueTable }).refine((funcs) => ({
			cityUniqueTable: {
				count: cities.length + 1,
				columns: {
					cityUnique: funcs.city({ isUnique: true }),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique cities.');
});

test('city array generator test', async () => {
	await seed(db, { cityTable: schema.cityArrayTable }).refine((funcs) => ({
		cityTable: {
			count,
			columns: {
				city: funcs.city({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.cityArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('streetAddress generator test', async () => {
	await seed(db, { streetAddressTable: schema.streetAddressTable }).refine((funcs) => ({
		streetAddressTable: {
			count,
			columns: {
				streetAddress: funcs.streetAddress(),
			},
		},
	}));

	const data = await db.select().from(schema.streetAddressTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('streetAddress unique generator test', async () => {
	await seed(db, { streetAddressUniqueTable: schema.streetAddressUniqueTable }).refine((funcs) => ({
		streetAddressUniqueTable: {
			count,
			columns: {
				streetAddressUnique: funcs.streetAddress({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.streetAddressUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('streetAddress array generator test', async () => {
	await seed(db, { streetAddressTable: schema.streetAddressArrayTable }).refine((funcs) => ({
		streetAddressTable: {
			count,
			columns: {
				streetAddress: funcs.streetAddress({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.streetAddressArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('jobTitle generator test', async () => {
	await seed(db, { jobTitleTable: schema.jobTitleTable }).refine((funcs) => ({
		jobTitleTable: {
			count,
			columns: {
				jobTitle: funcs.jobTitle(),
			},
		},
	}));

	const data = await db.select().from(schema.jobTitleTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('jobTitle array generator test', async () => {
	await seed(db, { jobTitleTable: schema.jobTitleArrayTable }).refine((funcs) => ({
		jobTitleTable: {
			count,
			columns: {
				jobTitle: funcs.jobTitle({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.jobTitleArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('postcode generator test', async () => {
	await seed(db, { postcodeTable: schema.postcodeTable }).refine((funcs) => ({
		postcodeTable: {
			count,
			columns: {
				postcode: funcs.postcode(),
			},
		},
	}));

	const data = await db.select().from(schema.postcodeTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('postcode unique generator test', async () => {
	await seed(db, { postcodeUniqueTable: schema.postcodeUniqueTable }).refine((funcs) => ({
		postcodeUniqueTable: {
			count,
			columns: {
				postcodeUnique: funcs.postcode({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.postcodeUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('postcode array generator test', async () => {
	await seed(db, { postcodeTable: schema.postcodeArrayTable }).refine((funcs) => ({
		postcodeTable: {
			count,
			columns: {
				postcode: funcs.postcode({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.postcodeArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('state generator test', async () => {
	await seed(db, { stateTable: schema.stateTable }).refine((funcs) => ({
		stateTable: {
			count,
			columns: {
				state: funcs.state(),
			},
		},
	}));

	const data = await db.select().from(schema.stateTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('state array generator test', async () => {
	await seed(db, { stateTable: schema.stateArrayTable }).refine((funcs) => ({
		stateTable: {
			count,
			columns: {
				state: funcs.state({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.stateArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('companyName generator test', async () => {
	await seed(db, { companyNameTable: schema.companyNameTable }).refine((funcs) => ({
		companyNameTable: {
			count,
			columns: {
				companyName: funcs.companyName(),
			},
		},
	}));

	const data = await db.select().from(schema.companyNameTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('companyName unique generator test', async () => {
	await seed(db, { companyNameUniqueTable: schema.companyNameUniqueTable }).refine((funcs) => ({
		companyNameUniqueTable: {
			count,
			columns: {
				companyNameUnique: funcs.companyName({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.companyNameUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('companyName array generator test', async () => {
	await seed(db, { companyNameTable: schema.companyNameArrayTable }).refine((funcs) => ({
		companyNameTable: {
			count,
			columns: {
				companyName: funcs.companyName({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.companyNameArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('loremIpsum generator test', async () => {
	await seed(db, { loremIpsumTable: schema.loremIpsumTable }).refine((funcs) => ({
		loremIpsumTable: {
			count,
			columns: {
				loremIpsum: funcs.loremIpsum(),
			},
		},
	}));

	const data = await db.select().from(schema.loremIpsumTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('loremIpsum array generator test', async () => {
	await seed(db, { loremIpsumTable: schema.loremIpsumArrayTable }).refine((funcs) => ({
		loremIpsumTable: {
			count,
			columns: {
				loremIpsum: funcs.loremIpsum({ arraySize: 3 }),
			},
		},
	}));

	const data = await db.select().from(schema.loremIpsumArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 3));
	expect(predicate).toBe(true);
});

test('point generator test', async () => {
	await seed(db, { pointTable: schema.pointTable }).refine((funcs) => ({
		pointTable: {
			count,
			columns: {
				point: funcs.point(),
			},
		},
	}));

	const data = await db.select().from(schema.pointTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('point unique generator test', async () => {
	await reset(db, { pointTable: schema.pointTable });
	await seed(db, { pointTable: schema.pointTable }).refine((funcs) => ({
		pointTable: {
			count,
			columns: {
				point: funcs.point({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.pointTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	// using Set because PGlite does not support unique point
	const pointStrsSet = new Set<string>(data.map((row) => row.point!.map(String).join(',')));
	predicate = pointStrsSet.size === data.length;
	expect(predicate).toBe(true);
});

test('point array generator test', async () => {
	await seed(db, { pointTable: schema.pointArrayTable }).refine((funcs) => ({
		pointTable: {
			count,
			columns: {
				point: funcs.point({ arraySize: 2 }),
			},
		},
	}));

	const data = await db.select().from(schema.pointArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 2));
	expect(predicate).toBe(true);
});

test('line generator test', async () => {
	await seed(db, { lineTable: schema.lineTable }).refine((funcs) => ({
		lineTable: {
			count,
			columns: {
				line: funcs.line(),
			},
		},
	}));

	const data = await db.select().from(schema.lineTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('line unique generator test', async () => {
	await reset(db, { lineTable: schema.lineTable });
	await seed(db, { lineTable: schema.lineTable }).refine((funcs) => ({
		lineTable: {
			count,
			columns: {
				line: funcs.line({ isUnique: true }),
			},
		},
	}));

	const data = await db.select().from(schema.lineTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	// using Set because PGlite does not support unique point
	const lineStrsSet = new Set<string>(data.map((row) => row.line!.map(String).join(',')));
	predicate = lineStrsSet.size === data.length;
	expect(predicate).toBe(true);
});

test('line array generator test', async () => {
	await seed(db, { lineTable: schema.lineArrayTable }).refine((funcs) => ({
		lineTable: {
			count,
			columns: {
				line: funcs.line({ arraySize: 2 }),
			},
		},
	}));

	const data = await db.select().from(schema.lineArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null && val.length === 2));
	expect(predicate).toBe(true);
});

test('phoneNumber generator test', async () => {
	await seed(db, { phoneNumberTable: schema.phoneNumberTable }).refine((funcs) => ({
		phoneNumberTable: {
			count,
			columns: {
				phoneNumber: funcs.phoneNumber(),
				phoneNumberPrefixes: funcs.phoneNumber({
					prefixes: ['+380 99', '+380 67', '+1'],
					generatedDigitsNumbers: [7, 7, 10],
				}),
				phoneNumberTemplate: funcs.phoneNumber({ template: '+380 ## ## ### ##' }),
			},
		},
	}));

	const data = await db.select().from(schema.phoneNumberTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('phoneNumber array generator test', async () => {
	await seed(db, { phoneNumberTable: schema.phoneNumberArrayTable }).refine((funcs) => ({
		phoneNumberTable: {
			count,
			columns: {
				phoneNumber: funcs.phoneNumber({ arraySize: 3 }),
				phoneNumberPrefixes: funcs.phoneNumber({
					prefixes: ['+380 99', '+380 67', '+1'],
					generatedDigitsNumbers: [7, 7, 10],
					arraySize: 4,
				}),
				phoneNumberTemplate: funcs.phoneNumber({
					template: '+380 ## ## ### ##',
					arraySize: 5,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.phoneNumberArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== undefined && val !== null && [3, 4, 5].includes(val.length))
		);
	expect(predicate).toBe(true);
});

test('weightedRandom generator test', async () => {
	await seed(db, { weightedRandomTable: schema.weightedRandomTable }).refine((funcs) => ({
		weightedRandomTable: {
			count,
			columns: {
				weightedRandom: funcs.weightedRandom([
					{ value: funcs.default({ defaultValue: 'default value' }), weight: 0.3 },
					{ value: funcs.loremIpsum(), weight: 0.7 },
				]),
			},
		},
	}));

	const data = await db.select().from(schema.weightedRandomTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('weightedRandom with unique gens generator test', async () => {
	await seed(db, { weightedRandomWithUniqueGensTable: schema.weightedRandomWithUniqueGensTable }).refine((funcs) => ({
		weightedRandomWithUniqueGensTable: {
			count: 10000,
			columns: {
				weightedRandomWithUniqueGens: funcs.weightedRandom([
					{ weight: 0.3, value: funcs.email() },
					{ weight: 0.7, value: funcs.firstName({ isUnique: true }) },
				]),
			},
		},
	}));

	const data = await db.select().from(schema.weightedRandomWithUniqueGensTable);
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	await expect(
		seed(db, { weightedRandomWithUniqueGensTable: schema.weightedRandomWithUniqueGensTable }).refine((funcs) => ({
			weightedRandomWithUniqueGensTable: {
				count: 40000,
				columns: {
					weightedRandomWithUniqueGens: funcs.weightedRandom([
						{ weight: 0.1, value: funcs.email() },
						{ weight: 0.9, value: funcs.firstName({ isUnique: true }) },
					]),
				},
			},
		})),
	).rejects.toThrow('count exceeds max number of unique first names.');

	await expect(
		seed(db, { weightedRandomWithUniqueGensTable: schema.weightedRandomWithUniqueGensTable }).refine((funcs) => ({
			weightedRandomWithUniqueGensTable: {
				count: 10000,
				columns: {
					weightedRandomWithUniqueGens: funcs.weightedRandom([
						{ weight: 0.2, value: funcs.email() },
						{ weight: 0.9, value: funcs.firstName({ isUnique: true }) },
					]),
				},
			},
		})),
	).rejects.toThrow(
		'The weights for the Weighted Random feature must add up to exactly 1. Please review your weights to ensure they total 1 before proceeding',
	);
});

test('uuid generator test', async () => {
	await reset(db, { uuidTable: schema.uuidTable });
	await seed(db, { uuidTable: schema.uuidTable }).refine((funcs) => ({
		uuidTable: {
			count,
			columns: {
				uuid: funcs.uuid(),
			},
		},
	}));

	const data = await db.select().from(schema.uuidTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	const uuidStrsSet = new Set<string>(data.map((row) => row.uuid!));
	predicate = uuidStrsSet.size === data.length;
	expect(predicate).toBe(true);
});

test('uuid array generator test', async () => {
	await reset(db, { uuidArrayTable: schema.uuidArrayTable });
	await seed(db, { uuidArrayTable: schema.uuidArrayTable }).refine((funcs) => ({
		uuidArrayTable: {
			count,
			columns: {
				uuid: funcs.uuid({ arraySize: 4 }),
			},
		},
	}));

	const data = await db.select().from(schema.uuidArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('bitString generator test', async () => {
	await reset(db, { bitStringTable: schema.bitStringTable });
	await seed(db, { bitStringTable: schema.bitStringTable }).refine((funcs) => ({
		bitStringTable: {
			count,
			columns: {
				bit: funcs.bitString({
					dimensions: 12,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.bitStringTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('bitString unique generator test', async () => {
	await reset(db, { bitStringUniqueTable: schema.bitStringUniqueTable });
	await seed(db, { bitStringUniqueTable: schema.bitStringUniqueTable }).refine((funcs) => ({
		bitStringUniqueTable: {
			count,
			columns: {
				bit: funcs.bitString({
					isUnique: true,
					dimensions: 12,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.bitStringUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('bitString array generator test', async () => {
	await reset(db, { bitStringArrayTable: schema.bitStringArrayTable });
	await seed(db, { bitStringArrayTable: schema.bitStringArrayTable }).refine((funcs) => ({
		bitStringArrayTable: {
			count,
			columns: {
				bit: funcs.bitString({
					arraySize: 4,
					dimensions: 12,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.bitStringArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('inet generator test', async () => {
	await reset(db, { inetTable: schema.inetTable });
	await seed(db, { inetTable: schema.inetTable }).refine((funcs) => ({
		inetTable: {
			count,
			columns: {
				inet: funcs.inet({
					ipAddress: 'ipv4',
					includeCidr: true,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.inetTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('inet unique generator test', async () => {
	await reset(db, { inetUniqueTable: schema.inetUniqueTable });
	await seed(db, { inetUniqueTable: schema.inetUniqueTable }).refine((funcs) => ({
		inetUniqueTable: {
			count,
			columns: {
				inet: funcs.inet({
					isUnique: true,
					ipAddress: 'ipv4',
					includeCidr: true,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.inetUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('inet array generator test', async () => {
	await reset(db, { inetArrayTable: schema.inetArrayTable });
	await seed(db, { inetArrayTable: schema.inetArrayTable }).refine((funcs) => ({
		inetArrayTable: {
			count,
			columns: {
				inet: funcs.inet({
					arraySize: 4,
					ipAddress: 'ipv4',
					includeCidr: true,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.inetArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('vector generator test', async () => {
	await reset(db, { vectorTable: schema.vectorTable });
	await seed(db, { vectorTable: schema.vectorTable }).refine((funcs) => ({
		vectorTable: {
			count,
			columns: {
				vector: funcs.vector({
					decimalPlaces: 5,
					dimensions: 12,
					minValue: -100,
					maxValue: 100,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.vectorTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('vector unique generator test', async () => {
	await reset(db, { vectorUniqueTable: schema.vectorUniqueTable });
	await seed(db, { vectorUniqueTable: schema.vectorUniqueTable }).refine((funcs) => ({
		vectorUniqueTable: {
			count,
			columns: {
				vector: funcs.vector({
					isUnique: true,
					decimalPlaces: 5,
					dimensions: 12,
					minValue: -100,
					maxValue: 100,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.vectorUniqueTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('vector array generator test', async () => {
	await reset(db, { vectorArrayTable: schema.vectorArrayTable });
	await seed(db, { vectorArrayTable: schema.vectorArrayTable }).refine((funcs) => ({
		vectorArrayTable: {
			count,
			columns: {
				vector: funcs.vector({
					arraySize: 4,
					decimalPlaces: 5,
					dimensions: 12,
					minValue: -100,
					maxValue: 100,
				}),
			},
		},
	}));

	const data = await db.select().from(schema.vectorArrayTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('composite unique key generator test', async () => {
	await reset(db, { compositeUniqueKeyTable: schema.compositeUniqueKeyTable });
	await seed(db, { compositeUniqueKeyTable: schema.compositeUniqueKeyTable }, { count: 10000 }).refine((funcs) => ({
		compositeUniqueKeyTable: {
			columns: {
				number: funcs.number(),
				int: funcs.int(),
				interval: funcs.interval(),
				string: funcs.string(),
				firstName: funcs.firstName(),
				lastName: funcs.lastName(),
				fullName: funcs.fullName(),
				country: funcs.country(),
				city: funcs.city(),
				streetAddress: funcs.streetAddress(),
				postcode: funcs.postcode(),
				companyName: funcs.companyName(),
				phoneNumber: funcs.phoneNumber(),
				email: funcs.email(),
				uuid: funcs.uuid(),
				bit: funcs.bitString(),
				inet: funcs.inet(),
				vector: funcs.vector(),
				valuesFromArray: funcs.valuesFromArray({ values: Array.from({ length: 20 }, (_, i) => String(i + 1)) }),
				// point: funcs.point(),
				// line: funcs.line(),
			},
		},
	}));

	const data = await db.select().from(schema.compositeUniqueKeyTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});
