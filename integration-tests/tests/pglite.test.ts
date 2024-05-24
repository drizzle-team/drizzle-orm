import 'dotenv/config';

import { PGlite } from '@electric-sql/pglite';
import type { TestFn } from 'ava';
import anyTest from 'ava';
import {
	and,
	arrayContained,
	arrayContains,
	arrayOverlaps,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	eq,
	exists,
	getTableColumns,
	gt,
	gte,
	inArray,
	lt,
	max,
	min,
	name,
	placeholder,
	type SQL,
	sql,
	type SQLWrapper,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import {
	alias,
	boolean,
	char,
	cidr,
	date,
	except,
	exceptAll,
	foreignKey,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	inet,
	integer,
	intersect,
	intersectAll,
	interval,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	type PgColumn,
	pgEnum,
	pgMaterializedView,
	pgTable,
	pgTableCreator,
	pgView,
	primaryKey,
	serial,
	text,
	time,
	timestamp,
	union,
	unionAll,
	unique,
	uniqueKeyName,
	uuid as pgUuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { v4 as uuid } from 'uuid';
import { type Equal, Expect, randomString } from './utils.ts';

const ENABLE_LOGGING = false;

const usersTable = pgTable('users', {
	id: serial('id' as string).primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const usersOnUpdate = pgTable('users_on_update', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	updateCounter: integer('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 }).$onUpdate(() => new Date()),
	alwaysNull: text('always_null').$type<string | null>().$onUpdate(() => null),
	// uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper(name)`), looks like this is not supported in pg
});

const citiesTable = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	state: char('state', { length: 2 }),
});

const cities2Table = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const users2Table = pgTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => citiesTable.id),
});

const coursesTable = pgTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: integer('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = pgTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = pgTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

const network = pgTable('network_table', {
	inet: inet('inet').notNull(),
	cidr: cidr('cidr').notNull(),
	macaddr: macaddr('macaddr').notNull(),
	macaddr8: macaddr8('macaddr8').notNull(),
});

const salEmp = pgTable('sal_emp', {
	name: text('name'),
	payByQuarter: integer('pay_by_quarter').array(),
	schedule: text('schedule').array().array(),
});

const _tictactoe = pgTable('tictactoe', {
	squares: integer('squares').array(3).array(3),
});

const usersMigratorTable = pgTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

// To test aggregate functions
const aggregateTable = pgTable('aggregate_table', {
	id: serial('id').notNull(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('null_only'),
});

interface Context {
	db: PgliteDatabase;
	client: PGlite;
}

const test = anyTest as TestFn<Context>;

test.before(async (t) => {
	const ctx = t.context;

	ctx.client = new PGlite();
	ctx.db = drizzle(ctx.client, { logger: ENABLE_LOGGING });
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop schema public cascade`);
	await ctx.db.execute(sql`create schema public`);
	await ctx.db.execute(
		sql`
			create table users (
				id serial primary key,
				name text not null,
				verified boolean not null default false, 
				jsonb jsonb,
				created_at timestamptz not null default now()
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table cities (
				id serial primary key,
				name text not null,
				state char(2)
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table users2 (
				id serial primary key,
				name text not null,
				city_id integer references cities(id)
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table course_categories (
				id serial primary key,
				name text not null
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table courses (
				id serial primary key,
				name text not null,
				category_id integer references course_categories(id)
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table orders (
				id serial primary key,
				region text not null,
				product text not null,
				amount integer not null,
				quantity integer not null
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table network_table (
				inet inet not null,
				cidr cidr not null,
				macaddr macaddr not null,
				macaddr8 macaddr8 not null
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table sal_emp (
				name text not null,
				pay_by_quarter integer[] not null,
				schedule text[][] not null
			)
		`,
	);
	await ctx.db.execute(
		sql`
			create table tictactoe (
				squares integer[3][3] not null
			)
		`,
	);
});

async function setupSetOperationTest(db: PgliteDatabase) {
	await db.execute(sql`drop table if exists users2`);
	await db.execute(sql`drop table if exists cities`);
	await db.execute(
		sql`
			create table cities (
				id serial primary key,
				name text not null
			)
		`,
	);
	await db.execute(
		sql`
			create table users2 (
				id serial primary key,
				name text not null,
				city_id integer references cities(id)
			)
		`,
	);

	await db.insert(cities2Table).values([
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

async function setupAggregateFunctionsTest(db: PgliteDatabase) {
	await db.execute(sql`drop table if exists "aggregate_table"`);
	await db.execute(
		sql`
			create table "aggregate_table" (
				"id" serial not null,
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

test.serial('table configs: unique third param', async (t) => {
	const cities1Table = pgTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: char('state', { length: 2 }),
	}, (t) => ({
		f: unique('custom_name').on(t.name, t.state).nullsNotDistinct(),
		f1: unique('custom_name1').on(t.name, t.state),
	}));

	const tableConfig = getTableConfig(cities1Table);

	t.assert(tableConfig.uniqueConstraints.length === 2);

	t.assert(tableConfig.uniqueConstraints[0]?.name === 'custom_name');
	t.assert(tableConfig.uniqueConstraints[0]?.nullsNotDistinct);
	t.deepEqual(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name), ['name', 'state']);

	t.assert(tableConfig.uniqueConstraints[1]?.name, 'custom_name1');
	t.assert(!tableConfig.uniqueConstraints[1]?.nullsNotDistinct);
	t.deepEqual(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name), ['name', 'state']);
});

test.serial('table configs: unique in column', async (t) => {
	const cities1Table = pgTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().unique(),
		state: char('state', { length: 2 }).unique('custom'),
		field: char('field', { length: 2 }).unique('custom_field', { nulls: 'not distinct' }),
	});

	const tableConfig = getTableConfig(cities1Table);

	const columnName = tableConfig.columns.find((it) => it.name === 'name');
	t.assert(columnName?.uniqueName === uniqueKeyName(cities1Table, [columnName!.name]));
	t.assert(columnName?.isUnique);

	const columnState = tableConfig.columns.find((it) => it.name === 'state');
	t.assert(columnState?.uniqueName === 'custom');
	t.assert(columnState?.isUnique);

	const columnField = tableConfig.columns.find((it) => it.name === 'field');
	t.assert(columnField?.uniqueName === 'custom_field');
	t.assert(columnField?.isUnique);
	t.assert(columnField?.uniqueType === 'not distinct');
});

test.serial('table config: foreign keys name', async (t) => {
	const table = pgTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
	}));

	const tableConfig = getTableConfig(table);

	t.is(tableConfig.foreignKeys.length, 1);
	t.is(tableConfig.foreignKeys[0]!.getName(), 'custom_fk');
});

test.serial('table config: primary keys name', async (t) => {
	const table = pgTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: primaryKey({ columns: [t.id, t.name], name: 'custom_pk' }),
	}));

	const tableConfig = getTableConfig(table);

	t.is(tableConfig.primaryKeys.length, 1);
	t.is(tableConfig.primaryKeys[0]!.getName(), 'custom_pk');
});

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	t.assert(result[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(result, [
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt },
	]);
});

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.select({
			name: sql`upper(${usersTable.name})`,
		})
		.from(usersTable);

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });

	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('$default function', async (t) => {
	const { db } = t.context;

	const insertedOrder = await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 })
		.returning();
	const selectedOrder = await db.select().from(orders);

	t.deepEqual(insertedOrder, [{
		id: 1,
		amount: 1,
		quantity: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);

	t.deepEqual(selectedOrder, [{
		id: 1,
		amount: 1,
		quantity: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test.serial('select distinct', async (t) => {
	const { db } = t.context;

	const usersDistinctTable = pgTable('users_distinct', {
		id: integer('id').notNull(),
		name: text('name').notNull(),
		age: integer('age').notNull(),
	});

	await db.execute(sql`drop table if exists ${usersDistinctTable}`);
	await db.execute(sql`create table ${usersDistinctTable} (id integer, name text, age integer)`);

	await db.insert(usersDistinctTable).values([
		{ id: 1, name: 'John', age: 24 },
		{ id: 1, name: 'John', age: 24 },
		{ id: 2, name: 'John', age: 25 },
		{ id: 1, name: 'Jane', age: 24 },
		{ id: 1, name: 'Jane', age: 26 },
	]);
	const users1 = await db.selectDistinct().from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
		usersDistinctTable.name,
	);
	const users2 = await db.selectDistinctOn([usersDistinctTable.id]).from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
	);
	const users3 = await db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
		usersDistinctTable,
	).orderBy(usersDistinctTable.name);
	const users4 = await db.selectDistinctOn([usersDistinctTable.id, usersDistinctTable.age]).from(
		usersDistinctTable,
	).orderBy(usersDistinctTable.id, usersDistinctTable.age);

	await db.execute(sql`drop table ${usersDistinctTable}`);

	t.deepEqual(users1, [
		{ id: 1, name: 'Jane', age: 24 },
		{ id: 1, name: 'Jane', age: 26 },
		{ id: 1, name: 'John', age: 24 },
		{ id: 2, name: 'John', age: 25 },
	]);

	t.deepEqual(users2.length, 2);
	t.deepEqual(users2[0]?.id, 1);
	t.deepEqual(users2[1]?.id, 2);

	t.deepEqual(users3.length, 2);
	t.deepEqual(users3[0]?.name, 'Jane');
	t.deepEqual(users3[1]?.name, 'John');

	t.deepEqual(users4, [
		{ id: 1, name: 'John', age: 24 },
		{ id: 1, name: 'Jane', age: 26 },
		{ id: 2, name: 'John', age: 25 },
	]);
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const users = await db
		.insert(usersTable)
		.values({ name: 'John' })
		.returning({
			name: sql`upper(${usersTable.name})`,
		});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.delete(usersTable)
		.where(eq(usersTable.name, 'John'))
		.returning({
			name: sql`upper(${usersTable.name})`,
		});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.update(usersTable)
		.set({ name: 'Jane' })
		.where(eq(usersTable.name, 'John'))
		.returning({
			name: sql`upper(${usersTable.name})`,
		});

	t.deepEqual(users, [{ name: 'JANE' }]);
});

test.serial('update with returning all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.update(usersTable)
		.set({ name: 'Jane' })
		.where(eq(usersTable.name, 'John'))
		.returning();

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(users, [
		{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
	]);
});

test.serial('update with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.update(usersTable)
		.set({ name: 'Jane' })
		.where(eq(usersTable.name, 'John'))
		.returning({
			id: usersTable.id,
			name: usersTable.name,
		});

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(users, [
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
	]);
});

test.serial('delete with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	});

	t.deepEqual(users, [{ id: 1, name: 'John' }]);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	t.deepEqual(result, [
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt },
	]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	t.deepEqual(result2, [
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
		})
		.from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.serial('char insert', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
		.from(citiesTable);

	t.deepEqual(result, [{ id: 1, name: 'Austin', state: 'TX' }]);
});

test.serial('char update', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
	await db.update(citiesTable).set({ name: 'Atlanta', state: 'GA' }).where(eq(citiesTable.id, 1));
	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
		.from(citiesTable);

	t.deepEqual(result, [{ id: 1, name: 'Atlanta', state: 'GA' }]);
});

