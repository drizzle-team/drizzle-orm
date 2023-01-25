import { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { asc, eq } from 'drizzle-orm/expressions';
import { placeholder } from 'drizzle-orm/sql';
import { alias } from 'drizzle-orm/sqlite-core';
import { bench, group, run } from 'mitata';

import { customerIds, customerSearches, employeeIds, orderIds, productSearches } from './meta';
import { customers, details, employees, orders, products, suppliers } from './schema';

const sqlite = new Database('northwind.db');
const db = drizzle(sqlite);

const d1 = db.select(customers).prepare();
const d2 = db
	.select(customers)
	.where(eq(customers.id, placeholder('userId')))
	.prepare();
const d3 = db
	.select(customers)
	.where(sql`${customers.companyName} like ${placeholder('name')}`)
	.prepare();
const d4 = db.select(employees).prepare();

const e2 = alias(employees, 'recipient');
const d5 = db
	.select(employees)
	.leftJoin(e2, eq(e2.id, employees.reportsTo))
	.where(eq(employees.id, placeholder('employeeId')))
	.prepare();

const d6 = db.select(suppliers).prepare();
const d7 = db.select(products).prepare();
const d8 = db
	.select(products)
	.where(sql`${products.name} like ${placeholder('name')}`)
	.prepare();

const d9 = db
	.select(orders)
	.leftJoin(details, eq(orders.id, details.orderId))
	.leftJoin(products, eq(details.productId, products.id))
	.where(eq(orders.id, placeholder('orderId')))
	.prepare();

const d10 = db
	.select(orders)
	.fields({
		id: orders.id,
		shippedDate: orders.shippedDate,
		shipName: orders.shipName,
		shipCity: orders.shipCity,
		shipCountry: orders.shipCountry,
		productsCount: sql`count(${details.productId})`.as<number>(),
		quantitySum: sql`sum(${details.quantity})`.as<number>(),
		totalPrice: sql`sum(${details.quantity} * ${details.unitPrice})`.as<number>(),
	})
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
			// due to a known bug https://github.com/oven-sh/bun/issues/1646
			// d5.all({ employeeId: id });
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
			// due to a known bug https://github.com/oven-sh/bun/issues/1646
			// d9.all({ orderId: id });
		});
	});

	bench('SELECT * FROM order LEFT JOIN details + [sum&count aggregations]', () => {
		d10.all();
	});
});

const main = async () => {
	await run();
	process.exit(1);
};

main();
