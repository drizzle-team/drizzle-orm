import 'dotenv/config';

import { connect } from '@tidbcloud/serverless';
import {
	and,
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
	Name,
	sql,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	date,
	datetime,
	decimal,
	except,
	exceptAll,
	foreignKey,
	getTableConfig,
	getViewConfig,
	int,
	intersect,
	intersectAll,
	json,
	mediumint,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	primaryKey,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	union,
	unionAll,
	unique,
	uniqueIndex,
	uniqueKeyName,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import type { TiDBServerlessDatabase } from 'drizzle-orm/tidb-serverless';
import { drizzle } from 'drizzle-orm/tidb-serverless';
import { migrate } from 'drizzle-orm/tidb-serverless/migrator';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import { type Equal, Expect, toLocalDate } from './utils.ts';

const ENABLE_LOGGING = false;

let db: TiDBServerlessDatabase;

const usersTable = mysqlTable('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

const users2Table = mysqlTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

const citiesTable = mysqlTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const usersOnUpdate = mysqlTable('users_on_update', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	updateCounter: int('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$onUpdate(() => new Date()),
	uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper(name)`),
	alwaysNull: text('always_null').$type<string | null>().$onUpdateFn(() => null), // need to add $type because $onUpdate add a default value
});

const datesTable = mysqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { fsp: 1 }),
	datetime: datetime('datetime', { fsp: 2 }),
	datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
	timestamp: timestamp('timestamp', { fsp: 3 }),
	timestampAsString: timestamp('timestamp_as_string', { fsp: 3, mode: 'string' }),
	year: year('year'),
});

const coursesTable = mysqlTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: int('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = mysqlTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = mysqlTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

const usersMigratorTable = mysqlTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => {
	return {
		name: uniqueIndex('').on(table.name).using('btree'),
	};
});

// To test aggregate functions
const aggregateTable = mysqlTable('aggregate_table', {
	id: serial('id').notNull(),
	name: text('name').notNull(),
	a: int('a'),
	b: int('b'),
	c: int('c'),
	nullOnly: int('null_only'),
});

beforeAll(async () => {
	const connectionString = process.env['TIDB_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error('TIDB_CONNECTION_STRING is not set');
	}

	const client = connect({ url: connectionString });
	db = drizzle(client!, { logger: ENABLE_LOGGING });
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists \`userstest\``);
	await db.execute(sql`drop table if exists \`users2\``);
	await db.execute(sql`drop table if exists \`cities\``);

	await db.execute(
		sql`
			create table \`userstest\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`verified\` boolean not null default false,
				\`jsonb\` json,
				\`created_at\` timestamp not null default now()
			)
		`,
	);

	await db.execute(
		sql`
			create table \`users2\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references \`cities\`(\`id\`)
			)
		`,
	);

	await db.execute(
		sql`
			create table \`cities\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);
});

async function setupSetOperationTest(db: TiDBServerlessDatabase) {
	await db.execute(sql`drop table if exists \`users2\``);
	await db.execute(sql`drop table if exists \`cities\``);
	await db.execute(
		sql`
			create table \`users2\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references \`cities\`(\`id\`)
			)
		`,
	);

	await db.execute(
		sql`
			create table \`cities\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);

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

async function setupAggregateFunctionsTest(db: TiDBServerlessDatabase) {
	await db.execute(sql`drop table if exists \`aggregate_table\``);
	await db.execute(
		sql`
			create table \`aggregate_table\` (
				\`id\` integer primary key auto_increment not null,
				\`name\` text not null,
				\`a\` integer,
				\`b\` integer,
				\`c\` integer,
				\`null_only\` integer
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

test('table config: unsigned ints', async () => {
	const unsignedInts = mysqlTable('cities1', {
		bigint: bigint('bigint', { mode: 'number', unsigned: true }),
		int: int('int', { unsigned: true }),
		smallint: smallint('smallint', { unsigned: true }),
		mediumint: mediumint('mediumint', { unsigned: true }),
		tinyint: tinyint('tinyint', { unsigned: true }),
	});

	const tableConfig = getTableConfig(unsignedInts);

	const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
	const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
	const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
	const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
	const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

	expect(bigintColumn.getSQLType()).toEqual('bigint unsigned');
	expect(intColumn.getSQLType()).toEqual('int unsigned');
	expect(smallintColumn.getSQLType()).toEqual('smallint unsigned');
	expect(mediumintColumn.getSQLType()).toEqual('mediumint unsigned');
	expect(tinyintColumn.getSQLType()).toEqual('tinyint unsigned');
});

test('table config: signed ints', async () => {
	const unsignedInts = mysqlTable('cities1', {
		bigint: bigint('bigint', { mode: 'number' }),
		int: int('int'),
		smallint: smallint('smallint'),
		mediumint: mediumint('mediumint'),
		tinyint: tinyint('tinyint'),
	});

	const tableConfig = getTableConfig(unsignedInts);

	const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
	const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
	const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
	const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
	const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

	expect(bigintColumn.getSQLType()).toEqual('bigint');
	expect(intColumn.getSQLType()).toEqual('int');
	expect(smallintColumn.getSQLType()).toEqual('smallint');
	expect(mediumintColumn.getSQLType()).toEqual('mediumint');
	expect(tinyintColumn.getSQLType()).toEqual('tinyint');
});

test('table config: foreign keys name', async () => {
	const table = mysqlTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
	}));

	const tableConfig = getTableConfig(table);

	expect(tableConfig.foreignKeys.length).toEqual(1);
	expect(tableConfig.foreignKeys[0]!.getName()).toEqual('custom_fk');
});

test('table config: primary keys name', async () => {
	const table = mysqlTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: primaryKey({ columns: [t.id, t.name], name: 'custom_pk' }),
	}));

	const tableConfig = getTableConfig(table);

	expect(tableConfig.primaryKeys.length).toEqual(1);
	expect(tableConfig.primaryKeys[0]!.getName()).toEqual('custom_pk');
});

test('table configs: unique third param', async () => {
	const cities1Table = mysqlTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: unique('custom_name').on(t.name, t.state),
		f1: unique('custom_name1').on(t.name, t.state),
	}));

	const tableConfig = getTableConfig(cities1Table);

	expect(tableConfig.uniqueConstraints).toHaveLength(2);

	expect(tableConfig.uniqueConstraints[0]?.name).toEqual('custom_name');
	expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

	expect(tableConfig.uniqueConstraints[1]?.name).toEqual('custom_name1');
	expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
});

test('table configs: unique in column', async () => {
	const cities1Table = mysqlTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().unique(),
		state: text('state').unique('custom'),
		field: text('field').unique('custom_field'),
	});

	const tableConfig = getTableConfig(cities1Table);

	const columnName = tableConfig.columns.find((it) => it.name === 'name');
	expect(columnName?.uniqueName).toEqual(uniqueKeyName(cities1Table, [columnName!.name]));
	expect(columnName?.isUnique).toEqual(true);

	const columnState = tableConfig.columns.find((it) => it.name === 'state');
	expect(columnState?.uniqueName === 'custom').toEqual(true);
	expect(columnState?.isUnique).toEqual(true);

	const columnField = tableConfig.columns.find((it) => it.name === 'field');
	expect(columnField?.uniqueName === 'custom_field').toEqual(true);
	expect(columnField?.isUnique).toEqual(true);
});

test('select all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result[0]!.createdAt instanceof Date).toEqual(true); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// expect(Math.abs(result[0]!.createdAt.getTime() - now) < 2000).toEqual(true);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test('select sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select typed sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select distinct', async () => {
	const usersDistinctTable = mysqlTable('users_distinct', {
		id: int('id').notNull(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${usersDistinctTable}`);
	await db.execute(sql`create table ${usersDistinctTable} (id int, name text)`);

	await db.insert(usersDistinctTable).values([
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'John' },
		{ id: 1, name: 'Jane' },
	]);
	const users = await db.selectDistinct().from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
		usersDistinctTable.name,
	);

	await db.execute(sql`drop table ${usersDistinctTable}`);

	expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
});

