import 'dotenv/config';

import { type Client, createClient } from '@libsql/client';
import type { TestFn } from 'ava';
import anyTest from 'ava';
import {
	asc,
	eq,
	gt,
	gte,
	inArray,
	type InferModel,
	Name,
	name,
	placeholder,
	sql,
	TransactionRollbackError,
	count,
	countDistinct,
	avg,
	avgDistinct,
	sum,
	sumDistinct,
	max,
	min
} from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import {
	alias,
	blob,
	except,
	foreignKey,
	getTableConfig,
	getViewConfig,
	int,
	integer,
	intersect,
	primaryKey,
	sqliteTable,
	sqliteTableCreator,
	sqliteView,
	text,
	union,
	unionAll,
} from 'drizzle-orm/sqlite-core';
import { type Equal, Expect } from './utils.ts';

const ENABLE_LOGGING = false;

interface Context {
	client: Client;
	db: LibSQLDatabase;
}

const test = anyTest as TestFn<Context>;

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
	product: text('product').notNull().$default(() => 'random_string'),
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

// To test aggregate functions
const aggregateTable = sqliteTable('aggregate_table', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('null_only')
});

test.before(async (t) => {
	const ctx = t.context;
	const url = process.env['LIBSQL_URL'];
	const authToken = process.env['LIBSQL_AUTH_TOKEN'];
	if (!url) {
		throw new Error('LIBSQL_URL is not set');
	}
	const sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.client = createClient({ url, authToken });
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to libsql');
		throw lastError;
	}
	ctx.db = drizzle(ctx.client, { logger: ENABLE_LOGGING });
});

test.after.always(async (t) => {
	t.context.client.close();
});

test.beforeEach(async (t) => {
	const ctx = t.context;

	await ctx.db.run(sql`drop table if exists ${usersTable}`);
	await ctx.db.run(sql`drop table if exists ${users2Table}`);
	await ctx.db.run(sql`drop table if exists ${citiesTable}`);
	await ctx.db.run(sql`drop table if exists ${coursesTable}`);
	await ctx.db.run(sql`drop table if exists ${courseCategoriesTable}`);
	await ctx.db.run(sql`drop table if exists ${orders}`);
	await ctx.db.run(sql`drop table if exists ${bigIntExample}`);
	await ctx.db.run(sql`drop table if exists ${pkExampleTable}`);

	await ctx.db.run(sql`
		create table ${usersTable} (
			id integer primary key,
			name text not null,
			verified integer not null default 0,
			json blob,
			created_at integer not null default (strftime('%s', 'now'))
		)
	`);

	await ctx.db.run(sql`
		create table ${citiesTable} (
			id integer primary key,
			name text not null
		)
	`);
	await ctx.db.run(sql`
		create table ${courseCategoriesTable} (
			id integer primary key,
			name text not null
		)
	`);

	await ctx.db.run(sql`
		create table ${users2Table} (
			id integer primary key,
			name text not null,
			city_id integer references ${citiesTable}(${name(citiesTable.id.name)})
		)
	`);
	await ctx.db.run(sql`
		create table ${coursesTable} (
			id integer primary key,
			name text not null,
			category_id integer references ${courseCategoriesTable}(${name(courseCategoriesTable.id.name)})
		)
	`);
	await ctx.db.run(sql`
		create table ${orders} (
			id integer primary key,
			region text not null,
			product text not null,
			amount integer not null,
			quantity integer not null
		)
	`);
	await ctx.db.run(sql`
		create table ${pkExampleTable} (
			id integer not null,
			name text not null,
			email text not null,
			primary key (id, name)
		)
	`);
	await ctx.db.run(sql`
		create table ${bigIntExample} (
		  id integer primary key,
		  name text not null,
		  big_int blob not null
		)
	`);
});

