import 'dotenv/config';
import { asc, DefaultLogger, eq, Name, sql } from 'drizzle-orm';
import {
	alias,
	customType,
	date,
	datetime2,
	int,
	mssqlTable,
	mssqlTableCreator,
	time,
	varchar,
} from 'drizzle-orm/mssql-core';
import { drizzle } from 'drizzle-orm/node-mssql';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { migrate } from 'drizzle-orm/node-mssql/migrator';
import type { ConnectionPool } from 'mssql';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createClient } from './instrumentation';

const ENABLE_LOGGING = false;

let db: NodeMsSqlDatabase;
let client: ConnectionPool;
let close: () => Promise<void>;

beforeAll(async () => {
	const res = await createClient();
	client = res.client;
	close = res.close;
	db = drizzle({ client, logger: ENABLE_LOGGING ? new DefaultLogger() : undefined });
});

afterAll(async () => {
	await close?.();
	await client?.close().catch(console.error);
});

const customText = customType<{ data: string }>({
	dataType() {
		return 'varchar(50)';
	},
});

const customBoolean = customType<{ data: boolean }>({
	dataType() {
		return 'bit';
	},
	fromDriver(value) {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	},
});

const customJson = <TData>(name: string) =>
	customType<{ data: TData; driverData: string }>({
		dataType() {
			return 'nvarchar(50)';
		},
		toDriver(value: TData): string {
			return JSON.stringify(value);
		},
		fromDriver(value: string): TData {
			return JSON.parse(value);
		},
	})(name);

const customTimestamp = customType<
	{ data: Date; driverData: string; config: { fsp: number } }
>({
	dataType(config) {
		const precision = config?.fsp === undefined ? '' : ` (${config.fsp})`;
		return `datetime2${precision}`;
	},
	fromDriver(value: string): Date {
		return new Date(value);
	},
});

const customBinary = customType<{ data: Buffer; driverData: Buffer; config: { length: number } }>({
	dataType(config) {
		return config?.length === undefined
			? `binary`
			: `binary(${config.length})`;
	},
});

const usersTable = mssqlTable('userstest', {
	id: int('id').identity().primaryKey(),
	name: customText('name').notNull(),
	verified: customBoolean('verified').notNull().default(false),
	jsonb: customJson<string[]>('jsonb'),
	createdAt: customTimestamp('created_at', { fsp: 2 }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

const datesTable = mssqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { precision: 1 }),
	datetime: datetime2('datetime', { precision: 2 }),
	datetimeAsString: datetime2('datetime_as_string', { precision: 2, mode: 'string' }),
});

export const testTable = mssqlTable('test_table', {
	id: customBinary('id', { length: 32 }).primaryKey(),
	rawId: varchar('raw_id', { length: 64 }),
});

