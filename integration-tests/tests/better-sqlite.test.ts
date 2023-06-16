import 'dotenv/config';

import type { TestFn } from 'ava';
import anyTest from 'ava';
import Database from 'better-sqlite3';
import { asc, eq, type Equal, gt, inArray, name, placeholder, sql, TransactionRollbackError } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
	alias,
	blob,
	getViewConfig,
	integer,
	primaryKey,
	sqliteTable,
	sqliteTableCreator,
	sqliteView,
	text,
} from 'drizzle-orm/sqlite-core';
import { Expect } from './utils';

const ENABLE_LOGGING = false;

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
	json: blob('json', { mode: 'json' }).$type<string[]>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`strftime('%s', 'now')`),
});

const users2Table = sqliteTable('users2', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => citiesTable.id),
});

const citiesTable = sqliteTable('cities', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const coursesTable = sqliteTable('courses', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: integer('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = sqliteTable('course_categories', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = sqliteTable('orders', {
	id: integer('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull(),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

const usersMigratorTable = sqliteTable('users12', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

const anotherUsersMigratorTable = sqliteTable('another_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

const pkExampleTable = sqliteTable('pk_example', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => ({
	compositePk: primaryKey(table.id, table.name),
}));

const bigIntExample = sqliteTable('big_int_example', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	bigInt: blob('big_int', { mode: 'bigint' }).notNull(),
});

interface Context {
	db: BetterSQLite3Database;
	client: Database.Database;
}

const test = anyTest as TestFn<Context>;

test.before((t) => {
	const ctx = t.context;
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

	ctx.client = new Database(dbPath);
	ctx.db = drizzle(ctx.client, { logger: ENABLE_LOGGING });
});

test.after.always((t) => {
	const ctx = t.context;
	ctx.client?.close();
});

test.after.always((t) => {
	const ctx = t.context;
	ctx.client?.close();
});

test.beforeEach((t) => {
	const ctx = t.context;

	ctx.db.run(sql`drop table if exists ${usersTable}`);
	ctx.db.run(sql`drop table if exists ${users2Table}`);
	ctx.db.run(sql`drop table if exists ${citiesTable}`);
	ctx.db.run(sql`drop table if exists ${coursesTable}`);
	ctx.db.run(sql`drop table if exists ${courseCategoriesTable}`);
	ctx.db.run(sql`drop table if exists ${orders}`);
	ctx.db.run(sql`drop table if exists ${bigIntExample}`);
	ctx.db.run(sql`drop table if exists ${pkExampleTable}`);

	ctx.db.run(sql`
		create table ${usersTable} (
			id integer primary key,
			name text not null,
			verified integer not null default 0,
			json blob,
			created_at integer not null default (strftime('%s', 'now'))
		)
	`);
	ctx.db.run(sql`
		create table ${users2Table} (
			id integer primary key,
			name text not null,
			city_id integer references ${citiesTable}(${name(citiesTable.id.name)})
		)
	`);
	ctx.db.run(sql`
		create table ${citiesTable} (
			id integer primary key,
			name text not null
		)
	`);
	ctx.db.run(sql`
		create table ${courseCategoriesTable} (
			id integer primary key,
			name text not null
		)
	`);
	ctx.db.run(sql`
		create table ${coursesTable} (
			id integer primary key,
			name text not null,
			category_id integer references ${courseCategoriesTable}(${name(courseCategoriesTable.id.name)})
		)
	`);
	ctx.db.run(sql`
		create table ${orders} (
			id integer primary key,
			region text not null,
			product text not null,
			amount integer not null,
			quantity integer not null
		)
	`);
	ctx.db.run(sql`
		create table ${pkExampleTable} (
			id integer not null,
			name text not null,
			email text not null,
			primary key (id, name)
		)
	`);
	ctx.db.run(sql`
		create table ${bigIntExample} (
			id integer primary key,
			name text not null,
			big_int blob not null
		)
	`);
});

test.serial('insert bigint values', async (t) => {
	const { db } = t.context;

	await db.insert(bigIntExample).values({ name: 'one', bigInt: BigInt('0') }).run();
	await db.insert(bigIntExample).values({ name: 'two', bigInt: BigInt('127') }).run();
	await db.insert(bigIntExample).values({ name: 'three', bigInt: BigInt('32767') }).run();
	await db.insert(bigIntExample).values({ name: 'four', bigInt: BigInt('1234567890') }).run();
	await db.insert(bigIntExample).values({ name: 'five', bigInt: BigInt('12345678900987654321') }).run();

	const result = await db.select().from(bigIntExample).all();
	t.deepEqual(result, [
		{ id: 1, name: 'one', bigInt: BigInt('0') },
		{ id: 2, name: 'two', bigInt: BigInt('127') },
		{ id: 3, name: 'three', bigInt: BigInt('32767') },
		{ id: 4, name: 'four', bigInt: BigInt('1234567890') },
		{ id: 5, name: 'five', bigInt: BigInt('12345678900987654321') },
	]);
});

test.serial('select all fields', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select().from(usersTable).all();

	t.assert(result[0]!.createdAt instanceof Date);
	t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select partial', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select({ name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ name: 'John' }]);
});

test.serial('select sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('insert returning sql', (t) => {
	const { db } = t.context;

	const users = db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('insert returning sql + get()', (t) => {
	const { db } = t.context;

	const users = db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	}).get();

	t.deepEqual(users, { name: 'JOHN' });
});

test.serial('delete returning sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('update returning sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JANE' }]);
});

test.serial('update returning sql + get()', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).get();

	t.deepEqual(users, { name: 'JANE' });
});

