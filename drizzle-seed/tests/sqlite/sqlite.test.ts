import BetterSqlite3 from 'better-sqlite3';
import { relations, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { reset, seed } from '../../src/index.ts';
import * as schema from './sqliteSchema.ts';

let client: BetterSqlite3.Database;
let db: BetterSQLite3Database;

beforeAll(async () => {
	client = new BetterSqlite3(':memory:');

	db = drizzle(client);

	db.run(
		sql.raw(`
    CREATE TABLE \`customer\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`company_name\` text NOT NULL,
	\`contact_name\` text NOT NULL,
	\`contact_title\` text NOT NULL,
	\`address\` text NOT NULL,
	\`city\` text NOT NULL,
	\`postal_code\` text,
	\`region\` text,
	\`country\` text NOT NULL,
	\`phone\` text NOT NULL,
	\`fax\` text
);
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`order_detail\` (
	\`unit_price\` numeric NOT NULL,
	\`quantity\` integer NOT NULL,
	\`discount\` numeric NOT NULL,
	\`order_id\` integer NOT NULL,
	\`product_id\` integer NOT NULL,
	FOREIGN KEY (\`order_id\`) REFERENCES \`order\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`product_id\`) REFERENCES \`product\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`employee\` (
	\`id\` integer PRIMARY KEY NOT NULL,
	\`last_name\` text NOT NULL,
	\`first_name\` text,
	\`title\` text NOT NULL,
	\`title_of_courtesy\` text NOT NULL,
	\`birth_date\` integer NOT NULL,
	\`hire_date\` integer NOT NULL,
	\`address\` text NOT NULL,
	\`city\` text NOT NULL,
	\`postal_code\` text NOT NULL,
	\`country\` text NOT NULL,
	\`home_phone\` text NOT NULL,
	\`extension\` integer NOT NULL,
	\`notes\` text NOT NULL,
	\`reports_to\` integer,
	\`photo_path\` text,
	FOREIGN KEY (\`reports_to\`) REFERENCES \`employee\`(\`id\`) ON UPDATE no action ON DELETE no action
);        
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`order\` (
	\`id\` integer PRIMARY KEY NOT NULL,
	\`order_date\` integer NOT NULL,
	\`required_date\` integer NOT NULL,
	\`shipped_date\` integer,
	\`ship_via\` integer NOT NULL,
	\`freight\` numeric NOT NULL,
	\`ship_name\` text NOT NULL,
	\`ship_city\` text NOT NULL,
	\`ship_region\` text,
	\`ship_postal_code\` text,
	\`ship_country\` text NOT NULL,
	\`customer_id\` text NOT NULL,
	\`employee_id\` integer NOT NULL,
	FOREIGN KEY (\`customer_id\`) REFERENCES \`customer\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`employee_id\`) REFERENCES \`employee\`(\`id\`) ON UPDATE no action ON DELETE cascade
);        
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`product\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`quantity_per_unit\` text NOT NULL,
	\`unit_price\` numeric NOT NULL,
	\`units_in_stock\` integer NOT NULL,
	\`units_on_order\` integer NOT NULL,
	\`reorder_level\` integer NOT NULL,
	\`discontinued\` integer NOT NULL,
	\`supplier_id\` integer NOT NULL,
	FOREIGN KEY (\`supplier_id\`) REFERENCES \`supplier\`(\`id\`) ON UPDATE no action ON DELETE cascade
);        
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`supplier\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`company_name\` text NOT NULL,
	\`contact_name\` text NOT NULL,
	\`contact_title\` text NOT NULL,
	\`address\` text NOT NULL,
	\`city\` text NOT NULL,
	\`region\` text,
	\`postal_code\` text NOT NULL,
	\`country\` text NOT NULL,
	\`phone\` text NOT NULL
);        
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`users\` (
	\`id\` integer PRIMARY KEY,
	\`name\` text,
	\`invitedBy\` integer,
	FOREIGN KEY (\`invitedBy\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
);        
    `),
	);

	db.run(
		sql.raw(`
    CREATE TABLE \`posts\` (
	\`id\` integer PRIMARY KEY,
	\`name\` text,
	\`content\` text,
	\`userId\` integer,
	FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
);        
    `),
	);
});

afterAll(async () => {
	client.close();
});

afterEach(async () => {
	await reset(db, schema);
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
	await seed(db, schema, { count: 11 }).refine(() => ({
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