async function setupSetOperationTest(db: LibSQLDatabase<Record<string, never>>) {
	await db.run(sql`drop table if exists users2`);
	await db.run(sql`drop table if exists cities`);
	await db.run(sql`
		create table \`cities\` (
			id integer primary key,
			name text not null
		)
	`);

	await db.run(sql`
		create table \`users2\` (
			id integer primary key,
			name text not null,
			city_id integer references ${citiesTable}(${name(citiesTable.id.name)})
		)
	`);

	await db.insert(citiesTable).values([
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	await db.insert(users2Table).values([
		{ id: 1, name: 'John', cityId: 1 },
		{ id: 2, name: 'Jane', cityId: 2 },
		{ id: 3, name: 'Jack', cityId: 3 },
		{ id: 4, name: 'Peter', cityId: 3 },
		{ id: 5, name: 'Ben', cityId: 2 },
		{ id: 6, name: 'Jill', cityId: 1 },
		{ id: 7, name: 'Mary', cityId: 2 },
		{ id: 8, name: 'Sally', cityId: 1 },
	]);
}

async function setupAggregateFunctionsTest(db: LibSQLDatabase<Record<string, never>>) {
	await db.run(sql`drop table if exists "aggregate_table"`);
	await db.run(
		sql`
			create table "aggregate_table" (
				"id" integer primary key autoincrement not null,
				"name" text not null,
				"a" integer,
				"b" integer,
				"c" integer,
				"null_only" integer
			);
		`,
	);
	await db.insert(aggregateTable).values([
		{ name: 'value 1', a: 5, b: 10, c: 20 },
		{ name: 'value 1', a: 5, b: 20, c: 30 },
		{ name: 'value 2', a: 10, b: 50, c: 60 },
		{ name: 'value 3', a: 20, b: 20, c: null },
		{ name: 'value 4', a: null, b: 90, c: 120 },
		{ name: 'value 5', a: 80, b: 10, c: null },
		{ name: 'value 6', a: null, b: null, c: 150 },
	]);
}

test.serial('table config: foreign keys name', async (t) => {
	const table = sqliteTable('cities', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
		f1: foreignKey(() => ({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk_deprecated' })),
	}));

	const tableConfig = getTableConfig(table);

	t.is(tableConfig.foreignKeys.length, 2);
	t.is(tableConfig.foreignKeys[0]!.getName(), 'custom_fk');
	t.is(tableConfig.foreignKeys[1]!.getName(), 'custom_fk_deprecated');
});

test.serial('table config: primary keys name', async (t) => {
	const table = sqliteTable('cities', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: primaryKey({ columns: [t.id, t.name], name: 'custom_pk' }),
	}));

	const tableConfig = getTableConfig(table);

	t.is(tableConfig.primaryKeys.length, 1);
	t.is(tableConfig.primaryKeys[0]!.getName(), 'custom_pk');
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

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select().from(usersTable).all();
	t.assert(result[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select({ name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ name: 'John' }]);
});

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select distinct', async (t) => {
	const { db } = t.context;

	const usersDistinctTable = sqliteTable('users_distinct', {
		id: integer('id').notNull(),
		name: text('name').notNull(),
	});

	await db.run(sql`drop table if exists ${usersDistinctTable}`);
	await db.run(sql`create table ${usersDistinctTable} (id integer, name text)`);

	await db.insert(usersDistinctTable).values([
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'John' },
		{ id: 1, name: 'Jane' },
	]).run();
	const users = await db.selectDistinct().from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
		usersDistinctTable.name,
	).all();

	await db.run(sql`drop table ${usersDistinctTable}`);

	t.deepEqual(users, [{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('$default function', async (t) => {
	const { db } = t.context;

	await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
	const selectedOrder = await db.select().from(orders);

	t.deepEqual(selectedOrder, [{
		id: 1,
		amount: 1,
		quantity: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('query check: insert single empty row', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("id", "name", "state") values (null, ?, null)',
		params: ['Dan'],
	});
});

test.serial('query check: insert multiple empty rows', (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("id", "name", "state") values (null, ?, null), (null, ?, null)',
		params: ['Dan', 'Dan'],
	});
});

test.serial('Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('empty_insert_single', {
		id: integer('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`,
	);

	await db.insert(users).values({}).run();

	const res = await db.select().from(users).all();

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }]);
});