test.serial('insert with auto increment', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Jane' },
		{ name: 'George' },
		{ name: 'Austin' },
	]).run();
	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Jane' },
		{ id: 3, name: 'George' },
		{ id: 4, name: 'Austin' },
	]);
});

test.serial('insert with default values', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select().from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('insert with overridden default values', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John', verified: true }).run();
	const result = db.select().from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: true, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('update with returning all fields', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: false, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning all fields + get()', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().get();

	t.assert(users.createdAt instanceof Date);
	t.assert(Math.abs(users.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, { id: 1, name: 'Jane', verified: false, json: null, createdAt: users.createdAt });
});

test.serial('update with returning partial', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, [{ id: 1, name: 'John', verified: false, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('delete with returning all fields + get()', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().get();

	t.assert(users!.createdAt instanceof Date);
	t.assert(Math.abs(users!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, { id: 1, name: 'John', verified: false, json: null, createdAt: users!.createdAt });
});

test.serial('delete with returning partial', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'John' }]);
});

test.serial('delete with returning partial + get()', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).get();

	t.deepEqual(users, { id: 1, name: 'John' });
});

test.serial('insert + select', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	db.insert(usersTable).values({ name: 'Jane' }).run();
	const result2 = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).run();
	const result = db.select({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
	}).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
});

test.serial('insert many', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]).run();
	const result = db.select({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
		verified: usersTable.verified,
	}).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John', json: null, verified: false },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', json: null, verified: false },
		{ id: 4, name: 'Austin', json: null, verified: true },
	]);
});

test.serial('insert many with returning', (t) => {
	const { db } = t.context;

	const result = db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	])
		.returning({
			id: usersTable.id,
			name: usersTable.name,
			json: usersTable.json,
			verified: usersTable.verified,
		})
		.all();

	t.deepEqual(result, [
		{ id: 1, name: 'John', json: null, verified: false },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', json: null, verified: false },
		{ id: 4, name: 'Austin', json: null, verified: true },
	]);
});

test.serial('partial join with alias', (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = db
		.select({
			user: {
				id: usersTable.id,
				name: usersTable.name,
			},
			customer: {
				id: customerAlias.id,
				name: customerAlias.name,
			},
		}).from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10))
		.all();

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);
	db.run(sql`create table ${users} (id integer primary key, name text not null)`);

	const customers = alias(users, 'customer');

	db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = db
		.select().from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10))
		.all();

	t.deepEqual(result, [{
		users: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);

	db.run(sql`drop table ${users}`);
});

test.serial('select from alias', (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);
	db.run(sql`create table ${users} (id integer primary key, name text not null)`);

	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = db
		.select()
		.from(user)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(user.id, 10))
		.all();

	t.deepEqual(result, [{
		user: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);

	db.run(sql`drop table ${users}`);
});

