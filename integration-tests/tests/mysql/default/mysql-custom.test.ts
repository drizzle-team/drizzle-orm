import { asc, eq, Name, sql } from 'drizzle-orm';
import {
	alias,
	binary,
	customType,
	date,
	datetime,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	serial,
	text,
	time,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';
import { toLocalDate } from '~/utils';
import { mysqlTest as test } from '../instrumentation';

const customSerial = customType<{ data: number; notNull: true; default: true }>({
	dataType() {
		return 'serial';
	},
});

const customText = customType<{ data: string }>({
	dataType() {
		return 'text';
	},
});

const customBoolean = customType<{ data: boolean }>({
	dataType() {
		return 'boolean';
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
			return 'json';
		},
		toDriver(value: TData): string {
			return JSON.stringify(value);
		},
	})(name);

const customTimestamp = customType<
	{ data: Date; driverData: string; config: { fsp: number } }
>({
	dataType(config) {
		const precision = config?.fsp === undefined ? '' : ` (${config.fsp})`;
		return `timestamp${precision}`;
	},
	fromDriver(value: string): Date {
		return new Date(value);
	},
});

const customBinary = customType<{ data: string; driverData: Buffer; config: { length: number } }>({
	dataType(config) {
		return config?.length === undefined
			? `binary`
			: `binary(${config.length})`;
	},

	toDriver(value) {
		return sql`UNHEX(${value})`;
	},

	fromDriver(value) {
		return value.toString('hex');
	},
});

const usersTable = mysqlTable('userstest', {
	id: customSerial('id').primaryKey(),
	name: customText('name').notNull(),
	verified: customBoolean('verified').notNull().default(false),
	jsonb: customJson<string[]>('jsonb'),
	createdAt: customTimestamp('created_at', { fsp: 2 }).notNull().default(sql`now()`),
});

const datesTable = mysqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { fsp: 1 }),
	datetime: datetime('datetime', { fsp: 2 }),
	datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
	year: year('year'),
});

export const testTable = mysqlTable('test_table', {
	id: customBinary('id', { length: 16 }).primaryKey(),
	sqlId: binary('sql_id', { length: 16 }),
	rawId: varchar('raw_id', { length: 64 }),
});

const usersMigratorTable = mysqlTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

test.beforeEach(async ({ db }) => {
	await db.execute(sql`drop table if exists \`userstest\``);
	await db.execute(sql`drop table if exists \`datestable\``);
	await db.execute(sql`drop table if exists \`test_table\``);
	// await ctx.db.execute(sql`create schema public`);
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
			create table \`datestable\` (
				\`date\` date,
				\`date_as_string\` date,
				\`time\` time,
				\`datetime\` datetime,
				\`datetime_as_string\` datetime,
				\`year\` year
			)
		`,
	);

	await db.execute(
		sql`
			create table \`test_table\` (
				\`id\` binary(16) primary key,
				\`sql_id\` binary(16),
				\`raw_id\` varchar(64)
			)
		`,
	);
});

test('select all fields', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result[0]!.createdAt).toBeInstanceOf(Date);
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test('select sql', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select typed sql', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('insert returning sql', async ({ db }) => {
	const [result, _] = await db.insert(usersTable).values({ name: 'John' });

	expect(result.insertId).toBe(1);
});

test('delete returning sql', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(users[0].affectedRows).toBe(1);
});

test('update returning sql', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	expect(users[0].changedRows).toBe(1);
});

test('update with returning all fields', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	expect(updatedUsers[0].changedRows).toBe(1);

	expect(users[0]!.createdAt).toBeInstanceOf(Date);
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
	expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test('update with returning partial', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(updatedUsers[0].changedRows).toBe(1);

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser[0].affectedRows).toBe(1);
});

test('delete with returning partial', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser[0].affectedRows).toBe(1);
});

test('insert + select', async ({ db }) => {
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

test('json insert', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	}).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test('insert with overridden default values', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test('insert many', async ({ db }) => {
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

test('insert many with returning', async ({ db }) => {
	const result = await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);

	expect(result[0].affectedRows).toBe(4);
});

test('select with group by as field', async ({ db }) => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
});

test('select with group by as sql', async ({ db }) => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
});

test('select with group by as sql + column', async ({ db }) => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test('select with group by as column + sql', async ({ db }) => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test('select with group by complex query', async ({ db }) => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test('build query', async ({ db }) => {
	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	expect(query).toEqual({
		sql: `select \`id\`, \`name\` from \`userstest\` group by \`userstest\`.\`id\`, \`userstest\`.\`name\``,
		params: [],
	});
});

test('build query insert with onDuplicate', async ({ db }) => {
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

test('insert with onDuplicate', async ({ db }) => {
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

test('insert conflict', async ({ db }) => {
	await db.insert(usersTable)
		.values({ name: 'John' });

	await expect((async () => {
		db.insert(usersTable).values({ id: 1, name: 'John1' });
	})()).resolves.not.toThrowError();
});

test('insert conflict with ignore', async ({ db }) => {
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

test('insert sql', async ({ db }) => {
	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('partial join with alias', async ({ db }) => {
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

test('full join with alias', async ({ db }) => {
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

test('select from alias', async ({ db }) => {
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

test('insert with spaces', async ({ db }) => {
	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
});

test('prepared statement', async ({ db }) => {
	await db.insert(usersTable).values({ name: 'John' });
	const statement = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.prepare();
	const result = await statement.execute();

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement reuse', async ({ db }) => {
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

test('prepared statement with placeholder in .where', async ({ db }) => {
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

test('migrator', async ({ db }) => {
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

test('insert via db.execute + select via db.execute', async ({ db }) => {
	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
	expect(result[0]).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async ({ db }) => {
	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	expect(inserted[0].affectedRows).toBe(1);
});

test('insert + select all possible dates', async ({ db }) => {
	const date = new Date('2022-11-11');

	await db.insert(datesTable).values({
		date: date,
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: date,
		year: 22,
		datetimeAsString: '2022-11-11 12:12:12',
	});

	const res = await db.select().from(datesTable);

	expect(res[0]?.date).toBeInstanceOf(Date);
	expect(res[0]?.datetime).toBeInstanceOf(Date);
	expect(res[0]?.dateAsString).toBeTypeOf('string');
	expect(res[0]?.datetimeAsString).toBeTypeOf('string');

	expect(res).toEqual([{
		date: toLocalDate(new Date('2022-11-11')),
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: new Date('2022-11-11'),
		year: 2022,
		datetimeAsString: '2022-11-11 12:12:12',
	}]);
});

const tableWithEnums = mysqlTable('enums_test_case', {
	id: serial('id').primaryKey(),
	enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
	enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
	enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
});

test('Mysql enum test case #1', async ({ db }) => {
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

test('custom binary', async ({ db }) => {
	const id = uuid().replace(/-/g, '');
	await db.insert(testTable).values({
		id,
		sqlId: sql`UNHEX(${id})`,
		rawId: id,
	});

	const res = await db.select().from(testTable);

	expect(res).toEqual([{
		id,
		sqlId: Buffer.from(id, 'hex').toString(),
		rawId: id,
	}]);
});