test.serial('Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('empty_insert_multiple', {
		id: integer('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`,
	);

	await db.insert(users).values([{}, {}]).run();

	const res = await db.select().from(users).all();

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JANE' }]);
});

test.serial('insert with auto increment', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Jane' },
		{ name: 'George' },
		{ name: 'Austin' },
	]).run();
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Jane' },
		{ id: 3, name: 'George' },
		{ id: 4, name: 'Austin' },
	]);
});

test.serial('insert with default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select().from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('insert with overridden default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', verified: true }).run();
	const result = await db.select().from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: true, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('update with returning all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: false, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, [{ id: 1, name: 'John', verified: false, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('delete with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'John' }]);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.insert(usersTable).values({ name: 'Jane' }).run();
	const result2 = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).run();
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
	}).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]).run();
	const result = await db.select({
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

test.serial('insert many with returning', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values([
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

test.serial('partial join with alias', async (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);

	const result = await db
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
		.where(eq(usersTable.id, 10));

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`create table ${users} (id integer primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = await db
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

	await db.run(sql`drop table ${users}`);
});

test.serial('select from alias', async (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`create table ${users} (id integer primary key, name text not null)`);

	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = await db
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

	await db.run(sql`drop table ${users}`);
});

test.serial('insert with spaces', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).run();
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const statement = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).prepare();
	const result = await statement.all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', async (t) => {
	const { db } = t.context;

	const stmt = db.insert(usersTable).values({
		verified: true,
		name: placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		await stmt.run({ name: `John ${i}` });
	}

	const result = await db.select({
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

test.serial('prepared statement with placeholder in .where', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.prepare();
	const result = await stmt.all({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test.serial('migrator', async (t) => {
	const { db } = t.context;

	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/sqlite' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = await db.select().from(usersMigratorTable).all();

	await db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = await db.select().from(anotherUsersMigratorTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);
	t.deepEqual(result2, [{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table __drizzle_migrations`);
});

test.serial('insert via db.run + select via db.all', async (t) => {
	const { db } = t.context;

	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('insert via db.get', async (t) => {
	const { db } = t.context;

	const inserted = await db.get<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${new Name(
			usersTable.name.name,
		)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	t.deepEqual(inserted, { id: 1, name: 'John' });
});

test.serial('insert via db.run + select via db.get', async (t) => {
	const { db } = t.context;

	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.get<{ id: number; name: string }>(
		sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
	);
	t.deepEqual(result, { id: 1, name: 'John' });
});

test.serial('insert via db.get w/ query builder', async (t) => {
	const { db } = t.context;

	const inserted = await db.get<Pick<InferModel<typeof usersTable>, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	t.deepEqual(inserted, { id: 1, name: 'John' });
});

test.serial('left join (flat object fields)', async (t) => {
	const { db } = t.context;

	const { id: cityId } = await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id }).all().then((res) => res[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]).run();

	const res = await db.select({
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

test.serial('left join (grouped fields)', async (t) => {
	const { db } = t.context;

	const { id: cityId } = await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id }).all().then((res) => res[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]).run();

	const res = await db.select({
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

test.serial('left join (all fields)', async (t) => {
	const { db } = t.context;

	const { id: cityId } = await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id }).all().then((res) => res[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]).run();

	const res = await db.select().from(users2Table)
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

test.serial('join subquery', async (t) => {
	const { db } = t.context;

	await db.insert(courseCategoriesTable).values([
		{ name: 'Category 1' },
		{ name: 'Category 2' },
		{ name: 'Category 3' },
		{ name: 'Category 4' },
	]).run();

	await db.insert(coursesTable).values([
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

	const res = await db
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

test.serial('with ... select', async (t) => {
	const { db } = t.context;

	await db.insert(orders).values([
		{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
		{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 50, quantity: 5 },
	]).run();

	const regionalSales = await db
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

	const topRegions = await db
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

	const result = await db
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

test.serial('select from subquery sql', async (t) => {
	const { db } = t.context;

	await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]).run();

	const sq = db
		.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq).all();

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

test.serial('select count()', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]).run();

	const res = await db.select({ count: sql`count(*)` }).from(usersTable).all();

	t.deepEqual(res, [{ count: 2 }]);
});

test.serial('having', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]).run();

	await db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]).run();

	const result = await db
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

test.serial('view', async (t) => {
	const { db } = t.context;

	const newYorkers1 = sqliteView('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = sqliteView('new_yorkers', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = sqliteView('new_yorkers', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).existing();

	await db.run(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]).run();

	await db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]).run();

	{
		const result = await db.select().from(newYorkers1).all();
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers2).all();
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers3).all();
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1).all();
		t.deepEqual(result, [
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	await db.run(sql`drop view ${newYorkers1}`);
});

test.serial('insert null timestamp', async (t) => {
	const { db } = t.context;

	const test = sqliteTable('test', {
		t: integer('t', { mode: 'timestamp' }),
	});

	await db.run(sql`create table ${test} (t timestamp)`);

	await db.insert(test).values({ t: null }).run();
	const res = await db.select().from(test).all();
	t.deepEqual(res, [{ t: null }]);

	await db.run(sql`drop table ${test}`);
});

test.serial('select from raw sql', async (t) => {
	const { db } = t.context;

	const result = await db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`).all();

	Expect<Equal<{ id: number; name: string }[], typeof result>>;

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);
});

test.serial('select from raw sql with joins', async (t) => {
	const { db } = t.context;

	const result = await db
		.select({
			id: sql<number>`users.id`,
			name: sql<string>`users.name`.as('userName'),
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`.as('cityName'),
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`)
		.all();

	Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
	]);
});

test.serial('join on aliased sql from select', async (t) => {
	const { db } = t.context;

	const result = await db
		.select({
			userId: sql<number>`users.id`.as('userId'),
			name: sql<string>`users.name`.as('userName'),
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
			cityName: sql<string>`cities.name`.as('cityName'),
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId))
		.all();

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.serial('join on aliased sql from with clause', async (t) => {
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

	const result = await db
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

test.serial('prefixed table', async (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `myprefix_${name}`);

	const users = sqliteTable('test_prefixed_table_with_unique_name', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' }).run();

	const result = await db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.run(sql`drop table ${users}`);
});

test.serial('orderBy with aliased column', (t) => {
	const { db } = t.context;

	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	t.deepEqual(query.sql, 'select something as "test" from "users2" order by "test"');
});

test.serial('transaction', async (t) => {
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

	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`drop table if exists ${products}`);

	await db.run(sql`create table users_transactions (id integer not null primary key, balance integer not null)`);
	await db.run(
		sql`create table products_transactions (id integer not null primary key, price integer not null, stock integer not null)`,
	);

	const user = await db.insert(users).values({ balance: 100 }).returning().get();
	const product = await db.insert(products).values({ price: 10, stock: 10 }).returning().get();

	await db.transaction(async (tx) => {
		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id)).run();
		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id)).run();
	});

	const result = await db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, balance: 90 }]);

	await db.run(sql`drop table ${users}`);
	await db.run(sql`drop table ${products}`);
});

test.serial('transaction rollback', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_transactions_rollback', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table users_transactions_rollback (id integer not null primary key, balance integer not null)`,
	);

	await t.throwsAsync(async () =>
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 }).run();
			tx.rollback();
		}), { instanceOf: TransactionRollbackError });

	const result = await db.select().from(users).all();

	t.deepEqual(result, []);

	await db.run(sql`drop table ${users}`);
});

test.serial('nested transaction', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_nested_transactions', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table users_nested_transactions (id integer not null primary key, balance integer not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 }).run();

		await tx.transaction(async (tx) => {
			await tx.update(users).set({ balance: 200 }).run();
		});
	});

	const result = await db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, balance: 200 }]);

	await db.run(sql`drop table ${users}`);
});