test.serial('insert with spaces', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).run();
	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const statement = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).prepare();
	const result = statement.all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', (t) => {
	const { db } = t.context;

	const stmt = db.insert(usersTable).values({
		verified: true,
		name: placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		stmt.run({ name: `John ${i}` });
	}

	const result = db.select({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John 0', verified: true },
		{ id: 2, name: 'John 1', verified: true },
		{ id: 3, name: 'John 2', verified: true },
		{ id: 4, name: 'John 3', verified: true },
		{ id: 5, name: 'John 4', verified: true },
		{ id: 6, name: 'John 5', verified: true },
		{ id: 7, name: 'John 6', verified: true },
		{ id: 8, name: 'John 7', verified: true },
		{ id: 9, name: 'John 8', verified: true },
		{ id: 10, name: 'John 9', verified: true },
	]);
});

test.serial('prepared statement with placeholder in .where', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.prepare();
	const result = stmt.all({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('select with group by as field', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by as column + sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by complex query', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test.serial('migrator', (t) => {
	const { db } = t.context;

	db.run(sql`drop table if exists another_users`);
	db.run(sql`drop table if exists users12`);
	db.run(sql`drop table if exists __drizzle_migrations`);

	migrate(db, { migrationsFolder: './drizzle2/sqlite' });

	db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = db.select().from(usersMigratorTable).all();

	db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = db.select().from(usersMigratorTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);
	t.deepEqual(result2, [{ id: 1, name: 'John', email: 'email' }]);

	db.run(sql`drop table another_users`);
	db.run(sql`drop table users12`);
	db.run(sql`drop table __drizzle_migrations`);
});

test.serial('insert via db.run + select via db.all', (t) => {
	const { db } = t.context;

	db.run(sql`insert into ${usersTable} (${name(usersTable.name.name)}) values (${'John'})`);

	const result = db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('insert via db.get', (t) => {
	const { db } = t.context;

	const inserted = db.get<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${
			name(usersTable.name.name)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	t.deepEqual(inserted, { id: 1, name: 'John' });
});

test.serial('insert via db.run + select via db.get', (t) => {
	const { db } = t.context;

	db.run(sql`insert into ${usersTable} (${name(usersTable.name.name)}) values (${'John'})`);

	const result = db.get<{ id: number; name: string }>(
		sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
	);
	t.deepEqual(result, { id: 1, name: 'John' });
});

test.serial('insert via db.get w/ query builder', (t) => {
	const { db } = t.context;

	const inserted = db.get(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	t.deepEqual(inserted, { id: 1, name: 'John' });
});

test.serial('left join (flat object fields)', (t) => {
	const { db } = t.context;

	const { id: cityId } = db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id }).all()[0]!;

	db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]).run();

	const res = db.select({
		userId: users2Table.id,
		userName: users2Table.name,
		cityId: citiesTable.id,
		cityName: citiesTable.name,
	}).from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id))
		.all();

	t.deepEqual(res, [
		{ userId: 1, userName: 'John', cityId, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test.serial('left join (grouped fields)', (t) => {
	const { db } = t.context;

	const { id: cityId } = db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id }).all()[0]!;

	db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]).run();

	const res = db.select({
		id: users2Table.id,
		user: {
			name: users2Table.name,
			nameUpper: sql<string>`upper(${users2Table.name})`,
		},
		city: {
			id: citiesTable.id,
			name: citiesTable.name,
			nameUpper: sql<string>`upper(${citiesTable.name})`,
		},
	}).from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id))
		.all();

	t.deepEqual(res, [
		{
			id: 1,
			user: { name: 'John', nameUpper: 'JOHN' },
			city: { id: cityId, name: 'Paris', nameUpper: 'PARIS' },
		},
		{
			id: 2,
			user: { name: 'Jane', nameUpper: 'JANE' },
			city: null,
		},
	]);
});

test.serial('left join (all fields)', (t) => {
	const { db } = t.context;

	const { id: cityId } = db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id }).all()[0]!;

	db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]).run();

	const res = db.select().from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id)).all();

	t.deepEqual(res, [
		{
			users2: {
				id: 1,
				name: 'John',
				cityId,
			},
			cities: {
				id: cityId,
				name: 'Paris',
			},
		},
		{
			users2: {
				id: 2,
				name: 'Jane',
				cityId: null,
			},
			cities: null,
		},
	]);
});

