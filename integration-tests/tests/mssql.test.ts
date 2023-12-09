import 'dotenv/config';

import type { TestFn } from 'ava';
import anyTest from 'ava';
import Docker from 'dockerode';
import {
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	DefaultLogger,
	eq,
	gt,
	gte,
	inArray,
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
	bit,
	date,
	datetime,
	except,
	foreignKey,
	getTableConfig,
	getViewConfig,
	int,
	intersect,
	mssqlTable,
	mssqlTableCreator,
	mssqlView,
	nVarchar,
	primaryKey,
	smallint,
	text,
	time,
	tinyint,
	union,
	unionAll,
	unique,
	uniqueIndex,
	uniqueKeyName,
	varchar,
} from 'drizzle-orm/mssql-core';
import { drizzle } from 'drizzle-orm/node-mssql';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { migrate } from 'drizzle-orm/node-mssql/migrator';
import getPort from 'get-port';
import mssql, { type config, type ConnectionPool } from 'mssql';
import { v4 as uuid } from 'uuid';
import { type Equal, Expect } from './utils.ts';

const ENABLE_LOGGING = false;

const usersTable = mssqlTable('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nVarchar('jsonb', { length: 300, mode: 'json' }).$type<string[]>(),
	createdAt: datetime('created_at', { fsp: 2 }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

const users2Table = mssqlTable('users2', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	cityId: int('city_id').default(sql`null`).references(() => citiesTable.id),
});

const citiesTable = mssqlTable('cities', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
});

const datesTable = mssqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { fsp: 1 }),
	timeAsString: time('time_as_string', { mode: 'string', fsp: 1 }),
	datetime: datetime('datetime', { fsp: 2 }),
	datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
});

const coursesTable = mssqlTable('courses', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	categoryId: int('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = mssqlTable('course_categories', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
});

