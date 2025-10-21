/// <reference types="bun-types" />
import { Database } from 'bun:sqlite';
import { DefaultLogger, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { suite } from 'uvu';

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

interface Context {
	db: SQLiteBunDatabase;
}

const test = suite<Context>('sqlite-bun');

test.before((ctx) => {
	try {
		const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

		const client = new Database(dbPath);
		ctx.db = drizzle({ client, logger: new DefaultLogger() });
	} catch (e) {
		console.error(e);
	}
});

// test.before.each((ctx) => {
// 	try {
// 		const { db } = ctx;

// 		db.run(sql`drop table if exists ${usersTable}`);
// 		db.run(sql`
// 		create table ${usersTable} (
// 			id integer primary key,
// 			name text not null,
// 			verified integer not null default 0,
// 			json blob,
// 			created_at text not null default (strftime('%s', 'now'))
// 		)`);
// 	} catch (e) {
// 		console.error(e);
// 	}
// });

test('select', (ctx) => {
	const { db } = ctx;

	// TODO: convert to normalniy test
	console.log(db.select().from(order).where(sql`"Order"."ShipCountry" = "Germany"`).all()[0]);
	console.log(db.select().from(order).where(sql`"Order"."ShipCountry" = ${'Germany'}`).prepare().all()[0]);
});

test.run();

// test.serial('select partial', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = db.select({ name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [{ name: 'John' }]);
// });

// test.serial('insert with auto increment', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Jane' },
// 		{ name: 'George' },
// 		{ name: 'Austin' },
// 	).execute();
// 	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John' },
// 		{ id: 2, name: 'Jane' },
// 		{ id: 3, name: 'George' },
// 		{ id: 4, name: 'Austin' },
// 	]);
// });

// test.serial('insert with default values', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', verified: 0 }]);
// });

// test.serial('insert with overridden default values', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John', verified: 1 }).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', verified: 1 }]);
// });

// test.serial('update with returning all fields', (t) => {
// 	const { db } = t.context;

// 	const now = Date.now();

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().execute();

// 	t.assert(users[0]!.createdAt instanceof Date);
// 	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
// });

// test.serial('update with returning partial', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 	}).execute();

// 	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
// });

// test.serial('delete with returning all fields', (t) => {
// 	const { db } = t.context;

// 	const now = Date.now();

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().execute();

// 	t.assert(users[0]!.createdAt instanceof Date);
// 	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	t.deepEqual(users, [{ id: 1, name: 'John', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
// });

// test.serial('delete with returning partial', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 	}).execute();

// 	t.deepEqual(users, [{ id: 1, name: 'John' }]);
// });

// test.serial('insert + select', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John' }]);

// 	db.insert(usersTable).values({ name: 'Jane' }).execute();
// 	const result2 = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
// });

// test.serial('json insert', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		json: usersTable.json,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
// });

// test.serial('insert many', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Bruce', json: ['foo', 'bar'] },
// 		{ name: 'Jane' },
// 		{ name: 'Austin', verified: 1 },
// 	).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		json: usersTable.json,
// 		verified: usersTable.verified,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John', json: null, verified: 0 },
// 		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
// 		{ id: 3, name: 'Jane', json: null, verified: 0 },
// 		{ id: 4, name: 'Austin', json: null, verified: 1 },
// 	]);
// });

// test.serial('insert many with returning', (t) => {
// 	const { db } = t.context;

// 	const result = db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Bruce', json: ['foo', 'bar'] },
// 		{ name: 'Jane' },
// 		{ name: 'Austin', verified: 1 },
// 	)
// 		.returning({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			json: usersTable.json,
// 			verified: usersTable.verified,
// 		})
// 		.execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John', json: null, verified: 0 },
// 		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
// 		{ id: 3, name: 'Jane', json: null, verified: 0 },
// 		{ id: 4, name: 'Austin', json: null, verified: 1 },
// 	]);
// });

// test.serial('join with alias', (t) => {
// 	const { db } = t.context;
// 	const customerAlias = alias(usersTable, 'customer');

// 	db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).execute();
// 	const result = db
// 		.select().from(usersTable)
// 		.fields({ id: usersTable.id, name: usersTable.name })
// 		.leftJoin(customerAlias, eq(customerAlias.id, 11), { id: customerAlias.id, name: customerAlias.name })
// 		.where(eq(usersTable.id, 10))
// 		.execute();

// 	t.deepEqual(result, [{
// 		users: { id: 10, name: 'Ivan' },
// 		customer: { id: 11, name: 'Hans' },
// 	}]);
// });

// test('insert with spaces', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).execute();
// 	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
// });

// test.after.always((t) => {
// 	const ctx = t.context;
// 	ctx.client?.close();
// });