test.serial('char delete', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
	await db.delete(citiesTable).where(eq(citiesTable.state, 'TX'));
	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
		.from(citiesTable);

	t.deepEqual(result, []);
});

test.serial('insert with overridden default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	t.deepEqual(result, [
		{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt },
	]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

	await db
		.insert(usersTable)
		.values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);
	const result = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
			verified: usersTable.verified,
		})
		.from(usersTable);

	t.deepEqual(result, [
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.serial('insert many with returning', async (t) => {
	const { db } = t.context;

	const result = await db
		.insert(usersTable)
		.values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		])
		.returning({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
			verified: usersTable.verified,
		});

	t.deepEqual(result, [
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.name);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with exists', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const user = alias(usersTable, 'user');
	const result = await db.select({ name: usersTable.name }).from(usersTable).where(
		exists(db.select({ one: sql`1` }).from(user).where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id)))),
	);

	t.deepEqual(result, [{ name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test.serial('insert sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
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
		})
		.from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10));

	t.deepEqual(result, [
		{
			user: { id: 10, name: 'Ivan' },
			customer: { id: 11, name: 'Hans' },
		},
	]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;

	const pgTable = pgTableCreator((name) => `prefixed_${name}`);

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select()
		.from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10));

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

	await db.execute(sql`drop table ${users}`);
});

test.serial('select from alias', async (t) => {
	const { db } = t.context;

	const pgTable = pgTableCreator((name) => `prefixed_${name}`);

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select()
		.from(user)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(user.id, 10));

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

	await db.execute(sql`drop table ${users}`);
});

test.serial('insert with spaces', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const statement = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.prepare('statement1');
	const result = await statement.execute();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', async (t) => {
	const { db } = t.context;

	const stmt = db
		.insert(usersTable)
		.values({
			verified: true,
			name: placeholder('name'),
		})
		.prepare('stmt2');

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			verified: usersTable.verified,
		})
		.from(usersTable);

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

	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.prepare('stmt3');
	const result = await stmt.execute({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement with placeholder in .limit', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.limit(placeholder('limit'))
		.prepare('stmt_limit');

	const result = await stmt.execute({ id: 1, limit: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
	t.is(result.length, 1);
});

test.serial('prepared statement with placeholder in .offset', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.offset(placeholder('offset'))
		.prepare('stmt_offset');

	const result = await stmt.execute({ offset: 1 });

	t.deepEqual(result, [{ id: 2, name: 'John1' }]);
});

// TODO change tests to new structure
test.serial('migrator : default migration strategy', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/pg' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
});