test.serial('nested transaction rollback', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_nested_transactions_rollback', {
		id: integer('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table users_nested_transactions_rollback (id integer not null primary key, balance integer not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 }).run();

		await t.throwsAsync(async () =>
			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 }).run();
				tx.rollback();
			}), { instanceOf: TransactionRollbackError });
	});

	const result = await db.select().from(users).all();

	t.deepEqual(result, [{ id: 1, balance: 100 }]);

	await db.run(sql`drop table ${users}`);
});

test.serial('join subquery with join', async (t) => {
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

	await db.run(sql`drop table if exists ${internalStaff}`);
	await db.run(sql`drop table if exists ${customUser}`);
	await db.run(sql`drop table if exists ${ticket}`);

	await db.run(sql`create table internal_staff (user_id integer not null)`);
	await db.run(sql`create table custom_user (id integer not null)`);
	await db.run(sql`create table ticket (staff_id integer not null)`);

	await db.insert(internalStaff).values({ userId: 1 }).run();
	await db.insert(customUser).values({ id: 1 }).run();
	await db.insert(ticket).values({ staffId: 1 }).run();

	const subq = await db
		.select()
		.from(internalStaff)
		.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
		.as('internal_staff');

	const mainQuery = await db
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

	await db.run(sql`drop table ${internalStaff}`);
	await db.run(sql`drop table ${customUser}`);
	await db.run(sql`drop table ${ticket}`);
});

