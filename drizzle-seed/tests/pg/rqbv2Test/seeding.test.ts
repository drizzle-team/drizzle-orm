import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { integer, numeric, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineRelations } from 'drizzle-orm/relations';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';

const customers = pgTable('customer', {
	id: varchar('id', { length: 256 }).primaryKey(),
	companyName: text('company_name').notNull(),
	contactName: text('contact_name').notNull(),
	contactTitle: text('contact_title').notNull(),
	address: text('address').notNull(),
	city: text('city').notNull(),
	postalCode: text('postal_code'),
	region: text('region'),
	country: text('country').notNull(),
	phone: text('phone').notNull(),
	fax: text('fax'),
});

const employees = pgTable('employee', {
	id: integer('id').primaryKey(),
	lastName: text('last_name').notNull(),
	firstName: text('first_name'),
	title: text('title').notNull(),
	titleOfCourtesy: text('title_of_courtesy').notNull(),
	birthDate: timestamp('birth_date').notNull(),
	hireDate: timestamp('hire_date').notNull(),
	address: text('address').notNull(),
	city: text('city').notNull(),
	postalCode: text('postal_code').notNull(),
	country: text('country').notNull(),
	homePhone: text('home_phone').notNull(),
	extension: integer('extension').notNull(),
	notes: text('notes').notNull(),
	reportsTo: integer('reports_to'),
	photoPath: text('photo_path'),
});

const orders = pgTable('order', {
	id: integer('id').primaryKey(),
	orderDate: timestamp('order_date').notNull(),
	requiredDate: timestamp('required_date').notNull(),
	shippedDate: timestamp('shipped_date'),
	shipVia: integer('ship_via').notNull(),
	freight: numeric('freight').notNull(),
	shipName: text('ship_name').notNull(),
	shipCity: text('ship_city').notNull(),
	shipRegion: text('ship_region'),
	shipPostalCode: text('ship_postal_code'),
	shipCountry: text('ship_country').notNull(),
	customerId: text('customer_id').notNull(),
	employeeId: integer('employee_id').notNull(),
});

const suppliers = pgTable('supplier', {
	id: integer('id').primaryKey(),
	companyName: text('company_name').notNull(),
	contactName: text('contact_name').notNull(),
	contactTitle: text('contact_title').notNull(),
	address: text('address').notNull(),
	city: text('city').notNull(),
	region: text('region'),
	postalCode: text('postal_code').notNull(),
	country: text('country').notNull(),
	phone: text('phone').notNull(),
});

const products = pgTable('product', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	quantityPerUnit: text('quantity_per_unit').notNull(),
	unitPrice: numeric('unit_price').notNull(),
	unitsInStock: integer('units_in_stock').notNull(),
	unitsOnOrder: integer('units_on_order').notNull(),
	reorderLevel: integer('reorder_level').notNull(),
	discontinued: integer('discontinued').notNull(),
	supplierId: integer('supplier_id').notNull(),
});

const details = pgTable('order_detail', {
	unitPrice: numeric('unit_price').notNull(),
	quantity: integer('quantity').notNull(),
	discount: numeric('discount').notNull(),
	orderId: integer('order_id').notNull(),
	productId: integer('product_id').notNull(),
});

const schema = { customers, employees, orders, suppliers, products, details };

const relations = defineRelations(schema, (r) => ({
	customers: {
		orders: r.many.orders(),
	},
	employees: {
		manager: r.one.employees({ from: r.employees.reportsTo, to: r.employees.id }),
		orders: r.many.orders(),
	},
	orders: {
		customer: r.one.customers({ from: r.orders.customerId, to: r.customers.id }),
		employee: r.one.employees({ from: r.orders.employeeId, to: r.employees.id }),
		details: r.many.details(),
	},
	suppliers: {
		products: r.many.products(),
	},
	products: {
		supplier: r.one.suppliers({ from: r.products.supplierId, to: r.suppliers.id }),
		details: r.many.details(),
	},
	details: {
		order: r.one.orders({ from: r.details.orderId, to: r.orders.id }),
		product: r.one.products({ from: r.details.productId, to: r.products.id }),
	},
}));