test.serial('join subquery', (t) => {
	const { db } = t.context;

	db.insert(courseCategoriesTable).values([
		{ name: 'Category 1' },
		{ name: 'Category 2' },
		{ name: 'Category 3' },
		{ name: 'Category 4' },
	]).run();

	db.insert(coursesTable).values([
		{ name: 'Development', categoryId: 2 },
		{ name: 'IT & Software', categoryId: 3 },
		{ name: 'Marketing', categoryId: 4 },
		{ name: 'Design', categoryId: 1 },
	]).run();

	const sq2 = db
		.select({
			categoryId: courseCategoriesTable.id,
			category: courseCategoriesTable.name,
			total: sql<number>`count(${courseCategoriesTable.id})`,
		})
		.from(courseCategoriesTable)
		.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
		.as('sq2');

	const res = db
		.select({
			courseName: coursesTable.name,
			categoryId: sq2.categoryId,
		})
		.from(coursesTable)
		.leftJoin(sq2, eq(coursesTable.categoryId, sq2.categoryId))
		.orderBy(coursesTable.name)
		.all();

	t.deepEqual(res, [
		{ courseName: 'Design', categoryId: 1 },
		{ courseName: 'Development', categoryId: 2 },
		{ courseName: 'IT & Software', categoryId: 3 },
		{ courseName: 'Marketing', categoryId: 4 },
	]);
});

test.serial('with ... select', (t) => {
	const { db } = t.context;

	db.insert(orders).values([
		{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
		{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 50, quantity: 5 },
	]).run();

	const regionalSales = db
		.$with('regional_sales')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

	const topRegions = db
		.$with('top_regions')
		.as(
			db
				.select({
					region: regionalSales.region,
				})
				.from(regionalSales)
				.where(
					gt(
						regionalSales.totalSales,
						db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
					),
				),
		);

	const result = db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`cast(sum(${orders.quantity}) as int)`,
			productSales: sql<number>`cast(sum(${orders.amount}) as int)`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product)
		.all();

	t.deepEqual(result, [
		{
			region: 'Europe',
			product: 'A',
			productUnits: 3,
			productSales: 30,
		},
		{
			region: 'Europe',
			product: 'B',
			productUnits: 5,
			productSales: 50,
		},
		{
			region: 'US',
			product: 'A',
			productUnits: 7,
			productSales: 70,
		},
		{
			region: 'US',
			product: 'B',
			productUnits: 9,
			productSales: 90,
		},
	]);
});

test.serial('select from subquery sql', (t) => {
	const { db } = t.context;

	db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]).run();

	const sq = db
		.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = db.select({ name: sq.name }).from(sq).all();

	t.deepEqual(res, [{ name: 'John modified' }, { name: 'Jane modified' }]);
});

test.serial('select a field without joining its table', (t) => {
	const { db } = t.context;

	t.throws(() => db.select({ name: users2Table.name }).from(usersTable).prepare());
});

test.serial('select all fields from subquery without alias', (t) => {
	const { db } = t.context;

	const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

	t.throws(() => db.select().from(sq).prepare());
});

test.serial('select count()', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]).run();

	const res = db.select({ count: sql`count(*)` }).from(usersTable).all();

	t.deepEqual(res, [{ count: 2 }]);
});

test.serial('having', (t) => {
	const { db } = t.context;

	db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]).run();

	db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]).run();

	const result = db
		.select({
			id: citiesTable.id,
			name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
			usersCount: sql<number>`count(${users2Table.id})`.as('users_count'),
		})
		.from(citiesTable)
		.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
		.where(({ name }) => sql`length(${name}) >= 3`)
		.groupBy(citiesTable.id)
		.having(({ usersCount }) => sql`${usersCount} > 0`)
		.orderBy(({ name }) => name)
		.all();

	t.deepEqual(result, [
		{
			id: 1,
			name: 'LONDON',
			usersCount: 2,
		},
		{
			id: 2,
			name: 'PARIS',
			usersCount: 1,
		},
	]);
});

