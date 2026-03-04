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
			    CREATE TABLE IF NOT EXISTS "customer" (
				"id" varchar(256) PRIMARY KEY NOT NULL,
				"company_name" string NOT NULL,
				"contact_name" string NOT NULL,
				"contact_title" string NOT NULL,
				"address" string NOT NULL,
				"city" string NOT NULL,
				"postal_code" string,
				"region" string,
				"country" string NOT NULL,
				"phone" string NOT NULL,
				"fax" string
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "order_detail" (
				"unit_price" numeric NOT NULL,
				"quantity" int4 NOT NULL,
				"discount" numeric NOT NULL,
				"order_id" int4 NOT NULL,
				"product_id" int4 NOT NULL
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "employee" (
				"id" int4 PRIMARY KEY NOT NULL,
				"last_name" string NOT NULL,
				"first_name" string,
				"title" string NOT NULL,
				"title_of_courtesy" string NOT NULL,
				"birth_date" timestamp NOT NULL,
				"hire_date" timestamp NOT NULL,
				"address" string NOT NULL,
				"city" string NOT NULL,
				"postal_code" string NOT NULL,
				"country" string NOT NULL,
				"home_phone" string NOT NULL,
				"extension" int4 NOT NULL,
				"notes" string NOT NULL,
				"reports_to" int4,
				"photo_path" string
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "order" (
				"id" int4 PRIMARY KEY NOT NULL,
				"order_date" timestamp NOT NULL,
				"required_date" timestamp NOT NULL,
				"shipped_date" timestamp,
				"ship_via" int4 NOT NULL,
				"freight" numeric NOT NULL,
				"ship_name" string NOT NULL,
				"ship_city" string NOT NULL,
				"ship_region" string,
				"ship_postal_code" string,
				"ship_country" string NOT NULL,
				"customer_id" string NOT NULL,
				"employee_id" int4 NOT NULL
			);    
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "product" (
				"id" int4 PRIMARY KEY NOT NULL,
				"name" string NOT NULL,
				"quantity_per_unit" string NOT NULL,
				"unit_price" numeric NOT NULL,
				"units_in_stock" int4 NOT NULL,
				"units_on_order" int4 NOT NULL,
				"reorder_level" int4 NOT NULL,
				"discontinued" int4 NOT NULL,
				"supplier_id" int4 NOT NULL
			);    
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE IF NOT EXISTS "supplier" (
				"id" int4 PRIMARY KEY NOT NULL,
				"company_name" string NOT NULL,
				"contact_name" string NOT NULL,
				"contact_title" string NOT NULL,
				"address" string NOT NULL,
				"city" string NOT NULL,
				"region" string,
				"postal_code" string NOT NULL,
				"country" string NOT NULL,
				"phone" string NOT NULL
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

const checkSoftRelations = (
	customers: (typeof schema.customers.$inferSelect)[],
	details: (typeof schema.details.$inferSelect)[],
	employees: (typeof schema.employees.$inferSelect)[],
	orders: (typeof schema.orders.$inferSelect)[],
	products: (typeof schema.products.$inferSelect)[],
	suppliers: (typeof schema.suppliers.$inferSelect)[],
) => {
	// employees soft relations check
	const employeeIds = new Set(employees.map((employee) => employee.id));
	const employeesPredicate = employees.every((employee) =>
		employee.reportsTo !== null && employeeIds.has(employee.reportsTo)
	);
	expect(employeesPredicate).toBe(true);

	// orders soft relations check
	const customerIds = new Set(customers.map((customer) => customer.id));
	const ordersPredicate1 = orders.every((order) => order.customerId !== null && customerIds.has(order.customerId));
	expect(ordersPredicate1).toBe(true);

	const ordersPredicate2 = orders.every((order) => order.employeeId !== null && employeeIds.has(order.employeeId));
	expect(ordersPredicate2).toBe(true);

	// product soft relations check
	const supplierIds = new Set(suppliers.map((supplier) => supplier.id));
	const productsPredicate = products.every((product) =>
		product.supplierId !== null && supplierIds.has(product.supplierId)
	);
	expect(productsPredicate).toBe(true);

	// details soft relations check
	const orderIds = new Set(orders.map((order) => order.id));
	const detailsPredicate1 = details.every((detail) => detail.orderId !== null && orderIds.has(detail.orderId));
	expect(detailsPredicate1).toBe(true);

	const productIds = new Set(products.map((product) => product.id));
	const detailsPredicate2 = details.every((detail) => detail.productId !== null && productIds.has(detail.productId));
	expect(detailsPredicate2).toBe(true);
};

test('basic seed, soft relations test', async ({ db }) => {
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

	checkSoftRelations(customers, details, employees, orders, products, suppliers);
});

test("redefine(refine) orders count using 'with' in customers, soft relations test", async ({ db }) => {
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

	checkSoftRelations(customers, details, employees, orders, products, suppliers);
});

test("sequential using of 'with', soft relations test", async ({ db }) => {
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

	checkSoftRelations(customers, details, employees, orders, products, suppliers);
});