test.serial('migrator : migrate with custom schema', async (t) => {
	const { db } = t.context;
	const customSchema = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: customSchema });

	// test if the custom migrations table was created
	const { rows } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
	t.true(rows.length! > 0);

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}."__drizzle_migrations"`);
});

test.serial('migrator : migrate with custom table', async (t) => {
	const { db } = t.context;
	const customTable = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

	// test if the custom migrations table was created
	const { rows } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
	t.true(rows.length! > 0);

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
});

test.serial('migrator : migrate with custom table and custom schema', async (t) => {
	const { db } = t.context;
	const customTable = randomString();
	const customSchema = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, {
		migrationsFolder: './drizzle2/pg',
		migrationsTable: customTable,
		migrationsSchema: customSchema,
	});

	// test if the custom migrations table was created
	const { rows } = await db.execute(
		sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
	);
	t.true(rows.length! > 0);

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
});

test.serial('insert via db.execute + select via db.execute', async (t) => {
	const { db } = t.context;

	await db.execute(
		sql`insert into ${usersTable} (${name(usersTable.name.name)}) values (${'John'})`,
	);

	const result = await db.execute<{ id: number; name: string }>(
		sql`select id, name from "users"`,
	);
	t.deepEqual(result.rows, [{ id: 1, name: 'John' }]);
});

test.serial('insert via db.execute + returning', async (t) => {
	const { db } = t.context;

	const inserted = await db.execute<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${
			name(
				usersTable.name.name,
			)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	t.deepEqual(inserted.rows, [{ id: 1, name: 'John' }]);
});

test.serial('insert via db.execute w/ query builder', async (t) => {
	const { db } = t.context;

	const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db
			.insert(usersTable)
			.values({ name: 'John' })
			.returning({ id: usersTable.id, name: usersTable.name }),
	);
	t.deepEqual(inserted.rows, [{ id: 1, name: 'John' }]);
});

test.serial('Query check: Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("id", "name", "state") values (default, default, default)',
		params: [],
	});
});

test.serial('Query check: Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state').default('UA'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("id", "name", "state") values (default, default, default), (default, default, default)',
		params: [],
	});
});

test.serial('Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = pgTable('empty_insert_single', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name text default 'Dan', state text)`,
	);

	await db.insert(users).values({});

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }]);
});

test.serial('Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = pgTable('empty_insert_multiple', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name text default 'Dan', state text)`,
	);

	await db.insert(users).values([{}, {}]);

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
});

test.serial('build query insert with onConflict do update', async (t) => {
	const { db } = t.context;

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.toSQL();

	t.deepEqual(query, {
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test.serial('build query insert with onConflict do update / multiple columns', async (t) => {
	const { db } = t.context;

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: [usersTable.id, usersTable.name], set: { name: 'John1' } })
		.toSQL();

	t.deepEqual(query, {
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test.serial('build query insert with onConflict do nothing', async (t) => {
	const { db } = t.context;

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing()
		.toSQL();

	t.deepEqual(query, {
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test.serial('build query insert with onConflict do nothing + target', async (t) => {
	const { db } = t.context;

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing({ target: usersTable.id })
		.toSQL();

	t.deepEqual(query, {
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test.serial('insert with onConflict do update', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } });

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1));

	t.deepEqual(res, [{ id: 1, name: 'John1' }]);
});

test.serial('insert with onConflict do nothing', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });

	await db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1));

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing + target', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id });

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1));

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('left join (flat object fields)', async (t) => {
	const { db } = t.context;

	const { id: cityId } = await db
		.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id })
		.then((rows) => rows[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

	const res = await db
		.select({
			userId: users2Table.id,
			userName: users2Table.name,
			cityId: citiesTable.id,
			cityName: citiesTable.name,
		})
		.from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	t.deepEqual(res, [
		{ userId: 1, userName: 'John', cityId, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test.serial('left join (grouped fields)', async (t) => {
	const { db } = t.context;

	const { id: cityId } = await db
		.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id })
		.then((rows) => rows[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

	const res = await db
		.select({
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
		})
		.from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

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

	const { id: cityId } = await db
		.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id })
		.then((rows) => rows[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

	const res = await db
		.select()
		.from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

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
				state: null,
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

	await db
		.insert(courseCategoriesTable)
		.values([
			{ name: 'Category 1' },
			{ name: 'Category 2' },
			{ name: 'Category 3' },
			{ name: 'Category 4' },
		]);

	await db
		.insert(coursesTable)
		.values([
			{ name: 'Development', categoryId: 2 },
			{ name: 'IT & Software', categoryId: 3 },
			{ name: 'Marketing', categoryId: 4 },
			{ name: 'Design', categoryId: 1 },
		]);

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
		.orderBy(coursesTable.name);

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
	]);

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

	const result1 = await db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`sum(${orders.quantity})::int`,
			productSales: sql<number>`sum(${orders.amount})::int`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);
	const result2 = await db
		.with(regionalSales, topRegions)
		.selectDistinct({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`sum(${orders.quantity})::int`,
			productSales: sql<number>`sum(${orders.amount})::int`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);
	const result3 = await db
		.with(regionalSales, topRegions)
		.selectDistinctOn([orders.region], {
			region: orders.region,
			productUnits: sql<number>`sum(${orders.quantity})::int`,
			productSales: sql<number>`sum(${orders.amount})::int`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region)
		.orderBy(orders.region);

	t.deepEqual(result1, [
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
	t.deepEqual(result2, result1);
	t.deepEqual(result3, [
		{
			region: 'Europe',
			productUnits: 8,
			productSales: 80,
		},
		{
			region: 'US',
			productUnits: 16,
			productSales: 160,
		},
	]);
});

test.serial('with ... update', async (t) => {
	const { db } = t.context;

	const products = pgTable('products', {
		id: serial('id').primaryKey(),
		price: numeric('price').notNull(),
		cheap: boolean('cheap').notNull().default(false),
	});

	await db.execute(sql`drop table if exists ${products}`);
	await db.execute(sql`
		create table ${products} (
			id serial primary key,
			price numeric not null,
			cheap boolean not null default false
		)
	`);

	await db.insert(products).values([
		{ price: '10.99' },
		{ price: '25.85' },
		{ price: '32.99' },
		{ price: '2.50' },
		{ price: '4.59' },
	]);

	const averagePrice = db
		.$with('average_price')
		.as(
			db
				.select({
					value: sql`avg(${products.price})`.as('value'),
				})
				.from(products),
		);

	const result = await db
		.with(averagePrice)
		.update(products)
		.set({
			cheap: true,
		})
		.where(lt(products.price, sql`(select * from ${averagePrice})`))
		.returning({
			id: products.id,
		});

	t.deepEqual(result, [
		{ id: 1 },
		{ id: 4 },
		{ id: 5 },
	]);
});

test.serial('with ... insert', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		username: text('username').notNull(),
		admin: boolean('admin').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (username text not null, admin boolean not null default false)`);

	const userCount = db
		.$with('user_count')
		.as(
			db
				.select({
					value: sql`count(*)`.as('value'),
				})
				.from(users),
		);

	const result = await db
		.with(userCount)
		.insert(users)
		.values([
			{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` },
		])
		.returning({
			admin: users.admin,
		});

	t.deepEqual(result, [{ admin: true }]);
});

test.serial('with ... delete', async (t) => {
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
	]);

	const averageAmount = db
		.$with('average_amount')
		.as(
			db
				.select({
					value: sql`avg(${orders.amount})`.as('value'),
				})
				.from(orders),
		);

	const result = await db
		.with(averageAmount)
		.delete(orders)
		.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
		.returning({
			id: orders.id,
		});

	t.deepEqual(result, [
		{ id: 6 },
		{ id: 7 },
		{ id: 8 },
	]);
});

test.serial('select from subquery sql', async (t) => {
	const { db } = t.context;

	await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

	const sq = db
		.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq);

	t.deepEqual(res, [{ name: 'John modified' }, { name: 'Jane modified' }]);
});

test.serial('select a field without joining its table', (t) => {
	const { db } = t.context;

	t.throws(() => db.select({ name: users2Table.name }).from(usersTable).prepare('query'));
});

test.serial('select all fields from subquery without alias', (t) => {
	const { db } = t.context;

	const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

	t.throws(() => db.select().from(sq).prepare('query'));
});

test.serial('select count()', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: sql`count(*)` }).from(usersTable);

	t.deepEqual(res, [{ count: 2 }]);
});

