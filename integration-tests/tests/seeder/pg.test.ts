import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { cities, countries, firstNames, lastNames, reset, seed } from 'drizzle-seed';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import * as schema from './pgSchema.ts';

let client: PGlite;
let db: PgliteDatabase;

const createNorthwindTables = async () => {
	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."customer" (
				"id" varchar(256) PRIMARY KEY NOT NULL,
				"company_name" text NOT NULL,
				"contact_name" text NOT NULL,
				"contact_title" text NOT NULL,
				"address" text NOT NULL,
				"city" text NOT NULL,
				"postal_code" text,
				"region" text,
				"country" text NOT NULL,
				"phone" text NOT NULL,
				"fax" text
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."order_detail" (
				"unit_price" numeric NOT NULL,
				"quantity" integer NOT NULL,
				"discount" numeric NOT NULL,
				"order_id" integer NOT NULL,
				"product_id" integer NOT NULL
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."employee" (
				"id" integer PRIMARY KEY NOT NULL,
				"last_name" text NOT NULL,
				"first_name" text,
				"title" text NOT NULL,
				"title_of_courtesy" text NOT NULL,
				"birth_date" timestamp NOT NULL,
				"hire_date" timestamp NOT NULL,
				"address" text NOT NULL,
				"city" text NOT NULL,
				"postal_code" text NOT NULL,
				"country" text NOT NULL,
				"home_phone" text NOT NULL,
				"extension" integer NOT NULL,
				"notes" text NOT NULL,
				"reports_to" integer,
				"photo_path" text
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."order" (
				"id" integer PRIMARY KEY NOT NULL,
				"order_date" timestamp NOT NULL,
				"required_date" timestamp NOT NULL,
				"shipped_date" timestamp,
				"ship_via" integer NOT NULL,
				"freight" numeric NOT NULL,
				"ship_name" text NOT NULL,
				"ship_city" text NOT NULL,
				"ship_region" text,
				"ship_postal_code" text,
				"ship_country" text NOT NULL,
				"customer_id" text NOT NULL,
				"employee_id" integer NOT NULL
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."product" (
				"id" integer PRIMARY KEY NOT NULL,
				"name" text NOT NULL,
				"quantity_per_unit" text NOT NULL,
				"unit_price" numeric NOT NULL,
				"units_in_stock" integer NOT NULL,
				"units_on_order" integer NOT NULL,
				"reorder_level" integer NOT NULL,
				"discontinued" integer NOT NULL,
				"supplier_id" integer NOT NULL
			);    
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."supplier" (
				"id" integer PRIMARY KEY NOT NULL,
				"company_name" text NOT NULL,
				"contact_name" text NOT NULL,
				"contact_title" text NOT NULL,
				"address" text NOT NULL,
				"city" text NOT NULL,
				"region" text,
				"postal_code" text NOT NULL,
				"country" text NOT NULL,
				"phone" text NOT NULL
			);    
		`,
	);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 ALTER TABLE "seeder_lib_pg"."order_detail" ADD CONSTRAINT "order_detail_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "seeder_lib_pg"."order"("id") ON DELETE cascade ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;
		`,
	);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 ALTER TABLE "seeder_lib_pg"."order_detail" ADD CONSTRAINT "order_detail_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "seeder_lib_pg"."product"("id") ON DELETE cascade ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;    
		`,
	);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 ALTER TABLE "seeder_lib_pg"."employee" ADD CONSTRAINT "employee_reports_to_employee_id_fk" FOREIGN KEY ("reports_to") REFERENCES "seeder_lib_pg"."employee"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;    
		`,
	);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 ALTER TABLE "seeder_lib_pg"."order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "seeder_lib_pg"."customer"("id") ON DELETE cascade ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;    
		`,
	);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 ALTER TABLE "seeder_lib_pg"."order" ADD CONSTRAINT "order_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "seeder_lib_pg"."employee"("id") ON DELETE cascade ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;    
		`,
	);

	await db.execute(
		sql`
			    DO $$ BEGIN
			 ALTER TABLE "seeder_lib_pg"."product" ADD CONSTRAINT "product_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "seeder_lib_pg"."supplier"("id") ON DELETE cascade ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;    
		`,
	);
};

const createAllDataTypesTable = async () => {
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
};

const createAllGeneratorsTables = async () => {
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
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."job_title_table" (
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
			CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."identity_columns_table" (
							"id" integer GENERATED ALWAYS AS IDENTITY,
							"id1" integer,
							"name" text
						); 
		`,
	);
};

beforeAll(async () => {
	client = new PGlite();

	db = drizzle(client);

	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "seeder_lib_pg";`);

	await createNorthwindTables();
	await createAllDataTypesTable();
	await createAllGeneratorsTables();
});