test('insert returning sql', async () => {
	const result = await db.insert(usersTable).values({ name: 'John' });

	expect(result.lastInsertId).toEqual(1);
});

test('delete returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(users.rowsAffected).toEqual(1);
});

test('update returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	expect(users.rowsAffected).toEqual(1);
});

test('update with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	expect(updatedUsers.rowsAffected).toEqual(1);

	expect(users[0]!.createdAt instanceof Date).toEqual(true); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// expect(Math.abs(users[0]!.createdAt.getTime() - now) < 2000).toEqual(true);
	expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test('update with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(updatedUsers.rowsAffected).toEqual(1);

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser.rowsAffected).toEqual(1);
});

test('delete with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser.rowsAffected).toEqual(1);
});

test('insert + select', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	expect(result2).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test('json insert', async () => {
	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	}).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test('insert with overridden default values', async () => {
	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test('insert many', async () => {
	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
		verified: usersTable.verified,
	}).from(usersTable);

	expect(result).toEqual([
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test('insert many with returning', async () => {
	const result = await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);

	expect(result.rowsAffected).toEqual(4);
});

test('select with group by as field', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name).orderBy(usersTable.name);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with exists', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const user = alias(usersTable, 'user');
	const result = await db.select({ name: usersTable.name }).from(usersTable).where(
		exists(db.select({ one: sql`1` }).from(user).where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id)))),
	);

	expect(result).toEqual([{ name: 'John' }]);
});

test('select with group by as sql', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual(expect.arrayContaining([{ name: 'Jane' }, { name: 'John' }]));
});

