import retry from 'async-retry';
import type Docker from 'dockerode';
import type { Equal } from 'drizzle-orm';
import { asc, eq, getTableName, gt, inArray, Name, sql, TransactionRollbackError } from 'drizzle-orm';
import {
	alias,
	boolean,
	date,
	datetime,
	getViewConfig,
	int,
	json,
	mysqlEnum,
	mysqlTable as mysqlTableRaw,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
	time,
	timestamp,
	uniqueIndex,
	year,
} from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { Expect, toLocalDate } from '~/utils';
import { createDockerDB } from './mysql-common';

const ENABLE_LOGGING = false;

let db: MySql2Database;
let client: mysql.Connection;
let container: Docker.Container | undefined;

beforeAll(async () => {
	let connectionString;
	if (process.env['MYSQL_CONNECTION_STRING']) {
		connectionString = process.env['MYSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr, container: contrainerObj } = await createDockerDB();
		connectionString = conStr;
		container = contrainerObj;
	}
	client = await retry(async () => {
		client = await mysql.createConnection(connectionString);
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});
	db = drizzle(client, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end();
	await container?.stop().catch(console.error);
});

const tablePrefix = 'drizzle_tests_';

const mysqlTable = mysqlTableCreator((name) => `${tablePrefix}${name}`);
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

beforeEach(async () => {
	await db.execute(sql`drop table if exists ${usersTable}`);
	await db.execute(sql`drop table if exists ${users2Table}`);
	await db.execute(sql`drop table if exists ${citiesTable}`);

	await db.execute(
		sql`
			create table ${usersTable} (
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
			create table ${users2Table} (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references ${citiesTable}(\`id\`)
			)
		`,
	);

	await db.execute(
		sql`
			create table ${citiesTable} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);
});

test('select all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result[0]!.createdAt).toBeInstanceOf(Date);
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
	const [result, _] = await db.insert(usersTable).values({ name: 'John' });

	expect(result.insertId).toBe(1);
});

test('delete returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(users[0].affectedRows).toBe(1);
});

test('update returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	expect(users[0].changedRows).toBe(1);
});

test('update with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	expect(updatedUsers[0].changedRows).toBe(1);

	expect(users[0]!.createdAt).toBeInstanceOf(Date);
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

	expect(updatedUsers[0].changedRows).toBe(1);

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser[0].affectedRows).toBe(1);
});

test('delete with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser[0].affectedRows).toBe(1);
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

	expect(result[0].affectedRows).toBe(4);
});

test('select with group by as field', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
});

test('select with group by as sql', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
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
		sql: `select \`id\`, \`name\` from \`${getTableName(usersTable)}\` group by \`${
			getTableName(usersTable)
		}\`.\`id\`, \`${getTableName(usersTable)}\`.\`name\``,
		params: [],
	});
});

test('build query insert with onDuplicate', async () => {
	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql: `insert into \`${
			getTableName(usersTable)
		}\` (\`id\`, \`name\`, \`verified\`, \`jsonb\`, \`created_at\`) values (default, ?, default, ?, default) on duplicate key update \`name\` = ?`,
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

	await expect((async () => {
		db.insert(usersTable).values({ id: 1, name: 'John1' });
	})()).resolves.not.toThrowError();
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
	const usersMigratorTable = mysqlTableRaw('users12', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
	}, (table) => {
		return {
			name: uniqueIndex('').on(table.name).using('btree'),
		};
	});

	await db.execute(sql.raw(`drop table if exists cities_migration`));
	await db.execute(sql.raw(`drop table if exists users_migration`));
	await db.execute(sql.raw(`drop table if exists users12`));
	await db.execute(sql.raw(`drop table if exists __drizzle_migrations`));

	await migrate(db, { migrationsFolder: './drizzle2/mysql' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql.raw(`drop table cities_migration`));
	await db.execute(sql.raw(`drop table users_migration`));
	await db.execute(sql.raw(`drop table users12`));
	await db.execute(sql.raw(`drop table __drizzle_migrations`));
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
	expect(result[0]).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	expect(inserted[0].affectedRows).toBe(1);
});

test('insert + select all possible dates', async () => {
	const datesTable = mysqlTable('datestable', {
		date: date('date'),
		dateAsString: date('date_as_string', { mode: 'string' }),
		time: time('time', { fsp: 1 }),
		datetime: datetime('datetime', { fsp: 2 }),
		datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
		year: year('year'),
	});

	await db.execute(sql`drop table if exists ${datesTable}`);
	await db.execute(
		sql`
			create table ${datesTable} (
				\`date\` date,
				\`date_as_string\` date,
				\`time\` time,
				\`datetime\` datetime,
				\`datetime_as_string\` datetime,
				\`year\` year
			)
		`,
	);

	const d = new Date('2022-11-11');

	await db.insert(datesTable).values({
		date: d,
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: d,
		year: 22,
		datetimeAsString: '2022-11-11 12:12:12',
	});

	const res = await db.select().from(datesTable);

	expect(res[0]?.date).toBeInstanceOf(Date);
	expect(res[0]?.datetime).toBeInstanceOf(Date);
	expect(typeof res[0]?.dateAsString).toBe('string');
	expect(typeof res[0]?.datetimeAsString).toBe('string');

	expect(res).toEqual([{
		date: toLocalDate(new Date('2022-11-11')),
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: new Date('2022-11-11'),
		year: 2022,
		datetimeAsString: '2022-11-11 12:12:12',
	}]);

	await db.execute(sql`drop table ${datesTable}`);
});

test('Mysql enum test case #1', async () => {
	const tableWithEnums = mysqlTable('enums_test_case', {
		id: serial('id').primaryKey(),
		enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
		enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
		enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
	});

	await db.execute(sql`drop table if exists ${tableWithEnums}`);

	await db.execute(sql`
		create table ${tableWithEnums} (
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

	await db.execute(sql`drop table ${tableWithEnums}`);

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
	const coursesTable = mysqlTable('courses', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		categoryId: int('category_id').references(() => courseCategoriesTable.id),
	});

	const courseCategoriesTable = mysqlTable('course_categories', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${coursesTable}`);
	await db.execute(sql`drop table if exists ${courseCategoriesTable}`);

	await db.execute(
		sql`
			create table ${courseCategoriesTable} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);

	await db.execute(
		sql`
			create table ${coursesTable} (
				\`id\` serial primary key,
				\`name\` text not null,
				\`category_id\` int references ${courseCategoriesTable}(\`id\`)
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

	await db.execute(sql`drop table ${coursesTable}`);
	await db.execute(sql`drop table ${courseCategoriesTable}`);

	expect(res).toEqual([
		{ courseName: 'Design', categoryId: 1 },
		{ courseName: 'Development', categoryId: 2 },
		{ courseName: 'IT & Software', categoryId: 3 },
		{ courseName: 'Marketing', categoryId: 4 },
	]);
});

test('with ... select', async () => {
	const orders = mysqlTable('orders', {
		id: serial('id').primaryKey(),
		region: text('region').notNull(),
		product: text('product').notNull(),
		amount: int('amount').notNull(),
		quantity: int('quantity').notNull(),
	});

	await db.execute(sql`drop table if exists ${orders}`);
	await db.execute(
		sql`
			create table ${orders} (
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
			productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
			productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);

	await db.execute(sql`drop table ${orders}`);

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

	expect(res).toEqual([{ count: 2 }]);
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
		expect(query.sql).toMatch(/ for update nowait$/);
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
			usersCount: sql<number>`count(${users2Table.id})`.as('users_count'),
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

	await db.execute(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

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
		id: sql<number>`id`,
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
			id: sql<number>`users.id`,
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
			userId: sql<number>`users.id`.as('userId'),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
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

	expect(query.sql).toBe(`select something as \`test\` from \`${getTableName(users2Table)}\` order by \`test\``);
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
	expect(Math.abs(users[0]!.createdAt.getTime() - Date.now())).toBeLessThan(2000);

	// check that the timestamps are set correctly for non default times
	expect(Math.abs(users[1]!.createdAt.getTime() - date.getTime())).toBeLessThan(2000);
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

	await db.execute(sql`create table ${users} (id serial not null primary key, balance int not null)`);
	await db.execute(
		sql`create table ${products} (id serial not null primary key, price int not null, stock int not null)`,
	);

	const [{ insertId: userId }] = await db.insert(users).values({ balance: 100 });
	const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]!);
	const [{ insertId: productId }] = await db.insert(products).values({ price: 10, stock: 10 });
	const product = await db.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]!);

	await db.transaction(async (tx) => {
		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
	});

	const result = await db.select().from(users);

	await db.execute(sql`drop table ${users}`);
	await db.execute(sql`drop table ${products}`);

	expect(result).toEqual([{ id: 1, balance: 90 }]);
});

