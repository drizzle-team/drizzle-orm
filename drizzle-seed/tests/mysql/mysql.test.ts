import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';
import { expect, vi } from 'vitest';
import { reset, seed } from '../../src/index.ts';
import { mysqlTest as test } from './instrumentation.ts';
import * as schema from './mysqlSchema.ts';

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

		await db.execute(
			sql`
			    CREATE TABLE \`users\` (
				\`id\` int,
				\`name\` text,
				\`invitedBy\` int,
				CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
			);
		`,
		);

		await db.execute(
			sql`
			    CREATE TABLE \`posts\` (
				\`id\` int,
				\`name\` text,
				\`content\` text,
				\`userId\` int,
				CONSTRAINT \`posts_id\` PRIMARY KEY(\`id\`)
			);
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`order_detail\` ADD CONSTRAINT \`order_detail_order_id_order_id_fk\` FOREIGN KEY (\`order_id\`) REFERENCES \`order\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`order_detail\` ADD CONSTRAINT \`order_detail_product_id_product_id_fk\` FOREIGN KEY (\`product_id\`) REFERENCES \`product\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`employee\` ADD CONSTRAINT \`employee_reports_to_employee_id_fk\` FOREIGN KEY (\`reports_to\`) REFERENCES \`employee\`(\`id\`) ON DELETE no action ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`order\` ADD CONSTRAINT \`order_customer_id_customer_id_fk\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customer\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`order\` ADD CONSTRAINT \`order_employee_id_employee_id_fk\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employee\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`product\` ADD CONSTRAINT \`product_supplier_id_supplier_id_fk\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`supplier\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`users\` ADD CONSTRAINT \`users_invitedBy_users_id_fk\` FOREIGN KEY (\`invitedBy\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		await db.execute(
			sql`
			ALTER TABLE \`posts\` ADD CONSTRAINT \`posts_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action;
		`,
		);

		resolveFunc('');
	}

	await promise;
});

test.afterEach(async ({ db }) => {
	await reset(db, schema);
});

test('basic seed test', async ({ db }) => {
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

test('seed with options.count:11 test', async ({ db }) => {
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

test('redefine(refine) customers count', async ({ db }) => {
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

test('redefine(refine) all tables count', async ({ db }) => {
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

test("redefine(refine) orders count using 'with' in customers", async ({ db }) => {
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

test("sequential using of 'with'", async ({ db }) => {
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

test('overlapping a foreign key constraint with a one-to-many relation', async ({ db }) => {
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