afterEach(async () => {
	await reset(db, schema);
});

afterAll(async () => {
	await client.close();
});

test('basic seed test', async () => {
	const currSchema = {
		customers: schema.customers,
		details: schema.details,
		employees: schema.employees,
		orders: schema.orders,
		products: schema.products,
		suppliers: schema.suppliers,
	};
	await seed(db, currSchema);

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(10);
	expect(details.length).toBe(10);
	expect(employees.length).toBe(10);
	expect(orders.length).toBe(10);
	expect(products.length).toBe(10);
	expect(suppliers.length).toBe(10);
});

test('seed with options.count:11 test', async () => {
	const currSchema = {
		customers: schema.customers,
		details: schema.details,
		employees: schema.employees,
		orders: schema.orders,
		products: schema.products,
		suppliers: schema.suppliers,
	};
	await seed(db, currSchema, { count: 11 });

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(11);
	expect(details.length).toBe(11);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(11);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test('redefine(refine) customers count', async () => {
	const currSchema = {
		customers: schema.customers,
		details: schema.details,
		employees: schema.employees,
		orders: schema.orders,
		products: schema.products,
		suppliers: schema.suppliers,
	};
	await seed(db, currSchema, { count: 11 }).refine(() => ({
		customers: {
			count: 12,
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(12);
	expect(details.length).toBe(11);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(11);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test('redefine(refine) all tables count', async () => {
	const currSchema = {
		customers: schema.customers,
		details: schema.details,
		employees: schema.employees,
		orders: schema.orders,
		products: schema.products,
		suppliers: schema.suppliers,
	};
	await seed(db, currSchema, { count: 11 }).refine(() => ({
		customers: {
			count: 12,
		},
		details: {
			count: 13,
		},
		employees: {
			count: 14,
		},
		orders: {
			count: 15,
		},
		products: {
			count: 16,
		},
		suppliers: {
			count: 17,
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(12);
	expect(details.length).toBe(13);
	expect(employees.length).toBe(14);
	expect(orders.length).toBe(15);
	expect(products.length).toBe(16);
	expect(suppliers.length).toBe(17);
});

test("redefine(refine) orders count using 'with' in customers", async () => {
	const currSchema = {
		customers: schema.customers,
		details: schema.details,
		employees: schema.employees,
		orders: schema.orders,
		products: schema.products,
		suppliers: schema.suppliers,
	};
	await seed(db, currSchema, { count: 11 }).refine(() => ({
		customers: {
			count: 4,
			with: {
				orders: 2,
			},
		},
		orders: {
			count: 13,
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(4);
	expect(details.length).toBe(11);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(8);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test("sequential using of 'with'", async () => {
	const currSchema = {
		customers: schema.customers,
		details: schema.details,
		employees: schema.employees,
		orders: schema.orders,
		products: schema.products,
		suppliers: schema.suppliers,
	};
	await seed(db, currSchema, { count: 11 }).refine(() => ({
		customers: {
			count: 4,
			with: {
				orders: 2,
			},
		},
		orders: {
			count: 12,
			with: {
				details: 3,
			},
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(4);
	expect(details.length).toBe(24);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(8);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test('seeding with identity columns', async () => {
	await seed(db, { identityColumnsTable: schema.identityColumnsTable });

	const result = await db.select().from(schema.identityColumnsTable);

	expect(result.length).toBe(10);
});

// All data types test -------------------------------
test('basic seed test for all postgres data types', async () => {
	await seed(db, { allDataTypes: schema.allDataTypes }, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);
	// every value in each 10 rows does not equal undefined.
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

// All generators test-------------------------------
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
						{ values: lastNames.slice(0, 14920), weight: 0.3 },
						{ values: lastNames.slice(14920), weight: 0.7 },
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

	const data = await db.select().from(schema.dateTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
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

	const data = await db.select().from(schema.timeTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
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

	const data = await db.select().from(schema.timestampTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
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
