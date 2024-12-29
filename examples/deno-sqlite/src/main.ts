import { Database } from '@db/sqlite';
import { bench, group, run } from 'mitata';

// Issue: https://github.com/denoland/deno/issues/18474
import { sql } from '../../../drizzle-orm/dist';
import { drizzle } from '../../../drizzle-orm/dist/deno-sqlite';
import { asc, eq } from '../../../drizzle-orm/dist/expressions';
import { placeholder } from '../../../drizzle-orm/dist/sql';
import { alias } from '../../../drizzle-orm/dist/sqlite-core';

import { customerIds, customerSearches, employeeIds, orderIds, productSearches } from './meta';
import { customers, details, employees, orders, products, suppliers } from './schema';

const sqlite = new Database('northwind.db');
const db = drizzle(sqlite);

const d1 = db.select().from(customers).prepare();
const d2 = db
	.select().from(customers)
	.where(eq(customers.id, placeholder('userId')))
	.prepare();
const d3 = db
	.select().from(customers)
	.where(sql`${customers.companyName} like ${placeholder('name')}`)
	.prepare();
const d4 = db.select().from(employees).prepare();

const e2 = alias(employees, 'recipient');
const d5 = db
	.select().from(employees)
	.leftJoin(e2, eq(e2.id, employees.reportsTo))
	.where(eq(employees.id, placeholder('employeeId')))
	.prepare();

const d6 = db.select().from(suppliers).prepare();
const d7 = db.select().from(products).prepare();
const d8 = db
	.select().from(products)
	.where(sql`${products.name} like ${placeholder('name')}`)
	.prepare();

const d9 = db
	.select().from(orders)
	.leftJoin(details, eq(orders.id, details.orderId))
	.leftJoin(products, eq(details.productId, products.id))
	.where(eq(orders.id, placeholder('orderId')))
	.prepare();

const d10 = db
	.select({
		id: orders.id,
		shippedDate: orders.shippedDate,
		shipName: orders.shipName,
		shipCity: orders.shipCity,
		shipCountry: orders.shipCountry,
		productsCount: sql<number>`count(${details.productId})`,
		quantitySum: sql<number>`sum(${details.quantity})`,
		totalPrice: sql<number>`sum(${details.quantity} * ${details.unitPrice})`,
	}).from(orders)
	.leftJoin(details, eq(orders.id, details.orderId))
	.groupBy(orders.id)
	.orderBy(asc(orders.id))
	.prepare();

group({ name: 'drizzle', summary: false }, () => {
	bench('SELECT * FROM customer', () => {
		d1.all();
	});
	bench('SELECT * FROM customer WHERE id = ?', () => {
		customerIds.forEach((id) => {
			d2.get({ userId: id });
		});
	});

	bench('SELECT * FROM customer WHERE company_name LIKE ?', () => {
		customerSearches.forEach((it) => {
			d3.all({ name: `%${it}%` });
		});
	});

	bench('SELECT * FROM employee', () => {
		d4.all();
	});

	bench('SELECT * FROM employee WHERE id = ? LEFT JOIN reportee', () => {
		employeeIds.forEach((id) => {
			d5.all({ employeeId: id });
		});
	});

	bench('SELECT * FROM supplier', () => {
		d6.all();
	});

	bench('SELECT * FROM product', () => {
		d7.all();
	});

	bench('SELECT * FROM product WHERE product.name LIKE ?', () => {
		productSearches.forEach((it) => {
			d8.all({ name: `%${it}%` });
		});
	});

	bench('SELECT * FROM order WHERE order_id = ? LEFT JOIN details + products', () => {
		orderIds.forEach((id) => {
			d9.all({ orderId: id });
		});
	});

	bench('SELECT * FROM order LEFT JOIN details + [sum&count aggregations]', () => {
		d10.all();
	});
});

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
	await run();
}