test('transaction rollback', async () => {
	const users = mysqlTable('users_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, balance int not null)`,
	);

	await expect((async () => {
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });
			tx.rollback();
		});
	})()).rejects.toThrowError(TransactionRollbackError);

	const result = await db.select().from(users);

	await db.execute(sql`drop table ${users}`);

	expect(result).toEqual([]);
});

test('nested transaction', async () => {
	const users = mysqlTable('users_nested_transactions', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, balance int not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await tx.transaction(async (tx) => {
			await tx.update(users).set({ balance: 200 });
		});
	});

	const result = await db.select().from(users);

	await db.execute(sql`drop table ${users}`);

	expect(result).toEqual([{ id: 1, balance: 200 }]);
});

test('nested transaction rollback', async () => {
	const users = mysqlTable('users_nested_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: int('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, balance int not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await expect((async () => {
			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
				tx.rollback();
			});
		})()).rejects.toThrowError(TransactionRollbackError);
	});

	const result = await db.select().from(users);

	await db.execute(sql`drop table ${users}`);

	expect(result).toEqual([{ id: 1, balance: 100 }]);
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

	await db.execute(sql`create table ${internalStaff} (user_id integer not null)`);
	await db.execute(sql`create table ${customUser} (id integer not null)`);
	await db.execute(sql`create table ${ticket} (staff_id integer not null)`);

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

	await db.execute(sql`drop table ${internalStaff}`);
	await db.execute(sql`drop table ${customUser}`);
	await db.execute(sql`drop table ${ticket}`);

	expect(mainQuery).toEqual([{
		ticket: { staffId: 1 },
		internal_staff: {
			internal_staff: { userId: 1 },
			custom_user: { id: 1 },
		},
	}]);
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

	await db.execute(sql`drop view ${newYorkers}`);
	await db.execute(sql`drop table ${users}`);

	expect(result).toEqual([
		{ id: 1, name: 'John', cityId: 1 },
		{ id: 3, name: 'Jack', cityId: 1 },
	]);
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

test('select iterator', async () => {
	const users = mysqlTable('users_iterator', {
		id: serial('id').primaryKey(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial not null primary key)`);

	await db.insert(users).values([{}, {}, {}]);

	const iter = db.select().from(users).iterator();

	const result: typeof users.$inferSelect[] = [];

	for await (const row of iter) {
		result.push(row);
	}

	expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test('select iterator w/ prepared statement', async () => {
	const users = mysqlTable('users_iterator', {
		id: serial('id').primaryKey(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial not null primary key)`);

	await db.insert(users).values([{}, {}, {}]);

	const prepared = db.select().from(users).prepare();
	const iter = prepared.iterator();
	const result: typeof users.$inferSelect[] = [];

	for await (const row of iter) {
		result.push(row);
	}

	expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
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

	await expect((async () => {
		await db.insert(users).values({ name: undefined });
	})()).resolves.not.toThrowError();

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

	await expect((async () => {
		await db.update(users).set({ name: undefined });
	})()).rejects.toThrowError();

	await expect((async () => {
		await db.update(users).set({ id: 1, name: undefined });
	})()).resolves.not.toThrowError();

	await db.execute(sql`drop table ${users}`);
});
