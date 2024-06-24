import { Client } from '@planetscale/database';
import { and, asc, eq, sql, TransactionRollbackError } from 'drizzle-orm';
import {
	alias,
	boolean,
	date,
	datetime,
	getTableConfig,
	int,
	json,
	mysqlEnum,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
	time,
	timestamp,
	uniqueIndex,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import type { PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { migrate } from 'drizzle-orm/planetscale-serverless/migrator';
import { beforeAll, beforeEach, expect, test } from 'vitest';

const ENABLE_LOGGING = false;

let db: PlanetScaleDatabase;

beforeAll(async () => {
	db = drizzle(new Client({ url: process.env['PLANETSCALE_CONNECTION_STRING']! }), { logger: ENABLE_LOGGING });
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

const datesTable = mysqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { fsp: 1 }),
	datetime: datetime('datetime', { fsp: 2 }),
	datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
	year: year('year'),
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

beforeEach(async () => {
	await db.execute(sql`drop table if exists ${usersTable}`);
	await db.execute(sql`drop table if exists ${datesTable}`);
	// await ctx.db.execute(sql`create schema public`);
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
	const users = await db
		.select({
			name: sql`upper(${usersTable.name})`,
		})
		.from(usersTable);

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

	expect(result.insertId).toBe('1');
});

test('delete returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(users.rowsAffected).toBe(1);
});

test('update returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	expect(users.rowsAffected).toBe(1);
});

test('update with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	expect(updatedUsers.rowsAffected).toBe(1);

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

	expect(updatedUsers.rowsAffected).toBe(1);

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser.rowsAffected).toBe(1);
});

test('delete with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	expect(deletedUser.rowsAffected).toBe(1);
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

	expect(result.rowsAffected).toBe(4);
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

	const tableName = getTableConfig(usersTable).name;

	expect(query).toEqual({
		sql: `select \`id\`, \`name\` from \`${tableName}\` group by \`${tableName}\`.\`id\`, \`${tableName}\`.\`name\``,
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
			getTableConfig(usersTable).name
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
		})
		.from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10));

	expect(result).toEqual([{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test('full join with alias', async () => {
	const sqliteTable = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
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
	const statement = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
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
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id, sql.placeholder('id')))
		.prepare();
	const result = await stmt.execute({ id: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('migrator', async () => {
	const migrationsTable = '__drizzle_tests_migrations';

	await db.execute(sql`drop table if exists ${sql.raw(tablePrefix)}cities_migration`);
	await db.execute(sql`drop table if exists ${sql.raw(tablePrefix)}users_migration`);
	await db.execute(sql`drop table if exists ${sql.raw(tablePrefix)}users12`);
	await db.execute(sql`drop table if exists ${sql.raw(migrationsTable)}`);

	await migrate(db, {
		migrationsFolder: './drizzle2/planetscale',
		migrationsTable: migrationsTable,
	});

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table ${sql.raw(tablePrefix)}cities_migration`);
	await db.execute(sql`drop table ${sql.raw(tablePrefix)}users_migration`);
	await db.execute(sql`drop table ${sql.raw(tablePrefix)}users12`);
	await db.execute(sql`drop table ${sql.raw(migrationsTable)}`);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
	expect(result.rows).toEqual([{ id: '1', name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	expect(inserted.rowsAffected).toBe(1);
});

test('insert + select all possible dates', async () => {
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
	expect(typeof res[0]?.dateAsString).toBe('string');
	expect(typeof res[0]?.datetimeAsString).toBe('string');

	expect(res[0]!.date).toEqual(new Date('2022-11-11'));
	expect(res[0]!.dateAsString).toBe('2022-11-11');
	expect(res[0]!.time).toBe('12:12:12');
	expect(res[0]!.year).toBe(2022);
	expect(res[0]!.datetimeAsString).toBe('2022-11-11 12:12:12');
});

const tableWithEnums = mysqlTable('enums_test_case', {
	id: serial('id').primaryKey(),
	enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
	enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
	enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
});

test('Mysql enum test case #1', async () => {
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

	const { insertId: userId } = await db.insert(users).values({ balance: 100 });
	const user = await db.select().from(users).where(eq(users.id, +userId)).then((rows) => rows[0]!);
	const { insertId: productId } = await db.insert(products).values({ price: 10, stock: 10 });
	const product = await db.select().from(products).where(eq(products.id, +productId)).then((rows) => rows[0]!);

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
		sql`create table ${users} (id serial not null primary key, balance int not null)`,
	);

	await expect((async () => {
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });
			tx.rollback();
		});
	})()).rejects.toThrowError(TransactionRollbackError);

	const result = await db.select().from(users);

	expect(result).toEqual([]);

	await db.execute(sql`drop table ${users}`);
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

	expect(result).toEqual([{ id: 1, balance: 200 }]);

	await db.execute(sql`drop table ${users}`);
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

test('join', async () => {
	const usersTable = mysqlTable(
		'users',
		{
			id: varchar('id', { length: 191 }).primaryKey().notNull(),
			createdAt: datetime('created_at', { fsp: 3 }).notNull(),
			name: varchar('name', { length: 191 }),
			email: varchar('email', { length: 191 }).notNull(),
			emailVerified: datetime('email_verified', { fsp: 3 }),
			image: text('image'),
		},
		(table) => ({
			emailIdx: uniqueIndex('email_idx').on(table.email),
		}),
	);

	const accountsTable = mysqlTable(
		'accounts',
		{
			id: varchar('id', { length: 191 }).primaryKey().notNull(),
			userId: varchar('user_id', { length: 191 }).notNull(),
			type: varchar('type', { length: 191 }).notNull(),
			provider: varchar('provider', { length: 191 }).notNull(),
			providerAccountId: varchar('provider_account_id', {
				length: 191,
			}).notNull(),
			refreshToken: text('refresh_token'),
			accessToken: text('access_token'),
			expiresAt: int('expires_at'),
			tokenType: varchar('token_type', { length: 191 }),
			scope: varchar('scope', { length: 191 }),
			idToken: text('id_token'),
			sessionState: varchar('session_state', { length: 191 }),
		},
		(table) => ({
			providerProviderAccountIdIdx: uniqueIndex(
				'provider_provider_account_id_idx',
			).on(table.provider, table.providerAccountId),
		}),
	);

	await db.execute(sql`drop table if exists ${usersTable}`);
	await db.execute(sql`drop table if exists ${accountsTable}`);
	await db.execute(sql`
		create table ${usersTable} (
			id varchar(191) not null primary key,
			created_at datetime(3) not null,
			name varchar(191),
			email varchar(191) not null,
			email_verified datetime(3),
			image text,
			unique key email_idx (email)
		)
	`);
	await db.execute(sql`
		create table ${accountsTable} (
			id varchar(191) not null primary key,
			user_id varchar(191) not null,
			type varchar(191) not null,
			provider varchar(191) not null,
			provider_account_id varchar(191) not null,
			refresh_token text,
			access_token text,
			expires_at int,
			token_type varchar(191),
			scope varchar(191),
			id_token text,
			session_state varchar(191),
			unique key provider_provider_account_id_idx (provider, provider_account_id)
		)
	`);

	const result = await db
		.select({ user: usersTable, account: accountsTable })
		.from(accountsTable)
		.leftJoin(usersTable, eq(accountsTable.userId, usersTable.id))
		.where(
			and(
				eq(accountsTable.provider, 'provider'),
				eq(accountsTable.providerAccountId, 'providerAccountId'),
			),
		)
		.limit(1);

	expect(result).toEqual([]);
});