test.serial('select count w/ custom mapper', async (t) => {
	const { db } = t.context;

	function count(value: PgColumn | SQLWrapper): SQL<number>;
	function count(value: PgColumn | SQLWrapper, alias: string): SQL.Aliased<number>;
	function count(value: PgColumn | SQLWrapper, alias?: string): SQL<number> | SQL.Aliased<number> {
		const result = sql`count(${value})`.mapWith(Number);
		if (!alias) {
			return result;
		}
		return result.as(alias);
	}

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: count(sql`*`) }).from(usersTable);

	t.deepEqual(res, [{ count: 2 }]);
});

test.serial('network types', async (t) => {
	const { db } = t.context;

	const value: typeof network.$inferSelect = {
		inet: '127.0.0.1',
		cidr: '192.168.100.128/25',
		macaddr: '08:00:2b:01:02:03',
		macaddr8: '08:00:2b:01:02:03:04:05',
	};

	await db.insert(network).values(value);

	const res = await db.select().from(network);

	t.deepEqual(res, [value]);
});

test.serial('array types', async (t) => {
	const { db } = t.context;

	const values: typeof salEmp.$inferSelect[] = [
		{
			name: 'John',
			payByQuarter: [10000, 10000, 10000, 10000],
			schedule: [['meeting', 'lunch'], ['training', 'presentation']],
		},
		{
			name: 'Carol',
			payByQuarter: [20000, 25000, 25000, 25000],
			schedule: [['breakfast', 'consulting'], ['meeting', 'lunch']],
		},
	];

	await db.insert(salEmp).values(values);

	const res = await db.select().from(salEmp);

	t.deepEqual(res, values);
});

test.serial('select for ...', (t) => {
	const { db } = t.context;

	{
		const query = db
			.select()
			.from(users2Table)
			.for('update')
			.toSQL();

		t.regex(
			query.sql,
			/ for update$/,
		);
	}

	{
		const query = db
			.select()
			.from(users2Table)
			.for('update', { of: [users2Table, coursesTable] })
			.toSQL();

		t.regex(
			query.sql,
			/ for update of "users2", "courses"$/,
		);
	}

	{
		const query = db
			.select()
			.from(users2Table)
			.for('no key update', { of: users2Table })
			.toSQL();

		t.regex(
			query.sql,
			/for no key update of "users2"$/,
		);
	}

	{
		const query = db
			.select()
			.from(users2Table)
			.for('no key update', { of: users2Table, skipLocked: true })
			.toSQL();

		t.regex(
			query.sql,
			/ for no key update of "users2" skip locked$/,
		);
	}

	{
		const query = db
			.select()
			.from(users2Table)
			.for('share', { of: users2Table, noWait: true })
			.toSQL();

		t.regex(
			query.sql,
			// eslint-disable-next-line unicorn/better-regex
			/for share of "users2" no wait$/,
		);
	}
});

test.serial('having', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
		name: 'Jack',
		cityId: 2,
	}]);

	const result = await db
		.select({
			id: citiesTable.id,
			name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
			usersCount: sql<number>`count(${users2Table.id})::int`.as('users_count'),
		})
		.from(citiesTable)
		.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
		.where(({ name }) => sql`length(${name}) >= 3`)
		.groupBy(citiesTable.id)
		.having(({ usersCount }) => sql`${usersCount} > 0`)
		.orderBy(({ name }) => name);

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

	const newYorkers1 = pgView('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = pgView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = pgView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).existing();

	await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

	await db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]);

	{
		const result = await db.select().from(newYorkers1);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers2);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers3);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
		t.deepEqual(result, [
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	await db.execute(sql`drop view ${newYorkers1}`);
});