const ddl = [
	sql`
		CREATE TABLE "customer" (
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
	sql`
		CREATE TABLE "employee" (
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
	sql`
		CREATE TABLE "order" (
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
	sql`
		CREATE TABLE "supplier" (
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
	sql`
		CREATE TABLE "product" (
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
	sql`
		CREATE TABLE "order_detail" (
			"unit_price" numeric NOT NULL,
			"quantity" integer NOT NULL,
			"discount" numeric NOT NULL,
			"order_id" integer NOT NULL,
			"product_id" integer NOT NULL
		);
	`,
];

let client: PGlite;
let db: PgliteDatabase<typeof relations>;

beforeEach(async () => {
	client = new PGlite();
	db = drizzle({ client, relations });

	for (const query of ddl) {
		await db.execute(query);
	}
});

afterEach(async () => {
	await client.close();
});

const selectAll = async () => ({
	customers: await db.select().from(customers),
	details: await db.select().from(details),
	employees: await db.select().from(employees),
	orders: await db.select().from(orders),
	products: await db.select().from(products),
	suppliers: await db.select().from(suppliers),
});

const checkV2Relations = (rows: Awaited<ReturnType<typeof selectAll>>) => {
	// employees self relation check
	const employeeIds = new Set(rows.employees.map((employee) => employee.id));
	const employeesPredicate = rows.employees.every((employee) =>
		employee.reportsTo !== null && employeeIds.has(employee.reportsTo)
	);
	expect(employeesPredicate).toBe(true);

	// orders relations check
	const customerIds = new Set(rows.customers.map((customer) => customer.id));
	const ordersPredicate1 = rows.orders.every((order) => order.customerId !== null && customerIds.has(order.customerId));
	expect(ordersPredicate1).toBe(true);

	const ordersPredicate2 = rows.orders.every((order) => order.employeeId !== null && employeeIds.has(order.employeeId));
	expect(ordersPredicate2).toBe(true);

	// products relations check
	const supplierIds = new Set(rows.suppliers.map((supplier) => supplier.id));
	const productsPredicate = rows.products.every((product) =>
		product.supplierId !== null && supplierIds.has(product.supplierId)
	);
	expect(productsPredicate).toBe(true);

	// details relations check
	const orderIds = new Set(rows.orders.map((order) => order.id));
	const detailsPredicate1 = rows.details.every((detail) => detail.orderId !== null && orderIds.has(detail.orderId));
	expect(detailsPredicate1).toBe(true);

	const productIds = new Set(rows.products.map((product) => product.id));
	const detailsPredicate2 = rows.details.every((detail) =>
		detail.productId !== null && productIds.has(detail.productId)
	);
	expect(detailsPredicate2).toBe(true);
};

test('basic seed driven by defineRelations, no foreign keys in the database', async () => {
	await seed(db, schema);

	const rows = await selectAll();

	expect(rows.customers.length).toBe(10);
	expect(rows.details.length).toBe(10);
	expect(rows.employees.length).toBe(10);
	expect(rows.orders.length).toBe(10);
	expect(rows.products.length).toBe(10);
	expect(rows.suppliers.length).toBe(10);

	checkV2Relations(rows);
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

	const rows = await selectAll();

	expect(rows.customers.length).toBe(4);
	expect(rows.details.length).toBe(11);
	expect(rows.employees.length).toBe(11);
	expect(rows.orders.length).toBe(8);
	expect(rows.products.length).toBe(11);
	expect(rows.suppliers.length).toBe(11);

	checkV2Relations(rows);
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

	const rows = await selectAll();

	expect(rows.customers.length).toBe(4);
	expect(rows.details.length).toBe(24);
	expect(rows.employees.length).toBe(11);
	expect(rows.orders.length).toBe(8);
	expect(rows.products.length).toBe(11);
	expect(rows.suppliers.length).toBe(11);

	checkV2Relations(rows);
});

test("'with' pointing at an unrelated table throws", async () => {
	await expect(
		seed(db, schema, { count: 11 }).refine(() => ({
			customers: {
				count: 4,
				with: {
					products: 2,
				},
			},
		})),
	).rejects.toThrow(
		'"products" table doesn\'t have a reference to "customers" table',
	);

	await expect(
		seed(db, schema, { count: 11 }).refine(() => ({
			customers: {
				count: 4,
				with: {
					products: 2,
				},
			},
		})),
	).rejects.toThrow(
		'You can\'t specify "products" as parameter in customers.with object.',
	);
});

test("weighted 'with' produces row counts in the expected range", async () => {
	await seed(db, schema, { count: 10 }).refine(() => ({
		customers: {
			count: 4,
			with: {
				orders: [
					{ weight: 0.6, count: [1, 2] },
					{ weight: 0.4, count: [3, 4] },
				],
			},
		},
	}));

	const rows = await selectAll();

	expect(rows.customers.length).toBe(4);
	expect(rows.details.length).toBe(10);
	expect(rows.employees.length).toBe(10);
	expect(rows.products.length).toBe(10);
	expect(rows.suppliers.length).toBe(10);

	// four customers, each getting between one and four orders
	expect(rows.orders.length).toBeGreaterThanOrEqual(4);
	expect(rows.orders.length).toBeLessThanOrEqual(16);

	checkV2Relations(rows);
});