test.serial('view', (t) => {
	const { db } = t.context;

	const newYorkers1 = sqliteView('new_yorkers1')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = sqliteView('new_yorkers2', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = sqliteView('new_yorkers1', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).existing();

	db.run(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);
	db.run(sql`create view ${newYorkers2} as ${getViewConfig(newYorkers2).query}`);

	db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]).run();

	db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]).run();

	{
		const result = db.select().from(newYorkers1).all();
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = db.select().from(newYorkers2).all();
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = db.select().from(newYorkers3).all();
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = db.select({ name: newYorkers1.name }).from(newYorkers1).all();
		t.deepEqual(result, [
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	db.run(sql`drop view ${newYorkers1}`);
	db.run(sql`drop view ${newYorkers2}`);
});

test.serial('insert null timestamp', (t) => {
	const { db } = t.context;

	const test = sqliteTable('test', {
		t: integer('t', { mode: 'timestamp' }),
	});

	db.run(sql`create table ${test} (t timestamp)`);

	db.insert(test).values({ t: null }).run();
	const res = db.select().from(test).all();
	t.deepEqual(res, [{ t: null }]);

	db.run(sql`drop table ${test}`);
});

test.serial('select from raw sql', (t) => {
	const { db } = t.context;

	const result = db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`).all();

	Expect<Equal<{ id: number; name: string }[], typeof result>>;

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);
});

test.serial('select from raw sql with joins', (t) => {
	const { db } = t.context;

	const result = db
		.select({
			id: sql<number>`users.id`,
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`)
		.all();

	Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
	]);
});

test.serial('join on aliased sql from select', (t) => {
	const { db } = t.context;

	const result = db
		.select({
			userId: sql<number>`users.id`.as('userId'),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId))
		.all();

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.serial('join on aliased sql from with clause', (t) => {
	const { db } = t.context;

	const users = db.$with('users').as(
		db.select({
			id: sql<number>`id`.as('userId'),
			name: sql<string>`name`.as('userName'),
			city: sql<string>`city`.as('city'),
		}).from(
			sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
		),
	);

	const cities = db.$with('cities').as(
		db.select({
			id: sql<number>`id`.as('cityId'),
			name: sql<string>`name`.as('cityName'),
		}).from(
			sql`(select 1 as id, 'Paris' as name) as cities`,
		),
	);

	const result = db
		.with(users, cities)
		.select({
			userId: users.id,
			name: users.name,
			userCity: users.city,
			cityId: cities.id,
			cityName: cities.name,
		})
		.from(users)
		.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId))
		.all();

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.serial('prefixed table', (t) => {
	const { db } = t.context;

	const table = sqliteTableCreator((name) => `myprefix_${name}`);

	const users = table('test_prefixed_table_with_unique_name', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
	);

	db.insert(users).values({ id: 1, name: 'John' }).run();

	const result = db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	db.run(sql`drop table ${users}`);
});

test.serial('orderBy with aliased column', (t) => {
	const { db } = t.context;

	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	t.deepEqual(query.sql, 'select something as "test" from "users2" order by "test"');
});

test.serial('transaction', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_transactions', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});
	const products = sqliteTable('products_transactions', {
		id: integer('id').primaryKey(),
		price: integer('price').notNull(),
		stock: integer('stock').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);
	db.run(sql`drop table if exists ${products}`);

	db.run(sql`create table users_transactions (id integer not null primary key, balance integer not null)`);
	db.run(
		sql`create table products_transactions (id integer not null primary key, price integer not null, stock integer not null)`,
	);

	const user = db.insert(users).values({ balance: 100 }).returning().get();
	const product = db.insert(products).values({ price: 10, stock: 10 }).returning().get();

	db.transaction((tx) => {
		tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id)).run();
		tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id)).run();
	});

	const result = db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, balance: 90 }]);

	db.run(sql`drop table ${users}`);
	db.run(sql`drop table ${products}`);
});

test.serial('transaction rollback', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_transactions_rollback', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table users_transactions_rollback (id integer not null primary key, balance integer not null)`,
	);

	t.throws(() =>
		db.transaction((tx) => {
			tx.insert(users).values({ balance: 100 }).run();
			tx.rollback();
		}), new TransactionRollbackError());

	const result = db.select().from(users).all();

	t.deepEqual(result, []);

	db.run(sql`drop table ${users}`);
});

test.serial('nested transaction', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_nested_transactions', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table users_nested_transactions (id integer not null primary key, balance integer not null)`,
	);

	db.transaction((tx) => {
		tx.insert(users).values({ balance: 100 }).run();

		tx.transaction(async (tx) => {
			tx.update(users).set({ balance: 200 }).run();
		});
	});

	const result = db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, balance: 200 }]);

	db.run(sql`drop table ${users}`);
});

