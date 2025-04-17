import { PGlite } from '@electric-sql/pglite';
import { relations, sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { reset, seed } from '../../src/index.ts';
import * as schema from './pgSchema.ts';

let client: PGlite;
let db: PgliteDatabase;

beforeAll(async () => {
	client = new PGlite();

	db = drizzle(client);

	await db.execute(sql`CREATE SCHEMA "seeder_lib_pg";`);
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

	await db.execute(
		sql`
			    CREATE TABLE IF NOT EXISTS "seeder_lib_pg"."identity_columns_table" (
				"id" integer generated always as identity,
				"id1" integer generated by default as identity,
				"name" text
			);    
		`,
	);

	await db.execute(
		sql`
			create table "seeder_lib_pg"."users"
			(
			    id          serial
			        primary key,
			    name        text,
			    "invitedBy" integer
			        constraint "users_invitedBy_user_id_fk"
			            references "seeder_lib_pg"."users"
			);
		`,
	);

	await db.execute(
		sql`
			create table "seeder_lib_pg"."posts"
			(
			    id          serial
			        primary key,
			    name        text,
				content     text,
			    "userId" integer
			        constraint "users_userId_user_id_fk"
			            references "seeder_lib_pg"."users"
			);
		`,
	);
});

afterEach(async () => {
	await reset(db, schema);
});

afterAll(async () => {
	await client.close();
});

test('basic seed test', async () => {
	await seed(db, schema);

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
	await seed(db, schema, { count: 11 });

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
	await seed(db, schema, { count: 11 }).refine(() => ({
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
	await seed(db, schema, { count: 11 }).refine(() => ({
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
	await seed(db, schema, { count: 11 }).refine(() => ({
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

test('seeding with self relation', async () => {
	await seed(db, { users: schema.users });

	const result = await db.select().from(schema.users);

	expect(result.length).toBe(10);
	const predicate = result.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('overlapping a foreign key constraint with a one-to-many relation', async () => {
	const postsRelation = relations(schema.posts, ({ one }) => ({
		user: one(schema.users, { fields: [schema.posts.userId], references: [schema.users.id] }),
	}));

	const consoleMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

	await reset(db, { users: schema.users, posts: schema.posts, postsRelation });
	await seed(db, { users: schema.users, posts: schema.posts, postsRelation });
	// expecting to get a warning
	expect(consoleMock).toBeCalled();
	expect(consoleMock).toBeCalledWith(expect.stringMatching(/^You are providing a one-to-many relation.+/));

	const users = await db.select().from(schema.users);
	const posts = await db.select().from(schema.posts);

	expect(users.length).toBe(10);
	let predicate = users.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	expect(posts.length).toBe(10);
	predicate = posts.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});