test.serial.skip('materialized view', async (t) => {
	// Disabled due to bug in PGlite:
	// https://github.com/electric-sql/pglite/issues/63
	const { db } = t.context;

	const newYorkers1 = pgMaterializedView('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = pgMaterializedView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = pgMaterializedView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	}).existing();

	await db.execute(sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`);

	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

	await db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]);

	{
		const result = await db.select().from(newYorkers1);
		t.deepEqual(result, []);
	}

	await db.refreshMaterializedView(newYorkers1);

	{
		const result = await db.select().from(newYorkers1);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers2);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers3);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
		t.deepEqual(result, [
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	await db.execute(sql`drop materialized view ${newYorkers1}`);
});

// TODO: copy to SQLite and MySQL, add to docs
test.serial('select from raw sql', async (t) => {
	const { db } = t.context;

	const result = await db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`);

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
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

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
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

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
		.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.serial('prefixed table', async (t) => {
	const { db } = t.context;

	const pgTable = pgTableCreator((name) => `myprefix_${name}`);

	const users = pgTable('test_prefixed_table_with_unique_name', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' });

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('select from enum', async (t) => {
	const { db } = t.context;

	const muscleEnum = pgEnum('muscle', [
		'abdominals',
		'hamstrings',
		'adductors',
		'quadriceps',
		'biceps',
		'shoulders',
		'chest',
		'middle_back',
		'calves',
		'glutes',
		'lower_back',
		'lats',
		'triceps',
		'traps',
		'forearms',
		'neck',
		'abductors',
	]);

	const forceEnum = pgEnum('force', ['isometric', 'isotonic', 'isokinetic']);

	const levelEnum = pgEnum('level', ['beginner', 'intermediate', 'advanced']);

	const mechanicEnum = pgEnum('mechanic', ['compound', 'isolation']);

	const equipmentEnum = pgEnum('equipment', ['barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'kettlebell']);

	const categoryEnum = pgEnum('category', ['upper_body', 'lower_body', 'full_body']);

	const exercises = pgTable('exercises', {
		id: serial('id').primaryKey(),
		name: varchar('name').notNull(),
		force: forceEnum('force'),
		level: levelEnum('level'),
		mechanic: mechanicEnum('mechanic'),
		equipment: equipmentEnum('equipment'),
		instructions: text('instructions'),
		category: categoryEnum('category'),
		primaryMuscles: muscleEnum('primary_muscles').array(),
		secondaryMuscles: muscleEnum('secondary_muscles').array(),
		createdAt: timestamp('created_at').notNull().default(sql`now()`),
		updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
	});

	await db.execute(sql`drop table if exists ${exercises}`);
	await db.execute(sql`drop type if exists ${name(muscleEnum.enumName)}`);
	await db.execute(sql`drop type if exists ${name(forceEnum.enumName)}`);
	await db.execute(sql`drop type if exists ${name(levelEnum.enumName)}`);
	await db.execute(sql`drop type if exists ${name(mechanicEnum.enumName)}`);
	await db.execute(sql`drop type if exists ${name(equipmentEnum.enumName)}`);
	await db.execute(sql`drop type if exists ${name(categoryEnum.enumName)}`);

	await db.execute(
		sql`create type ${
			name(muscleEnum.enumName)
		} as enum ('abdominals', 'hamstrings', 'adductors', 'quadriceps', 'biceps', 'shoulders', 'chest', 'middle_back', 'calves', 'glutes', 'lower_back', 'lats', 'triceps', 'traps', 'forearms', 'neck', 'abductors')`,
	);
	await db.execute(sql`create type ${name(forceEnum.enumName)} as enum ('isometric', 'isotonic', 'isokinetic')`);
	await db.execute(sql`create type ${name(levelEnum.enumName)} as enum ('beginner', 'intermediate', 'advanced')`);
	await db.execute(sql`create type ${name(mechanicEnum.enumName)} as enum ('compound', 'isolation')`);
	await db.execute(
		sql`create type ${
			name(equipmentEnum.enumName)
		} as enum ('barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'kettlebell')`,
	);
	await db.execute(sql`create type ${name(categoryEnum.enumName)} as enum ('upper_body', 'lower_body', 'full_body')`);
	await db.execute(sql`
		create table ${exercises} (
			id serial primary key,
			name varchar not null,
			force force,
			level level,
			mechanic mechanic,
			equipment equipment,
			instructions text,
			category category,
			primary_muscles muscle[],
			secondary_muscles muscle[],
			created_at timestamp not null default now(),
			updated_at timestamp not null default now()
		)
	`);

	await db.insert(exercises).values({
		name: 'Bench Press',
		force: 'isotonic',
		level: 'beginner',
		mechanic: 'compound',
		equipment: 'barbell',
		instructions:
			'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
		category: 'upper_body',
		primaryMuscles: ['chest', 'triceps'],
		secondaryMuscles: ['shoulders', 'traps'],
	});

	const result = await db.select().from(exercises);

	t.deepEqual(result, [
		{
			id: 1,
			name: 'Bench Press',
			force: 'isotonic',
			level: 'beginner',
			mechanic: 'compound',
			equipment: 'barbell',
			instructions:
				'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
			category: 'upper_body',
			primaryMuscles: ['chest', 'triceps'],
			secondaryMuscles: ['shoulders', 'traps'],
			createdAt: result[0]!.createdAt,
			updatedAt: result[0]!.updatedAt,
		},
	]);

	await db.execute(sql`drop table ${exercises}`);
	await db.execute(sql`drop type ${name(muscleEnum.enumName)}`);
	await db.execute(sql`drop type ${name(forceEnum.enumName)}`);
	await db.execute(sql`drop type ${name(levelEnum.enumName)}`);
	await db.execute(sql`drop type ${name(mechanicEnum.enumName)}`);
	await db.execute(sql`drop type ${name(equipmentEnum.enumName)}`);
	await db.execute(sql`drop type ${name(categoryEnum.enumName)}`);
});

test.serial('all date and time columns', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		dateString: date('date_string', { mode: 'string' }).notNull(),
		time: time('time', { precision: 3 }).notNull(),
		datetime: timestamp('datetime').notNull(),
		datetimeWTZ: timestamp('datetime_wtz', { withTimezone: true }).notNull(),
		datetimeString: timestamp('datetime_string', { mode: 'string' }).notNull(),
		datetimeFullPrecision: timestamp('datetime_full_precision', { precision: 6, mode: 'string' }).notNull(),
		datetimeWTZString: timestamp('datetime_wtz_string', { withTimezone: true, mode: 'string' }).notNull(),
		interval: interval('interval').notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					date_string date not null,
					time time(3) not null,
					datetime timestamp not null,
					datetime_wtz timestamp with time zone not null,
					datetime_string timestamp not null,
					datetime_full_precision timestamp(6) not null,
					datetime_wtz_string timestamp with time zone not null,
					interval interval not null
			)
	`);

	const someDatetime = new Date('2022-01-01T00:00:00.123Z');
	const fullPrecision = '2022-01-01T00:00:00.123456Z';
	const someTime = '23:23:12.432';

	await db.insert(table).values({
		dateString: '2022-01-01',
		time: someTime,
		datetime: someDatetime,
		datetimeWTZ: someDatetime,
		datetimeString: '2022-01-01T00:00:00.123Z',
		datetimeFullPrecision: fullPrecision,
		datetimeWTZString: '2022-01-01T00:00:00.123Z',
		interval: '1 day',
	});

	const result = await db.select().from(table);

	Expect<
		Equal<{
			id: number;
			dateString: string;
			time: string;
			datetime: Date;
			datetimeWTZ: Date;
			datetimeString: string;
			datetimeFullPrecision: string;
			datetimeWTZString: string;
			interval: string;
		}[], typeof result>
	>;

	Expect<
		Equal<{
			dateString: string;
			time: string;
			datetime: Date;
			datetimeWTZ: Date;
			datetimeString: string;
			datetimeFullPrecision: string;
			datetimeWTZString: string;
			interval: string;
			id?: number | undefined;
		}, typeof table.$inferInsert>
	>;

	t.deepEqual(result, [
		{
			id: 1,
			dateString: '2022-01-01',
			time: someTime,
			datetime: someDatetime,
			datetimeWTZ: someDatetime,
			datetimeString: '2022-01-01 00:00:00.123',
			datetimeFullPrecision: fullPrecision.replace('T', ' ').replace('Z', ''),
			datetimeWTZString: '2022-01-01 00:00:00.123+00',
			interval: '1 day',
		},
	]);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns with timezone second case mode date', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(3) with time zone not null
			)
	`);

	const insertedDate = new Date();

	// 1. Insert date as new date
	await db.insert(table).values([
		{ timestamp: insertedDate },
	]);

	// 2, Select as date and check that timezones are the same
	// There is no way to check timezone in Date object, as it is always represented internally in UTC
	const result = await db.select().from(table);

	t.deepEqual(result, [{ id: 1, timestamp: insertedDate }]);

	// 3. Compare both dates
	t.deepEqual(insertedDate.getTime(), result[0]?.timestamp.getTime());

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns with timezone third case mode date', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(3) with time zone not null
			)
	`);

	const insertedDate = new Date('2022-01-01 20:00:00.123-04'); // used different time zones, internally is still UTC
	const insertedDate2 = new Date('2022-01-02 04:00:00.123+04'); // They are both the same date in different time zones

	// 1. Insert date as new dates with different time zones
	await db.insert(table).values([
		{ timestamp: insertedDate },
		{ timestamp: insertedDate2 },
	]);

	// 2, Select and compare both dates
	const result = await db.select().from(table);

	t.deepEqual(result[0]?.timestamp.getTime(), result[1]?.timestamp.getTime());

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns without timezone first case mode string', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) not null
			)
	`);

	// 1. Insert date in string format without timezone in it
	await db.insert(table).values([
		{ timestamp: '2022-01-01 02:00:00.123456' },
	]);

	// 2, Select in string format and check that values are the same
	const result = await db.select().from(table);

	t.deepEqual(result, [{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);

	// 3. Select as raw query and check that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	t.deepEqual(result2.rows, [{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns without timezone second case mode string', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) not null
			)
	`);

	// 1. Insert date in string format with timezone in it
	await db.insert(table).values([
		{ timestamp: '2022-01-01T02:00:00.123456-02' },
	]);

	// 2, Select as raw query and check that values are the same
	const result = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	t.deepEqual(result.rows, [{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns without timezone third case mode date', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(3) not null
			)
	`);

	const insertedDate = new Date('2022-01-01 20:00:00.123+04');

	// 1. Insert date as new date
	await db.insert(table).values([
		{ timestamp: insertedDate },
	]);

	// 2, Select as raw query as string
	const result = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
	t.deepEqual(new Date(result.rows[0]!.timestamp_string + 'Z').getTime(), insertedDate.getTime());

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('test mode string for timestamp with timezone', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) with time zone not null
			)
	`);

	const timestampString = '2022-01-01 00:00:00.123456-0200';

	// 1. Insert date in string format with timezone in it
	await db.insert(table).values([
		{ timestamp: timestampString },
	]);

	// 2. Select date in string format and check that the values are the same
	const result = await db.select().from(table);

	// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
	t.deepEqual(result, [{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

	// 3. Select as raw query and checke that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
	t.deepEqual(result2.rows, [{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('test mode date for timestamp with timezone', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(3) with time zone not null
			)
	`);

	const timestampString = new Date('2022-01-01 00:00:00.456-0200');

	// 1. Insert date in string format with timezone in it
	await db.insert(table).values([
		{ timestamp: timestampString },
	]);

	// 2. Select date in string format and check that the values are the same
	const result = await db.select().from(table);

	// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
	t.deepEqual(result, [{ id: 1, timestamp: timestampString }]);

	// 3. Select as raw query and checke that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
	t.deepEqual(result2.rows, [{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial.skip('test mode string for timestamp with timezone in UTC timezone', async (t) => {
	// Disabled due to bug in PGlite:
	// https://github.com/electric-sql/pglite/issues/62
	const { db } = t.context;

	// get current timezone from db
	const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

	// set timezone to UTC
	await db.execute(sql`set time zone 'UTC'`);

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) with time zone not null
			)
	`);

	const timestampString = '2022-01-01 00:00:00.123456-0200';

	// 1. Insert date in string format with timezone in it
	await db.insert(table).values([
		{ timestamp: timestampString },
	]);

	// 2. Select date in string format and check that the values are the same
	const result = await db.select().from(table);

	// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
	t.deepEqual(result, [{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

	// 3. Select as raw query and checke that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
	t.deepEqual(result2.rows, [{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

	await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial.skip('test mode string for timestamp with timezone in different timezone', async (t) => {
	// Disabled due to bug in PGlite:
	// https://github.com/electric-sql/pglite/issues/62
	const { db } = t.context;

	// get current timezone from db
	const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

	// set timezone to HST (UTC - 10)
	await db.execute(sql`set time zone 'HST'`);

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) with time zone not null
			)
	`);

	const timestampString = '2022-01-01 00:00:00.123456-1000';

	// 1. Insert date in string format with timezone in it
	await db.insert(table).values([
		{ timestamp: timestampString },
	]);

	// 2. Select date in string format and check that the values are the same
	const result = await db.select().from(table);

	t.deepEqual(result, [{ id: 1, timestamp: '2022-01-01 00:00:00.123456-10' }]);

	// 3. Select as raw query and checke that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	t.deepEqual(result2.rows, [{ id: 1, timestamp_string: '2022-01-01 00:00:00.123456-10' }]);

	await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('orderBy with aliased column', (t) => {
	const { db } = t.context;

	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	t.deepEqual(query.sql, 'select something as "test" from "users2" order by "test"');
});

test.serial('select from sql', async (t) => {
	const { db } = t.context;

	const metricEntry = pgTable('metric_entry', {
		id: pgUuid('id').notNull(),
		createdAt: timestamp('created_at').notNull(),
	});

	await db.execute(sql`drop table if exists ${metricEntry}`);
	await db.execute(sql`create table ${metricEntry} (id uuid not null, created_at timestamp not null)`);

	const metricId = uuid();

	const intervals = db.$with('intervals').as(
		db
			.select({
				startTime: sql<string>`(date'2023-03-01'+ x * '1 day'::interval)`.as('start_time'),
				endTime: sql<string>`(date'2023-03-01'+ (x+1) *'1 day'::interval)`.as('end_time'),
			})
			.from(sql`generate_series(0, 29, 1) as t(x)`),
	);

	await t.notThrowsAsync(() =>
		db
			.with(intervals)
			.select({
				startTime: intervals.startTime,
				endTime: intervals.endTime,
				count: sql<number>`count(${metricEntry})`,
			})
			.from(metricEntry)
			.rightJoin(
				intervals,
				and(
					eq(metricEntry.id, metricId),
					gte(metricEntry.createdAt, intervals.startTime),
					lt(metricEntry.createdAt, intervals.endTime),
				),
			)
			.groupBy(intervals.startTime, intervals.endTime)
			.orderBy(asc(intervals.startTime))
	);
});

test.serial('timestamp timezone', async (t) => {
	const { db } = t.context;

	const usersTableWithAndWithoutTimezone = pgTable('users_test_with_and_without_timezone', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
	});

	await db.execute(sql`drop table if exists ${usersTableWithAndWithoutTimezone}`);

	await db.execute(
		sql`
			create table users_test_with_and_without_timezone (
				id serial not null primary key,
				name text not null,
				created_at timestamptz not null default now(),
				updated_at timestamp not null default now()
			)
		`,
	);

	const date = new Date(Date.parse('2020-01-01T00:00:00+04:00'));

	await db.insert(usersTableWithAndWithoutTimezone).values({ name: 'With default times' });
	await db.insert(usersTableWithAndWithoutTimezone).values({
		name: 'Without default times',
		createdAt: date,
		updatedAt: date,
	});
	const users = await db.select().from(usersTableWithAndWithoutTimezone);

	// check that the timestamps are set correctly for default times
	t.assert(Math.abs(users[0]!.updatedAt.getTime() - Date.now()) < 2000);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - Date.now()) < 2000);

	// check that the timestamps are set correctly for non default times
	t.assert(Math.abs(users[1]!.updatedAt.getTime() - date.getTime()) < 2000);
	t.assert(Math.abs(users[1]!.createdAt.getTime() - date.getTime()) < 2000);
});

test.serial('transaction', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_transactions', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});
	const products = pgTable('products_transactions', {
		id: serial('id').primaryKey(),
		price: integer('price').notNull(),
		stock: integer('stock').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop table if exists ${products}`);

	await db.execute(sql`create table users_transactions (id serial not null primary key, balance integer not null)`);
	await db.execute(
		sql`create table products_transactions (id serial not null primary key, price integer not null, stock integer not null)`,
	);

	const user = await db.insert(users).values({ balance: 100 }).returning().then((rows) => rows[0]!);
	const product = await db.insert(products).values({ price: 10, stock: 10 }).returning().then((rows) => rows[0]!);

	await db.transaction(async (tx) => {
		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
	});

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, balance: 90 }]);

	await db.execute(sql`drop table ${users}`);
	await db.execute(sql`drop table ${products}`);
});

test.serial('transaction rollback', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_transactions_rollback (id serial not null primary key, balance integer not null)`,
	);

	await t.throwsAsync(async () =>
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });
			tx.rollback();
		}), { instanceOf: TransactionRollbackError });

	const result = await db.select().from(users);

	t.deepEqual(result, []);

	await db.execute(sql`drop table ${users}`);
});

