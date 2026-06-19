/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import {
	and,
	asc,
	DrizzleQueryError,
	eq,
	getColumns,
	getTableColumns,
	gt,
	inArray,
	is,
	isNull,
	make$ReturningResponseMapper,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
	max,
	Name,
	sql,
} from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	customType,
	datetime,
	index,
	int,
	MySqlAsyncSession,
	MySqlDialect,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
	timestamp,
	unionAll,
	unique,
	varchar,
} from 'drizzle-orm/mysql-core';
import { TiDBServerlessDatabase } from 'drizzle-orm/tidb-serverless';
import { expect } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { Test } from './instrumentation';
import { allTypesCodecsTable, createUsersOnUpdateTable, createUserTable, usersMigratorTable } from './schema2';
import { normalizeDataWithDbCodecs } from './utils';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent(
		'insert+update+delete returning sql',
		async ({ db, push }) => {
			const users = createUserTable('users_85');
			await push({ users });

			const res0 = await db.insert(users).values({ name: 'John' });
			const res1 = await db
				.update(users)
				.set({ name: 'Jane' })
				.where(eq(users.name, 'John'));
			const res2 = await db.delete(users).where(eq(users.name, 'Jane'));

			const insertId = res0.insertId ? Number(res0.insertId) : res0[0].insertId;
			const changedRows = res1.rowsAffected ?? res1[0].changedRows;
			const affectedRows = res2.rowsAffected ?? res2[0].affectedRows;

			expect(insertId).toBe(1);
			expect(changedRows).toBe(1);
			expect(affectedRows).toBe(1);
		},
	);

	test.concurrent(
		'update with returning all fields + partial',
		async ({ db, push }) => {
			const users = createUserTable('users_86');
			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const updatedUsers = await db
				.update(users)
				.set({ name: 'Jane' })
				.where(eq(users.name, 'John'));

			const result = await db.select().from(users).where(eq(users.id, 1));

			const countRows = updatedUsers[0]?.changedRows ?? updatedUsers.rowsAffected;
			expect(countRows).toBe(1);
			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
			expect(result).toStrictEqual([
				{
					id: 1,
					name: 'Jane',
					verified: false,
					jsonb: null,
					createdAt: result[0]!.createdAt,
				},
			]);
		},
	);

	test.concurrent('update with returning partial', async ({ db, push }) => {
		const users = createUserTable('users_87');
		await push({ users });

		await db.insert(users).values({ name: 'John' });
		const updatedUsers = await db
			.update(users)
			.set({ name: 'Jane' })
			.where(eq(users.name, 'John'));

		const result = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.id, 1));

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
		expect(result).toStrictEqual([
			{
				id: 1,
				name: 'John',
				verified: false,
				jsonb: null,
				createdAt: result[0]!.createdAt,
			},
		]);

		await db.insert(users).values({ name: 'Jane' });
		const result2 = await db.select().from(users);
		expect(result2).toStrictEqual([
			{
				id: 1,
				name: 'John',
				verified: false,
				jsonb: null,
				createdAt: result2[0]!.createdAt,
			},
			{
				id: 2,
				name: 'Jane',
				verified: false,
				jsonb: null,
				createdAt: result2[1]!.createdAt,
			},
		]);
	});

	test.concurrent('json insert', async ({ db, push }) => {
		const users = createUserTable('users_91');
		await push({ users });

		await db.insert(users).values({ name: 'John', jsonb: ['foo', 'bar'] });
		const result = await db
			.select({
				id: users.id,
				name: users.name,
				jsonb: users.jsonb,
			})
			.from(users);

		expect(result).toStrictEqual([
			{ id: 1, name: 'John', jsonb: ['foo', 'bar'] },
		]);
	});

	test.concurrent(
		'insert with overridden default values',
		async ({ db, push }) => {
			const users = createUserTable('users_92');
			await push({ users });

			await db.insert(users).values({ name: 'John', verified: true });
			const result = await db.select().from(users);

			expect(result).toStrictEqual([
				{
					id: 1,
					name: 'John',
					verified: true,
					jsonb: null,
					createdAt: result[0]!.createdAt,
				},
			]);
		},
	);

	test.concurrent('insert many', async ({ db, push }) => {
		const users = createUserTable('users_93');
		await push({ users });

		await db
			.insert(users)
			.values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);
		const result = await db
			.select({
				id: users.id,
				name: users.name,
				jsonb: users.jsonb,
				verified: users.verified,
			})
			.from(users);

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

		const result = await db
			.insert(users)
			.values([
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
			product: text('product')
				.notNull()
				.$default(() => 'random_string'),
			amount: int('amount').notNull(),
			quantity: int('quantity').notNull(),
		});
		await push({ orders });

		await db
			.insert(orders)
			.values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
		const selectedOrder = await db.select().from(orders);

		expect(selectedOrder).toStrictEqual([
			{
				id: 1,
				amount: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			},
		]);
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

		expect(selectedOrder).toStrictEqual([
			{
				id: 1,
				region: 'Ukraine',
				product: 'random_string',
			},
		]);
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

	test.concurrent(
		'Insert all defaults in multiple rows',
		async ({ db, push }) => {
			const users = mysqlTable('empty_insert_multiple_97', {
				id: serial('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await push({ users });

			await db.insert(users).values([{}, {}]);

			const res = await db.select().from(users);

			expect(res).toStrictEqual([
				{ id: 1, name: 'Dan', state: null },
				{ id: 2, name: 'Dan', state: null },
			]);
		},
	);

	test.concurrent('insert with onDuplicate', async ({ db, push }) => {
		const users = createUserTable('users_98');
		await push({ users });

		await db.insert(users).values({ name: 'John' });

		await db
			.insert(users)
			.values({ id: 1, name: 'John' })
			.onDuplicateKeyUpdate({ set: { name: 'John1' } });

		const res = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.id, 1));

		expect(res).toStrictEqual([{ id: 1, name: 'John1' }]);
	});

	test.concurrent(
		'insert with onDuplicate placeholder',
		async ({ db, push }) => {
			const users = createUserTable('users_98_p');
			await push({ users });

			await db.insert(users).values({ name: 'John' });

			await db
				.insert(users)
				.values({ id: 1, name: 'John' })
				.onDuplicateKeyUpdate({ set: { name: sql.placeholder('name') } })
				.execute({ name: 'John1' });

			const res = await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(eq(users.id, 1));

			expect(res).toStrictEqual([{ id: 1, name: 'John1' }]);
		},
	);

	test.concurrent('insert conflict', async ({ db, push }) => {
		const users = createUserTable('users_99');
		await push({ users });

		await db.insert(users).values({ name: 'John' });

		await expect(
			(async () => {
				await db.insert(users).values({ id: 1, name: 'John1' });
			})(),
		).rejects.toThrowError();
	});

	test.concurrent('insert conflict with ignore', async ({ db, push }) => {
		const users = createUserTable('users_100');
		await push({ users });

		await db.insert(users).values({ name: 'John' });

		await db.insert(users).ignore().values({ id: 1, name: 'John1' });

		const res = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.id, 1));

		expect(res).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('insert sql', async ({ db, push }) => {
		const users = createUserTable('users_101');
		await push({ users });

		await db.insert(users).values({ name: sql`${'John'}` });
		const result = await db
			.select({ id: users.id, name: users.name })
			.from(users);
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

		await db.insert(users).values([
			{ id: 10, name: 'Ivan' },
			{ id: 11, name: 'Hans' },
		]);
		const result = await db
			.select()
			.from(users)
			.leftJoin(customers, eq(customers.id, 11))
			.where(eq(users.id, 10));

		expect(result).toStrictEqual([
			{
				users_102: {
					id: 10,
					name: 'Ivan',
				},
				customer: {
					id: 11,
					name: 'Hans',
				},
			},
		]);
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

		await db.insert(users).values([
			{ id: 10, name: 'Ivan' },
			{ id: 11, name: 'Hans' },
		]);
		const result = await db
			.select()
			.from(user)
			.leftJoin(customers, eq(customers.id, 11))
			.where(eq(user.id, 10));

		expect(result).toStrictEqual([
			{
				user: {
					id: 10,
					name: 'Ivan',
				},
				customer: {
					id: 11,
					name: 'Hans',
				},
			},
		]);
	});

	test.concurrent('insert with spaces', async ({ db, push }) => {
		const users = createUserTable('users_104');
		await push({ users });

		await db.insert(users).values({ name: sql`'Jo   h     n'` });
		const result = await db
			.select({ id: users.id, name: users.name })
			.from(users);

		expect(result).toStrictEqual([{ id: 1, name: 'Jo   h     n' }]);
	});

	test.concurrent(
		'insert: placeholders on columns with encoder',
		async ({ db, push }) => {
			const users = createUserTable('users_105');
			await push({ users });

			const date = new Date('2024-08-07T15:30:00Z');

			const statement = db
				.insert(users)
				.values({
					name: 'John',
					createdAt: sql.placeholder('createdAt'),
				})
				.prepare();

			await statement.execute({ createdAt: date });

			const result = await db
				.select({
					id: users.id,
					createdAt: users.createdAt,
				})
				.from(users);

			expect(result).toStrictEqual([{ id: 1, createdAt: date }]);
		},
	);

	test.concurrent('prepared statement reuse', async ({ db, push }) => {
		const users = createUserTable('users_106');
		await push({ users });

		const stmt = db
			.insert(users)
			.values({
				verified: true,
				name: sql.placeholder('name'),
			})
			.prepare();

		for (let i = 0; i < 10; i++) {
			await stmt.execute({ name: `John ${i}` });
		}

		const result = await db
			.select({
				id: users.id,
				name: users.name,
				verified: users.verified,
			})
			.from(users);

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

	// https://github.com/drizzle-team/drizzle-orm/issues/1415
	test.skipIf(Date.now() < +new Date('2026-06-24')).concurrent(
		'prepared statement sql.placeholder in .inArray',
		async ({ db, push }) => {
			const users = createUserTable('users_116');
			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'John1' }]);
			// TODO: it seems to me that prepared shouldn't be of type any
			const prepared = db.select({ name: users.name }).from(users).where(
				inArray(users.name, sql.placeholder('names')),
			).prepare();

			const result = await prepared.execute({ names: ['John', 'John1'] });
			expect(result).toStrictEqual([{ name: 'John' }, { name: 'John1' }]);
		},
	);

	// https://github.com/drizzle-team/drizzle-orm/issues/1415
	test
		.skipIf(Date.now() < +new Date('2026-06-24'))
		.concurrent(
			'prepared statement sql.placeholder in .inArray #2',
			async ({ db, push, seed }) => {
				const users = createUserTable('users_116_2');
				await push({ users });

				await db.insert(users).values([{ name: 'John' }, { name: 'John1' }]);
				// TODO: it seems to me that prepared shouldn't be of type any
				const prepared = db
					.select({ name: users.name })
					.from(users)
					.where(inArray(users.name, sql.placeholder('names')))
					.prepare();

				const result = await prepared.execute({ names: ['John', 'John1'] });
				expect(result).toStrictEqual([{ name: 'John' }, { name: 'John1' }]);
			},
		);

	test.concurrent(
		'insert via db.execute + select via db.execute',
		async ({ db, push }) => {
			const users = createUserTable('users_108');
			await push({ users });

			await db.execute(
				sql`insert into ${users} (${new Name(users.name.name)}) values (${'John'})`,
			);

			const result = await db.execute<{ id: number; name: string }>(
				sql`select id, name from ${users}`,
			);
			expect(result[0]).toStrictEqual([{ id: 1, name: 'John' }]);
		},
	);

	test.concurrent(
		'insert via db.execute w/ query builder',
		async ({ db, push }) => {
			const users = createUserTable('users_109');
			await push({ users });

			const inserted = await db.execute(
				db.insert(users).values({ name: 'John' }),
			);
			expect(inserted[0].affectedRows).toBe(1);
		},
	);

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
	test.concurrent(
		'test $onUpdateFn and $onUpdate works as $default',
		async ({ db, push }) => {
			const usersOnUpdate = createUsersOnUpdateTable('users_on_update_1');
			await push({ usersOnUpdate });

			await db
				.insert(usersOnUpdate)
				.values([
					{ name: 'John' },
					{ name: 'Jane' },
					{ name: 'Jack' },
					{ name: 'Jill' },
				]);
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

			const response = await db.select({ ...rest }).from(usersOnUpdate);

			expect(response).toStrictEqual([
				{
					name: 'John',
					id: 1,
					updateCounter: 1,
					uppercaseName: 'JOHN',
					alwaysNull: null,
				},
				{
					name: 'Jane',
					id: 2,
					updateCounter: 1,
					uppercaseName: 'JANE',
					alwaysNull: null,
				},
				{
					name: 'Jack',
					id: 3,
					updateCounter: 1,
					uppercaseName: 'JACK',
					alwaysNull: null,
				},
				{
					name: 'Jill',
					id: 4,
					updateCounter: 1,
					uppercaseName: 'JILL',
					alwaysNull: null,
				},
			]);
			const msDelay = 750;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(
					Date.now() - msDelay,
				);
			}
		},
	);

	test.concurrent(
		'test $onUpdateFn and $onUpdate works updating',
		async ({ db, push }) => {
			const usersOnUpdate = createUsersOnUpdateTable('users_on_update_2');
			await push({ usersOnUpdate });

			await db
				.insert(usersOnUpdate)
				.values([
					{ name: 'John', alwaysNull: 'this will will be null after updating' },
					{ name: 'Jane' },
					{ name: 'Jack' },
					{ name: 'Jill' },
				]);
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
			const initial = await db.select({ updatedAt }).from(usersOnUpdate);

			await db
				.update(usersOnUpdate)
				.set({ name: 'Angel', uppercaseName: null })
				.where(eq(usersOnUpdate.id, 1));

			const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

			const response = await db.select({ ...rest }).from(usersOnUpdate);

			expect(response).toStrictEqual([
				{
					name: 'Angel',
					id: 1,
					updateCounter: 2,
					uppercaseName: null,
					alwaysNull: null,
				},
				{
					name: 'Jane',
					id: 2,
					updateCounter: 1,
					uppercaseName: 'JANE',
					alwaysNull: null,
				},
				{
					name: 'Jack',
					id: 3,
					updateCounter: 1,
					uppercaseName: 'JACK',
					alwaysNull: null,
				},
				{
					name: 'Jill',
					id: 4,
					updateCounter: 1,
					uppercaseName: 'JILL',
					alwaysNull: null,
				},
			]);
			const msDelay = 750;

			expect(initial[0]?.updatedAt?.valueOf()).not.toBe(
				justDates[0]?.updatedAt?.valueOf(),
			);

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(
					Date.now() - msDelay,
				);
			}
		},
	);

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
			{
				createdAt: sql`now() - interval 30 day`,
				updatedAt: sql`now() - interval 1 day`,
				admin: true,
			},
			{
				createdAt: sql`now() - interval 1 day`,
				updatedAt: sql`now() - interval 30 day`,
				admin: true,
			},
			{
				createdAt: sql`now() - interval 1 day`,
				updatedAt: sql`now() - interval 1 day`,
				admin: false,
			},
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

		expect(result).toStrictEqual([{ id: 3, admin: false }]);
	});

	test.concurrent('update with limit and order by', async ({ db, push }) => {
		const users = createUserTable('users_112');
		await push({ users });

		await db.insert(users).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db
			.update(users)
			.set({ verified: true })
			.limit(2)
			.orderBy(asc(users.name));

		const result = await db
			.select({ name: users.name, verified: users.verified })
			.from(users)
			.orderBy(asc(users.name));
		expect(result).toStrictEqual([
			{ name: 'Alan', verified: true },
			{ name: 'Barry', verified: true },
			{ name: 'Carl', verified: false },
		]);
	});

	test.concurrent('update with placeholder', async ({ db, push }) => {
		const users = createUserTable('users_112_p');
		await push({ users });

		await db.insert(users).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db
			.update(users)
			.set({ verified: sql.placeholder('verified') })
			.execute({
				verified: true,
			});

		const result = await db
			.select({ name: users.name, verified: users.verified })
			.from(users)
			.orderBy(asc(users.name));
		expect(result).toStrictEqual([
			{ name: 'Alan', verified: true },
			{ name: 'Barry', verified: true },
			{ name: 'Carl', verified: true },
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

		await db
			.delete(users)
			.where(eq(users.verified, false))
			.limit(1)
			.orderBy(asc(users.name));

		const result = await db
			.select({ name: users.name, verified: users.verified })
			.from(users)
			.orderBy(asc(users.name));
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
			qb
				.select({
					userId: users.id.as('user_id'),
					cityId: cities.id.as('city_id'),
					userName: users.name.as('user_name'),
					cityName: cities.name.as('city_name'),
				})
				.from(users)
				.leftJoin(cities, eq(cities.id, users.cityId))
		);

		await push({ users, cities, ucView });

		try {
			await db.insert(cities).values([
				{
					id: 1,
					name: 'Firstistan',
				},
				{
					id: 2,
					name: 'Secondaria',
				},
			]);

			await db.insert(users).values([
				{ id: 1, name: 'First', cityId: 1 },
				{
					id: 2,
					name: 'Second',
					cityId: 2,
				},
				{
					id: 3,
					name: 'Third',
				},
			]);

			const joinSelectReturn = await db
				.select({
					userId: users.id.as('user_id'),
					cityId: cities.id.as('city_id'),
					userName: users.name.as('user_name'),
					cityName: cities.name.as('city_name'),
				})
				.from(users)
				.leftJoin(cities, eq(cities.id, users.cityId));

			expect(joinSelectReturn).toStrictEqual(
				expect.arrayContaining([
					{
						userId: 1,
						userName: 'First',
						cityId: 1,
						cityName: 'Firstistan',
					},
					{
						userId: 2,
						userName: 'Second',
						cityId: 2,
						cityName: 'Secondaria',
					},
					{
						userId: 3,
						userName: 'Third',
						cityId: null,
						cityName: null,
					},
				]),
			);

			const viewSelectReturn = await db.select().from(ucView);

			expect(viewSelectReturn).toStrictEqual(
				expect.arrayContaining([
					{
						userId: 1,
						userName: 'First',
						cityId: 1,
						cityName: 'Firstistan',
					},
					{
						userId: 2,
						userName: 'Second',
						cityId: 2,
						cityName: 'Secondaria',
					},
					{
						userId: 3,
						userName: 'Third',
						cityId: null,
						cityName: null,
					},
				]),
			);

			const viewJoinReturn = await db
				.select({
					userId: ucView.userId.as('user_id_ucv'),
					cityId: cities.id.as('city_id'),
					userName: ucView.userName.as('user_name_ucv'),
					cityName: cities.name.as('city_name'),
				})
				.from(ucView)
				.leftJoin(cities, eq(cities.id, ucView.cityId));

			expect(viewJoinReturn).toStrictEqual(
				expect.arrayContaining([
					{
						userId: 1,
						userName: 'First',
						cityId: 1,
						cityName: 'Firstistan',
					},
					{
						userId: 2,
						userName: 'Second',
						cityId: 2,
						cityName: 'Secondaria',
					},
					{
						userId: 3,
						userName: 'Third',
						cityId: null,
						cityName: null,
					},
				]),
			);
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
		await db
			.insert(table)
			.values([{ col1: true }, { col1: false, col2: 'qwerty' }]);

		const query = db
			.select()
			.from(table)
			.where(eq(table.col1, isNull(table.col2)));
		expect(query.toSQL()).toStrictEqual({
			sql:
				'select `col1`, `col2` from `table_where_is_null` where `table_where_is_null`.`col1` = (`table_where_is_null`.`col2` is null)',
			params: [],
		});
		const res = await query;
		expect(res).toStrictEqual([
			{ col1: true, col2: null },
			{ col1: false, col2: 'qwerty' },
		]);
	});

	test.concurrent('select + extra index params', async ({ db, push }) => {
		const users = mysqlTable(
			'index_test',
			{
				id: int('id').primaryKey(),
				name: varchar('name', { length: 15 }).notNull(),
				age: int('age').notNull(),
				time: int('time').notNull(),
			},
			() => [idx, idx2, unq],
		);
		const idx = index('name_index').on(users.name);
		const idx2 = index('age_index2').on(users.age);
		const unq = unique('time_unq').on(users.time);

		expect(
			db
				.select()
				.from(users, { useIndex: [idx] })
				.toSQL().sql,
		).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` USE INDEX (`name_index`)',
		);
		expect(
			db
				.select()
				.from(users, { forceIndex: [idx] })
				.toSQL().sql,
		).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` FORCE INDEX (`name_index`)',
		);
		expect(
			db
				.select()
				.from(users, { ignoreIndex: [idx] })
				.toSQL().sql,
		).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` IGNORE INDEX (`name_index`)',
		);
		expect(
			db
				.select()
				.from(users, { ignoreIndex: [unq] })
				.toSQL().sql,
		).toBe(
			'select `id`, `name`, `age`, `time` from `index_test` IGNORE INDEX (`time_unq`)',
		);

		await push({ users });

		try {
			await db.insert(users).values([
				{ id: 1, name: 'hello1', age: 1, time: 1 },
				{
					id: 2,
					name: 'hello2',
					age: 2,
					time: 2,
				},
			]);

			const res1 = await db.select().from(users, { forceIndex: idx });
			const res2 = await db.select().from(users, { ignoreIndex: idx });
			const res3 = await db.select().from(users, { useIndex: idx });
			const res4 = await db
				.select()
				.from(users, { forceIndex: idx, ignoreIndex: idx2 });
			const res5 = await db
				.select()
				.from(users, { useIndex: unq, ignoreIndex: unq });

			const result = [
				{
					age: 1,
					id: 1,
					name: 'hello1',
					time: 1,
				},
				{
					age: 2,
					id: 2,
					name: 'hello2',
					time: 2,
				},
			];
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

		await db
			.insert(dateTable)
			.values([
				{
					id: 1,
					date: date,
					dateStr: dateStr,
					timestamp: timestamp,
					timestampStr: timestampStr,
				},
				{
					id: 2,
					date: sql.placeholder('dateAsDate'),
					dateStr: sql.placeholder('dateStrAsDate'),
					timestamp: sql.placeholder('timestampAsDate'),
					timestampStr: sql.placeholder('timestampStrAsDate'),
				},
				{
					id: 3,
					date: sql.placeholder('dateAsString'),
					dateStr: sql.placeholder('dateStrAsString'),
					timestamp: sql.placeholder('timestampAsString'),
					timestampStr: sql.placeholder('timestampStrAsString'),
				},
				{
					id: 4,
					date: sql`${dateStr}`,
					dateStr: sql`${dateStr}`,
					timestamp: sql`${timestampStr}`,
					timestampStr: sql`${timestampStr}`,
				},
			])
			.execute({
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

		expect(initial).toStrictEqual([
			{
				id: 1,
				date,
				dateStr,
				timestamp,
				timestampStr,
			},
			{
				id: 2,
				date,
				dateStr,
				timestamp,
				timestampStr,
			},
			{
				id: 3,
				date,
				dateStr,
				timestamp,
				timestampStr,
			},
			{
				id: 4,
				date,
				dateStr,
				timestamp,
				timestampStr,
			},
		]);

		expect(updated).toStrictEqual(initial);
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/4875
	test.concurrent('select aliased view', async ({ db }) => {
		const productionJobTable = mysqlTable('production_job', {
			id: text('id').primaryKey(),
			name: text('name'),
		});

		const rfidTagTable = mysqlTable('rfid_tag', {
			createdAt: timestamp('created_at')
				.notNull()
				.default(sql`now()`),
			epc: text('epc').notNull(),
			locationId: text('location_id').notNull(),
			id: text('id')
				.notNull()
				.unique()
				.$default(() => 'abc'),
		});

		const productionJobWithLocationView = mysqlView(
			'production_job_with_location',
		).as((qb) => {
			const productionColumns = getColumns(productionJobTable);
			const sub = qb.selectDistinct().from(rfidTagTable).as('r');
			return qb
				.select({
					...productionColumns,
					locationId: sub.locationId,
					tagId: sub.id.as('tag_id'),
					tagCreatedAt: sub.createdAt.as('tag_created_at'),
				})
				.from(productionJobTable)
				.leftJoin(
					sub,
					and(
						eq(productionJobTable.id, sql`LTRIM(${sub.epc}, '0')`),
						sql`${sub.epc} ~ '^0?[0-9]+'`,
					),
				);
		});

		const sub = alias(productionJobWithLocationView, 'p'); // if select from "productionJobWithLocationView" (not from alias), it works as expected

		const query = db.select().from(sub);
		expect(query.toSQL().sql).toStrictEqual(
			(<{ dialect: MySqlDialect }> (<any> db)).dialect.sqlToQuery(
				sql`select ${sql.identifier('id')}, ${sql.identifier('name')}, ${sql.identifier('location_id')}, ${
					sql.identifier(
						'tag_id',
					)
				}, ${sql.identifier('tag_created_at')} from ${sql.identifier('production_job_with_location')} ${
					sql.identifier(
						'p',
					)
				}`,
			).sql,
		);
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/4612
	test.concurrent('select with inline params in sql', async ({ db }) => {
		const users = mysqlTable('users_115', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		});

		const query = db.select({ sum: sql`sum(${3})`.inlineParams() }).from(users);

		expect(query.toSQL()).toStrictEqual({
			sql: 'select sum(3) from `users_115`',
			params: [],
		});
	});

	test.concurrent('sql.identifier escape', async () => {
		const dialect = new MySqlDialect();
		const userInput = 'id` ASC, CAST((SELECT password_hash FROM users LIMIT 1) AS int)--';
		const query = sql`SELECT * FROM ${sql.identifier('users')} ORDER BY ${sql.identifier(userInput)} ASC`;
		const str = dialect.sqlToQuery(query);
		expect(str.sql).toBe(
			'SELECT * FROM `users` ORDER BY `id`` ASC, CAST((SELECT password_hash FROM users LIMIT 1) AS int)--` ASC',
		);
	});

	test.concurrent('Query error wrapping', async ({ push, db }) => {
		const table = mysqlTable('users_error_wrap', (t) => ({
			id: t.int().primaryKey(),
			name: t.text().notNull(),
		}));

		await push({ table });
		await expect(db.insert(table).values([{ id: 1, name: 'First' }, { id: 1, name: 'Second' }]))
			.rejects.toBeInstanceOf(DrizzleQueryError);
	});

	test.concurrent('comments', async ({ createDB, push }) => {
		const ctbl = mysqlTable('comments_test', (t) => ({
			id: t.int('id').primaryKey(),
			name: t.text('name').notNull(),
		}));

		await push({ ctbl });
		const db = createDB({ schema: { ctbl } });

		const insertQ = db
			.insert(ctbl)
			.values([
				{
					id: 1,
					name: 'First',
				},
				{
					id: 2,
					name: 'Second',
				},
			])
			.comment({ insert: '*/ comment /*', '/* n': 1 });

		expect(insertQ.toSQL().sql).toStrictEqual(
			`insert into \`comments_test\` (\`id\`, \`name\`) values (?, ?), (?, ?) /*%2F*%20n='1',insert='*%2F%20comment%20%2F*'*/`,
		);

		const deleteQ = db
			.delete(ctbl)
			.where(eq(ctbl.id, 2))
			.comment({ "del ' ete": '*/ comment /*' });
		expect(deleteQ.toSQL().sql).toStrictEqual(
			`delete from \`comments_test\` where \`comments_test\`.\`id\` = ? /*del%20\\'%20ete='*%2F%20comment%20%2F*'*/`,
		);

		const updateQ = db
			.update(ctbl)
			.set({ name: 'Updated' })
			.where(eq(ctbl.id, 1))
			.comment({
				update: 'here /**',
			});
		expect(updateQ.toSQL().sql).toStrictEqual(
			`update \`comments_test\` set \`name\` = ? where \`comments_test\`.\`id\` = ? /*update='here%20%2F**'*/`,
		);

		const selectQ = db
			.select()
			.from(ctbl)
			.comment({ select: 'co\'m"m`/* ent*/ "' });
		expect(selectQ.toSQL().sql).toStrictEqual(
			`select \`id\`, \`name\` from \`comments_test\` /*select='co\\'m%22m%60%2F*%20ent*%2F%20%22'*/`,
		);

		const rqbQ = db.query.ctbl.findFirst({
			columns: {
				id: true,
			},
			comment: {
				fieldOne: '_valueOne',
				_fieldTwo: 'value two',
			},
		});
		expect(rqbQ.toSQL().sql).toStrictEqual(
			`select \`d0\`.\`id\` as \`id\` from \`comments_test\` as \`d0\` limit ? /*_fieldTwo='value%20two',fieldOne='_valueOne'*/`,
		);

		const selectQPrepared = db
			.select()
			.from(ctbl)
			.comment({
				select: `com'ment`,
			})
			.prepare();
		expect(
			typeof (<any> selectQPrepared).query?.sql === 'string'
				? (<any> selectQPrepared).query.sql
				: (<any> selectQPrepared).queryString,
		)
			.toStrictEqual(
				`select \`id\`, \`name\` from \`comments_test\` /*select='com\\'ment'*/`,
			);

		await insertQ;
		await updateQ;
		await deleteQ;

		const [res1, res2, res3] = [
			await selectQ,
			await rqbQ,
			await selectQPrepared.execute(),
		];

		expectTypeOf(res2).toEqualTypeOf<
			| {
				id: number;
			}
			| undefined
		>();
		expect(res1).toStrictEqual([{ id: 1, name: 'Updated' }]);
		expect(res2).toStrictEqual({ id: 1 });
		expect(res3).toStrictEqual([{ id: 1, name: 'Updated' }]);
	});

	test.concurrent('all types ~codecs~', async ({ createDB, push }) => {
		const db = createDB({
			schema: { allTypesTable: allTypesCodecsTable },
			cb: (r) => ({
				allTypesTable: {
					self: r.many.allTypesTable({
						from: r.allTypesTable.serial,
						to: r.allTypesTable.serial,
					}),
				},
			}),
		});
		await push({ allTypesCodecsTable });
		type ExpectedType = {
			serial: number;
			bigint53: number;
			bigint64: bigint;
			bigintstr: string;
			binary: string;
			boolean: boolean;
			char: string;
			date: Date;
			datestr: string;
			datetime: Date;
			datetimestr: string;
			decimal: string;
			decimalnum: number;
			decimalbig: bigint;
			double: number;
			float: number;
			int: number;
			json1: unknown;
			json2: unknown;
			json3: unknown;
			json4: unknown;
			medint: number;
			smallint: number;
			real: number;
			text: string;
			tinytext: string;
			mediumtext: string;
			longtext: string;
			time: string;
			timestamp: Date;
			timestampstr: string;
			tinyint: number;
			varbin: string;
			varchar: string;
			year: number;
			enum: 'enV1' | 'enV2';
			blob: Buffer;
			tinyblob: Buffer;
			mediumblob: Buffer;
			longblob: Buffer;
			stringblob: string;
			stringtinyblob: string;
			stringmediumblob: string;
			stringlongblob: string;
		};

		const testData: ExpectedType = {
			serial: 1,
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
			bigintstr: '5044565289845416380',
			binary: '1',
			boolean: true,
			char: 'c',
			date: new Date('2025-03-12'),
			datestr: '2025-03-12',
			datetime: new Date(1741743161623),
			datetimestr: new Date(1741743161623).toISOString().slice(0, 23).replace('T', ' '),
			decimal: '47521',
			decimalnum: 9007199254740991,
			decimalbig: 5044565289845416380n,
			double: 15.35325689124218,
			enum: 'enV1',
			float: 1.048596,
			real: 1.048596,
			text: 'C4-',
			tinytext: 'tiny text',
			mediumtext: 'medium text',
			longtext: 'long text',
			int: 621,
			json1: { str: 'strval', arr: ['str', 10] },
			json2: [{ key: 'value', num: 7 }, 'v', '11', 5],
			json3: 5,
			json4: '5',
			medint: 560,
			smallint: 14,
			time: '04:13:22',
			timestamp: new Date(1741743161623),
			timestampstr: new Date(1741743161623).toISOString().slice(0, 23).replace('T', ' '),
			tinyint: 7,
			varbin: '1010110101001101',
			varchar: 'VCHAR',
			year: 2025,
			blob: Buffer.from('string'),
			longblob: Buffer.from('string'),
			mediumblob: Buffer.from('string'),
			tinyblob: Buffer.from('string'),
			stringblob: 'string',
			stringlongblob: 'string',
			stringmediumblob: 'string',
			stringtinyblob: 'string',
		};

		await db.insert(allTypesCodecsTable).values(testData);

		const session = (<any> db).session as MySqlAsyncSession;

		const queryRes = await session.objects<ExpectedType>(
			db.select(
				Object.fromEntries(Object.entries(getTableColumns(allTypesCodecsTable)).map(([k, v]) => [k, v.as(v.name)])),
			).from(allTypesCodecsTable).getSQL(),
		).then((e) =>
			normalizeDataWithDbCodecs({
				db,
				columns: getColumns(allTypesCodecsTable),
				data: e,
				mode: 'query',
			})[0]
		);

		expect(queryRes).toStrictEqual(testData);

		const isTidb = is(db, TiDBServerlessDatabase);

		// ---- numbers ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 1.0485960245132446 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 1.0485960245132446 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 1.0485960245132446 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 9007199254740991 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 1.0485960245132446 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 15.35325689124218 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: isTidb ? 9007200000000000 : 9007199000000000 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.0485960245132446 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.0485960245132446 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.0485960245132446 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.0485960245132446 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 1.0485960245132446 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 621 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 560 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 14 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 1.0485960245132446 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 1.048596 }, { value: 2025 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 7 }, { value: isTidb ? 2025 : 127 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.serial }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 1 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint53 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalnum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 9007199254740991 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.double }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 15.35325689124218 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.float }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.int }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 621 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.medint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 560 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.smallint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 14 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.real }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 1.048596 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyint }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: isTidb ? 2025 : 127 }, { value: 7 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.year }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 2025 }, { value: 2025 }]));

		// ---- strings ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: isTidb ? '0000000000000010000' : '5044565289845416380' }, {
				value: '1010110101001101',
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5044565289845416380' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: isTidb ? '0' : 'c' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'c' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: isTidb ? '00001' : '47521' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '47521' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'C4-' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'tiny text' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'medium text' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'long text' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: isTidb ? '00000' : 'VCHAR' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'VCHAR' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: '1010110101001101' }, {
				value: isTidb ? '0000000000000010000' : '5044565289845416380',
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: isTidb ? '0' : 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: isTidb ? '00001' : '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: isTidb ? '00000' : 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: isTidb ? '0000000010' : '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: '1010110101001101' }, {
				value: isTidb ? '00000000100010000010000' : '2025-03-12 01:32:41.623',
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: '1010110101001101' }, {
				value: isTidb ? '00000000100010000010000' : '2025-03-12 01:32:41.623',
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1010110101001101' }, { value: isTidb ? '00010000' : '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'string' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: isTidb ? '0000000010' : '2025-03-12' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12' }, { value: '2025-03-12' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 00:00:00.000' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 00:00:00.000' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: isTidb ? '00000000100010000010000' : '2025-03-12 01:32:41.623' }, {
				value: '1010110101001101',
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '2025-03-12 00:00:00.000' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: isTidb ? '00000000100010000010000' : '2025-03-12 01:32:41.623' }, {
				value: '1010110101001101',
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '2025-03-12 00:00:00.000' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetimestr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestampstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '2025-03-12 01:32:41.623' }, { value: '2025-03-12 01:32:41.623' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigintstr }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: '5044565289845416380' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.char }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'c' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimal }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: '47521' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.text }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'C4-' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinytext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'tiny text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'medium text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longtext }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'long text' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varchar }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'VCHAR' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.varbin }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: isTidb ? '00010000' : '04:13:22' }, { value: '1010110101001101' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringtinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringmediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.stringlongblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: 'string' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.time }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '04:13:22' }, { value: '04:13:22' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.binary }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.binary }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '1' }, { value: '1' }]));

		// ---- bigint ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint64 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint64 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5044565289845416380n }, { value: 5044565289845416380n }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.bigint64 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalbig }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5044565289845416380n }, { value: 5044565289845416380n }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalbig }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.bigint64 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5044565289845416380n }, { value: 5044565289845416380n }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.decimalbig }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.decimalbig }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5044565289845416380n }, { value: 5044565289845416380n }]));

		// ---- boolean ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.boolean }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.boolean }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: true }, { value: true }]));

		// ---- date ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.date }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.date }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date('2025-03-12') }, { value: new Date('2025-03-12') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.date }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetime }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date('2025-03-12') }, { value: new Date(1741743161623) }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.date }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestamp }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date('2025-03-12') }, { value: new Date(1741743161623) }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetime }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.date }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date(1741743161623) }, { value: new Date('2025-03-12') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetime }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetime }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date(1741743161623) }, { value: new Date(1741743161623) }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.datetime }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestamp }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date(1741743161623) }, { value: new Date(1741743161623) }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestamp }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.date }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date(1741743161623) }, { value: new Date('2025-03-12') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestamp }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.datetime }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date(1741743161623) }, { value: new Date(1741743161623) }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.timestamp }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.timestamp }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: new Date(1741743161623) }, { value: new Date(1741743161623) }]));

		// ---- buffer ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.blob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.tinyblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.mediumblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.longblob }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: Buffer.from('string') }, { value: Buffer.from('string') }]));

		// ---- enum ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.enum }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.enum }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 'enV1' }, { value: 'enV1' }]));

		// ---- json ----
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: { str: 'strval', arr: ['str', 10] } }, {
				value: { str: 'strval', arr: ['str', 10] },
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: { str: 'strval', arr: ['str', 10] } }, {
				value: [{ key: 'value', num: 7 }, 'v', '11', 5],
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: { str: 'strval', arr: ['str', 10] } }, { value: 5 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: { str: 'strval', arr: ['str', 10] } }, { value: '5' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: [{ key: 'value', num: 7 }, 'v', '11', 5] }, {
				value: { str: 'strval', arr: ['str', 10] },
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
			),
		).toEqual(
			expect.arrayContaining([{ value: [{ key: 'value', num: 7 }, 'v', '11', 5] }, {
				value: [{ key: 'value', num: 7 }, 'v', '11', 5],
			}]),
		);
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: [{ key: 'value', num: 7 }, 'v', '11', 5] }, { value: 5 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: [{ key: 'value', num: 7 }, 'v', '11', 5] }, { value: '5' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5 }, { value: { str: 'strval', arr: ['str', 10] } }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5 }, { value: [{ key: 'value', num: 7 }, 'v', '11', 5] }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5 }, { value: 5 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: 5 }, { value: '5' }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json1 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5' }, { value: { str: 'strval', arr: ['str', 10] } }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json2 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5' }, { value: [{ key: 'value', num: 7 }, 'v', '11', 5] }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json3 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5' }, { value: 5 }]));
		expect(
			await unionAll(
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
				db.select({ value: allTypesCodecsTable.json4 }).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([{ value: '5' }, { value: '5' }]));

		// TiDB's engine does not support `LATERAL` derived tables, which the RQB relation query
		// (`with: { self }`) relies on — skip the relation-based assertions there.
		const relationSQL = db.query.allTypesTable.findFirst({
			with: {
				self: true,
			},
		}).getSQL();
		if (!is(db, TiDBServerlessDatabase)) {
			const { relationRes, rootRes } = await session.objects(relationSQL).then((e) => {
				const [{ self: relationRaw, ...rootRaw }] = e as [Record<string, any>];

				return {
					relationRes: normalizeDataWithDbCodecs({
						db,
						columns: getColumns(allTypesCodecsTable),
						data: relationRaw,
						mode: 'json',
					})[0]!,
					rootRes: normalizeDataWithDbCodecs({
						db,
						columns: getColumns(allTypesCodecsTable),
						data: [rootRaw],
						mode: 'query',
					})[0]!,
				};
			});

			expect(relationRes).toStrictEqual(testData);
			expect(rootRes).toStrictEqual(testData);
		}
	});

	test.concurrent('Column as decoder applies codecs', async ({ createDB, push }) => {
		let customCast = false;
		let customMap = false;

		const codecBypass = customType<{
			data: Date;
			driverData: string;
			jsonData: string;
		}>({
			codec: 'timestamp',
			dataType: () => 'timestamp(3)',
			forJsonSelect: (identifier, sql) => {
				customCast = true;
				return sql`cast(${identifier} as char)`;
			},
			fromJson: (v) => {
				customMap = true;
				return new Date(v + '+0000');
			},
			toDriver: (v) => v.toISOString().replace('T', ' ').replace('Z', ''),
		});

		const users = mysqlTable('users_823', (t) => ({
			id: t.int().primaryKey(),
			name: t.text().notNull(),
			createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
			createdAtStr: t.timestamp('created_at_str', { fsp: 3, mode: 'string' }).notNull(),
			cus: codecBypass('custom').notNull(),
		}));

		const usersView = mysqlView('users_823_v').as((qb) =>
			qb.select({
				...getColumns(users),
				max: max(users.createdAt).as('max'),
				maxStr: max(users.createdAtStr).as('max_str'),
				sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
			}).from(users).groupBy(users.id)
		);

		await push({ users, usersView });

		const db = createDB({
			schema: { users, usersView },
			cb: (r) => ({
				users: {
					self: r.one.users({
						from: r.users.id,
						to: r.users.id,
					}),
				},
				usersView: {
					self: r.one.usersView({
						from: r.usersView.id,
						to: r.usersView.id,
					}),
				},
			}),
		});

		const exDateStr = '1970-01-16 16:45:46.351';
		const exDate = new Date(exDateStr);

		await db.insert(users).values({
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			cus: exDate,
		});

		const res = await db.select({
			...getColumns(users),
			max: max(users.createdAt).as('max'),
			maxStr: max(users.createdAtStr).as('max_str'),
			sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
		}).from(users).groupBy(users.id);

		const viewRes = await db.select().from(usersView);

		const nested = await db.query.users.findFirst({
			with: {
				self: {
					extras: {
						max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
						maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
					},
				},
			},
			extras: {
				max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
				maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
			},
		});

		const viewNested = await db.query.usersView.findFirst({
			columns: {
				sq: false, // TODO: re-enable when supported in RQBv2
			},
			with: {
				self: {
					columns: {
						sq: false, // TODO: re-enable when supported in RQBv2
					},
				},
			},
		});

		expect(res).toStrictEqual([
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				sq: exDate,
				cus: exDate,
			},
		]);
		expect(viewRes).toStrictEqual([
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				sq: exDate,
				cus: exDate,
			},
		]);

		expect(customCast).toBeTruthy();
		expect(customMap).toBeTruthy();

		expect(nested).toStrictEqual(
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
				self: {
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					max: exDate,
					maxStr: exDateStr,
					cus: exDate,
				},
			},
		);
		expect(viewNested).toStrictEqual(
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
				self: {
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					max: exDate,
					maxStr: exDateStr,
					cus: exDate,
				},
			},
		);
	});

	test.concurrent('Column as decoder applies codecs - Jit mappers', async ({ createDB, push }) => {
		let customCast = false;
		let customMap = false;

		const codecBypass = customType<{
			data: Date;
			driverData: string;
			jsonData: string;
		}>({
			codec: 'timestamp',
			dataType: () => 'timestamp(3)',
			forJsonSelect: (identifier, sql) => {
				customCast = true;
				return sql`cast(${identifier} as char)`;
			},
			fromJson: (v) => {
				customMap = true;
				return new Date(v + '+0000');
			},
			toDriver: (v) => v.toISOString().replace('T', ' ').replace('Z', ''),
		});

		const users = mysqlTable('users_823_jit', (t) => ({
			id: t.int().primaryKey(),
			name: t.text().notNull(),
			createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
			createdAtStr: t.timestamp('created_at_str', { fsp: 3, mode: 'string' }).notNull(),
			cus: codecBypass('custom').notNull(),
		}));

		const usersView = mysqlView('users_823_v_jit').as((qb) =>
			qb.select({
				...getColumns(users),
				max: max(users.createdAt).as('max'),
				maxStr: max(users.createdAtStr).as('max_str'),
				sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
			}).from(users).groupBy(users.id)
		);

		await push({ users, usersView });

		const db = createDB({
			schema: { users, usersView },
			cb: (r) => ({
				users: {
					self: r.one.users({
						from: r.users.id,
						to: r.users.id,
					}),
				},
				usersView: {
					self: r.one.usersView({
						from: r.usersView.id,
						to: r.usersView.id,
					}),
				},
			}),
		});

		const exDateStr = '1970-01-16 16:45:46.351';
		const exDate = new Date(exDateStr);

		await db.insert(users).values({
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			cus: exDate,
		});

		const res = await db.select({
			...getColumns(users),
			max: max(users.createdAt).as('max'),
			maxStr: max(users.createdAtStr).as('max_str'),
			sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
		}).from(users).groupBy(users.id);

		const viewRes = await db.select().from(usersView);

		const nested = await db.query.users.findFirst({
			with: {
				self: {
					extras: {
						max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
						maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
					},
				},
			},
			extras: {
				max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
				maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
			},
		});

		const viewNested = await db.query.usersView.findFirst({
			columns: {
				sq: false, // TODO: re-enable when supported in RQBv2
			},
			with: {
				self: {
					columns: {
						sq: false, // TODO: re-enable when supported in RQBv2
					},
				},
			},
		});

		expect(res).toStrictEqual([
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				sq: exDate,
				cus: exDate,
			},
		]);
		expect(viewRes).toStrictEqual([
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				sq: exDate,
				cus: exDate,
			},
		]);

		expect(customCast).toBeTruthy();
		expect(customMap).toBeTruthy();

		expect(nested).toStrictEqual(
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
				self: {
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					max: exDate,
					maxStr: exDateStr,
					cus: exDate,
				},
			},
		);
		expect(viewNested).toStrictEqual(
			{
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
				self: {
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					max: exDate,
					maxStr: exDateStr,
					cus: exDate,
				},
			},
		);
	});

	test.concurrent('Mappers: correct mappers enabled', async ({ db, createDB }) => {
		const jitDb = createDB({ jit: true });

		const dialect: MySqlDialect = (<any> db).dialect;
		const jitDialect: MySqlDialect = (<any> jitDb).dialect;

		expect(dialect.mapperGenerators.relationalRows === makeDefaultRqbMapper).toStrictEqual(true);
		expect(dialect.mapperGenerators.rows === makeDefaultQueryMapper).toStrictEqual(true);
		expect(dialect.mapperGenerators.$returning === make$ReturningResponseMapper).toStrictEqual(true);
		expect(jitDialect.mapperGenerators.relationalRows === makeJitRqbMapper).toStrictEqual(true);
		expect(jitDialect.mapperGenerators.rows === makeJitQueryMapper).toStrictEqual(true);
		// TODO: replace after making jit version
		expect(jitDialect.mapperGenerators.$returning === make$ReturningResponseMapper).toStrictEqual(true);
	});

	const mappersDate = new Date('2026-04-02T00:00:00.000Z');

	test.concurrent('Mappers: simple select - no rows', async ({ db, push }) => {
		const users = mysqlTable('mappers_users_1', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		await push({ users });

		const result = await db.select().from(users);

		expect(result).toStrictEqual([]);
	});

	test.concurrent('Mappers: select - nothing to decode - text', async ({ db, push }) => {
		const users = mysqlTable('mappers_users_2', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		await push({ users });

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		const selected = await db.select({ name: users.name }).from(users);

		expect(selected).toStrictEqual([{ name: 'First' }]);
	});

	test.concurrent('Mappers: select - nothing to decode - null', async ({ db, push }) => {
		const users = mysqlTable('mappers_users_3', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		await push({ users });

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		const selected = await db.select({ isBanned: users.isBanned }).from(users);

		expect(selected).toStrictEqual([{ isBanned: null }]);
	});

	test.concurrent('Mappers: insert $returningId + select', async ({ db, push }) => {
		const users = mysqlTable('mappers_users_4', (t) => ({
			id: t.bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		await push({ users });

		const insertedIds = await db.insert(users).values([{
			name: 'First',
			createdAt: mappersDate,
		}, {
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			name: 'Third',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

		const selected = await db.select().from(users);

		await db.update(users).set({
			isBanned: false,
		}).where(eq(users.id, 2));

		expect(selected).toStrictEqual([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
			isBanned: null,
		}, {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
			isBanned: null,
		}]);
	});

	test.concurrent('Mappers: select complex selections', async ({ db, push }) => {
		const users = mysqlTable('mappers_users_5', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const posts = mysqlTable('mappers_posts_1', (t) => ({
			id: t.int('id').primaryKey(),
			authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
			content: t.text('content'),
		}));

		await push({ users, posts });

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}, {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		await db.insert(posts).values({
			id: 1,
			authorId: 1,
			content: 'p1',
		});

		const selected1 = await db.select({ user: users, post: posts }).from(users).leftJoin(
			posts,
			eq(users.id, posts.authorId),
		);
		const selected2 = await db.select({ user: users, post: posts }).from(users).innerJoin(
			posts,
			eq(users.id, posts.authorId),
		);
		const selected3 = await db.select({
			userId: users.id,
			postId: posts.id,
			name: users.name,
			isBanned: users.isBanned,
			content: posts.content,
			createdAt: users.createdAt,
		}).from(users).leftJoin(
			posts,
			eq(users.id, posts.authorId),
		);
		const selected4 = await db.select({
			userId: users.id,
			postId: posts.id,
			name: users.name,
			isBanned: users.isBanned,
			content: posts.content,
			createdAt: users.createdAt,
		}).from(users).innerJoin(
			posts,
			eq(users.id, posts.authorId),
		);

		expect(selected1).toStrictEqual([{
			user: {
				id: 1,
				name: 'First',
				createdAt: mappersDate,
				isBanned: null,
			},
			post: {
				id: 1,
				authorId: 1,
				content: 'p1',
			},
		}, {
			user: {
				id: 2,
				name: 'Second',
				createdAt: mappersDate,
				isBanned: true,
			},
			post: null,
		}, {
			user: {
				id: 3,
				name: 'Third',
				createdAt: mappersDate,
				isBanned: null,
			},
			post: null,
		}]);
		expect(selected2).toStrictEqual([{
			user: {
				id: 1,
				name: 'First',
				createdAt: mappersDate,
				isBanned: null,
			},
			post: {
				id: 1,
				authorId: 1,
				content: 'p1',
			},
		}]);
		expect(selected3).toStrictEqual([
			{
				content: 'p1',
				createdAt: mappersDate,
				isBanned: null,
				name: 'First',
				postId: 1,
				userId: 1,
			},
			{
				content: null,
				createdAt: mappersDate,
				isBanned: true,
				name: 'Second',
				postId: null,
				userId: 2,
			},
			{
				content: null,
				createdAt: mappersDate,
				isBanned: null,
				name: 'Third',
				postId: null,
				userId: 3,
			},
		]);
		expect(selected4).toStrictEqual([
			{
				content: 'p1',
				createdAt: mappersDate,
				isBanned: null,
				name: 'First',
				postId: 1,
				userId: 1,
			},
		]);
	});

	test.concurrent('Mappers: relational', async ({ createDB, push }) => {
		const users = mysqlTable('mappers_users_6', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const posts = mysqlTable('mappers_posts_2', (t) => ({
			id: t.int('id').primaryKey(),
			authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
			content: t.text('content'),
		}));

		const db = createDB({
			schema: { users, posts },
			cb: (r) => ({
				users: {
					post: r.one.posts({
						from: r.users.id,
						to: r.posts.authorId,
					}),
					posts: r.one.posts({
						from: r.users.id,
						to: r.posts.authorId,
					}),
				},
				posts: {
					author: r.one.users({
						from: r.posts.authorId,
						to: r.users.id,
					}),
					authors: r.many.users({
						from: r.posts.authorId,
						to: r.users.id,
					}),
				},
			}),
			jit: false,
		});
		await push({ users, posts });

		const empty1 = await db.query.users.findFirst();
		const empty2 = await db.query.users.findMany();

		expect(empty1).toStrictEqual(undefined);
		expect(empty2).toStrictEqual([]);

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}, {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		await db.insert(posts).values({
			id: 1,
			authorId: 1,
			content: 'p1',
		});

		const simple1 = await db.query.users.findFirst();
		const simple2 = await db.query.users.findMany();

		expect(simple1).toStrictEqual(
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
			},
		);
		expect(simple2).toStrictEqual([
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
			},
			{
				createdAt: mappersDate,
				id: 2,
				isBanned: true,
				name: 'Second',
			},
			{
				createdAt: mappersDate,
				id: 3,
				isBanned: null,
				name: 'Third',
			},
		]);

		const extra1 = await db.query.users.findFirst({
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});
		const extra2 = await db.query.users.findMany({
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});

		expect(extra1).toStrictEqual(
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				sql: 1,
				sqlWrapper: 2,
			},
		);
		expect(extra2).toStrictEqual([
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 2,
				isBanned: true,
				name: 'Second',
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 3,
				isBanned: null,
				name: 'Third',
				sql: 1,
				sqlWrapper: 2,
			},
		]);

		const nested1 = await db.query.users.findFirst({
			with: {
				post: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
				posts: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
			},
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});
		const nested2 = await db.query.users.findMany({
			with: {
				post: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
				posts: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
			},
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});

		expect(nested1).toStrictEqual(
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				post: {
					author: null,
					authorId: 1,
					authors: [],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				posts: {
					author: {
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					authorId: 1,
					authors: [
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
					],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				sql: 1,
				sqlWrapper: 2,
			},
		);
		expect(nested2).toStrictEqual([
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				post: {
					author: null,
					authorId: 1,
					authors: [],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				posts: {
					author: {
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					authorId: 1,
					authors: [
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
					],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 2,
				isBanned: true,
				name: 'Second',
				post: null,
				posts: null,
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 3,
				isBanned: null,
				name: 'Third',
				post: null,
				posts: null,
				sql: 1,
				sqlWrapper: 2,
			},
		]);
	});

	test.concurrent('Jit mappers: simple select - no rows', async ({ createDB, push }) => {
		const users = mysqlTable('jit_mappers_users_1', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const db = createDB({ jit: true });
		await push({ users });

		const result = await db.select().from(users);

		expect(result).toStrictEqual([]);
	});

	test.concurrent('Jit mappers: select - nothing to decode - text', async ({ createDB, push }) => {
		const users = mysqlTable('jit_mappers_users_2', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const db = createDB({ jit: true });
		await push({ users });

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		const selected = await db.select({ name: users.name }).from(users);

		expect(selected).toStrictEqual([{ name: 'First' }]);
	});

	test.concurrent('Jit mappers: select - nothing to decode - null', async ({ createDB, push }) => {
		const users = mysqlTable('jit_mappers_users_3', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const db = createDB({ jit: true });
		await push({ users });

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		const selected = await db.select({ isBanned: users.isBanned }).from(users);

		expect(selected).toStrictEqual([{ isBanned: null }]);
	});

	test.concurrent('Jit mappers: insert $returningId + select', async ({ createDB, push }) => {
		const users = mysqlTable('jit_mappers_users_4', (t) => ({
			id: t.bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const db = createDB({ jit: true });
		await push({ users });

		const insertedIds = await db.insert(users).values([{
			name: 'First',
			createdAt: mappersDate,
		}, {
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			name: 'Third',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

		const selected = await db.select().from(users);

		await db.update(users).set({
			isBanned: false,
		}).where(eq(users.id, 2));

		expect(selected).toStrictEqual([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
			isBanned: null,
		}, {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
			isBanned: null,
		}]);
	});

	test.concurrent('Jit mappers: select complex selections', async ({ createDB, push }) => {
		const users = mysqlTable('jit_mappers_users_5', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const posts = mysqlTable('jit_mappers_posts_1', (t) => ({
			id: t.int('id').primaryKey(),
			authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
			content: t.text('content'),
		}));

		const db = createDB({ jit: true });
		await push({ users, posts });

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}, {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		await db.insert(posts).values({
			id: 1,
			authorId: 1,
			content: 'p1',
		});

		const selected1 = await db.select({ user: users, post: posts }).from(users).leftJoin(
			posts,
			eq(users.id, posts.authorId),
		);
		const selected2 = await db.select({ user: users, post: posts }).from(users).innerJoin(
			posts,
			eq(users.id, posts.authorId),
		);
		const selected3 = await db.select({
			userId: users.id,
			postId: posts.id,
			name: users.name,
			isBanned: users.isBanned,
			content: posts.content,
			createdAt: users.createdAt,
		}).from(users).leftJoin(
			posts,
			eq(users.id, posts.authorId),
		);
		const selected4 = await db.select({
			userId: users.id,
			postId: posts.id,
			name: users.name,
			isBanned: users.isBanned,
			content: posts.content,
			createdAt: users.createdAt,
		}).from(users).innerJoin(
			posts,
			eq(users.id, posts.authorId),
		);

		expect(selected1).toStrictEqual([{
			user: {
				id: 1,
				name: 'First',
				createdAt: mappersDate,
				isBanned: null,
			},
			post: {
				id: 1,
				authorId: 1,
				content: 'p1',
			},
		}, {
			user: {
				id: 2,
				name: 'Second',
				createdAt: mappersDate,
				isBanned: true,
			},
			post: null,
		}, {
			user: {
				id: 3,
				name: 'Third',
				createdAt: mappersDate,
				isBanned: null,
			},
			post: null,
		}]);
		expect(selected2).toStrictEqual([{
			user: {
				id: 1,
				name: 'First',
				createdAt: mappersDate,
				isBanned: null,
			},
			post: {
				id: 1,
				authorId: 1,
				content: 'p1',
			},
		}]);
		expect(selected3).toStrictEqual([
			{
				content: 'p1',
				createdAt: mappersDate,
				isBanned: null,
				name: 'First',
				postId: 1,
				userId: 1,
			},
			{
				content: null,
				createdAt: mappersDate,
				isBanned: true,
				name: 'Second',
				postId: null,
				userId: 2,
			},
			{
				content: null,
				createdAt: mappersDate,
				isBanned: null,
				name: 'Third',
				postId: null,
				userId: 3,
			},
		]);
		expect(selected4).toStrictEqual([
			{
				content: 'p1',
				createdAt: mappersDate,
				isBanned: null,
				name: 'First',
				postId: 1,
				userId: 1,
			},
		]);
	});

	test.concurrent('Jit mappers: relational', async ({ createDB, push }) => {
		const users = mysqlTable('jit_mappers_users_6', (t) => ({
			id: t.bigint('id', { mode: 'number' }).primaryKey(),
			name: t.text('name').notNull(),
			createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
			isBanned: t.boolean('is_banned'),
		}));

		const posts = mysqlTable('jit_mappers_posts_2', (t) => ({
			id: t.int('id').primaryKey(),
			authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
			content: t.text('content'),
		}));

		const db = createDB({
			schema: { users, posts },
			cb: (r) => ({
				users: {
					post: r.one.posts({
						from: r.users.id,
						to: r.posts.authorId,
					}),
					posts: r.one.posts({
						from: r.users.id,
						to: r.posts.authorId,
					}),
				},
				posts: {
					author: r.one.users({
						from: r.posts.authorId,
						to: r.users.id,
					}),
					authors: r.many.users({
						from: r.posts.authorId,
						to: r.users.id,
					}),
				},
			}),
			jit: true,
		});
		await push({ users, posts });

		const empty1 = await db.query.users.findFirst();
		const empty2 = await db.query.users.findMany();

		expect(empty1).toStrictEqual(undefined);
		expect(empty2).toStrictEqual([]);

		const insertedIds = await db.insert(users).values([{
			id: 1,
			name: 'First',
			createdAt: mappersDate,
		}, {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		}, {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
		}]).$returningId();

		expect(insertedIds).toStrictEqual([]);

		await db.insert(posts).values({
			id: 1,
			authorId: 1,
			content: 'p1',
		});

		const simple1 = await db.query.users.findFirst();
		const simple2 = await db.query.users.findMany();

		expect(simple1).toStrictEqual(
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
			},
		);
		expect(simple2).toStrictEqual([
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
			},
			{
				createdAt: mappersDate,
				id: 2,
				isBanned: true,
				name: 'Second',
			},
			{
				createdAt: mappersDate,
				id: 3,
				isBanned: null,
				name: 'Third',
			},
		]);

		const extra1 = await db.query.users.findFirst({
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});
		const extra2 = await db.query.users.findMany({
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});

		expect(extra1).toStrictEqual(
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				sql: 1,
				sqlWrapper: 2,
			},
		);
		expect(extra2).toStrictEqual([
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 2,
				isBanned: true,
				name: 'Second',
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 3,
				isBanned: null,
				name: 'Third',
				sql: 1,
				sqlWrapper: 2,
			},
		]);

		const nested1 = await db.query.users.findFirst({
			with: {
				post: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
				posts: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
			},
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});
		const nested2 = await db.query.users.findMany({
			with: {
				post: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
				posts: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
			},
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		});

		expect(nested1).toStrictEqual(
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				post: {
					author: null,
					authorId: 1,
					authors: [],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				posts: {
					author: {
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					authorId: 1,
					authors: [
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
					],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				sql: 1,
				sqlWrapper: 2,
			},
		);
		expect(nested2).toStrictEqual([
			{
				createdAt: mappersDate,
				id: 1,
				isBanned: null,
				name: 'First',
				post: {
					author: null,
					authorId: 1,
					authors: [],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				posts: {
					author: {
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					authorId: 1,
					authors: [
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
					],
					content: 'p1',
					id: 1,
					sql: 1,
					sqlWrapper: 2,
				},
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 2,
				isBanned: true,
				name: 'Second',
				post: null,
				posts: null,
				sql: 1,
				sqlWrapper: 2,
			},
			{
				createdAt: mappersDate,
				id: 3,
				isBanned: null,
				name: 'Third',
				post: null,
				posts: null,
				sql: 1,
				sqlWrapper: 2,
			},
		]);
	});
}