test.serial('join view as subquery', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users_join_view', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	});

	const newYorkers = sqliteView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`drop view if exists ${newYorkers}`);

	await db.run(
		sql`create table ${users} (id integer not null primary key, name text not null, city_id integer not null)`,
	);
	await db.run(sql`create view ${newYorkers} as ${getViewConfig(newYorkers).query}`);

	db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]).run();

	const sq = db.select().from(newYorkers).as('new_yorkers_sq');

	const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).all();

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

	await db.run(sql`drop view ${newYorkers}`);
	await db.run(sql`drop table ${users}`);
});

test.serial('insert with onConflict do nothing', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing()
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing using composite pk', async (t) => {
	const { db } = t.context;

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.run();

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john1@example.com' })
		.onConflictDoNothing()
		.run();

	const res = await db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john@example.com' }]);
});

test.serial('insert with onConflict do nothing using target', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id })
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing using composite pk as target', async (t) => {
	const { db } = t.context;

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.run();

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john1@example.com' })
		.onConflictDoNothing({ target: [pkExampleTable.id, pkExampleTable.name] })
		.run();

	const res = await db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john@example.com' }]);
});

test.serial('insert with onConflict do update', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John1' }]);
});

test.serial('insert with onConflict do update where', async (t) => {
	const { db } = t.context;

	await db
		.insert(usersTable)
		.values([{ id: 1, name: 'John', verified: false }])
		.run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John1', verified: true })
		.onConflictDoUpdate({
			target: usersTable.id,
			set: { name: 'John1', verified: true },
			where: eq(usersTable.verified, false),
		})
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name, verified: usersTable.verified })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John1', verified: true }]);
});

test.serial('insert with onConflict do update using composite pk', async (t) => {
	const { db } = t.context;

	await db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.onConflictDoUpdate({ target: [pkExampleTable.id, pkExampleTable.name], set: { email: 'john1@example.com' } })
		.run();

	const res = await db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john1@example.com' }]);
});

test.serial('insert undefined', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	await t.notThrowsAsync(async () => await db.insert(users).values({ name: undefined }).run());

	await db.run(sql`drop table ${users}`);
});

