import { Database } from 'bun:sqlite';
import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const order = sqliteTable('Order', {
	id: integer('Id'),
	customerId: text('CustomerId'),
	employeeId: integer('EmployeeId'),
	orderDate: text('OrderDate'),
	requiredDate: text('RequiredDate'),
	shippedDate: text('ShippedDate'),
	shipVia: integer('ShipVia'),
	freight: real('Freight'),
	shipName: text('ShipName'),
	shipAddress: text('ShipAddress'),
	shipCity: text('ShipCity'),
	shipRegion: text('ShipRegion'),
	shipPostalCode: text('ShipPostalCode'),
	shipCountry: text('ShipCountry'),
});

const rows = [
	{ id: 1, customerId: 'VINET', shipName: 'Vins et alcools Chevalier', shipCity: 'Reims', shipCountry: 'France' },
	{ id: 2, customerId: 'TOMSP', shipName: 'Toms Spezialitäten', shipCity: 'Münster', shipCountry: 'Germany' },
	{ id: 3, customerId: 'HANAR', shipName: 'Hanari Carnes', shipCity: 'Rio de Janeiro', shipCountry: 'Brazil' },
];

let db: SQLiteBunDatabase;

beforeAll(() => {
	db = drizzle({ client: new Database(process.env['SQLITE_DB_PATH'] ?? ':memory:') });
});

beforeEach(() => {
	db.run(sql`drop table if exists ${order}`);
	db.run(sql`
		create table ${order} (
			"Id" integer primary key,
			"CustomerId" text,
			"EmployeeId" integer,
			"OrderDate" text,
			"RequiredDate" text,
			"ShippedDate" text,
			"ShipVia" integer,
			"Freight" real,
			"ShipName" text,
			"ShipAddress" text,
			"ShipCity" text,
			"ShipRegion" text,
			"ShipPostalCode" text,
			"ShipCountry" text
		)
	`);
	db.insert(order).values(rows).run();
});

test('select filtered by a bound parameter', () => {
	const result = db.select().from(order).where(sql`${order.shipCountry} = ${'Germany'}`).all();

	expect(result.map((r) => r.id)).toStrictEqual([2]);
	expect(result[0]!.shipName).toBe('Toms Spezialitäten');
});

test('select filtered by a prepared statement', () => {
	const result = db.select().from(order).where(sql`${order.shipCountry} = ${'Germany'}`).prepare().all();

	expect(result.map((r) => r.id)).toStrictEqual([2]);
});

test('a double-quoted literal falls back to a string', () => {
	const result = db.select().from(order).where(sql`${order.shipCountry} = "Germany"`).all();

	expect(result.map((r) => r.id)).toStrictEqual([2]);
});

test('a double-quoted identifier that does resolve stays a column', () => {
	const result = db.select().from(order).where(sql`${order.shipCountry} = "ShipCity"`).all();

	expect(result).toStrictEqual([]);
});