test.serial('nested transaction', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_nested_transactions', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions (id serial not null primary key, balance integer not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await tx.transaction(async (tx) => {
			await tx.update(users).set({ balance: 200 });
		});
	});

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, balance: 200 }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('nested transaction rollback', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_nested_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions_rollback (id serial not null primary key, balance integer not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await t.throwsAsync(async () =>
			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
				tx.rollback();
			}), { instanceOf: TransactionRollbackError });
	});

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, balance: 100 }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('join subquery with join', async (t) => {
	const { db } = t.context;

	const internalStaff = pgTable('internal_staff', {
		userId: integer('user_id').notNull(),
	});

	const customUser = pgTable('custom_user', {
		id: integer('id').notNull(),
	});

	const ticket = pgTable('ticket', {
		staffId: integer('staff_id').notNull(),
	});

	await db.execute(sql`drop table if exists ${internalStaff}`);
	await db.execute(sql`drop table if exists ${customUser}`);
	await db.execute(sql`drop table if exists ${ticket}`);

	await db.execute(sql`create table internal_staff (user_id integer not null)`);
	await db.execute(sql`create table custom_user (id integer not null)`);
	await db.execute(sql`create table ticket (staff_id integer not null)`);

	await db.insert(internalStaff).values({ userId: 1 });
	await db.insert(customUser).values({ id: 1 });
	await db.insert(ticket).values({ staffId: 1 });

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
		.as('internal_staff');

	const mainQuery = await db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId));

	t.deepEqual(mainQuery, [{
		ticket: { staffId: 1 },
		internal_staff: {
			internal_staff: { userId: 1 },
			custom_user: { id: 1 },
		},
	}]);

	await db.execute(sql`drop table ${internalStaff}`);
	await db.execute(sql`drop table ${customUser}`);
	await db.execute(sql`drop table ${ticket}`);
});

