import 'dotenv/config';

import type { TestFn } from 'ava';
import anyTest from 'ava';
import Docker from 'dockerode';
import { asc, DefaultLogger, eq, Name, sql } from 'drizzle-orm';
import {
	alias,
	bit,
	date,
	datetime,
	datetime2,
	getViewConfig,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlTableCreator,
	nvarchar,
	text,
	time,
	varchar,
} from 'drizzle-orm/mssql-core';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import getPort from 'get-port';
import mssql, { type config, type ConnectionPool } from 'mssql';
import { v4 as uuid } from 'uuid';

const ENABLE_LOGGING = false;

const mySchema = mssqlSchema('mySchema');

const usersTable = mySchema.table('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { mode: 'json', length: 100 }).$type<string[]>(),
	createdAt: datetime2('created_at', { precision: 2 }).notNull().defaultCurrentTimestamp(),
});

const users2Table = mySchema.table('users2', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

const citiesTable = mySchema.table('cities', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
});

const publicUsersTable = mssqlTable('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { mode: 'json', length: 100 }).$type<string[]>(),
	createdAt: datetime2('created_at', { precision: 2 }).notNull().defaultCurrentTimestamp(),
});

const datesTable = mssqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { precision: 1 }),
	datetime: datetime('datetime'),
	datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
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

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop table if exists [datestable]`);
	await ctx.db.execute(sql`drop table if exists [mySchema].[userstest]`);
	await ctx.db.execute(sql`drop table if exists [mySchema].[users2]`);
	await ctx.db.execute(sql`drop table if exists [mySchema].[cities]`);
	await ctx.db.execute(sql`drop table if exists [mySchema].[datestable]`);
	await ctx.db.execute(sql`drop schema if exists [mySchema]`);
	await ctx.db.execute(sql`create schema [mySchema]`);
	await ctx.db.execute(
		sql`
			create table [mySchema].[userstest] (
				[id] int identity primary key,
				[name] varchar(100) not null,
				[verified] bit not null default 0,
				[jsonb] nvarchar(100),
				[created_at] datetime2(2) not null default current_timestamp
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table [mySchema].[cities] (
				[id] int identity primary key,
				[name] varchar(100) not null
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table [mySchema].[users2] (
				[id] int identity primary key,
				[name] varchar(100) not null,
				[city_id] int references [mySchema].[cities]([id])
			)
		`,
	);

	await ctx.db.execute(
		sql`
			create table [datestable] (
				[date] date,
				[date_as_string] date,
				[time] time(1),
				[datetime] datetime,
				[datetime_as_string] datetime
			)
		`,
	);
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
	const result = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(result.rowsAffected[0], 1);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	t.is(result.rowsAffected[0], 1);
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

	t.is(updatedUsers.rowsAffected[0], 1);

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
		.groupBy(usersTable.name);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
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
		.offset(0)
		.fetch(1);

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: `select [id], [name] from [mySchema].[userstest] group by [userstest].[id], [userstest].[name]`,
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

	await db.insert(usersTable).values([{ name: 'Ivan' }, { name: 'Hans' }]);
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
		.leftJoin(customerAlias, eq(customerAlias.id, 2))
		.where(eq(usersTable.id, 1));

	t.deepEqual(result, [{
		user: { id: 1, name: 'Ivan' },
		customer: { id: 2, name: 'Hans' },
	}]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;

	const mysqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
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

	const mysqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
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

	const date = new Date('2022-11-11');

	await db.insert(datesTable).values({
		date: date,
		dateAsString: '2022-11-11',
		time: '12:12:12',
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
		time: new Date('1970-01-01T12:12:12.000Z'),
		datetime: new Date('2022-11-11'),
		datetimeAsString: '2022-11-11T12:12:12.000Z',
	}]);
});
test.serial('select from tables with same name from different schema using alias', async (t) => {
	const { db } = t.context;
	await db.execute(sql`drop table if exists [userstest]`);
	await db.execute(
		sql`
			create table [userstest] (
				[id] int identity primary key,
				[name] varchar(100) not null,
				[verified] bit not null default 0,
				[jsonb] nvarchar(100),
				[created_at] datetime2(2) not null default current_timestamp
			)
		`,
	);

	await db.insert(usersTable).values({ name: 'Ivan' });
	await db.insert(publicUsersTable).values({ name: 'Hans' });

	const customerAlias = alias(publicUsersTable, 'customer');

	const result = await db
		.select().from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 1))
		.where(eq(usersTable.id, 1));

	t.deepEqual(result, [{
		userstest: {
			id: 1,
			name: 'Ivan',
			verified: false,
			jsonb: null,
			createdAt: result[0]?.userstest.createdAt,
		},
		customer: {
			id: 1,
			name: 'Hans',
			verified: false,
			jsonb: null,
			createdAt: result[0]?.customer!.createdAt,
		},
	}]);
});

const tableWithEnums = mySchema.table('enums_test_case', {
	id: int('id').primaryKey(),
	enum1: varchar('enum1', { enum: ['a', 'b', 'c'] }).notNull(),
	enum2: varchar('enum2', { enum: ['a', 'b', 'c'] }).default('a'),
	enum3: varchar('enum3', { enum: ['a', 'b', 'c'] }).notNull().default('b'),
});

test.serial('Mysql enum test case #1', async (t) => {
	const { db } = t.context;

	await db.execute(sql`
		create table ${tableWithEnums} (
			[id] int primary key,
			[enum1] varchar not null,
			[enum2] varchar default 'a',
			[enum3] varchar not null default 'b'
		)
	`);

	await db.insert(tableWithEnums).values([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a' },
	]);

	const res = await db.select().from(tableWithEnums);

	await db.execute(sql`drop table ${tableWithEnums}`);

	t.deepEqual(res, [
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
	]);
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.close();
	await ctx.mssqlContainer?.stop().catch(console.error);
});

test.serial('view', async (t) => {
	const { db } = t.context;

	const newYorkers1 = mySchema.view('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = mySchema.view('new_yorkers', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = mySchema.view('new_yorkers', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
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
