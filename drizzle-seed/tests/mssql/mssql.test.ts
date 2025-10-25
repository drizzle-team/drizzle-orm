import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';

import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';

import type { Container } from 'dockerode';
import type { MsSqlDatabase } from 'drizzle-orm/node-mssql';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { reset, seed } from '../../src/index.ts';
import * as schema from './mssqlSchema.ts';
import { createDockerDB } from './utils.ts';

let mssqlContainer: Container;
let client: mssql.ConnectionPool;
let db: MsSqlDatabase<any, any>;

beforeAll(async () => {
	const { options, container } = await createDockerDB('mssql');
	mssqlContainer = container;

	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await mssql.connect(options);
			await client.connect();
			db = drizzle({ client });
			connected = true;
			// console.log('mssql test connection is successfull.')
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MsSQL');
		await client?.close().catch(console.error);
		await mssqlContainer?.stop().catch(console.error);
		throw lastError;
	}

	await db.execute(
		sql`
				CREATE TABLE [customer] (
				[id] varchar(256) NOT NULL,
				[company_name] varchar(max) NOT NULL,
				[contact_name] varchar(max) NOT NULL,
				[contact_title] varchar(max) NOT NULL,
				[address] varchar(max) NOT NULL,
				[city] varchar(max) NOT NULL,
				[postal_code] varchar(max),
				[region] varchar(max),
				[country] varchar(max) NOT NULL,
				[phone] varchar(max) NOT NULL,
				[fax] varchar(max),
				CONSTRAINT [customer_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [order_detail] (
				[unit_price] float NOT NULL,
				[quantity] int NOT NULL,
				[discount] float NOT NULL,
				[order_id] int NOT NULL,
				[product_id] int NOT NULL
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [employee] (
				[id] int NOT NULL,
				[last_name] varchar(max) NOT NULL,
				[first_name] varchar(max),
				[title] varchar(max) NOT NULL,
				[title_of_courtesy] varchar(max) NOT NULL,
				[birth_date] datetime NOT NULL,
				[hire_date] datetime NOT NULL,
				[address] varchar(max) NOT NULL,
				[city] varchar(max) NOT NULL,
				[postal_code] varchar(max) NOT NULL,
				[country] varchar(max) NOT NULL,
				[home_phone] varchar(max) NOT NULL,
				[extension] int NOT NULL,
				[notes] varchar(max) NOT NULL,
				[reports_to] int,
				[photo_path] varchar(max),
				CONSTRAINT [employee_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [order] (
				[id] int NOT NULL,
				[order_date] datetime NOT NULL,
				[required_date] datetime NOT NULL,
				[shipped_date] datetime,
				[ship_via] int NOT NULL,
				[freight] float NOT NULL,
				[ship_name] varchar(max) NOT NULL,
				[ship_city] varchar(max) NOT NULL,
				[ship_region] varchar(max),
				[ship_postal_code] varchar(max),
				[ship_country] varchar(max) NOT NULL,
				[customer_id] varchar(256) NOT NULL,
				[employee_id] int NOT NULL,
				CONSTRAINT [order_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [product] (
				[id] int NOT NULL,
				[name] varchar(max) NOT NULL,
				[quantity_per_unit] varchar(max) NOT NULL,
				[unit_price] float NOT NULL,
				[units_in_stock] int NOT NULL,
				[units_on_order] int NOT NULL,
				[reorder_level] int NOT NULL,
				[discontinued] int NOT NULL,
				[supplier_id] int NOT NULL,
				CONSTRAINT [product_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [supplier] (
				[id] int NOT NULL,
				[company_name] varchar(max) NOT NULL,
				[contact_name] varchar(max) NOT NULL,
				[contact_title] varchar(max) NOT NULL,
				[address] varchar(max) NOT NULL,
				[city] varchar(max) NOT NULL,
				[region] varchar(max),
				[postal_code] varchar(max) NOT NULL,
				[country] varchar(max) NOT NULL,
				[phone] varchar(max) NOT NULL,
				CONSTRAINT [supplier_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [users] (
				[id] int,
				[name] varchar(max),
				[invitedBy] int,
				CONSTRAINT [users_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
				CREATE TABLE [posts] (
				[id] int,
				[name] varchar(max),
				[content] varchar(max),
				[userId] int,
				CONSTRAINT [posts_id] PRIMARY KEY([id])
			);
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [order_detail] ADD CONSTRAINT [order_detail_order_id_order_id_fk] FOREIGN KEY ([order_id]) REFERENCES [order]([id]) ON DELETE cascade ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [order_detail] ADD CONSTRAINT [order_detail_product_id_product_id_fk] FOREIGN KEY ([product_id]) REFERENCES [product]([id]) ON DELETE cascade ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [employee] ADD CONSTRAINT [employee_reports_to_employee_id_fk] FOREIGN KEY ([reports_to]) REFERENCES [employee]([id]) ON DELETE no action ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [order] ADD CONSTRAINT [order_customer_id_customer_id_fk] FOREIGN KEY ([customer_id]) REFERENCES [customer]([id]) ON DELETE cascade ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [order] ADD CONSTRAINT [order_employee_id_employee_id_fk] FOREIGN KEY ([employee_id]) REFERENCES [employee]([id]) ON DELETE cascade ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [product] ADD CONSTRAINT [product_supplier_id_supplier_id_fk] FOREIGN KEY ([supplier_id]) REFERENCES [supplier]([id]) ON DELETE cascade ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [users] ADD CONSTRAINT [users_invitedBy_users_id_fk] FOREIGN KEY ([invitedBy]) REFERENCES [users]([id]) ON DELETE no action ON UPDATE no action;
		`,
	);

	await db.execute(
		sql`
			ALTER TABLE [posts] ADD CONSTRAINT [posts_userId_users_id_fk] FOREIGN KEY ([userId]) REFERENCES [users]([id]) ON DELETE cascade ON UPDATE no action;
		`,
	);
});

afterAll(async () => {
	await client?.close().catch(console.error);
	await mssqlContainer?.stop().catch(console.error);
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