test.serial('subquery with view', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_subquery_view', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	});

	const newYorkers = pgView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop view if exists ${newYorkers}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
	);
	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

	await db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]);

	const sq = db.$with('sq').as(db.select().from(newYorkers));
	const result = await db.with(sq).select().from(sq);

	t.deepEqual(result, [
		{ id: 1, name: 'John', cityId: 1 },
		{ id: 3, name: 'Jack', cityId: 1 },
	]);

	await db.execute(sql`drop view ${newYorkers}`);
	await db.execute(sql`drop table ${users}`);
});

test.serial('join view as subquery', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_join_view', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	});

	const newYorkers = pgView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop view if exists ${newYorkers}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
	);
	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

	await db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]);

	const sq = db.select().from(newYorkers).as('new_yorkers_sq');

	const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id));

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

	await db.execute(sql`drop view ${newYorkers}`);
	await db.execute(sql`drop table ${users}`);
});

test.serial('table selection with single table', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
	);

	await db.insert(users).values({ name: 'John', cityId: 1 });

	const result = await db.select({ users }).from(users);

	t.deepEqual(result, [{ users: { id: 1, name: 'John', cityId: 1 } }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('set null to jsonb field', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		jsonb: jsonb('jsonb'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, jsonb jsonb)`,
	);

	const result = await db.insert(users).values({ jsonb: null }).returning();

	t.deepEqual(result, [{ id: 1, jsonb: null }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('insert undefined', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	await t.notThrowsAsync(async () => await db.insert(users).values({ name: undefined }));

	await db.execute(sql`drop table ${users}`);
});

test.serial('update undefined', async (t) => {
	const { db } = t.context;

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	await t.throwsAsync(async () => await db.update(users).set({ name: undefined }));
	await t.notThrowsAsync(async () => await db.update(users).set({ id: 1, name: undefined }));

	await db.execute(sql`drop table ${users}`);
});

test.serial('array operators', async (t) => {
	const { db } = t.context;

	const posts = pgTable('posts', {
		id: serial('id').primaryKey(),
		tags: text('tags').array(),
	});

	await db.execute(sql`drop table if exists ${posts}`);

	await db.execute(
		sql`create table ${posts} (id serial primary key, tags text[])`,
	);

	await db.insert(posts).values([{
		tags: ['ORM'],
	}, {
		tags: ['Typescript'],
	}, {
		tags: ['Typescript', 'ORM'],
	}, {
		tags: ['Typescript', 'Frontend', 'React'],
	}, {
		tags: ['Typescript', 'ORM', 'Database', 'Postgres'],
	}, {
		tags: ['Java', 'Spring', 'OOP'],
	}]);

	const contains = await db.select({ id: posts.id }).from(posts)
		.where(arrayContains(posts.tags, ['Typescript', 'ORM']));
	const contained = await db.select({ id: posts.id }).from(posts)
		.where(arrayContained(posts.tags, ['Typescript', 'ORM']));
	const overlaps = await db.select({ id: posts.id }).from(posts)
		.where(arrayOverlaps(posts.tags, ['Typescript', 'ORM']));
	const withSubQuery = await db.select({ id: posts.id }).from(posts)
		.where(arrayContains(
			posts.tags,
			db.select({ tags: posts.tags }).from(posts).where(eq(posts.id, 1)),
		));

	t.deepEqual(contains, [{ id: 3 }, { id: 5 }]);
	t.deepEqual(contained, [{ id: 1 }, { id: 2 }, { id: 3 }]);
	t.deepEqual(overlaps, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
	t.deepEqual(withSubQuery, [{ id: 1 }, { id: 3 }, { id: 5 }]);
});

test.serial('set operations (union) from query builder with subquery', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const sq = db
		.select({ id: users2Table.id, name: users2Table.name })
		.from(users2Table).as('sq');

	const result = await db
		.select({ id: cities2Table.id, name: citiesTable.name })
		.from(cities2Table).union(
			db.select().from(sq),
		).orderBy(asc(sql`name`)).limit(2).offset(1);

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 3, name: 'Jack' },
		{ id: 2, name: 'Jane' },
	]);

	t.throws(() => {
		db
			.select({ id: cities2Table.id, name: citiesTable.name, name2: users2Table.name })
			.from(cities2Table).union(
				// @ts-expect-error
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
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).where(eq(citiesTable.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	).orderBy(asc(sql`name`)).limit(1).offset(1);

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
	]);

	t.throws(() => {
		union(
			db
				.select({ name: citiesTable.name, id: cities2Table.id })
				.from(cities2Table).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
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
		.select({ id: cities2Table.id, name: citiesTable.name })
		.from(cities2Table).limit(2).unionAll(
			db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).limit(2),
		).orderBy(asc(sql`id`));

	t.assert(result.length === 4);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
		{ id: 2, name: 'London' },
	]);

	t.throws(() => {
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).limit(2).unionAll(
				db
					.select({ name: citiesTable.name, id: cities2Table.id })
					.from(cities2Table).limit(2),
			).orderBy(asc(sql`id`));
	});
});

test.serial('set operations (union all) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await unionAll(
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).where(eq(citiesTable.id, 1)),
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
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);
	});
});

test.serial('set operations (intersect) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select({ id: cities2Table.id, name: citiesTable.name })
		.from(cities2Table).intersect(
			db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).where(gt(citiesTable.id, 1)),
		).orderBy(asc(sql`name`));

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	t.throws(() => {
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).intersect(
				// @ts-expect-error
				db
					.select({ id: cities2Table.id, name: citiesTable.name, id2: cities2Table.id })
					.from(cities2Table).where(gt(citiesTable.id, 1)),
			).orderBy(asc(sql`name`));
	});
});

test.serial('set operations (intersect) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await intersect(
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).where(eq(citiesTable.id, 1)),
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
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);
	});
});

test.serial('set operations (intersect all) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select({ id: cities2Table.id, name: citiesTable.name })
		.from(cities2Table).limit(2).intersectAll(
			db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).limit(2),
		).orderBy(asc(sql`id`));

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
	]);

	t.throws(() => {
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).limit(2).intersectAll(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(cities2Table).limit(2),
			).orderBy(asc(sql`id`));
	});
});

test.serial('set operations (intersect all) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await intersectAll(
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	);

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);

	t.throws(() => {
		intersectAll(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
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
		.from(cities2Table).except(
			db
				.select()
				.from(cities2Table).where(gt(citiesTable.id, 1)),
		);

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
	]);

	t.throws(() => {
		db
			.select()
			.from(cities2Table).except(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(cities2Table).where(gt(citiesTable.id, 1)),
			);
	});
});

test.serial('set operations (except) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await except(
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table),
		db
			.select({ id: cities2Table.id, name: citiesTable.name })
			.from(cities2Table).where(eq(citiesTable.id, 1)),
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
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(cities2Table).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).orderBy(asc(sql`id`));
	});
});

test.serial('set operations (except all) from query builder', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await db
		.select()
		.from(cities2Table).exceptAll(
			db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id, 1)),
		).orderBy(asc(sql`id`));

	t.assert(result.length === 2);

	t.deepEqual(result, [
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	t.throws(() => {
		db
			.select({ name: cities2Table.name, id: cities2Table.id })
			.from(cities2Table).exceptAll(
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id, 1)),
			).orderBy(asc(sql`id`));
	});
});

test.serial('set operations (except all) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await exceptAll(
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(gt(users2Table.id, 7)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)),
	).orderBy(asc(sql`id`)).limit(5).offset(2);

	t.assert(result.length === 4);

	t.deepEqual(result, [
		{ id: 4, name: 'Peter' },
		{ id: 5, name: 'Ben' },
		{ id: 6, name: 'Jill' },
		{ id: 7, name: 'Mary' },
	]);

	t.throws(() => {
		exceptAll(
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(gt(users2Table.id, 7)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).orderBy(asc(sql`id`));
	});
});

test.serial('set operations (mixed) from query builder with subquery', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);
	const sq = db
		.select()
		.from(cities2Table).where(gt(citiesTable.id, 1)).as('sq');

	const result = await db
		.select()
		.from(cities2Table).except(
			({ unionAll }) =>
				unionAll(
					db.select().from(sq),
					db.select().from(cities2Table).where(eq(citiesTable.id, 2)),
				),
		);

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
	]);

	t.throws(() => {
		db
			.select()
			.from(cities2Table).except(
				({ unionAll }) =>
					unionAll(
						db
							.select({ name: cities2Table.name, id: cities2Table.id })
							.from(cities2Table).where(gt(citiesTable.id, 1)),
						db.select().from(cities2Table).where(eq(citiesTable.id, 2)),
					),
			);
	});
});

test.serial('set operations (mixed all) as function', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);

	const result = await union(
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
			.select().from(cities2Table).where(gt(citiesTable.id, 1)),
	).orderBy(asc(sql`id`));

	t.assert(result.length === 6);

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
		{ id: 5, name: 'Ben' },
		{ id: 6, name: 'Jill' },
		{ id: 8, name: 'Sally' },
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
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 7)),
			),
			db
				.select().from(cities2Table).where(gt(citiesTable.id, 1)),
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

	const result1 = await db.select({ value: avg(table.b) }).from(table);
	const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
	const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

	t.deepEqual(result1[0]?.value, '33.3333333333333333');
	t.deepEqual(result2[0]?.value, null);
	t.deepEqual(result3[0]?.value, '42.5000000000000000');
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

test.serial('array mapping and parsing', async (t) => {
	const { db } = t.context;

	const arrays = pgTable('arrays_tests', {
		id: serial('id').primaryKey(),
		tags: text('tags').array(),
		nested: text('nested').array().array(),
		numbers: integer('numbers').notNull().array(),
	});

	await db.execute(sql`drop table if exists ${arrays}`);
	await db.execute(sql`
		 create table ${arrays} (
		 id serial primary key,
		 tags text[],
		 nested text[][],
		 numbers integer[]
		)
	`);

	await db.insert(arrays).values({
		tags: ['', 'b', 'c'],
		nested: [['1', ''], ['3', '\\a']],
		numbers: [1, 2, 3],
	});

	const result = await db.select().from(arrays);

	t.deepEqual(result, [{
		id: 1,
		tags: ['', 'b', 'c'],
		nested: [['1', ''], ['3', '\\a']],
		numbers: [1, 2, 3],
	}]);

	await db.execute(sql`drop table ${arrays}`);
});

test.serial('test $onUpdateFn and $onUpdate works as $default', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists ${usersOnUpdate}`);

	await db.execute(
		sql`
			create table ${usersOnUpdate} (
			id serial primary key,
			name text not null,
			update_counter integer default 1 not null,
			updated_at timestamp(3),
			always_null text
			)
		`,
	);

	await db.insert(usersOnUpdate).values([
		{ name: 'John' },
		{ name: 'Jane' },
		{ name: 'Jack' },
		{ name: 'Jill' },
	]);

	const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

	const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	t.deepEqual(response, [
		{ name: 'John', id: 1, updateCounter: 1, alwaysNull: null },
		{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
		{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
		{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
	]);
	const msDelay = 250;

	for (const eachUser of justDates) {
		t.assert(eachUser.updatedAt!.valueOf() > Date.now() - msDelay);
	}
});

test.serial('test $onUpdateFn and $onUpdate works updating', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists ${usersOnUpdate}`);

	await db.execute(
		sql`
			create table ${usersOnUpdate} (
			id serial primary key,
			name text not null,
			update_counter integer default 1,
			updated_at timestamp(3),
			always_null text
			)
		`,
	);

	await db.insert(usersOnUpdate).values([
		{ name: 'John', alwaysNull: 'this will be null after updating' },
		{ name: 'Jane' },
		{ name: 'Jack' },
		{ name: 'Jill' },
	]);

	const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
	// const initial = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	await db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));
	await db.update(usersOnUpdate).set({ updateCounter: null }).where(eq(usersOnUpdate.id, 2));

	const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

	t.deepEqual(response, [
		{ name: 'Angel', id: 1, updateCounter: 2, alwaysNull: null },
		{ name: 'Jane', id: 2, updateCounter: null, alwaysNull: null },
		{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
		{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
	]);
	const msDelay = 250;

	// t.assert(initial[0]?.updatedAt?.valueOf() !== justDates[0]?.updatedAt?.valueOf());

	for (const eachUser of justDates) {
		t.assert(eachUser.updatedAt!.valueOf() > Date.now() - msDelay);
	}
});
