/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { and, asc, eq, getTableColumns, gt, Name, sql } from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	int,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/mysql-core';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { expect } from 'vitest';
import { type Test } from './instrumentation';
import { createUserTable, orders, usersMigratorTable, usersOnUpdate, usersTable } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('insert+update+delete returning sql', async ({ db, push }) => {
		const users = createUserTable('users_85');
		await push({ users });

		const [result, _] = await db.insert(users).values({ name: 'John' });
		const res1 = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));
		const res2 = await db.delete(users).where(eq(users.name, 'Jane'));

		expect(result.insertId).toBe(1);
		expect(res1[0].changedRows).toBe(1);
		expect(res2[0].affectedRows).toBe(1);
	});

	test.concurrent('update with returning all fields + partial', async ({ db, push }) => {
		const users = createUserTable('users_86');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const updatedUsers = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));

		const result = await db.select().from(users).where(eq(users.id, 1));

		expect(updatedUsers[0].changedRows).toBe(1);
		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test.concurrent('update with returning partial', async ({ db, push }) => {
		const users = createUserTable('users_87');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const updatedUsers = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));

		const result = await db.select({ id: users.id, name: users.name }).from(users).where(
			eq(users.id, 1),
		);

		expect(updatedUsers[0].changedRows).toBe(1);

		expect(result).toEqual([{ id: 1, name: 'Jane' }]);
	});

	test.concurrent('delete with returning all fields', async ({ db }) => {
		await db.insert(usersTable).values({ name: 'John' });
		const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

		expect(deletedUser[0].affectedRows).toBe(1);
	});

	test.concurrent('delete with returning partial', async ({ db }) => {
		await db.insert(usersTable).values({ name: 'John' });
		const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

		expect(deletedUser[0].affectedRows).toBe(1);
	});

	test.concurrent('insert + select', async ({ db }) => {
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

	test.concurrent('json insert', async ({ db }) => {
		await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
		const result = await db.select({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
		}).from(usersTable);

		expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
	});

	test.concurrent('insert with overridden default values', async ({ db }) => {
		await db.insert(usersTable).values({ name: 'John', verified: true });
		const result = await db.select().from(usersTable);

		expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test.concurrent('insert many', async ({ db }) => {
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

	test.concurrent('insert many with returning', async ({ db }) => {
		const result = await db.insert(usersTable).values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);

		expect(result[0].affectedRows).toBe(4);
	});
	test.concurrent('$default function', async ({ db }) => {
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

	test.concurrent('$default with empty array', async ({ db }) => {
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

	// here

	test.concurrent('Insert all defaults in 1 row', async ({ db }) => {
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

	test.concurrent('Insert all defaults in multiple rows', async ({ db }) => {
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

	test.concurrent('insert with onDuplicate', async ({ db }) => {
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

	test.concurrent('insert conflict', async ({ db }) => {
		await db.insert(usersTable)
			.values({ name: 'John' });

		await expect((async () => {
			await db.insert(usersTable).values({ id: 1, name: 'John1' });
		})()).rejects.toThrowError();
	});

	test.concurrent('insert conflict with ignore', async ({ db }) => {
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

	test.concurrent('insert sql', async ({ db }) => {
		await db.insert(usersTable).values({ name: sql`${'John'}` });
		const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
		expect(result).toEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('full join with alias', async ({ db }) => {
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

	test.concurrent('select from alias', async ({ db }) => {
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

	test.concurrent('insert with spaces', async ({ db }) => {
		await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
		const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

		expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
	});

	test.concurrent('insert: placeholders on columns with encoder', async ({ db }) => {
		const date = new Date('2024-08-07T15:30:00Z');

		const statement = db.insert(usersTable).values({
			name: 'John',
			createdAt: sql.placeholder('createdAt'),
		}).prepare();

		await statement.execute({ createdAt: date });

		const result = await db
			.select({
				id: usersTable.id,
				createdAt: usersTable.createdAt,
			})
			.from(usersTable);

		expect(result).toEqual([
			{ id: 1, createdAt: date },
		]);
	});

	test.concurrent('prepared statement reuse', async ({ db }) => {
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

	test.concurrent('migrator', async ({ db }) => {
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

	test.concurrent('insert via db.execute + select via db.execute', async ({ db }) => {
		await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

		const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
		expect(result[0]).toEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('insert via db.execute w/ query builder', async ({ db }) => {
		const inserted = await db.execute(
			db.insert(usersTable).values({ name: 'John' }),
		);
		expect(inserted[0].affectedRows).toBe(1);
	});

	test.concurrent('Mysql enum as ts enum', async ({ db }) => {
		enum Test {
			a = 'a',
			b = 'b',
			c = 'c',
		}

		const tableWithTsEnums = mysqlTable('enums_test_case', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', Test).notNull(),
			enum2: mysqlEnum('enum2', Test).default(Test.a),
			enum3: mysqlEnum('enum3', Test).notNull().default(Test.b),
		});

		await db.execute(sql`drop table if exists \`enums_test_case\``);

		await db.execute(sql`
				create table \`enums_test_case\` (
						\`id\` serial primary key,
						\`enum1\` ENUM('a', 'b', 'c') not null,
						\`enum2\` ENUM('a', 'b', 'c') default 'a',
						\`enum3\` ENUM('a', 'b', 'c') not null default 'b'
				)
			`);

		await db.insert(tableWithTsEnums).values([
			{ id: 1, enum1: Test.a, enum2: Test.b, enum3: Test.c },
			{ id: 2, enum1: Test.a, enum3: Test.c },
			{ id: 3, enum1: Test.a },
		]);

		const res = await db.select().from(tableWithTsEnums);

		await db.execute(sql`drop table \`enums_test_case\``);

		expect(res).toEqual([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
		]);
	});
	test.concurrent('test $onUpdateFn and $onUpdate works as $default', async ({ db }) => {
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
		const msDelay = 750;

		for (const eachUser of justDates) {
			expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
		}
	});

	test.concurrent('test $onUpdateFn and $onUpdate works updating', async ({ db }) => {
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
		const msDelay = 750;

		expect(initial[0]?.updatedAt?.valueOf()).not.toBe(justDates[0]?.updatedAt?.valueOf());

		for (const eachUser of justDates) {
			expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
		}
	});

	test.concurrent('Object keys as column names', async ({ db }) => {
		// Tests the following:
		// Column with required config
		// Column with optional config without providing a value
		// Column with optional config providing a value
		// Column without config
		const users = mysqlTable('users', {
			id: bigint({ mode: 'number' }).autoincrement().primaryKey(),
			createdAt: timestamp(),
			updatedAt: timestamp({ fsp: 3 }),
			admin: boolean(),
		});

		await db.execute(sql`drop table if exists users`);
		await db.execute(
			sql`
					create table users (
						\`id\` bigint auto_increment primary key,
						\`createdAt\` timestamp,
						\`updatedAt\` timestamp(3),
						\`admin\` boolean
					)
				`,
		);

		await db.insert(users).values([
			{ createdAt: sql`now() - interval 30 day`, updatedAt: sql`now() - interval 1 day`, admin: true },
			{ createdAt: sql`now() - interval 1 day`, updatedAt: sql`now() - interval 30 day`, admin: true },
			{ createdAt: sql`now() - interval 1 day`, updatedAt: sql`now() - interval 1 day`, admin: false },
		]);
		const result = await db
			.select({ id: users.id, admin: users.admin })
			.from(users)
			.where(
				and(
					gt(users.createdAt, sql`now() - interval 7 day`),
					gt(users.updatedAt, sql`now() - interval 7 day`),
				),
			);

		expect(result).toEqual([
			{ id: 3, admin: false },
		]);

		await db.execute(sql`drop table users`);
	});

	test.concurrent('$count separate with filters', async ({ db }) => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable, gt(countTestTable.id, 1));

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual(3);
	});

	test.concurrent('$count embedded with filters', async ({ db }) => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.select({
			count: db.$count(countTestTable, gt(countTestTable.id, 1)),
		}).from(countTestTable);

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual([
			{ count: 3 },
			{ count: 3 },
			{ count: 3 },
			{ count: 3 },
		]);
	});
	test.concurrent('update with limit and order by', async ({ db }) => {
		await db.insert(usersTable).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db.update(usersTable).set({ verified: true }).limit(2).orderBy(asc(usersTable.name));

		const result = await db.select({ name: usersTable.name, verified: usersTable.verified }).from(usersTable).orderBy(
			asc(usersTable.name),
		);
		expect(result).toStrictEqual([
			{ name: 'Alan', verified: true },
			{ name: 'Barry', verified: true },
			{ name: 'Carl', verified: false },
		]);
	});

	test.concurrent('delete with limit and order by', async ({ db }) => {
		await db.insert(usersTable).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db.delete(usersTable).where(eq(usersTable.verified, false)).limit(1).orderBy(asc(usersTable.name));

		const result = await db.select({ name: usersTable.name, verified: usersTable.verified }).from(usersTable).orderBy(
			asc(usersTable.name),
		);
		expect(result).toStrictEqual([
			{ name: 'Barry', verified: false },
			{ name: 'Carl', verified: false },
		]);
	});
}