test.serial('update undefined', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	await t.throwsAsync(async () => await db.update(users).set({ name: undefined }).run());
	await t.notThrowsAsync(async () => await db.update(users).set({ id: 1, name: undefined }).run());

	await db.run(sql`drop table ${users}`);
});

test.serial('async api - CRUD', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' });

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'John' }]);

	await db.update(users).set({ name: 'John1' }).where(eq(users.id, 1));

	const res1 = await db.select().from(users);

	t.deepEqual(res1, [{ id: 1, name: 'John1' }]);

	await db.delete(users).where(eq(users.id, 1));

	const res2 = await db.select().from(users);

	t.deepEqual(res2, []);

	await db.run(sql`drop table ${users}`);
});

test.serial('async api - insert + select w/ prepare + async execute', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	const insertStmt = db.insert(users).values({ id: 1, name: 'John' }).prepare();
	await insertStmt.execute();

	const selectStmt = db.select().from(users).prepare();
	const res = await selectStmt.execute();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);

	const updateStmt = db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
	await updateStmt.execute();

	const res1 = await selectStmt.execute();

	t.deepEqual(res1, [{ id: 1, name: 'John1' }]);

	const deleteStmt = db.delete(users).where(eq(users.id, 1)).prepare();
	await deleteStmt.execute();

	const res2 = await selectStmt.execute();

	t.deepEqual(res2, []);

	await db.run(sql`drop table ${users}`);
});

test.serial('async api - insert + select w/ prepare + sync execute', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	const insertStmt = db.insert(users).values({ id: 1, name: 'John' }).prepare();
	await insertStmt.execute();

	const selectStmt = db.select().from(users).prepare();
	const res = await selectStmt.execute();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);

	const updateStmt = db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
	await updateStmt.execute();

	const res1 = await selectStmt.execute();

	t.deepEqual(res1, [{ id: 1, name: 'John1' }]);

	const deleteStmt = db.delete(users).where(eq(users.id, 1)).prepare();
	await deleteStmt.execute();

	const res2 = await selectStmt.execute();

	t.deepEqual(res2, []);

	await db.run(sql`drop table ${users}`);
});

test.serial('select + .get() for empty result', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	db.run(sql`drop table if exists ${users}`);

	db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	const res = await db.select().from(users).where(eq(users.id, 1)).get();

	t.is(res, undefined);

	await db.run(sql`drop table ${users}`);
});

test.serial('set operations (union) from query builder with subquery', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const sq = db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).union(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table),
		).orderBy(asc(sql`name`)).as('sq');

	const result = await db.select().from(sq).limit(5).offset(5);

	t.assert(result.length === 5);

	t.deepEqual(result, [
		{ id: 2, name: 'London' },
		{ id: 7, name: 'Mary' },
		{ id: 1, name: 'New York' },
		{ id: 4, name: 'Peter' },
		{ id: 8, name: 'Sally' },
	]);

	t.throws(() => {
		db
			.select({ name: citiesTable.name, id: citiesTable.id })
			.from(citiesTable).union(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table),
			).orderBy(asc(sql`name`));
	});
});

test.serial('set operations (union) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await union(
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).where(eq(citiesTable.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	).orderBy(asc(sql`name`));

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
		{ id: 1, name: 'New York' },
	]);

	t.throws(() => {
		union(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).orderBy(asc(sql`name`));
	});
});

test.serial('set operations (union all) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).unionAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable),
		).orderBy(asc(citiesTable.id)).limit(5).offset(1);

	t.assert(result.length === 5);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
		{ id: 3, name: 'Tampa' },
	]);

	t.throws(() => {
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).unionAll(
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable),
			).orderBy(asc(citiesTable.id)).limit(5).offset(1);
	});
});

test.serial('set operations (union all) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await unionAll(
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).where(eq(citiesTable.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	);

	t.assert(result.length === 3);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
	]);

	t.throws(() => {
		unionAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);
	});
});

