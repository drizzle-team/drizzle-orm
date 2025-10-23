import retry from 'async-retry';
import type { Container } from 'dockerode';
import { sql } from 'drizzle-orm';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import { drizzle } from 'drizzle-orm/singlestore';
import type { Connection } from 'mysql2/promise';
import { createConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { createDockerDB } from '../utils.ts';
import * as schema from './singlestoreSchema.ts';

let singleStoreContainer: Container;
let client: Connection | undefined;
let db: SingleStoreDriverDatabase;

beforeAll(async () => {
	let connectionString: string;
	if (process.env['SINGLESTORE_CONNECTION_STRING']) {
		connectionString = process.env['SINGLESTORE_CONNECTION_STRING'];
	} else {
		const data = await createDockerDB();
		connectionString = data.url;
		singleStoreContainer = data.container;
	}

	client = await retry(async () => {
		client = await createConnection({ uri: connectionString, supportBigNumbers: true });
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});

	await client.query(`DROP DATABASE IF EXISTS drizzle;`);
	await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
	await client.changeUser({ database: 'drizzle' });
	db = drizzle({ client });

	await db.execute(
		sql`
			    CREATE TABLE \`customer\` (
				\`id\` varchar(256) NOT NULL,
				\`company_name\` text NOT NULL,
				\`contact_name\` text NOT NULL,
				\`contact_title\` text NOT NULL,
				\`address\` text NOT NULL,
				\`city\` text NOT NULL,
				\`postal_code\` text,
				\`region\` text,
				\`country\` text NOT NULL,
				\`phone\` text NOT NULL,
				\`fax\` text,
				CONSTRAINT \`customer_id\` PRIMARY KEY(\`id\`)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE \`order_detail\` (
				\`unit_price\` float NOT NULL,
				\`quantity\` int NOT NULL,
				\`discount\` float NOT NULL,
				\`order_id\` int NOT NULL,
				\`product_id\` int NOT NULL
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE \`employee\` (
				\`id\` int NOT NULL,
				\`last_name\` text NOT NULL,
				\`first_name\` text,
				\`title\` text NOT NULL,
				\`title_of_courtesy\` text NOT NULL,
				\`birth_date\` timestamp NOT NULL,
				\`hire_date\` timestamp NOT NULL,
				\`address\` text NOT NULL,
				\`city\` text NOT NULL,
				\`postal_code\` text NOT NULL,
				\`country\` text NOT NULL,
				\`home_phone\` text NOT NULL,
				\`extension\` int NOT NULL,
				\`notes\` text NOT NULL,
				\`reports_to\` int,
				\`photo_path\` text,
				CONSTRAINT \`employee_id\` PRIMARY KEY(\`id\`)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE \`order\` (
				\`id\` int NOT NULL,
				\`order_date\` timestamp NOT NULL,
				\`required_date\` timestamp NOT NULL,
				\`shipped_date\` timestamp,
				\`ship_via\` int NOT NULL,
				\`freight\` float NOT NULL,
				\`ship_name\` text NOT NULL,
				\`ship_city\` text NOT NULL,
				\`ship_region\` text,
				\`ship_postal_code\` text,
				\`ship_country\` text NOT NULL,
				\`customer_id\` varchar(256) NOT NULL,
				\`employee_id\` int NOT NULL,
				CONSTRAINT \`order_id\` PRIMARY KEY(\`id\`)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE \`product\` (
				\`id\` int NOT NULL,
				\`name\` text NOT NULL,
				\`quantity_per_unit\` text NOT NULL,
				\`unit_price\` float NOT NULL,
				\`units_in_stock\` int NOT NULL,
				\`units_on_order\` int NOT NULL,
				\`reorder_level\` int NOT NULL,
				\`discontinued\` int NOT NULL,
				\`supplier_id\` int NOT NULL,
				CONSTRAINT \`product_id\` PRIMARY KEY(\`id\`)
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE \`supplier\` (
				\`id\` int NOT NULL,
				\`company_name\` text NOT NULL,
				\`contact_name\` text NOT NULL,
				\`contact_title\` text NOT NULL,
				\`address\` text NOT NULL,
				\`city\` text NOT NULL,
				\`region\` text,
				\`postal_code\` text NOT NULL,
				\`country\` text NOT NULL,
				\`phone\` text NOT NULL,
				CONSTRAINT \`supplier_id\` PRIMARY KEY(\`id\`)
			);
		`,
	);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await singleStoreContainer?.stop().catch(console.error);
});

afterEach(async () => {
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

test('basic seed, soft relations test', async () => {
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

test('seed with options.count:11, soft relations test', async () => {
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

	checkSoftRelations(customers, details, employees, orders, products, suppliers);
});

test('redefine(refine) customers count, soft relations test', async () => {
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

	checkSoftRelations(customers, details, employees, orders, products, suppliers);
});

test('redefine(refine) all tables count, soft relations test', async () => {
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

	checkSoftRelations(customers, details, employees, orders, products, suppliers);
});

test("redefine(refine) orders count using 'with' in customers, soft relations test", async () => {
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

test("sequential using of 'with', soft relations test", async () => {
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