const usersMigratorTable = mssqlTable('users12', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 50 }).notNull(),
	email: varchar('email', { length: 50 }).notNull(),
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists [userstest]`);
	await db.execute(sql`drop table if exists [datestable]`);
	await db.execute(sql`drop table if exists [test_table]`);
	// await ctx.db.execute(sql`create schema public`);
	await db.execute(
		sql`
			create table [userstest] (
				[id] int identity primary key,
				[name] varchar(50) not null,
				[verified] bit not null default 0,
				[jsonb] nvarchar(50),
				[created_at] datetime2 not null default CURRENT_TIMESTAMP
			)
		`,
	);

	await db.execute(
		sql`
			create table [datestable] (
				[date] date,
				[date_as_string] date,
				[time] time,
				[datetime] datetime,
				[datetime_as_string] datetime,
			)
		`,
	);

	await db.execute(
		sql`
			create table [test_table] (
				[id] binary(32) primary key,
				[raw_id] varchar(64)
			)
		`,
	);
});

test('select all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result[0]!.createdAt).toBeInstanceOf(Date); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
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

test('insert returning sql', async () => {
	const result = await db.insert(usersTable).values({ name: 'John' });

	expect(result.rowsAffected[0]).toEqual(1);
});

test('delete returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(users.rowsAffected[0]).toBe(1);
});

test('update returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	expect(users.rowsAffected[0]).toBe(1);
});

test('update with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	expect(updatedUsers.rowsAffected[0]).toBe(1);

	expect(users[0]!.createdAt).toBeInstanceOf(Date); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
	expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test('update with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(updatedUsers.rowsAffected[0]).toEqual(1);

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser.rowsAffected[0]).toBe(1);
});

test('delete with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser.rowsAffected[0]).toBe(1);
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

	expect(result.rowsAffected[0]).toBe(4);
});

test('select with group by as field', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
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
		.offset(0).fetch(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test('build query', async () => {
	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	expect(query).toEqual({
		sql: `select [id], [name] from [userstest] group by [userstest].[id], [userstest].[name]`,
		params: [],
	});
});

test('insert sql', async () => {
	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('partial join with alias', async () => {
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

	expect(result).toEqual([{
		user: { id: 1, name: 'Ivan' },
		customer: { id: 2, name: 'Hans' },
	}]);
});

test('full join with alias', async () => {
	const mysqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
		id: int('id').primaryKey(),
		name: varchar('name', { length: 50 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int primary key, name varchar(50) not null)`);

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
	const mysqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
		id: int('id').primaryKey(),
		name: varchar('name', { length: 50 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id int primary key, name varchar(50) not null)`);

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
	await db.execute(sql`drop table if exists [drizzle].[__drizzle_migrations]`);

	await migrate(db, { migrationsFolder: './drizzle2/mssql' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table cities_migration`);
	await db.execute(sql`drop table users_migration`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table [drizzle].[__drizzle_migrations]`);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
	expect(result.recordset).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	expect(inserted.rowsAffected[0]).toBe(1);
});

test('insert + select all possible dates', async () => {
	const date = new Date('2022-11-11');

	await db.insert(datesTable).values({
		date: date,
		dateAsString: '2022-11-11',
		time: new Date('1970-01-01T12:12:12.000Z'),
		datetime: date,
		datetimeAsString: '2022-11-11T12:12:12.000Z',
	});

	const res = await db.select().from(datesTable);

	expect(res[0]?.date).toBeInstanceOf(Date); // eslint-disable-line no-instanceof/no-instanceof
	expect(res[0]?.datetime).toBeInstanceOf(Date); // eslint-disable-line no-instanceof/no-instanceof
	expect(typeof res[0]?.dateAsString).toEqual('string');
	expect(typeof res[0]?.datetimeAsString).toEqual('string');

	expect(res).toEqual([{
		date: new Date('2022-11-11'),
		dateAsString: '2022-11-11',
		time: new Date('1970-01-01T12:12:12.000Z'),
		datetime: new Date('2022-11-11'),
		datetimeAsString: '2022-11-11T12:12:12.000Z',
	}]);
});

const tableWithEnums = mssqlTable('enums_test_case', {
	id: int('id').primaryKey(),
	enum1: varchar('enum1', { enum: ['a', 'b', 'c'], length: 50 }).notNull(),
	enum2: varchar('enum2', { enum: ['a', 'b', 'c'], length: 50 }).default('a'),
	enum3: varchar('enum3', { enum: ['a', 'b', 'c'], length: 50 }).notNull().default('b'),
});

test('Mssql enum test case #1', async () => {
	await db.execute(sql`drop table if exists [enums_test_case]`);

	await db.execute(sql`
		create table [enums_test_case] (
			[id] int primary key,
			[enum1] varchar(50) not null,
			[enum2] varchar(50) default 'a',
			[enum3] varchar(50) not null default 'b'
		)
	`);

	await db.insert(tableWithEnums).values([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a' },
	]);

	const res = await db.select().from(tableWithEnums);

	await db.execute(sql`drop table [enums_test_case]`);

	expect(res).toEqual([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
	]);
});

test('custom binary', async () => {
	const id = uuid().replace(/-/g, '');
	await db.insert(testTable).values({
		id: Buffer.from(id),
		rawId: id,
	});

	const res = await db.select().from(testTable);

	expect(res).toEqual([{
		id: Buffer.from(id),
		rawId: id,
	}]);
});
