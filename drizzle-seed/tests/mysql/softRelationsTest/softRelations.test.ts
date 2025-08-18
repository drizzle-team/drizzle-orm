import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import getPort from 'get-port';
import type { Connection } from 'mysql2/promise';
import { createConnection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import * as schema from './mysqlSchema.ts';

let mysqlContainer: Docker.Container;
let client: Connection;
let db: MySql2Database;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

beforeAll(async () => {
	const connectionString = await createDockerDB();

	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await createConnection(connectionString);
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
		console.error('Cannot connect to MySQL');
		await client?.end().catch(console.error);
		await mysqlContainer?.stop().catch(console.error);
		throw lastError;
	}

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
	await mysqlContainer?.stop().catch(console.error);
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