test.serial('set operations (intersect) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).intersect(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(gt(citiesTable.id, 1)),
		).orderBy(asc(sql`name`));

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	t.throws(() => {
		db
			.select({ name: citiesTable.name, id: citiesTable.id })
			.from(citiesTable).intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			).orderBy(asc(sql`name`));
	});
});

test.serial('set operations (intersect) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await intersect(
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).where(eq(citiesTable.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	);

	t.assert(result.length === 0);

	t.deepEqual(result, []);

	t.throws(() => {
		intersect(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);
	});
});

test.serial('set operations (except) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select()
		.from(citiesTable).except(
			db
				.select()
				.from(citiesTable).where(gt(citiesTable.id, 1)),
		);

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
	]);

	t.throws(() => {
		db
			.select()
			.from(citiesTable).except(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			);
	});
});

test.serial('set operations (except) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await except(
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable),
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).where(eq(citiesTable.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	).orderBy(asc(sql`id`));

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	t.throws(() => {
		except(
			db
				.select({ name: citiesTable.name, id: citiesTable.id })
				.from(citiesTable),
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).orderBy(asc(sql`id`));
	});
});

test.serial('set operations (mixed) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select()
		.from(citiesTable).except(
			({ unionAll }) =>
				unionAll(
					db
						.select()
						.from(citiesTable).where(gt(citiesTable.id, 1)),
					db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
				),
		);

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
	]);

	t.throws(() => {
		db
			.select()
			.from(citiesTable).except(
				({ unionAll }) =>
					unionAll(
						db
							.select()
							.from(citiesTable).where(gt(citiesTable.id, 1)),
						db.select({ name: citiesTable.name, id: citiesTable.id })
							.from(citiesTable).where(eq(citiesTable.id, 2)),
					),
			);
	});
});

test.serial('set operations (mixed all) as function with subquery', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const sq = union(
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		except(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(gte(users2Table.id, 5)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 7)),
		),
		db
			.select().from(citiesTable).where(gt(citiesTable.id, 1)),
	).orderBy(asc(sql`id`)).as('sq');

	const result = await db.select().from(sq).limit(4).offset(1);

	t.assert(result.length === 4);

	t.deepEqual(result, [
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
		{ id: 5, name: 'Ben' },
		{ id: 6, name: 'Jill' },
	]);

	t.throws(() => {
		union(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			except(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(gte(users2Table.id, 5)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 7)),
			),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(citiesTable).where(gt(citiesTable.id, 1)),
		).orderBy(asc(sql`id`));
	});
});

test.serial('aggregate function: count', async (t) => {
	const { db } = t.context;
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: count() }).from(table);
	const result2 = await db.select({ value: count(table.a) }).from(table);
	const result3 = await db.select({ value: countDistinct(table.name) }).from(table);

	t.deepEqual(result1[0]?.value, 7);
	t.deepEqual(result2[0]?.value, 5);
	t.deepEqual(result3[0]?.value, 6);
});

test.serial('aggregate function: avg', async (t) => {
	const { db } = t.context;
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: avg(table.a) }).from(table);
	const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
	const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

	t.deepEqual(result1[0]?.value, '24');
	t.deepEqual(result2[0]?.value, null);
	t.deepEqual(result3[0]?.value, '42.5');
});

test.serial('aggregate function: sum', async (t) => {
	const { db } = t.context;
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: sum(table.b) }).from(table);
	const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
	const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

	t.deepEqual(result1[0]?.value, '200');
	t.deepEqual(result2[0]?.value, null);
	t.deepEqual(result3[0]?.value, '170');
});

test.serial('aggregate function: max', async (t) => {
	const { db } = t.context;
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: max(table.b) }).from(table);
	const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

	t.deepEqual(result1[0]?.value, 90);
	t.deepEqual(result2[0]?.value, null);
});

test.serial('aggregate function: min', async (t) => {
	const { db } = t.context;
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: min(table.b) }).from(table);
	const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

	t.deepEqual(result1[0]?.value, 10);
	t.deepEqual(result2[0]?.value, null);
});