test('$default function', async () => {
	await db.execute(sql`drop table if exists \`orders\``);
	await db.execute(
		sql`
			create table \`orders\` (
				\`id\` serial primary key,
				\`region\` text not null,
				\`product\` text not null,
				\`amount\` int not null,
				\`quantity\` int not null
			)
		`,
	);

	await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
	const selectedOrder = await db.select().from(orders);

	expect(selectedOrder).toEqual([{
		id: 1,
		amount: 1,
		quantity: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

// Default value for TEXT is not supported
test.skip('$default with empty array - text column', async () => {
	await db.execute(sql`drop table if exists \`s_orders\``);
	await db.execute(
		sql`
			create table \`s_orders\` (
				\`id\` serial primary key,
				\`region\` text default ('Ukraine'),
				\`product\` text not null
			)
		`,
	);

	const users = mysqlTable('s_orders', {
		id: serial('id').primaryKey(),
		region: text('region').default('Ukraine'),
		product: text('product').$defaultFn(() => 'random_string'),
	});

	await db.insert(users).values({});
	const selectedOrder = await db.select().from(users);

	expect(selectedOrder).toEqual([{
		id: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test('$default with empty array', async () => {
	await db.execute(sql`drop table if exists \`s_orders\``);
	await db.execute(
		sql`
			create table \`s_orders\` (
				\`id\` serial primary key,
				\`region\` varchar(255) default 'Ukraine',
				\`product\` text not null
			)
		`,
	);

	const users = mysqlTable('s_orders', {
		id: serial('id').primaryKey(),
		region: varchar('region', { length: 255 }).default('Ukraine'),
		product: text('product').$defaultFn(() => 'random_string'),
	});

	await db.insert(users).values({});
	const selectedOrder = await db.select().from(users);

	expect(selectedOrder).toEqual([{
		id: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test('select with group by as sql + column', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test('select with group by as column + sql', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test('select with group by complex query', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test('build query', async () => {
	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	expect(query).toEqual({
		sql: `select \`id\`, \`name\` from \`userstest\` group by \`userstest\`.\`id\`, \`userstest\`.\`name\``,
		params: [],
	});
});

test('Query check: Insert all defaults in 1 row', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	expect(query).toEqual({
		sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default)',
		params: [],
	});
});

test('Query check: Insert all defaults in multiple rows', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state').default('UA'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	expect(query).toEqual({
		sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default), (default, default, default)',
		params: [],
	});
});

// Default value for TEXT is not supported
test.skip('Insert all defaults in 1 row - text column', async () => {
	const users = mysqlTable('empty_insert_single', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name text default ('Dan'), state text)`,
	);

	await db.insert(users).values({});

	const res = await db.select().from(users);

	expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
});

test('Insert all defaults in 1 row', async () => {
	const users = mysqlTable('empty_insert_single', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 255 }).default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name varchar(255) default 'Dan', state text)`,
	);

	await db.insert(users).values({});

	const res = await db.select().from(users);

	expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
});

// Default value for TEXT is not supported
test.skip('Insert all defaults in multiple rows - text column', async () => {
	const users = mysqlTable('empty_insert_multiple', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name text default ('Dan'), state text)`,
	);

	await db.insert(users).values([{}, {}]);

	const res = await db.select().from(users);

	expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
});

test('Insert all defaults in multiple rows', async () => {
	const users = mysqlTable('empty_insert_multiple', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 255 }).default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name varchar(255) default 'Dan', state text)`,
	);

	await db.insert(users).values([{}, {}]);

	const res = await db.select().from(users);

	expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
});

test('build query insert with onDuplicate', async () => {
	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into `userstest` (`id`, `name`, `verified`, `jsonb`, `created_at`) values (default, ?, default, ?, default) on duplicate key update `name` = ?',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test('insert with onDuplicate', async () => {
	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John1' }]);
});

test('insert conflict', async () => {
	await db.insert(usersTable)
		.values({ name: 'John' });

	await expect(() => db.insert(usersTable).values({ id: 1, name: 'John1' }))
		.rejects.toThrowError(
			"Execute SQL fail: Error 1062 (23000): Duplicate entry '?' for key 'userstest.id'",
		);
});

test('insert conflict with ignore', async () => {
	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.ignore()
		.values({ id: 1, name: 'John1' });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John' }]);
});

test('insert sql', async () => {
	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('partial join with alias', async () => {
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

	expect(result).toEqual([{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test('full join with alias', async () => {
	const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select().from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10));

	expect(result).toEqual([{
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

test('select from alias', async () => {
	const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
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

	expect(result).toEqual([{
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

test('insert with spaces', async () => {
	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
});

test('prepared statement', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const statement = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.prepare();
	const result = await statement.execute();

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement reuse', async () => {
	const stmt = db.insert(usersTable).values({
		verified: true,
		name: sql.placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable);

	expect(result).toEqual([
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

test('prepared statement with placeholder in .where', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, sql.placeholder('id')))
		.prepare();
	const result = await stmt.execute({ id: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('migrator', async () => {
	await db.execute(sql`drop table if exists cities_migration`);
	await db.execute(sql`drop table if exists users_migration`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/mysql' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table cities_migration`);
	await db.execute(sql`drop table users_migration`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table __drizzle_migrations`);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: string; name: string }>(sql`select id, name from ${usersTable}`);
	expect(result.rows).toEqual([{ id: '1', name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	expect(inserted.rowsAffected).toEqual(1);
});

test('insert + select all possible dates', async () => {
	await db.execute(sql`drop table if exists \`datestable\``);
	await db.execute(
		sql`
			create table \`datestable\` (
				\`date\` date,
				\`date_as_string\` date,
				\`time\` time,
				\`datetime\` datetime,
				\`datetime_as_string\` datetime,
				\`timestamp\` timestamp(3),
				\`timestamp_as_string\` timestamp(3),
				\`year\` year
			)
		`,
	);

	const date = new Date('2022-11-11');
	const dateWithMilliseconds = new Date('2022-11-11 12:12:12.123');

	await db.insert(datesTable).values({
		date: date,
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: date,
		year: 22,
		datetimeAsString: '2022-11-11 12:12:12',
		timestamp: dateWithMilliseconds,
		timestampAsString: '2022-11-11 12:12:12.123',
	});

	const res = await db.select().from(datesTable);

	expect(res[0]?.date instanceof Date).toEqual(true); // eslint-disable-line no-instanceof/no-instanceof
	expect(res[0]?.datetime instanceof Date).toEqual(true); // eslint-disable-line no-instanceof/no-instanceof
	expect(typeof res[0]?.dateAsString === 'string').toEqual(true);
	expect(typeof res[0]?.datetimeAsString === 'string').toEqual(true);

	expect(res).toEqual([{
		date: toLocalDate(new Date('2022-11-11')),
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: new Date('2022-11-11'),
		year: 2022,
		datetimeAsString: '2022-11-11 12:12:12',
		timestamp: new Date('2022-11-11 12:12:12.123'),
		timestampAsString: '2022-11-11 12:12:12.123',
	}]);

	await db.execute(sql`drop table if exists \`datestable\``);
});

const tableWithEnums = mysqlTable('enums_test_case', {
	id: serial('id').primaryKey(),
	enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
	enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
	enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
});

test('Mysql enum test case #1', async () => {
	await db.execute(sql`drop table if exists \`enums_test_case\``);

	await db.execute(sql`
		create table \`enums_test_case\` (
			\`id\` serial primary key,
			\`enum1\` ENUM('a', 'b', 'c') not null,
			\`enum2\` ENUM('a', 'b', 'c') default 'a',
			\`enum3\` ENUM('a', 'b', 'c') not null default 'b'
		)
	`);

	await db.insert(tableWithEnums).values([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a' },
	]);

	const res = await db.select().from(tableWithEnums);

	await db.execute(sql`drop table \`enums_test_case\``);

	expect(res).toEqual([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
	]);
});

test('left join (flat object fields)', async () => {
	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select({
		userId: users2Table.id,
		userName: users2Table.name,
		cityId: citiesTable.id,
		cityName: citiesTable.name,
	}).from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	expect(res).toEqual([
		{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test('left join (grouped fields)', async () => {
	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

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
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	expect(res).toEqual([
		{
			id: 1,
			user: { name: 'John', nameUpper: 'JOHN' },
			city: { id: 1, name: 'Paris', nameUpper: 'PARIS' },
		},
		{
			id: 2,
			user: { name: 'Jane', nameUpper: 'JANE' },
			city: null,
		},
	]);
});

test('left join (all fields)', async () => {
	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select().from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	expect(res).toEqual([
		{
			users2: {
				id: 1,
				name: 'John',
				cityId: 1,
			},
			cities: {
				id: 1,
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

test('join subquery', async () => {
	await db.execute(sql`drop table if exists \`courses\``);
	await db.execute(sql`drop table if exists \`course_categories\``);

	await db.execute(
		sql`
			create table \`course_categories\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);

	await db.execute(
		sql`
			create table \`courses\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`category_id\` int references \`course_categories\`(\`id\`)
			)
		`,
	);

	await db.insert(courseCategoriesTable).values([
		{ name: 'Category 1' },
		{ name: 'Category 2' },
		{ name: 'Category 3' },
		{ name: 'Category 4' },
	]);

	await db.insert(coursesTable).values([
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

	expect(res).toEqual([
		{ courseName: 'Design', categoryId: 1 },
		{ courseName: 'Development', categoryId: 2 },
		{ courseName: 'IT & Software', categoryId: 3 },
		{ courseName: 'Marketing', categoryId: 4 },
	]);

	await db.execute(sql`drop table if exists \`courses\``);
	await db.execute(sql`drop table if exists \`course_categories\``);
});

test('with ... select', async () => {
	await db.execute(sql`drop table if exists \`orders\``);
	await db.execute(
		sql`
			create table \`orders\` (
				\`id\` serial primary key,
				\`region\` text not null,
				\`product\` text not null,
				\`amount\` int not null,
				\`quantity\` int not null
			)
		`,
	);

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

	const result = await db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`sum(${orders.quantity})`.mapWith(Number),
			productSales: sql<number>`sum(${orders.amount})`.mapWith(Number),
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);

	expect(result).toEqual([
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

test('with ... update', async () => {
	const products = mysqlTable('products', {
		id: serial('id').primaryKey(),
		price: decimal('price', {
			precision: 15,
			scale: 2,
		}).notNull(),
		cheap: boolean('cheap').notNull().default(false),
	});

	await db.execute(sql`drop table if exists ${products}`);
	await db.execute(sql`
		create table ${products} (
			id serial primary key,
			price decimal(15, 2) not null,
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

	await db
		.with(averagePrice)
		.update(products)
		.set({
			cheap: true,
		})
		.where(lt(products.price, sql`(select * from ${averagePrice})`));

	const result = await db
		.select({
			id: products.id,
		})
		.from(products)
		.where(eq(products.cheap, true));

	expect(result).toEqual([
		{ id: 1 },
		{ id: 4 },
		{ id: 5 },
	]);
});

test('with ... delete', async () => {
	await db.execute(sql`drop table if exists \`orders\``);
	await db.execute(
		sql`
			create table \`orders\` (
				\`id\` serial primary key,
				\`region\` text not null,
				\`product\` text not null,
				\`amount\` int not null,
				\`quantity\` int not null
			)
		`,
	);

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

	await db
		.with(averageAmount)
		.delete(orders)
		.where(gt(orders.amount, sql`(select * from ${averageAmount})`));

	const result = await db
		.select({
			id: orders.id,
		})
		.from(orders);

	expect(result).toEqual([
		{ id: 1 },
		{ id: 2 },
		{ id: 3 },
		{ id: 4 },
		{ id: 5 },
	]);
});

test('select from subquery sql', async () => {
	await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

	const sq = db
		.select({ name: sql<string>`concat(${users2Table.name}, " modified")`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq);

	expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
});

test('select a field without joining its table', () => {
	expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).toThrowError();
});

test('select all fields from subquery without alias', () => {
	const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

	expect(() => db.select().from(sq).prepare()).toThrowError();
});

test('select count()', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: sql`count(*)` }).from(usersTable);

	expect(res).toEqual([{ count: '2' }]);
});

test('select for ...', () => {
	{
		const query = db.select().from(users2Table).for('update').toSQL();
		expect(query.sql).toMatch(/ for update$/);
	}
	{
		const query = db.select().from(users2Table).for('share', { skipLocked: true }).toSQL();
		expect(query.sql).toMatch(/ for share skip locked$/);
	}
	{
		const query = db.select().from(users2Table).for('update', { noWait: true }).toSQL();
		expect(query.sql).toMatch(/ for update no wait$/);
	}
});

test('having', async () => {
	await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
		name: 'Jack',
		cityId: 2,
	}]);

	const result = await db
		.select({
			id: citiesTable.id,
			name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
			usersCount: sql<number>`count(${users2Table.id})`.mapWith(Number).as('users_count'),
		})
		.from(citiesTable)
		.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
		.where(({ name }) => sql`length(${name}) >= 3`)
		.groupBy(citiesTable.id)
		.having(({ usersCount }) => sql`${usersCount} > 0`)
		.orderBy(({ name }) => name);

	expect(result).toEqual([
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

test('view', async () => {
	const newYorkers1 = mysqlView('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = mysqlView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = mysqlView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).existing();

	await db.execute(sql`drop view if exists ${newYorkers1}`);

	await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

	await db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]);

	{
		const result = await db.select().from(newYorkers1);
		expect(result).toEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers2);
		expect(result).toEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers3);
		expect(result).toEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
		expect(result).toEqual([
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	await db.execute(sql`drop view ${newYorkers1}`);
});

test('select from raw sql', async () => {
	const result = await db.select({
		id: sql<number>`id`.mapWith(Number),
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`);

	Expect<Equal<{ id: number; name: string }[], typeof result>>;

	expect(result).toEqual([
		{ id: 1, name: 'John' },
	]);
});

test('select from raw sql with joins', async () => {
	const result = await db
		.select({
			id: sql<number>`users.id`.mapWith(Number),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

	Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
	]);
});

test('join on aliased sql from select', async () => {
	const result = await db
		.select({
			userId: sql<number>`users.id`.mapWith(Number).as('userId'),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.mapWith(Number).as('cityId'),
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test('join on aliased sql from with clause', async () => {
	const users = db.$with('users').as(
		db.select({
			id: sql<number>`id`.mapWith(Number).as('userId'),
			name: sql<string>`name`.as('userName'),
			city: sql<string>`city`.as('city'),
		}).from(
			sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
		),
	);

	const cities = db.$with('cities').as(
		db.select({
			id: sql<number>`id`.mapWith(Number).as('cityId'),
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

	expect(result).toEqual([
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test('prefixed table', async () => {
	const mysqlTable = mysqlTableCreator((name) => `myprefix_${name}`);

	const users = mysqlTable('test_prefixed_table_with_unique_name', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id int not null primary key, name text not null)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' });

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, name: 'John' }]);

	await db.execute(sql`drop table ${users}`);
});

test('orderBy with aliased column', () => {
	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	expect(query.sql).toEqual('select something as `test` from `users2` order by `test`');
});

test('timestamp timezone', async () => {
	const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

	await db.insert(usersTable).values({ name: 'With default times' });
	await db.insert(usersTable).values({
		name: 'Without default times',
		createdAt: date,
	});
	const users = await db.select().from(usersTable);

	// check that the timestamps are set correctly for default times
	expect(Math.abs(users[0]!.createdAt.getTime() - Date.now()) < 2000).toEqual(true);

	// check that the timestamps are set correctly for non default times
	expect(Math.abs(users[1]!.createdAt.getTime() - date.getTime()) < 2000).toEqual(true);
});

test('transaction', async () => {
	const users = mysqlTable('users_transactions', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});
	const products = mysqlTable('products_transactions', {
		id: serial('id').primaryKey(),
		price: int('price').notNull(),
		stock: int('stock').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop table if exists ${products}`);

	await db.execute(sql`create table users_transactions (id serial not null primary key, balance int not null)`);
	await db.execute(
		sql`create table products_transactions (id serial not null primary key, price int not null, stock int not null)`,
	);

	const { lastInsertId: userId } = await db.insert(users).values({ balance: 100 });
	const user = await db.select().from(users).where(eq(users.id, userId!)).then((rows) => rows[0]!);
	const { lastInsertId: productId } = await db.insert(products).values({ price: 10, stock: 10 });
	const product = await db.select().from(products).where(eq(products.id, productId!)).then((rows) => rows[0]!);

	await db.transaction(async (tx) => {
		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
	});

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 90 }]);

	await db.execute(sql`drop table ${users}`);
	await db.execute(sql`drop table ${products}`);
});

test('transaction rollback', async () => {
	const users = mysqlTable('users_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_transactions_rollback (id serial not null primary key, balance int not null)`,
	);

	await expect(async () =>
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });
			tx.rollback();
		})
	).rejects.toThrowError(TransactionRollbackError);

	const result = await db.select().from(users);

	expect(result).toEqual([]);

	await db.execute(sql`drop table ${users}`);
});

test.only('nested transaction', async () => {
	const users = mysqlTable('users_nested_transactions', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions (id serial not null primary key, balance int not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await tx.transaction(async (tx) => {
			await tx.update(users).set({ balance: 200 });
		});
	});

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 200 }]);

	await db.execute(sql`drop table ${users}`);
});

test.only('nested transaction rollback', async () => {
	const users = mysqlTable('users_nested_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions_rollback (id serial not null primary key, balance int not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await expect(async () =>
			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
				tx.rollback();
			})
		).rejects.toThrowError(TransactionRollbackError);
	});

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 100 }]);

	await db.execute(sql`drop table ${users}`);
});

test('join subquery with join', async () => {
	const internalStaff = mysqlTable('internal_staff', {
		userId: int('user_id').notNull(),
	});

	const customUser = mysqlTable('custom_user', {
		id: int('id').notNull(),
	});

	const ticket = mysqlTable('ticket', {
		staffId: int('staff_id').notNull(),
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

	expect(mainQuery).toEqual([{
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

test('subquery with view', async () => {
	const users = mysqlTable('users_subquery_view', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mysqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

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

	expect(result).toEqual([
		{ id: 1, name: 'John', cityId: 1 },
		{ id: 3, name: 'Jack', cityId: 1 },
	]);

	await db.execute(sql`drop view ${newYorkers}`);
	await db.execute(sql`drop table ${users}`);
});

test('join view as subquery', async () => {
	const users = mysqlTable('users_join_view', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mysqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

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

	expect(result).toEqual([
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

test('insert undefined', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	await expect(db.insert(users).values({ name: undefined })).resolves.not.toThrowError();

	await db.execute(sql`drop table ${users}`);
});

test('update undefined', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	await expect(async () => await db.update(users).set({ name: undefined })).rejects.toThrowError();
	await expect(db.update(users).set({ id: 1, name: undefined })).resolves.not.toThrowError();

	await db.execute(sql`drop table ${users}`);
});

test('utc config for datetime', async () => {
	await db.execute(sql`drop table if exists \`datestable\``);
	await db.execute(
		sql`
			create table \`datestable\` (
				\`datetime_utc\` datetime(3),
				\`datetime\` datetime(3),
				\`datetime_as_string\` datetime
			)
		`,
	);
	const datesTable = mysqlTable('datestable', {
		datetimeUTC: datetime('datetime_utc', { fsp: 3, mode: 'date' }),
		datetime: datetime('datetime', { fsp: 3 }),
		datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
	});

	const dateObj = new Date('2022-11-11');
	const dateUtc = new Date('2022-11-11T12:12:12.122Z');

	await db.insert(datesTable).values({
		datetimeUTC: dateUtc,
		datetime: dateObj,
		datetimeAsString: '2022-11-11 12:12:12',
	});

	const res = await db.select().from(datesTable);

	const rawSelect = await db.execute(sql`select \`datetime_utc\` from \`datestable\``);
	const selectedRow = (rawSelect.rows as [{ datetime_utc: string }])[0];

	expect(selectedRow.datetime_utc).toEqual('2022-11-11 12:12:12.122');
	expect(new Date(selectedRow.datetime_utc.replace(' ', 'T') + 'Z')).toEqual(dateUtc);

	expect(res[0]?.datetime instanceof Date).toEqual(true); // eslint-disable-line no-instanceof/no-instanceof
	expect(res[0]?.datetimeUTC instanceof Date).toEqual(true); // eslint-disable-line no-instanceof/no-instanceof
	expect(typeof res[0]?.datetimeAsString === 'string').toEqual(true);

	expect(res).toEqual([{
		datetimeUTC: dateUtc,
		datetime: new Date('2022-11-11'),
		datetimeAsString: '2022-11-11 12:12:12',
	}]);

	await db.execute(sql`drop table if exists \`datestable\``);
});

test('set operations (union) from query builder with subquery', async () => {
	await setupSetOperationTest(db);
	const sq = db
		.select({ id: users2Table.id, name: users2Table.name })
		.from(users2Table).as('sq');

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).union(
			db.select().from(sq).orderBy(sq.id),
		)
		.orderBy(citiesTable.id)
		.limit(8);

	expect(result).toHaveLength(8);

	expect(result).toEqual(expect.arrayContaining([
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Jane' },
		{ id: 3, name: 'Jack' },
		{ id: 4, name: 'Peter' },
		{ id: 5, name: 'Ben' },
	]));

	// union should throw if selected fields are not in the same order
	expect(() =>
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).union(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table),
			)
	).toThrow();
});

test('set operations (union) as function', async () => {
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
	);

	expect(result).toHaveLength(2);

	expect(result).toEqual(expect.arrayContaining([
		{ id: 1, name: 'New York' },
		{ id: 1, name: 'John' },
	]));

	expect(() => {
		union(
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
	}).toThrow();
});

test('set operations (union all) from query builder', async () => {
	await setupSetOperationTest(db);

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).limit(2).unionAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).limit(2),
		).orderBy(asc(sql`id`)).limit(3);

	expect(result.length === 3).toEqual(true);

	expect(result).toEqual([
		{ id: 1, name: 'New York' },
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
	]);

	expect(() => {
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).limit(2).unionAll(
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).limit(2),
			).orderBy(asc(sql`id`));
	}).toThrow();
});

test('set operations (union all) as function', async () => {
	await setupSetOperationTest(db);

	const result = await unionAll(
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).where(eq(citiesTable.id, 1))
			.limit(1),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1))
			.limit(1),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1))
			.limit(1),
	);

	expect(result).toHaveLength(3);

	expect(result).toEqual(expect.arrayContaining([
		{ id: 1, name: 'New York' },
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
	]));

	expect(() => {
		unionAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(1);
	}).toThrow();
});

test('set operations (intersect) from query builder', async () => {
	await setupSetOperationTest(db);

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).intersect(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(gt(citiesTable.id, 1)),
		);

	expect(result.length === 2).toEqual(true);

	expect(result).toEqual([
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	expect(() => {
		db
			.select({ name: citiesTable.name, id: citiesTable.id })
			.from(citiesTable).intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			);
	}).toThrow();
});

test('set operations (intersect) as function', async () => {
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
	).limit(1);

	expect(result.length === 0).toEqual(true);

	expect(result).toEqual([]);

	expect(() => {
		intersect(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(1);
	}).toThrow();
});

// "intersect all" is not supported in TiDB
test.skip('set operations (intersect all) from query builder', async () => {
	await setupSetOperationTest(db);

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).limit(2).intersectAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).limit(2),
		).orderBy(asc(sql`id`));

	expect(result.length === 2).toEqual(true);

	expect(result).toEqual([
		{ id: 1, name: 'New York' },
		{ id: 2, name: 'London' },
	]);

	expect(() => {
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).limit(2).intersectAll(
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).limit(2),
			).orderBy(asc(sql`id`));
	}).toThrow();
});

// "intersect all" is not supported in TiDB
test.skip('set operations (intersect all) as function', async () => {
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

	expect(result.length === 1).toEqual(true);

	expect(result).toEqual([
		{ id: 1, name: 'John' },
	]);

	expect(() => {
		intersectAll(
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);
	}).toThrow();
});

test('set operations (except) from query builder', async () => {
	await setupSetOperationTest(db);

	const result = await db
		.select()
		.from(citiesTable).except(
			db
				.select()
				.from(citiesTable).where(gt(citiesTable.id, 1)),
		);

	expect(result.length === 1).toEqual(true);

	expect(result).toEqual([
		{ id: 1, name: 'New York' },
	]);
});

test('set operations (except) as function', async () => {
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
	).limit(3);

	expect(result.length === 2).toEqual(true);

	expect(result).toEqual([
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	expect(() => {
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
		).limit(3);
	}).toThrow();
});

// "except all" is not supported in TiDB
test.skip('set operations (except all) from query builder', async () => {
	await setupSetOperationTest(db);

	const result = await db
		.select()
		.from(citiesTable).exceptAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
		).orderBy(asc(sql`id`));

	expect(result.length === 2).toEqual(true);

	expect(result).toEqual([
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]);

	expect(() => {
		db
			.select()
			.from(citiesTable).exceptAll(
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
			).orderBy(asc(sql`id`));
	}).toThrow();
});

// "except all" is not supported in TiDB
test.skip('set operations (except all) as function', async () => {
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
	).limit(6).orderBy(asc(sql.identifier('id')));

	expect(result.length === 6).toEqual(true);

	expect(result).toEqual([
		{ id: 2, name: 'Jane' },
		{ id: 3, name: 'Jack' },
		{ id: 4, name: 'Peter' },
		{ id: 5, name: 'Ben' },
		{ id: 6, name: 'Jill' },
		{ id: 7, name: 'Mary' },
	]);

	expect(() => {
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
		).limit(6);
	}).toThrow();
});

test('set operations (mixed) from query builder', async () => {
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
				).orderBy(asc(citiesTable.id)).limit(1).offset(1),
		);

	expect(result.length === 2).toEqual(true);

	expect(result).toEqual([
		{ id: 1, name: 'New York' },
		{ id: 3, name: 'Tampa' },
	]);

	expect(() => {
		db
			.select()
			.from(citiesTable).except(
				({ unionAll }) =>
					unionAll(
						db
							.select({ name: citiesTable.name, id: citiesTable.id })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
						db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
					),
			);
	}).toThrow();
});

test('set operations (mixed all) as function with subquery', async () => {
	await setupSetOperationTest(db);

	const sq = except(
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(gte(users2Table.id, 5)),
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 7)),
	).orderBy(asc(sql.identifier('id'))).as('sq');

	const result = await union(
		db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).where(eq(users2Table.id, 1)).orderBy(users2Table.id),
		db.select().from(sq).limit(1).orderBy(sq.id),
		db
			.select().from(citiesTable).where(gt(citiesTable.id, 1)).orderBy(citiesTable.id),
	);

	expect(result).toHaveLength(4);

	expect(result).toEqual(expect.arrayContaining([
		{ id: 1, name: 'John' },
		{ id: 5, name: 'Ben' },
		{ id: 2, name: 'London' },
		{ id: 3, name: 'Tampa' },
	]));

	expect(() => {
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
			).limit(1),
			db
				.select().from(citiesTable).where(gt(citiesTable.id, 1)),
		);
	}).toThrow();
});

test('aggregate function: count', async () => {
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: count() }).from(table);
	const result2 = await db.select({ value: count(table.a) }).from(table);
	const result3 = await db.select({ value: countDistinct(table.name) }).from(table);

	expect(result1[0]?.value).toEqual(7);
	expect(result2[0]?.value).toEqual(5);
	expect(result3[0]?.value).toEqual(6);
});

test('aggregate function: avg', async () => {
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: avg(table.b) }).from(table);
	const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
	const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

	expect(result1[0]?.value).toEqual('33.3333');
	expect(result2[0]?.value).toEqual(null);
	expect(result3[0]?.value).toEqual('42.5000');
});

test('aggregate function: sum', async () => {
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: sum(table.b) }).from(table);
	const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
	const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

	expect(result1[0]?.value).toEqual('200');
	expect(result2[0]?.value).toEqual(null);
	expect(result3[0]?.value).toEqual('170');
});

test('aggregate function: max', async () => {
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: max(table.b) }).from(table);
	const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

	expect(result1[0]?.value).toEqual(90);
	expect(result2[0]?.value).toEqual(null);
});

test('aggregate function: min', async () => {
	const table = aggregateTable;
	await setupAggregateFunctionsTest(db);

	const result1 = await db.select({ value: min(table.b) }).from(table);
	const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

	expect(result1[0]?.value).toEqual(10);
	expect(result2[0]?.value).toEqual(null);
});

test('test $onUpdateFn and $onUpdate works as $default', async () => {
	await db.execute(sql`drop table if exists ${usersOnUpdate}`);

	await db.execute(
		sql`
			create table ${usersOnUpdate} (
			id serial not null primary key,
			name text not null,
			update_counter integer default 1 not null,
			updated_at datetime(3),
			uppercase_name text,
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

	const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

	const response = await db.select({ ...rest }).from(usersOnUpdate);

	expect(response).toEqual([
		{ name: 'John', id: 1, updateCounter: 1, uppercaseName: 'JOHN', alwaysNull: null },
		{ name: 'Jane', id: 2, updateCounter: 1, uppercaseName: 'JANE', alwaysNull: null },
		{ name: 'Jack', id: 3, updateCounter: 1, uppercaseName: 'JACK', alwaysNull: null },
		{ name: 'Jill', id: 4, updateCounter: 1, uppercaseName: 'JILL', alwaysNull: null },
	]);
	const msDelay = 250;

	for (const eachUser of justDates) {
		expect(eachUser.updatedAt!.valueOf() > Date.now() - msDelay).toEqual(true);
	}
});

test('test $onUpdateFn and $onUpdate works updating', async () => {
	await db.execute(sql`drop table if exists ${usersOnUpdate}`);

	await db.execute(
		sql`
			create table ${usersOnUpdate} (
			id serial not null primary key,
			name text not null,
			update_counter integer default 1 not null,
			updated_at datetime(3),
			uppercase_name text,
			always_null text
			)
		`,
	);

	await db.insert(usersOnUpdate).values([
		{ name: 'John', alwaysNull: 'this will will be null after updating' },
		{ name: 'Jane' },
		{ name: 'Jack' },
		{ name: 'Jill' },
	]);
	const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
	const initial = await db.select({ updatedAt }).from(usersOnUpdate);

	await db.update(usersOnUpdate).set({ name: 'Angel', uppercaseName: null }).where(eq(usersOnUpdate.id, 1));

	const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

	const response = await db.select({ ...rest }).from(usersOnUpdate);

	expect(response).toEqual([
		{ name: 'Angel', id: 1, updateCounter: 2, uppercaseName: null, alwaysNull: null },
		{ name: 'Jane', id: 2, updateCounter: 1, uppercaseName: 'JANE', alwaysNull: null },
		{ name: 'Jack', id: 3, updateCounter: 1, uppercaseName: 'JACK', alwaysNull: null },
		{ name: 'Jill', id: 4, updateCounter: 1, uppercaseName: 'JILL', alwaysNull: null },
	]);
	const msDelay = 250;

	expect(initial[0]?.updatedAt?.valueOf() !== justDates[0]?.updatedAt?.valueOf()).toEqual(true);

	for (const eachUser of justDates) {
		expect(eachUser.updatedAt!.valueOf() > Date.now() - msDelay).toEqual(true);
	}
});