test.serial('nested transaction rollback', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_nested_transactions_rollback', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table users_nested_transactions_rollback (id integer not null primary key, balance integer not null)`,
	);

	db.transaction((tx) => {
		tx.insert(users).values({ balance: 100 }).run();

		t.throws(() =>
			tx.transaction((tx) => {
				tx.update(users).set({ balance: 200 }).run();
				tx.rollback();
			}), new TransactionRollbackError());
	});

	const result = db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, balance: 100 }]);

	db.run(sql`drop table ${users}`);
});

test.serial('join subquery with join', (t) => {
	const { db } = t.context;

	const internalStaff = sqliteTable('internal_staff', {
		userId: integer('user_id').notNull(),
	});

	const customUser = sqliteTable('custom_user', {
		id: integer('id').notNull(),
	});

	const ticket = sqliteTable('ticket', {
		staffId: integer('staff_id').notNull(),
	});

	db.run(sql`drop table if exists ${internalStaff}`);
	db.run(sql`drop table if exists ${customUser}`);
	db.run(sql`drop table if exists ${ticket}`);

	db.run(sql`create table internal_staff (user_id integer not null)`);
	db.run(sql`create table custom_user (id integer not null)`);
	db.run(sql`create table ticket (staff_id integer not null)`);

	db.insert(internalStaff).values({ userId: 1 }).run();
	db.insert(customUser).values({ id: 1 }).run();
	db.insert(ticket).values({ staffId: 1 }).run();

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
		.as('internal_staff');

	const mainQuery = db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId))
		.all();

	t.deepEqual(mainQuery, [{
		ticket: { staffId: 1 },
		internal_staff: {
			internal_staff: { userId: 1 },
			custom_user: { id: 1 },
		},
	}]);

	db.run(sql`drop table ${internalStaff}`);
	db.run(sql`drop table ${customUser}`);
	db.run(sql`drop table ${ticket}`);
});

test.serial('join view as subquery', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_join_view', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	});

	const newYorkers = sqliteView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	db.run(sql`drop table if exists ${users}`);
	db.run(sql`drop view if exists ${newYorkers}`);

	db.run(
		sql`create table ${users} (id integer not null primary key, name text not null, city_id integer not null)`,
	);
	db.run(sql`create view ${newYorkers} as ${getViewConfig(newYorkers).query}`);

	db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]).run();

	const sq = db.select().from(newYorkers).as('new_yorkers_sq');

	const result = db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).all();

	t.deepEqual(result, [
		{
			users_join_view: { id: 1, name: 'John', cityId: 1 },
			new_yorkers_sq: { id: 1, name: 'John', cityId: 1 },
		},
		{
			users_join_view: { id: 2, name: 'Jane', cityId: 2 },
			new_yorkers_sq: null,
		},
		{
			users_join_view: { id: 3, name: 'Jack', cityId: 1 },
			new_yorkers_sq: { id: 3, name: 'Jack', cityId: 1 },
		},
		{
			users_join_view: { id: 4, name: 'Jill', cityId: 2 },
			new_yorkers_sq: null,
		},
	]);

	db.run(sql`drop view ${newYorkers}`);
	db.run(sql`drop table ${users}`);
});

test.serial('insert with onConflict do nothing', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing()
		.run();

	const res = db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing using composite pk', (t) => {
	const { db } = t.context;

	db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.run();

	db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john1@example.com' })
		.onConflictDoNothing()
		.run();

	const res = db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john@example.com' }]);
});

test.serial('insert with onConflict do nothing using target', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id })
		.run();

	const res = db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing using composite pk as target', (t) => {
	const { db } = t.context;

	db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.run();

	db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john1@example.com' })
		.onConflictDoNothing({ target: [pkExampleTable.id, pkExampleTable.name] })
		.run();

	const res = db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john@example.com' }]);
});

test.serial('insert with onConflict do update', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.run();

	const res = db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John1' }]);
});

test.serial('insert with onConflict do update using composite pk', (t) => {
	const { db } = t.context;

	db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

	db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.onConflictDoUpdate({ target: [pkExampleTable.id, pkExampleTable.name], set: { email: 'john1@example.com' } })
		.run();

	const res = db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john1@example.com' }]);
});

test.serial('insert undefined', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	t.notThrows(() => db.insert(users).values({ name: undefined }).run());

	db.run(sql`drop table ${users}`);
});

test.serial('update undefined', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	t.throws(() => db.update(users).set({ name: undefined }).run());
	t.notThrows(() => db.update(users).set({ id: 1, name: undefined }).run());

	db.run(sql`drop table ${users}`);
});
