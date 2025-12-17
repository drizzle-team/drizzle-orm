/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { and, asc, eq, getTableColumns, gt, isNull, Name, sql } from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	datetime,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
	timestamp,
	unique,
	varchar,
} from 'drizzle-orm/mysql-core';
import { expect } from 'vitest';
import type { Test } from './instrumentation';
import { createUsersOnUpdateTable, createUserTable, usersMigratorTable } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('insert+update+delete returning sql', async ({ db, push }) => {
		const users = createUserTable('users_85');
		await push({ users });

		const res0 = await db.insert(users).values({ name: 'John' });
		const res1 = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));
		const res2 = await db.delete(users).where(eq(users.name, 'Jane'));

		const insertId = res0.insertId ? Number(res0.insertId) : res0[0].insertId;
		const changedRows = res1.rowsAffected ?? res1[0].changedRows;
		const affectedRows = res2.rowsAffected ?? res2[0].affectedRows;

		expect(insertId).toBe(1);
		expect(changedRows).toBe(1);
		expect(affectedRows).toBe(1);
	});

	test.concurrent('update with returning all fields + partial', async ({ db, push }) => {
		const users = createUserTable('users_86');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const updatedUsers = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'));

		const result = await db.select().from(users).where(eq(users.id, 1));

		const countRows = updatedUsers[0]?.changedRows ?? updatedUsers.rowsAffected;
		expect(countRows).toBe(1);
		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'Jane',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
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

		expect(result).toStrictEqual([{ id: 1, name: 'Jane' }]);
	});

	test.concurrent('delete with returning all fields', async ({ db, push }) => {
		const users = createUserTable('users_88');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const deletedUser = await db.delete(users).where(eq(users.name, 'John'));

		expect(deletedUser[0].affectedRows).toBe(1);
	});

	test.concurrent('delete with returning partial', async ({ db, push }) => {
		const users = createUserTable('users_89');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const deletedUser = await db.delete(users).where(eq(users.name, 'John'));

		expect(deletedUser[0].affectedRows).toBe(1);
	});

	test.concurrent('insert + select', async ({ db, push }) => {
		const users = createUserTable('users_90');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const result = await db.select().from(users);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);

		await db.insert(users).values({ name: 'Jane' });
		const result2 = await db.select().from(users);
		expect(result2).toStrictEqual([
			{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
			{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
		]);
	});

	test.concurrent('json insert', async ({ db, push }) => {
		const users = createUserTable('users_91');
		await push({ users });

		await db.insert(users).values({ name: 'John', jsonb: ['foo', 'bar'] });
		const result = await db.select({
			id: users.id,
			name: users.name,
			jsonb: users.jsonb,
		}).from(users);

		expect(result).toStrictEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
	});

	test.concurrent('insert with overridden default values', async ({ db, push }) => {
		const users = createUserTable('users_92');
		await push({ users });

		await db.insert(users).values({ name: 'John', verified: true });
		const result = await db.select().from(users);

		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: true,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
	});

	test.concurrent('insert many', async ({ db, push }) => {
		const users = createUserTable('users_93');
		await push({ users });

		await db.insert(users).values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);
		const result = await db.select({
			id: users.id,
			name: users.name,
			jsonb: users.jsonb,
			verified: users.verified,
		}).from(users);

		expect(result).toStrictEqual([
			{ id: 1, name: 'John', jsonb: null, verified: false },
			{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
			{ id: 3, name: 'Jane', jsonb: null, verified: false },
			{ id: 4, name: 'Austin', jsonb: null, verified: true },
		]);
	});

	test.concurrent('insert many with returning', async ({ db, push }) => {
		const users = createUserTable('users_94');
		await push({ users });

		const result = await db.insert(users).values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);

		expect(result[0].affectedRows).toBe(4);
	});
	test.concurrent('$default function', async ({ db, push }) => {
		const orders = mysqlTable('orders', {
			id: serial('id').primaryKey(),
			region: text('region').notNull(),
			product: text('product').notNull().$default(() => 'random_string'),
			amount: int('amount').notNull(),
			quantity: int('quantity').notNull(),
		});
		await push({ orders });

		await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
		const selectedOrder = await db.select().from(orders);

		expect(selectedOrder).toStrictEqual([{
			id: 1,
			amount: 1,
			quantity: 1,
			region: 'Ukraine',
			product: 'random_string',
		}]);
	});

	test.concurrent('$default with empty array', async ({ db, push }) => {
		const sOrders = mysqlTable('s_orders', {
			id: serial('id').primaryKey(),
			region: text('region').default('Ukraine'),
			product: text('product').$defaultFn(() => 'random_string'),
		});
		await push({ sOrders });

		await db.insert(sOrders).values({});
		const selectedOrder = await db.select().from(sOrders);

		expect(selectedOrder).toStrictEqual([{
			id: 1,
			region: 'Ukraine',
			product: 'random_string',
		}]);
	});

	// here

	test.concurrent('Insert all defaults in 1 row', async ({ db, push }) => {
		const users = mysqlTable('empty_insert_single_97', {
			id: serial('id').primaryKey(),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		await push({ users });

		await db.insert(users).values({});

		const res = await db.select().from(users);

		expect(res).toStrictEqual([{ id: 1, name: 'Dan', state: null }]);
	});

	test.concurrent('Insert all defaults in multiple rows', async ({ db, push }) => {
		const users = mysqlTable('empty_insert_multiple_97', {
			id: serial('id').primaryKey(),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		await push({ users });

		await db.insert(users).values([{}, {}]);

		const res = await db.select().from(users);

		expect(res).toStrictEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
	});

	test.concurrent('insert with onDuplicate', async ({ db, push }) => {
		const users = createUserTable('users_98');
		await push({ users });

		await db.insert(users)
			.values({ name: 'John' });

		await db.insert(users)
			.values({ id: 1, name: 'John' })
			.onDuplicateKeyUpdate({ set: { name: 'John1' } });

		const res = await db.select({ id: users.id, name: users.name }).from(users).where(
			eq(users.id, 1),
		);

		expect(res).toStrictEqual([{ id: 1, name: 'John1' }]);
	});

	test.concurrent('insert conflict', async ({ db, push }) => {
		const users = createUserTable('users_99');
		await push({ users });

		await db.insert(users)
			.values({ name: 'John' });

		await expect((async () => {
			await db.insert(users).values({ id: 1, name: 'John1' });
		})()).rejects.toThrowError();
	});

	test.concurrent('insert conflict with ignore', async ({ db, push }) => {
		const users = createUserTable('users_100');
		await push({ users });

		await db.insert(users)
			.values({ name: 'John' });

		await db.insert(users)
			.ignore()
			.values({ id: 1, name: 'John1' });

		const res = await db.select({ id: users.id, name: users.name }).from(users).where(
			eq(users.id, 1),
		);

		expect(res).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('insert sql', async ({ db, push }) => {
		const users = createUserTable('users_101');
		await push({ users });

		await db.insert(users).values({ name: sql`${'John'}` });
		const result = await db.select({ id: users.id, name: users.name }).from(users);
		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('full join with alias', async ({ db, push }) => {
		const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);
		const users = mysqlTable('users_102', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });

		const customers = alias(users, 'customer');

		await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
		const result = await db
			.select().from(users)
			.leftJoin(customers, eq(customers.id, 11))
			.where(eq(users.id, 10));

		expect(result).toStrictEqual([{
			users_102: {
				id: 10,
				name: 'Ivan',
			},
			customer: {
				id: 11,
				name: 'Hans',
			},
		}]);
	});

	test.concurrent('select from alias', async ({ db, push }) => {
		const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);

		const users = mysqlTable('users_103', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });

		const user = alias(users, 'user');
		const customers = alias(users, 'customer');

		await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
		const result = await db
			.select()
			.from(user)
			.leftJoin(customers, eq(customers.id, 11))
			.where(eq(user.id, 10));

		expect(result).toStrictEqual([{
			user: {
				id: 10,
				name: 'Ivan',
			},
			customer: {
				id: 11,
				name: 'Hans',
			},
		}]);
	});

	test.concurrent('insert with spaces', async ({ db, push }) => {
		const users = createUserTable('users_104');
		await push({ users });

		await db.insert(users).values({ name: sql`'Jo   h     n'` });
		const result = await db.select({ id: users.id, name: users.name }).from(users);

		expect(result).toStrictEqual([{ id: 1, name: 'Jo   h     n' }]);
	});

	test.concurrent('insert: placeholders on columns with encoder', async ({ db, push }) => {
		const users = createUserTable('users_105');
		await push({ users });

		const date = new Date('2024-08-07T15:30:00Z');

		const statement = db.insert(users).values({
			name: 'John',
			createdAt: sql.placeholder('createdAt'),
		}).prepare();

		await statement.execute({ createdAt: date });

		const result = await db
			.select({
				id: users.id,
				createdAt: users.createdAt,
			})
			.from(users);

		expect(result).toStrictEqual([
			{ id: 1, createdAt: date },
		]);
	});

	test.concurrent('prepared statement reuse', async ({ db, push }) => {
		const users = createUserTable('users_106');
		await push({ users });

		const stmt = db.insert(users).values({
			verified: true,
			name: sql.placeholder('name'),
		}).prepare();

		for (let i = 0; i < 10; i++) {
			await stmt.execute({ name: `John ${i}` });
		}

		const result = await db.select({
			id: users.id,
			name: users.name,
			verified: users.verified,
		}).from(users);

		expect(result).toStrictEqual([
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

	test.concurrent('insert via db.execute + select via db.execute', async ({ db, push }) => {
		const users = createUserTable('users_108');
		await push({ users });

		await db.execute(sql`insert into ${users} (${new Name(users.name.name)}) values (${'John'})`);

		const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${users}`);
		expect(result[0]).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('insert via db.execute w/ query builder', async ({ db, push }) => {
		const users = createUserTable('users_109');
		await push({ users });

		const inserted = await db.execute(
			db.insert(users).values({ name: 'John' }),
		);
		expect(inserted[0].affectedRows).toBe(1);
	});

	test.concurrent('Mysql enum as ts enum', async ({ db, push }) => {
		enum Test {
			a = 'a',
			b = 'b',
			c = 'c',
		}

		const tableWithTsEnums = mysqlTable('enums_test_case_109', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', Test).notNull(),
			enum2: mysqlEnum('enum2', Test).default(Test.a),
			enum3: mysqlEnum('enum3', Test).notNull().default(Test.b),
		});

		await push({ tableWithTsEnums });

		await db.insert(tableWithTsEnums).values([
			{ id: 1, enum1: Test.a, enum2: Test.b, enum3: Test.c },
			{ id: 2, enum1: Test.a, enum3: Test.c },
			{ id: 3, enum1: Test.a },
		]);

		const res = await db.select().from(tableWithTsEnums);

		expect(res).toStrictEqual([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
		]);
	});
	test.concurrent('test $onUpdateFn and $onUpdate works as $default', async ({ db, push }) => {
		const usersOnUpdate = createUsersOnUpdateTable('users_on_update_1');
		await push({ usersOnUpdate });

		await db.insert(usersOnUpdate).values([
			{ name: 'John' },
			{ name: 'Jane' },
			{ name: 'Jack' },
			{ name: 'Jill' },
		]);
		const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

		const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

		const response = await db.select({ ...rest }).from(usersOnUpdate);

		expect(response).toStrictEqual([
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

	test.concurrent('test $onUpdateFn and $onUpdate works updating', async ({ db, push }) => {
		const usersOnUpdate = createUsersOnUpdateTable('users_on_update_2');
		await push({ usersOnUpdate });

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

		expect(response).toStrictEqual([
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

	test.concurrent('Object keys as column names', async ({ db, push }) => {
		// Tests the following:
		// Column with required config
		// Column with optional config without providing a value
		// Column with optional config providing a value
		// Column without config
		const users = mysqlTable('users_114', {
			id: bigint({ mode: 'number' }).autoincrement().primaryKey(),
			createdAt: timestamp(),
			updatedAt: timestamp({ fsp: 3 }),
			admin: boolean(),
		});

		await push({ users });

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

		expect(result).toStrictEqual([
			{ id: 3, admin: false },
		]);
	});

	test.concurrent('update with limit and order by', async ({ db, push }) => {
		const users = createUserTable('users_112');
		await push({ users });

		await db.insert(users).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db.update(users).set({ verified: true }).limit(2).orderBy(asc(users.name));

		const result = await db.select({ name: users.name, verified: users.verified }).from(users).orderBy(
			asc(users.name),
		);
		expect(result).toStrictEqual([
			{ name: 'Alan', verified: true },
			{ name: 'Barry', verified: true },
			{ name: 'Carl', verified: false },
		]);
	});

	test.concurrent('delete with limit and order by', async ({ db, push }) => {
		const users = createUserTable('users_113');
		await push({ users });

		await db.insert(users).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db.delete(users).where(eq(users.verified, false)).limit(1).orderBy(asc(users.name));

		const result = await db.select({ name: users.name, verified: users.verified }).from(users).orderBy(
			asc(users.name),
		);
		expect(result).toStrictEqual([
			{ name: 'Barry', verified: false },
			{ name: 'Carl', verified: false },
		]);
	});

	test.concurrent('column.as', async ({ db, push }) => {
		const users = mysqlTable('users_column_as', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').references(() => cities.id),
		});

		const cities = mysqlTable('cities_column_as', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		});

		const ucView = mysqlView('cities_users_column_as_view').as((qb) =>
			qb.select({
				userId: users.id.as('user_id'),
				cityId: cities.id.as('city_id'),
				userName: users.name.as('user_name'),
				cityName: cities.name.as('city_name'),
			}).from(users).leftJoin(cities, eq(cities.id, users.cityId))
		);

		await push({ users, cities, ucView });

		try {
			await db.insert(cities).values([{
				id: 1,
				name: 'Firstistan',
			}, {
				id: 2,
				name: 'Secondaria',
			}]);

			await db.insert(users).values([{ id: 1, name: 'First', cityId: 1 }, {
				id: 2,
				name: 'Second',
				cityId: 2,
			}, {
				id: 3,
				name: 'Third',
			}]);

			const joinSelectReturn = await db.select({
				userId: users.id.as('user_id'),
				cityId: cities.id.as('city_id'),
				userName: users.name.as('user_name'),
				cityName: cities.name.as('city_name'),
			}).from(users).leftJoin(cities, eq(cities.id, users.cityId));

			expect(joinSelectReturn).toStrictEqual(expect.arrayContaining([{
				userId: 1,
				userName: 'First',
				cityId: 1,
				cityName: 'Firstistan',
			}, {
				userId: 2,
				userName: 'Second',
				cityId: 2,
				cityName: 'Secondaria',
			}, {
				userId: 3,
				userName: 'Third',
				cityId: null,
				cityName: null,
			}]));

			const viewSelectReturn = await db.select().from(ucView);

			expect(viewSelectReturn).toStrictEqual(expect.arrayContaining([{
				userId: 1,
				userName: 'First',
				cityId: 1,
				cityName: 'Firstistan',
			}, {
				userId: 2,
				userName: 'Second',
				cityId: 2,
				cityName: 'Secondaria',
			}, {
				userId: 3,
				userName: 'Third',
				cityId: null,
				cityName: null,
			}]));

			const viewJoinReturn = await db.select({
				userId: ucView.userId.as('user_id_ucv'),
				cityId: cities.id.as('city_id'),
				userName: ucView.userName.as('user_name_ucv'),
				cityName: cities.name.as('city_name'),
			}).from(ucView).leftJoin(cities, eq(cities.id, ucView.cityId));

			expect(viewJoinReturn).toStrictEqual(expect.arrayContaining([{
				userId: 1,
				userName: 'First',
				cityId: 1,
				cityName: 'Firstistan',
			}, {
				userId: 2,
				userName: 'Second',
				cityId: 2,
				cityName: 'Secondaria',
			}, {
				userId: 3,
				userName: 'Third',
				cityId: null,
				cityName: null,
			}]));
		} finally {
			await db.execute(sql`DROP TABLE ${users}`).catch(() => null);
			await db.execute(sql`DROP TABLE ${cities}`).catch(() => null);
			await db.execute(sql`DROP VIEW ${ucView}`).catch(() => null);
		}
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/4878
	test.concurrent('.where with isNull in it', async ({ db, push }) => {
		const table = mysqlTable('table_where_is_null', {
			col1: boolean(),
			col2: text(),
		});

		await push({ table });
		await db.insert(table).values([{ col1: true }, { col1: false, col2: 'qwerty' }]);

		const query = db.select().from(table).where(eq(table.col1, isNull(table.col2)));
		expect(query.toSQL()).toStrictEqual({
			sql:
				'select `col1`, `col2` from `table_where_is_null` where `table_where_is_null`.`col1` = (`table_where_is_null`.`col2` is null)',
			params: [],
		});
		const res = await query;
		expect(res).toStrictEqual([{ col1: true, col2: null }, { col1: false, col2: 'qwerty' }]);
	});

	test.concurrent('select + extra index params', async ({ db, push }) => {
		const users = mysqlTable('index_test', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 15 }).notNull(),
			age: int('age').notNull(),
			time: int('time').notNull(),
		}, () => [idx, idx2, unq]);
		const idx = index('name_index').on(users.name);
		const idx2 = index('age_index2').on(users.age);
		const unq = unique('time_unq').on(users.time);

		expect(db.select().from(users, { useIndex: [idx] }).toSQL().sql).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` USE INDEX (`name_index`)',
		);
		expect(db.select().from(users, { forceIndex: [idx] }).toSQL().sql).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` FORCE INDEX (`name_index`)',
		);
		expect(db.select().from(users, { ignoreIndex: [idx] }).toSQL().sql).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` IGNORE INDEX (`name_index`)',
		);
		expect(db.select().from(users, { ignoreIndex: [unq] }).toSQL().sql).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` IGNORE INDEX (`time_unq`)',
		);

		await push({ users });

		try {
			await db.insert(users).values([{ id: 1, name: 'hello1', age: 1, time: 1 }, {
				id: 2,
				name: 'hello2',
				age: 2,
				time: 2,
			}]);

			const res1 = await db.select().from(users, { forceIndex: idx });
			const res2 = await db.select().from(users, { ignoreIndex: idx });
			const res3 = await db.select().from(users, { useIndex: idx });
			const res4 = await db.select().from(users, { forceIndex: idx, ignoreIndex: idx2 });
			const res5 = await db.select().from(users, { useIndex: unq, ignoreIndex: unq });

			const result = [{
				age: 1,
				id: 1,
				name: 'hello1',
				time: 1,
			}, {
				age: 2,
				id: 2,
				name: 'hello2',
				time: 2,
			}];
			expect(res1).toStrictEqual(result);
			expect(res2).toStrictEqual(result);
			expect(res3).toStrictEqual(result);
			expect(res4).toStrictEqual(result);
			expect(res5).toStrictEqual(result);
		} finally {
			await db.execute(sql`DROP TABLE ${users}`).catch(() => null);
		}
	});

	test.concurrent('placeholder + sql dates', async ({ db, push }) => {
		const dateTable = mysqlTable('dates_placeholder_test', (t) => ({
			id: t.int('id').primaryKey().notNull(),
			date: t.datetime('date', { mode: 'date' }).notNull(),
			dateStr: t.datetime('date_str', { mode: 'string' }).notNull(),
			timestamp: t.timestamp('timestamp', { mode: 'date' }).notNull(),
			timestampStr: t.timestamp('timestamp_str', { mode: 'string' }).notNull(),
		}));

		await db.execute(sql`DROP TABLE IF EXISTS ${dateTable};`);
		await push({ dateTable });

		const date = new Date('2025-12-10T01:01:01.000Z');
		const timestamp = new Date('2025-12-10T01:01:01.000Z');
		const dateStr = date.toISOString().slice(0, -5).replace('T', ' ');
		const timestampStr = timestamp.toISOString().slice(0, -5).replace('T', ' ');

		await db.insert(dateTable).values([{
			id: 1,
			date: date,
			dateStr: dateStr,
			timestamp: timestamp,
			timestampStr: timestampStr,
		}, {
			id: 2,
			date: sql.placeholder('dateAsDate'),
			dateStr: sql.placeholder('dateStrAsDate'),
			timestamp: sql.placeholder('timestampAsDate'),
			timestampStr: sql.placeholder('timestampStrAsDate'),
		}, {
			id: 3,
			date: sql.placeholder('dateAsString'),
			dateStr: sql.placeholder('dateStrAsString'),
			timestamp: sql.placeholder('timestampAsString'),
			timestampStr: sql.placeholder('timestampStrAsString'),
		}, {
			id: 4,
			date: sql`${dateStr}`,
			dateStr: sql`${dateStr}`,
			timestamp: sql`${timestampStr}`,
			timestampStr: sql`${timestampStr}`,
		}]).execute({
			dateAsDate: date,
			dateAsString: dateStr,
			dateStrAsDate: date,
			dateStrAsString: dateStr,
			timestampAsDate: timestamp,
			timestampAsString: timestampStr,
			timestampStrAsDate: timestamp,
			timestampStrAsString: timestampStr,
		});

		const initial = await db.select().from(dateTable).orderBy(dateTable.id);

		await db.update(dateTable).set({
			date: sql`${dateStr}`,
			dateStr: sql`${dateStr}`,
			timestamp: sql`${timestampStr}`,
			timestampStr: sql`${timestampStr}`,
		});

		const updated = await db.select().from(dateTable).orderBy(dateTable.id);

		expect(initial).toStrictEqual([{
			id: 1,
			date,
			dateStr,
			timestamp,
			timestampStr,
		}, {
			id: 2,
			date,
			dateStr,
			timestamp,
			timestampStr,
		}, {
			id: 3,
			date,
			dateStr,
			timestamp,
			timestampStr,
		}, {
			id: 4,
			date,
			dateStr,
			timestamp,
			timestampStr,
		}]);

		expect(updated).toStrictEqual(initial);
	});
}