const orders = mssqlTable('orders', {
	id: int('id').identity().primaryKey(),
	region: varchar('region', { length: 50 }).notNull(),
	product: varchar('product', { length: 50 }).notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

const usersMigratorTable = mssqlTable('users12', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => {
	return {
		name: uniqueIndex('').on(table.name).using('btree'),
	};
});

// To test aggregate functions
const aggregateTable = mssqlTable('aggregate_table', {
	id: int('id').identity().notNull(),
	name: varchar('name', { length: 30 }).notNull(),
	a: int('a'),
	b: int('b'),
	c: int('c'),
	nullOnly: int('null_only'),
});

interface Context {
	docker: Docker;
	mssqlContainer: Docker.Container;
	db: NodeMsSqlDatabase;
	client: ConnectionPool;
}

const test = anyTest as TestFn<Context>;

async function createDockerDB(ctx: Context): Promise<config | string> {
	const docker = (ctx.docker = new Docker());
	const port = await getPort({ port: 1434 });
	const image = 'mcr.microsoft.com/mssql/server:2019-latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	ctx.mssqlContainer = await docker.createContainer({
		Image: image,
		Env: ['ACCEPT_EULA=Y', 'MSSQL_SA_PASSWORD=drizzle123PASSWORD'],
		name: `drizzle-integration-tests-${uuid()}`,
		platform: 'linux/amd64',
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'1433/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await ctx.mssqlContainer.start();

	return `Server=localhost,${port};User Id=SA;Password=drizzle123PASSWORD;TrustServerCertificate=True;`;
}

test.before(async (t) => {
	const ctx = t.context;
	const connectionString = process.env['MSSQL_CONNECTION_STRING'] ?? await createDockerDB(ctx);

	const sleep = 2000;
	let timeLeft = 30000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.client = await mssql.connect(connectionString);
			ctx.client.on('debug', console.log);
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MsSQL');
		await ctx.client?.close().catch(console.error);
		await ctx.mssqlContainer?.stop().catch(console.error);
		throw lastError;
	}
	ctx.db = drizzle(ctx.client, { logger: ENABLE_LOGGING ? new DefaultLogger() : undefined });
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.close().catch(console.error);
	await ctx.mssqlContainer?.stop().catch(console.error);
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop table if exists [userstest]`);
	await ctx.db.execute(sql`drop table if exists [users2]`);
	await ctx.db.execute(sql`drop table if exists [cities]`);

	await ctx.db.execute(
		sql`
			create table [userstest] (
				[id] int identity primary key,
				[name] varchar(30) not null,
				[verified] bit not null default 0,
				[jsonb] text,
				[created_at] datetime not null default current_timestamp
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table [cities] (
				[id] int identity primary key,
				[name] varchar(30) not null
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table [users2] (
				[id] int identity primary key,
				[name] varchar(30) not null,
				[city_id] int null foreign key references [cities]([id])
			)
		`,
	);
});

async function setupSetOperationTest(db: NodeMsSqlDatabase) {
	await db.execute(sql`drop table if exists [users2]`);
	await db.execute(sql`drop table if exists [cities]`);

	await db.execute(
		sql`
			create table [cities] (
				[id] int identity primary key,
				[name] varchar(30) not null
			)
		`,
	);

	await db.execute(
		sql`
			create table [users2] (
				[id] int identity primary key,
				[name] varchar(30) not null,
				[city_id] int foreign key references [cities]([id])
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

async function setupAggregateFunctionsTest(db: NodeMsSqlDatabase) {
	await db.execute(sql`drop table if exists [aggregate_table]`);
	await db.execute(
		sql`
			create table [aggregate_table] (
				[id] int identity primary key not null,
				[name] varchar(30) not null,
				[a] int,
				[b] int,
				[c] int,
				[null_only] int
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

test.serial('table config: signed ints', async (t) => {
	const unsignedInts = mssqlTable('cities1', {
		bigint: bigint('bigint', { mode: 'number' }),
		int: int('int'),
		smallint: smallint('smallint'),
		tinyint: tinyint('tinyint'),
	});

	const tableConfig = getTableConfig(unsignedInts);

	const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
	const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
	const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
	const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

	t.is(bigintColumn.getSQLType(), 'bigint');
	t.is(intColumn.getSQLType(), 'int');
	t.is(smallintColumn.getSQLType(), 'smallint');
	t.is(tinyintColumn.getSQLType(), 'tinyint');
});

test.serial('table config: foreign keys name', async (t) => {
	const table = mssqlTable('cities', {
		id: int('id').primaryKey(),
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
	const table = mssqlTable('cities', {
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

test.serial('table configs: unique third param', async (t) => {
	const cities1Table = mssqlTable('cities1', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: unique('custom_name').on(t.name, t.state),
		f1: unique('custom_name1').on(t.name, t.state),
	}));

	const tableConfig = getTableConfig(cities1Table);

	t.assert(tableConfig.uniqueConstraints.length === 2);

	t.assert(tableConfig.uniqueConstraints[0]?.name === 'custom_name');
	t.deepEqual(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name), ['name', 'state']);

	t.assert(tableConfig.uniqueConstraints[1]?.name, 'custom_name1');
	t.deepEqual(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name), ['name', 'state']);
});

test.serial('table configs: unique in column', async (t) => {
	const cities1Table = mssqlTable('cities1', {
		id: int('id').primaryKey(),
		name: text('name').notNull().unique(),
		state: text('state').unique('custom'),
		field: text('field').unique('custom_field'),
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
});

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	t.assert(result[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

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

test.serial('select distinct', async (t) => {
	const { db } = t.context;

	const usersDistinctTable = mssqlTable('users_distinct', {
		id: int('id').notNull(),
		name: varchar('name', { length: 30 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${usersDistinctTable}`);
	await db.execute(sql`create table ${usersDistinctTable} (id int, name varchar(30))`);

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

	t.deepEqual(users, [{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values({ name: 'John' });

	t.deepEqual(result.rowsAffected[0], 1);
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(users.rowsAffected[0], 1);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	t.is(users.rowsAffected[0], 1);
});

test.serial('update with returning all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	t.is(updatedUsers.rowsAffected[0], 1);

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(updatedUsers.rowsAffected[0], 1);

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(deletedUser.rowsAffected[0], 1);
});

test.serial('delete with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(deletedUser.rowsAffected[0], 1);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

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
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	}).from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.serial('insert with overridden default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

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

	t.deepEqual(result, [
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.serial('insert many with returning', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);

	t.is(result.rowsAffected[0], 4);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name).orderBy(usersTable.name);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`).orderBy(usersTable.name);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('$default function', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists [orders]`);
	await db.execute(
		sql`
			create table [orders] (
				[id] int identity primary key,
				[region] text not null,
				[product] text not null,
				[amount] int not null,
				[quantity] int not null
			)
		`,
	);

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

test.serial('$default with empty array', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists [s_orders]`);
	await db.execute(
		sql`
			create table [s_orders] (
				[id] int identity primary key,
				[region] text default ('Ukraine'),
				[product] text not null
			)
		`,
	);

	const users = mssqlTable('s_orders', {
		id: int('id').identity().primaryKey(),
		region: text('region').default('Ukraine'),
		product: text('product').$defaultFn(() => 'random_string'),
	});

	await db.insert(users).values({});
	const selectedOrder = await db.select().from(users);

	t.deepEqual(selectedOrder, [{
		id: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.offset(0).fetch(1);

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: `select [id], [name] from [userstest] group by [userstest].[id], [userstest].[name]`,
		params: [],
	});
});

test.serial('Query check: Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users', {
		id: int('id').identity().primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into [users] ([name], [state]) values (default, default)',
		params: [],
	});
});

test.serial('Query check: Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users', {
		id: int('id').identity().primaryKey(),
		name: text('name').default('Dan'),
		state: text('state').default('UA'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into [users] ([name], [state]) values (default, default), (default, default)',
		params: [],
	});
});

test.serial('Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('empty_insert_single', {
		id: int('id').identity().primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id int identity primary key, name text default ('Dan'), state text)`,
	);

	await db.insert(users).values({});

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }]);
});

test.serial('Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('empty_insert_multiple', {
		id: int('id').identity().primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id int identity primary key, name text default ('Dan'), state text)`,
	);

	await db.insert(users).values([{}, {}]);

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
});

test.serial('insert sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('partial join with alias', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

	const customerAlias = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select({
			user: {
				id: users.id,
				name: users.name,
			},
			customer: {
				id: customerAlias.id,
				name: customerAlias.name,
			},
		}).from(users)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(users.id, 10));

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;

	const mssqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

	const users = mssqlTable('users', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select().from(users)
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

	const mssqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

	const users = mssqlTable('users', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

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
	const statement = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.prepare();
	const result = await statement.execute();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', async (t) => {
	const { db } = t.context;

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
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, sql.placeholder('id')))
		.prepare();
	const result = await stmt.execute({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('migrator', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists cities_migration`);
	await db.execute(sql`drop table if exists users_migration`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/mssql' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table cities_migration`);
	await db.execute(sql`drop table users_migration`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table __drizzle_migrations`);
});

test.serial('insert via db.execute + select via db.execute', async (t) => {
	const { db } = t.context;

	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
	t.deepEqual(result.recordset, [{ id: 1, name: 'John' }]);
});

test.serial('insert via db.execute w/ query builder', async (t) => {
	const { db } = t.context;

	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	t.is(inserted.rowsAffected[0], 1);
});

test.serial('insert + select all possible dates', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists [datestable]`);
	await db.execute(
		sql`
			create table [datestable] (
				[date] date,
				[date_as_string] date,
				[time] time,
				[time_as_string] time,
				[datetime] datetime,
				[datetime_as_string] datetime,
			)
		`,
	);

	const date = new Date('2022-11-11');

	await db.insert(datesTable).values({
		date: date,
		dateAsString: '2022-11-11',
		time: '12:12:12',
		timeAsString: '12:12:12',
		datetime: date,
		datetimeAsString: '2022-11-11 12:12:12',
	});

	const res = await db.select().from(datesTable);

	t.assert(res[0]?.date instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(res[0]?.datetime instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(typeof res[0]?.dateAsString === 'string');
	t.assert(typeof res[0]?.datetimeAsString === 'string');

	t.deepEqual(res, [{
		date: new Date('2022-11-11'),
		dateAsString: '2022-11-11',
		time: new Date('1970-01-01T12:12:12Z'),
		datetime: new Date('2022-11-11'),
		datetimeAsString: '2022-11-11T12:12:12.000Z',
		timeAsString: '12:12:12.000',
	}]);

	await db.execute(sql`drop table if exists [datestable]`);
});

const tableWithEnums = mssqlTable('enums_test_case', {
	id: int('id').identity().primaryKey(),
	enum1: text('enum1', ['a', 'b', 'c']).notNull(),
	enum2: text('enum2', ['a', 'b', 'c']).default('a'),
	enum3: text('enum3', ['a', 'b', 'c']).notNull().default('b'),
});

test.serial('Mssql enum test case #1', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists [enums_test_case]`);

	await db.execute(sql`
		create table [enums_test_case] (
			[id] int identity primary key,
			[enum1] text not null,
			[enum2] text default 'a',
			[enum3] text not null default 'b'
		)
	`);

	await db.insert(tableWithEnums).values([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a' },
	]);

	const res = await db.select().from(tableWithEnums);

	await db.execute(sql`drop table [enums_test_case]`);

	t.deepEqual(res, [
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
	]);
});

test.serial('left join (flat object fields)', async (t) => {
	const { db } = t.context;

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

	t.deepEqual(res, [
		{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test.serial('left join (grouped fields)', async (t) => {
	const { db } = t.context;

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

	t.deepEqual(res, [
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

test.serial('left join (all fields)', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select().from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	t.deepEqual(res, [
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

test.serial('join subquery', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists [courses]`);
	await db.execute(sql`drop table if exists [course_categories]`);

	await db.execute(
		sql`
			create table [course_categories] (
				[id] int identity primary key,
				[name] varchar(50) not null
			)
		`,
	);

	await db.execute(
		sql`
			create table [courses] (
				[id] int identity primary key,
				[name] varchar(50) not null,
				[category_id] int references [course_categories]([id])
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
			total: sql<number>`count(${courseCategoriesTable.id})`.as('count'),
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

	await db.execute(sql`drop table if exists [courses]`);
	await db.execute(sql`drop table if exists [course_categories]`);
});

test.serial('with ... select', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists [orders]`);
	await db.execute(
		sql`
			create table [orders] (
				[id] int identity primary key,
				[region] varchar(50) not null,
				[product] varchar(50) not null,
				[amount] int not null,
				[quantity] int not null
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
			productUnits: sql<number>`cast(sum(${orders.quantity}) as int)`,
			productSales: sql<number>`cast(sum(${orders.amount}) as int)`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);

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

	await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

	const sq = db
		.select({ name: sql<string>`concat(${users2Table.name}, ' modified')`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq);

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

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: sql`count(*)` }).from(usersTable);

	t.deepEqual(res, [{ count: 2 }]);
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
			usersCount: sql<number>`count(${users2Table.id})`.as('users_count'),
		})
		.from(citiesTable)
		.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
		.where(({ name }) => sql`len(${name}) >= 3`)
		.groupBy(citiesTable.id, citiesTable.name)
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

	const newYorkers1 = mssqlView('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = mssqlView('new_yorkers', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = mssqlView('new_yorkers', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).existing();

	await db.execute(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

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

	const mssqlTable = mssqlTableCreator((name) => `myprefix_${name}`);

	const users = mssqlTable('test_prefixed_table_with_unique_name', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id int not null primary key, name text not null)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' });

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('orderBy with aliased column', (t) => {
	const { db } = t.context;

	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	t.deepEqual(query.sql, 'select something as [test] from [users2] order by [test]');
});

test.serial('timestamp timezone', async (t) => {
	const { db } = t.context;

	const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

	await db.insert(usersTable).values({ name: 'With default times' });
	await db.insert(usersTable).values({
		name: 'Without default times',
		createdAt: date,
	});
	const users = await db.select().from(usersTable);

	// check that the timestamps are set correctly for default times
	t.assert(Math.abs(users[0]!.createdAt.getTime() - Date.now()) < 2000);

	// check that the timestamps are set correctly for non default times
	t.assert(Math.abs(users[1]!.createdAt.getTime() - date.getTime()) < 2000);
});

test.serial('transaction', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users_transactions', {
		id: int('id').identity().primaryKey(),
		balance: int('balance').notNull(),
	});
	const products = mssqlTable('products_transactions', {
		id: int('id').identity().primaryKey(),
		price: int('price').notNull(),
		stock: int('stock').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop table if exists ${products}`);

	await db.execute(sql`create table users_transactions (id int identity not null primary key, balance int not null)`);
	await db.execute(
		sql`create table products_transactions (id int identity not null primary key, price int not null, stock int not null)`,
	);

	await db.insert(users).values({ balance: 100, id: 1 });
	const user = await db.select().from(users).where(eq(users.id, 1)).then((rows) => rows[0]!);
	await db.insert(products).values({ price: 10, stock: 10, id: 1 });
	const product = await db.select().from(products).where(eq(products.id, 1)).then((rows) => rows[0]!);

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

	const users = mssqlTable('users_transactions_rollback', {
		id: int('id').identity().primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_transactions_rollback (id int identity not null primary key, balance int not null)`,
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

	const users = mssqlTable('users_nested_transactions', {
		id: int('id').identity().primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions (id int identity not null primary key, balance int not null)`,
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

	const users = mssqlTable('users_nested_transactions_rollback', {
		id: int('id').identity().primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions_rollback (id int identity not null primary key, balance int not null)`,
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

	const internalStaff = mssqlTable('internal_staff', {
		userId: int('user_id').notNull(),
	});

	const customUser = mssqlTable('custom_user', {
		id: int('id').notNull(),
	});

	const ticket = mssqlTable('ticket', {
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

	const users = mssqlTable('users_subquery_view', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mssqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop view if exists ${newYorkers}`);

	await db.execute(
		sql`create table ${users} (id int identity not null primary key, name text not null, city_id integer not null)`,
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

	const users = mssqlTable('users_join_view', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mssqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop view if exists ${newYorkers}`);

	await db.execute(
		sql`create table ${users} (id int identity not null primary key, name text not null, city_id integer not null)`,
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

test.serial('select iterator', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users_iterator', {
		id: int('id').identity().primaryKey(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int identity not null primary key)`);

	await db.insert(users).values({});
	await db.insert(users).values({});
	await db.insert(users).values({});

	const iter = db.select().from(users).iterator();
	const result: typeof users.$inferSelect[] = [];

	for await (const row of iter) {
		result.push(row);
	}

	t.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test.serial('select iterator w/ prepared statement', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users_iterator', {
		id: int('id').identity(1, 1).primaryKey(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int identity not null primary key)`);

	await db.insert(users).values({});
	await db.insert(users).values({});
	await db.insert(users).values({});

	const prepared = db.select().from(users).prepare();
	const iter = prepared.iterator();
	const result: typeof users.$inferSelect[] = [];

	for await (const row of iter) {
		result.push(row);
	}

	t.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test.serial('insert undefined', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users', {
		id: int('id').identity().primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id int identity not null primary key, name text)`,
	);

	await t.notThrowsAsync(async () => await db.insert(users).values({ name: undefined }));

	await db.execute(sql`drop table ${users}`);
});

test.serial('update undefined', async (t) => {
	const { db } = t.context;

	const users = mssqlTable('users', {
		id: int('id').identity().primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id int not null primary key, name text)`,
	);

	await t.throwsAsync(async () => await db.update(users).set({ name: undefined }));
	await t.notThrowsAsync(async () => await db.update(users).set({ id: 1, name: undefined }));

	await db.execute(sql`drop table ${users}`);
});

// test.serial('utc config for datetime', async (t) => {
// 	const { db } = t.context;
//
// 	await db.execute(sql`drop table if exists [datestable]`);
// 	await db.execute(
// 		sql`
// 			create table [datestable] (
// 				[datetime_utc] datetime,
// 				[datetime] datetime,
// 				[datetime_as_string] datetime
// 			)
// 		`,
// 	);
// 	const datesTable = mssqlTable('datestable', {
// 		datetimeUTC: datetime('datetime_utc', { mode: 'date' }),
// 		datetime: datetime('datetime'),
// 		datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
// 	});
//
// 	const dateObj = new Date('2022-11-11');
// 	const dateUtc = new Date('2022-11-11T12:12:12.122Z');
//
// 	await db.insert(datesTable).values({
// 		datetimeUTC: dateUtc,
// 		datetime: dateObj,
// 		datetimeAsString: '2022-11-11 12:12:12',
// 	});
//
// 	const res = await db.select().from(datesTable);
//
// 	const rawSelect = await db.execute(sql`select [datetime_utc] from [datestable]`);
// 	const selectedRow = rawSelect.recordset[0];
//
// 	t.is(selectedRow.datetime_utc, '2022-11-11 12:12:12.122');
// 	t.deepEqual(new Date(selectedRow.datetime_utc.replace(' ', 'T') + 'Z'), dateUtc);
//
// 	t.assert(res[0]?.datetime instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
// 	t.assert(res[0]?.datetimeUTC instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
// 	t.assert(typeof res[0]?.datetimeAsString === 'string');
//
// 	t.deepEqual(res, [{
// 		datetimeUTC: dateUtc,
// 		datetime: new Date('2022-11-11'),
// 		datetimeAsString: '2022-11-11 12:12:12',
// 	}]);
//
// 	await db.execute(sql`drop table if exists [datestable]`);
// });

test.serial('set operations (union) from query builder with subquery', async (t) => {
	const { db } = t.context;

	await setupSetOperationTest(db);
	const sq = db
		.select({ id: users2Table.id, name: users2Table.name })
		.from(users2Table).as('sq');

	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name })
		.from(citiesTable).union(
			db.select().from(sq),
		).orderBy(asc(citiesTable.name)).offset(0).fetch(8);

	t.assert(result.length === 8);

	t.deepEqual(result, [
		{ id: 5, name: 'Ben' },
		{ id: 3, name: 'Jack' },
		{ id: 2, name: 'Jane' },
		{ id: 6, name: 'Jill' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'London' },
		{ id: 7, name: 'Mary' },
		{ id: 1, name: 'New York' },
	]);

	// union should throw if selected fields are not in the same order
	t.throws(() =>
		db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).union(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table),
			)
	);
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
	).orderBy(sql`name`);

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
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ name: users2Table.name, id: users2Table.id })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);
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
		).orderBy(asc(citiesTable.id)).offset(1).fetch(5);

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
			).orderBy(asc(citiesTable.id)).offset(1).fetch(5);
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
	).orderBy(citiesTable.id).offset(0).fetch(1);

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);

	t.throws(() => {
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
		).orderBy(citiesTable.id).offset(0).fetch(1);
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
		);

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
			);
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
	).orderBy(citiesTable.id).offset(0).fetch(1);

	t.assert(result.length === 0);

	t.deepEqual(result, []);

	t.throws(() => {
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
		).orderBy(citiesTable.id).offset(0).fetch(1);
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
	).orderBy(citiesTable.id).offset(0).fetch(3);

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
		).orderBy(citiesTable.id).offset(0).fetch(3);
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

	t.assert(result.length === 1);

	t.deepEqual(result, [
		{ id: 1, name: 'New York' },
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
	).as('sq');

	const result = await db.select().from(sq).orderBy(sq.id).offset(1).fetch(4);

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

	const result1 = await db.select({ value: avg(table.b) }).from(table);
	const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
	const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

	t.deepEqual(result1[0]?.value, '33');
	t.deepEqual(result2[0]?.value, null);
	t.deepEqual(result3[0]?.value, '42');
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
