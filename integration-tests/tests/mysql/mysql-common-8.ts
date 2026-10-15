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
import { PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
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
	test.skipIf(Date.now() < +new Date('2026-07-01')).concurrent(
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
		.skipIf(Date.now() < +new Date('2026-07-01'))
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
		// TiDB and PlanetScale (serverless HTTP drivers) widen `<col> ∪ varbinary` to a binary
		// type, returning the bit-string of the raw bytes; mysql2 keeps the text value. (Float
		// precision and `year ∪ tinyint` narrowing, by contrast, match mysql2 on PlanetScale.)
		const binWidens = isTidb || is(db, PlanetScaleDatabase);

		// ---- numbers ----
		expect(
			await unionAll(
				db.select({
					'serial ∪ serial': allTypesCodecsTable.serial.as('serial ∪ serial'),
					'serial ∪ bigint53': allTypesCodecsTable.serial.as('serial ∪ bigint53'),
					'serial ∪ decimalnum': allTypesCodecsTable.serial.as('serial ∪ decimalnum'),
					'serial ∪ double': allTypesCodecsTable.serial.as('serial ∪ double'),
					'serial ∪ float': allTypesCodecsTable.serial.as('serial ∪ float'),
					'serial ∪ int': allTypesCodecsTable.serial.as('serial ∪ int'),
					'serial ∪ medint': allTypesCodecsTable.serial.as('serial ∪ medint'),
					'serial ∪ smallint': allTypesCodecsTable.serial.as('serial ∪ smallint'),
					'serial ∪ real': allTypesCodecsTable.serial.as('serial ∪ real'),
					'serial ∪ tinyint': allTypesCodecsTable.serial.as('serial ∪ tinyint'),
					'serial ∪ year': allTypesCodecsTable.serial.as('serial ∪ year'),
					'bigint53 ∪ serial': allTypesCodecsTable.bigint53.as('bigint53 ∪ serial'),
					'bigint53 ∪ bigint53': allTypesCodecsTable.bigint53.as('bigint53 ∪ bigint53'),
					'bigint53 ∪ decimalnum': allTypesCodecsTable.bigint53.as('bigint53 ∪ decimalnum'),
					'bigint53 ∪ double': allTypesCodecsTable.bigint53.as('bigint53 ∪ double'),
					'bigint53 ∪ float': allTypesCodecsTable.bigint53.as('bigint53 ∪ float'),
					'bigint53 ∪ int': allTypesCodecsTable.bigint53.as('bigint53 ∪ int'),
					'bigint53 ∪ medint': allTypesCodecsTable.bigint53.as('bigint53 ∪ medint'),
					'bigint53 ∪ smallint': allTypesCodecsTable.bigint53.as('bigint53 ∪ smallint'),
					'bigint53 ∪ real': allTypesCodecsTable.bigint53.as('bigint53 ∪ real'),
					'bigint53 ∪ tinyint': allTypesCodecsTable.bigint53.as('bigint53 ∪ tinyint'),
					'bigint53 ∪ year': allTypesCodecsTable.bigint53.as('bigint53 ∪ year'),
					'decimalnum ∪ serial': allTypesCodecsTable.decimalnum.as('decimalnum ∪ serial'),
					'decimalnum ∪ bigint53': allTypesCodecsTable.decimalnum.as('decimalnum ∪ bigint53'),
					'decimalnum ∪ decimalnum': allTypesCodecsTable.decimalnum.as('decimalnum ∪ decimalnum'),
					'decimalnum ∪ double': allTypesCodecsTable.decimalnum.as('decimalnum ∪ double'),
					'decimalnum ∪ float': allTypesCodecsTable.decimalnum.as('decimalnum ∪ float'),
					'decimalnum ∪ int': allTypesCodecsTable.decimalnum.as('decimalnum ∪ int'),
					'decimalnum ∪ medint': allTypesCodecsTable.decimalnum.as('decimalnum ∪ medint'),
					'decimalnum ∪ smallint': allTypesCodecsTable.decimalnum.as('decimalnum ∪ smallint'),
					'decimalnum ∪ real': allTypesCodecsTable.decimalnum.as('decimalnum ∪ real'),
					'decimalnum ∪ tinyint': allTypesCodecsTable.decimalnum.as('decimalnum ∪ tinyint'),
					'decimalnum ∪ year': allTypesCodecsTable.decimalnum.as('decimalnum ∪ year'),
					'double ∪ serial': allTypesCodecsTable.double.as('double ∪ serial'),
					'double ∪ bigint53': allTypesCodecsTable.double.as('double ∪ bigint53'),
					'double ∪ decimalnum': allTypesCodecsTable.double.as('double ∪ decimalnum'),
					'double ∪ double': allTypesCodecsTable.double.as('double ∪ double'),
					'double ∪ float': allTypesCodecsTable.double.as('double ∪ float'),
					'double ∪ int': allTypesCodecsTable.double.as('double ∪ int'),
					'double ∪ medint': allTypesCodecsTable.double.as('double ∪ medint'),
					'double ∪ smallint': allTypesCodecsTable.double.as('double ∪ smallint'),
					'double ∪ real': allTypesCodecsTable.double.as('double ∪ real'),
					'double ∪ tinyint': allTypesCodecsTable.double.as('double ∪ tinyint'),
					'double ∪ year': allTypesCodecsTable.double.as('double ∪ year'),
					'float ∪ serial': allTypesCodecsTable.float.as('float ∪ serial'),
					'float ∪ bigint53': allTypesCodecsTable.float.as('float ∪ bigint53'),
					'float ∪ decimalnum': allTypesCodecsTable.float.as('float ∪ decimalnum'),
					'float ∪ double': allTypesCodecsTable.float.as('float ∪ double'),
					'float ∪ float': allTypesCodecsTable.float.as('float ∪ float'),
					'float ∪ int': allTypesCodecsTable.float.as('float ∪ int'),
					'float ∪ medint': allTypesCodecsTable.float.as('float ∪ medint'),
					'float ∪ smallint': allTypesCodecsTable.float.as('float ∪ smallint'),
					'float ∪ real': allTypesCodecsTable.float.as('float ∪ real'),
					'float ∪ tinyint': allTypesCodecsTable.float.as('float ∪ tinyint'),
					'float ∪ year': allTypesCodecsTable.float.as('float ∪ year'),
					'int ∪ serial': allTypesCodecsTable.int.as('int ∪ serial'),
					'int ∪ bigint53': allTypesCodecsTable.int.as('int ∪ bigint53'),
					'int ∪ decimalnum': allTypesCodecsTable.int.as('int ∪ decimalnum'),
					'int ∪ double': allTypesCodecsTable.int.as('int ∪ double'),
					'int ∪ float': allTypesCodecsTable.int.as('int ∪ float'),
					'int ∪ int': allTypesCodecsTable.int.as('int ∪ int'),
					'int ∪ medint': allTypesCodecsTable.int.as('int ∪ medint'),
					'int ∪ smallint': allTypesCodecsTable.int.as('int ∪ smallint'),
					'int ∪ real': allTypesCodecsTable.int.as('int ∪ real'),
					'int ∪ tinyint': allTypesCodecsTable.int.as('int ∪ tinyint'),
					'int ∪ year': allTypesCodecsTable.int.as('int ∪ year'),
					'medint ∪ serial': allTypesCodecsTable.medint.as('medint ∪ serial'),
					'medint ∪ bigint53': allTypesCodecsTable.medint.as('medint ∪ bigint53'),
					'medint ∪ decimalnum': allTypesCodecsTable.medint.as('medint ∪ decimalnum'),
					'medint ∪ double': allTypesCodecsTable.medint.as('medint ∪ double'),
					'medint ∪ float': allTypesCodecsTable.medint.as('medint ∪ float'),
					'medint ∪ int': allTypesCodecsTable.medint.as('medint ∪ int'),
					'medint ∪ medint': allTypesCodecsTable.medint.as('medint ∪ medint'),
					'medint ∪ smallint': allTypesCodecsTable.medint.as('medint ∪ smallint'),
					'medint ∪ real': allTypesCodecsTable.medint.as('medint ∪ real'),
					'medint ∪ tinyint': allTypesCodecsTable.medint.as('medint ∪ tinyint'),
					'medint ∪ year': allTypesCodecsTable.medint.as('medint ∪ year'),
					'smallint ∪ serial': allTypesCodecsTable.smallint.as('smallint ∪ serial'),
					'smallint ∪ bigint53': allTypesCodecsTable.smallint.as('smallint ∪ bigint53'),
					'smallint ∪ decimalnum': allTypesCodecsTable.smallint.as('smallint ∪ decimalnum'),
					'smallint ∪ double': allTypesCodecsTable.smallint.as('smallint ∪ double'),
					'smallint ∪ float': allTypesCodecsTable.smallint.as('smallint ∪ float'),
					'smallint ∪ int': allTypesCodecsTable.smallint.as('smallint ∪ int'),
					'smallint ∪ medint': allTypesCodecsTable.smallint.as('smallint ∪ medint'),
					'smallint ∪ smallint': allTypesCodecsTable.smallint.as('smallint ∪ smallint'),
					'smallint ∪ real': allTypesCodecsTable.smallint.as('smallint ∪ real'),
					'smallint ∪ tinyint': allTypesCodecsTable.smallint.as('smallint ∪ tinyint'),
					'smallint ∪ year': allTypesCodecsTable.smallint.as('smallint ∪ year'),
					'real ∪ serial': allTypesCodecsTable.real.as('real ∪ serial'),
					'real ∪ bigint53': allTypesCodecsTable.real.as('real ∪ bigint53'),
					'real ∪ decimalnum': allTypesCodecsTable.real.as('real ∪ decimalnum'),
					'real ∪ double': allTypesCodecsTable.real.as('real ∪ double'),
					'real ∪ float': allTypesCodecsTable.real.as('real ∪ float'),
					'real ∪ int': allTypesCodecsTable.real.as('real ∪ int'),
					'real ∪ medint': allTypesCodecsTable.real.as('real ∪ medint'),
					'real ∪ smallint': allTypesCodecsTable.real.as('real ∪ smallint'),
					'real ∪ real': allTypesCodecsTable.real.as('real ∪ real'),
					'real ∪ tinyint': allTypesCodecsTable.real.as('real ∪ tinyint'),
					'real ∪ year': allTypesCodecsTable.real.as('real ∪ year'),
					'tinyint ∪ serial': allTypesCodecsTable.tinyint.as('tinyint ∪ serial'),
					'tinyint ∪ bigint53': allTypesCodecsTable.tinyint.as('tinyint ∪ bigint53'),
					'tinyint ∪ decimalnum': allTypesCodecsTable.tinyint.as('tinyint ∪ decimalnum'),
					'tinyint ∪ double': allTypesCodecsTable.tinyint.as('tinyint ∪ double'),
					'tinyint ∪ float': allTypesCodecsTable.tinyint.as('tinyint ∪ float'),
					'tinyint ∪ int': allTypesCodecsTable.tinyint.as('tinyint ∪ int'),
					'tinyint ∪ medint': allTypesCodecsTable.tinyint.as('tinyint ∪ medint'),
					'tinyint ∪ smallint': allTypesCodecsTable.tinyint.as('tinyint ∪ smallint'),
					'tinyint ∪ real': allTypesCodecsTable.tinyint.as('tinyint ∪ real'),
					'tinyint ∪ tinyint': allTypesCodecsTable.tinyint.as('tinyint ∪ tinyint'),
					'tinyint ∪ year': allTypesCodecsTable.tinyint.as('tinyint ∪ year'),
					'year ∪ serial': allTypesCodecsTable.year.as('year ∪ serial'),
					'year ∪ bigint53': allTypesCodecsTable.year.as('year ∪ bigint53'),
					'year ∪ decimalnum': allTypesCodecsTable.year.as('year ∪ decimalnum'),
					'year ∪ double': allTypesCodecsTable.year.as('year ∪ double'),
					'year ∪ float': allTypesCodecsTable.year.as('year ∪ float'),
					'year ∪ int': allTypesCodecsTable.year.as('year ∪ int'),
					'year ∪ medint': allTypesCodecsTable.year.as('year ∪ medint'),
					'year ∪ smallint': allTypesCodecsTable.year.as('year ∪ smallint'),
					'year ∪ real': allTypesCodecsTable.year.as('year ∪ real'),
					'year ∪ tinyint': allTypesCodecsTable.year.as('year ∪ tinyint'),
					'year ∪ year': allTypesCodecsTable.year.as('year ∪ year'),
				}).from(allTypesCodecsTable),
				db.select({
					'serial ∪ serial': allTypesCodecsTable.serial.as('serial ∪ serial'),
					'serial ∪ bigint53': allTypesCodecsTable.bigint53.as('serial ∪ bigint53'),
					'serial ∪ decimalnum': allTypesCodecsTable.decimalnum.as('serial ∪ decimalnum'),
					'serial ∪ double': allTypesCodecsTable.double.as('serial ∪ double'),
					'serial ∪ float': allTypesCodecsTable.float.as('serial ∪ float'),
					'serial ∪ int': allTypesCodecsTable.int.as('serial ∪ int'),
					'serial ∪ medint': allTypesCodecsTable.medint.as('serial ∪ medint'),
					'serial ∪ smallint': allTypesCodecsTable.smallint.as('serial ∪ smallint'),
					'serial ∪ real': allTypesCodecsTable.real.as('serial ∪ real'),
					'serial ∪ tinyint': allTypesCodecsTable.tinyint.as('serial ∪ tinyint'),
					'serial ∪ year': allTypesCodecsTable.year.as('serial ∪ year'),
					'bigint53 ∪ serial': allTypesCodecsTable.serial.as('bigint53 ∪ serial'),
					'bigint53 ∪ bigint53': allTypesCodecsTable.bigint53.as('bigint53 ∪ bigint53'),
					'bigint53 ∪ decimalnum': allTypesCodecsTable.decimalnum.as('bigint53 ∪ decimalnum'),
					'bigint53 ∪ double': allTypesCodecsTable.double.as('bigint53 ∪ double'),
					'bigint53 ∪ float': allTypesCodecsTable.float.as('bigint53 ∪ float'),
					'bigint53 ∪ int': allTypesCodecsTable.int.as('bigint53 ∪ int'),
					'bigint53 ∪ medint': allTypesCodecsTable.medint.as('bigint53 ∪ medint'),
					'bigint53 ∪ smallint': allTypesCodecsTable.smallint.as('bigint53 ∪ smallint'),
					'bigint53 ∪ real': allTypesCodecsTable.real.as('bigint53 ∪ real'),
					'bigint53 ∪ tinyint': allTypesCodecsTable.tinyint.as('bigint53 ∪ tinyint'),
					'bigint53 ∪ year': allTypesCodecsTable.year.as('bigint53 ∪ year'),
					'decimalnum ∪ serial': allTypesCodecsTable.serial.as('decimalnum ∪ serial'),
					'decimalnum ∪ bigint53': allTypesCodecsTable.bigint53.as('decimalnum ∪ bigint53'),
					'decimalnum ∪ decimalnum': allTypesCodecsTable.decimalnum.as('decimalnum ∪ decimalnum'),
					'decimalnum ∪ double': allTypesCodecsTable.double.as('decimalnum ∪ double'),
					'decimalnum ∪ float': allTypesCodecsTable.float.as('decimalnum ∪ float'),
					'decimalnum ∪ int': allTypesCodecsTable.int.as('decimalnum ∪ int'),
					'decimalnum ∪ medint': allTypesCodecsTable.medint.as('decimalnum ∪ medint'),
					'decimalnum ∪ smallint': allTypesCodecsTable.smallint.as('decimalnum ∪ smallint'),
					'decimalnum ∪ real': allTypesCodecsTable.real.as('decimalnum ∪ real'),
					'decimalnum ∪ tinyint': allTypesCodecsTable.tinyint.as('decimalnum ∪ tinyint'),
					'decimalnum ∪ year': allTypesCodecsTable.year.as('decimalnum ∪ year'),
					'double ∪ serial': allTypesCodecsTable.serial.as('double ∪ serial'),
					'double ∪ bigint53': allTypesCodecsTable.bigint53.as('double ∪ bigint53'),
					'double ∪ decimalnum': allTypesCodecsTable.decimalnum.as('double ∪ decimalnum'),
					'double ∪ double': allTypesCodecsTable.double.as('double ∪ double'),
					'double ∪ float': allTypesCodecsTable.float.as('double ∪ float'),
					'double ∪ int': allTypesCodecsTable.int.as('double ∪ int'),
					'double ∪ medint': allTypesCodecsTable.medint.as('double ∪ medint'),
					'double ∪ smallint': allTypesCodecsTable.smallint.as('double ∪ smallint'),
					'double ∪ real': allTypesCodecsTable.real.as('double ∪ real'),
					'double ∪ tinyint': allTypesCodecsTable.tinyint.as('double ∪ tinyint'),
					'double ∪ year': allTypesCodecsTable.year.as('double ∪ year'),
					'float ∪ serial': allTypesCodecsTable.serial.as('float ∪ serial'),
					'float ∪ bigint53': allTypesCodecsTable.bigint53.as('float ∪ bigint53'),
					'float ∪ decimalnum': allTypesCodecsTable.decimalnum.as('float ∪ decimalnum'),
					'float ∪ double': allTypesCodecsTable.double.as('float ∪ double'),
					'float ∪ float': allTypesCodecsTable.float.as('float ∪ float'),
					'float ∪ int': allTypesCodecsTable.int.as('float ∪ int'),
					'float ∪ medint': allTypesCodecsTable.medint.as('float ∪ medint'),
					'float ∪ smallint': allTypesCodecsTable.smallint.as('float ∪ smallint'),
					'float ∪ real': allTypesCodecsTable.real.as('float ∪ real'),
					'float ∪ tinyint': allTypesCodecsTable.tinyint.as('float ∪ tinyint'),
					'float ∪ year': allTypesCodecsTable.year.as('float ∪ year'),
					'int ∪ serial': allTypesCodecsTable.serial.as('int ∪ serial'),
					'int ∪ bigint53': allTypesCodecsTable.bigint53.as('int ∪ bigint53'),
					'int ∪ decimalnum': allTypesCodecsTable.decimalnum.as('int ∪ decimalnum'),
					'int ∪ double': allTypesCodecsTable.double.as('int ∪ double'),
					'int ∪ float': allTypesCodecsTable.float.as('int ∪ float'),
					'int ∪ int': allTypesCodecsTable.int.as('int ∪ int'),
					'int ∪ medint': allTypesCodecsTable.medint.as('int ∪ medint'),
					'int ∪ smallint': allTypesCodecsTable.smallint.as('int ∪ smallint'),
					'int ∪ real': allTypesCodecsTable.real.as('int ∪ real'),
					'int ∪ tinyint': allTypesCodecsTable.tinyint.as('int ∪ tinyint'),
					'int ∪ year': allTypesCodecsTable.year.as('int ∪ year'),
					'medint ∪ serial': allTypesCodecsTable.serial.as('medint ∪ serial'),
					'medint ∪ bigint53': allTypesCodecsTable.bigint53.as('medint ∪ bigint53'),
					'medint ∪ decimalnum': allTypesCodecsTable.decimalnum.as('medint ∪ decimalnum'),
					'medint ∪ double': allTypesCodecsTable.double.as('medint ∪ double'),
					'medint ∪ float': allTypesCodecsTable.float.as('medint ∪ float'),
					'medint ∪ int': allTypesCodecsTable.int.as('medint ∪ int'),
					'medint ∪ medint': allTypesCodecsTable.medint.as('medint ∪ medint'),
					'medint ∪ smallint': allTypesCodecsTable.smallint.as('medint ∪ smallint'),
					'medint ∪ real': allTypesCodecsTable.real.as('medint ∪ real'),
					'medint ∪ tinyint': allTypesCodecsTable.tinyint.as('medint ∪ tinyint'),
					'medint ∪ year': allTypesCodecsTable.year.as('medint ∪ year'),
					'smallint ∪ serial': allTypesCodecsTable.serial.as('smallint ∪ serial'),
					'smallint ∪ bigint53': allTypesCodecsTable.bigint53.as('smallint ∪ bigint53'),
					'smallint ∪ decimalnum': allTypesCodecsTable.decimalnum.as('smallint ∪ decimalnum'),
					'smallint ∪ double': allTypesCodecsTable.double.as('smallint ∪ double'),
					'smallint ∪ float': allTypesCodecsTable.float.as('smallint ∪ float'),
					'smallint ∪ int': allTypesCodecsTable.int.as('smallint ∪ int'),
					'smallint ∪ medint': allTypesCodecsTable.medint.as('smallint ∪ medint'),
					'smallint ∪ smallint': allTypesCodecsTable.smallint.as('smallint ∪ smallint'),
					'smallint ∪ real': allTypesCodecsTable.real.as('smallint ∪ real'),
					'smallint ∪ tinyint': allTypesCodecsTable.tinyint.as('smallint ∪ tinyint'),
					'smallint ∪ year': allTypesCodecsTable.year.as('smallint ∪ year'),
					'real ∪ serial': allTypesCodecsTable.serial.as('real ∪ serial'),
					'real ∪ bigint53': allTypesCodecsTable.bigint53.as('real ∪ bigint53'),
					'real ∪ decimalnum': allTypesCodecsTable.decimalnum.as('real ∪ decimalnum'),
					'real ∪ double': allTypesCodecsTable.double.as('real ∪ double'),
					'real ∪ float': allTypesCodecsTable.float.as('real ∪ float'),
					'real ∪ int': allTypesCodecsTable.int.as('real ∪ int'),
					'real ∪ medint': allTypesCodecsTable.medint.as('real ∪ medint'),
					'real ∪ smallint': allTypesCodecsTable.smallint.as('real ∪ smallint'),
					'real ∪ real': allTypesCodecsTable.real.as('real ∪ real'),
					'real ∪ tinyint': allTypesCodecsTable.tinyint.as('real ∪ tinyint'),
					'real ∪ year': allTypesCodecsTable.year.as('real ∪ year'),
					'tinyint ∪ serial': allTypesCodecsTable.serial.as('tinyint ∪ serial'),
					'tinyint ∪ bigint53': allTypesCodecsTable.bigint53.as('tinyint ∪ bigint53'),
					'tinyint ∪ decimalnum': allTypesCodecsTable.decimalnum.as('tinyint ∪ decimalnum'),
					'tinyint ∪ double': allTypesCodecsTable.double.as('tinyint ∪ double'),
					'tinyint ∪ float': allTypesCodecsTable.float.as('tinyint ∪ float'),
					'tinyint ∪ int': allTypesCodecsTable.int.as('tinyint ∪ int'),
					'tinyint ∪ medint': allTypesCodecsTable.medint.as('tinyint ∪ medint'),
					'tinyint ∪ smallint': allTypesCodecsTable.smallint.as('tinyint ∪ smallint'),
					'tinyint ∪ real': allTypesCodecsTable.real.as('tinyint ∪ real'),
					'tinyint ∪ tinyint': allTypesCodecsTable.tinyint.as('tinyint ∪ tinyint'),
					'tinyint ∪ year': allTypesCodecsTable.year.as('tinyint ∪ year'),
					'year ∪ serial': allTypesCodecsTable.serial.as('year ∪ serial'),
					'year ∪ bigint53': allTypesCodecsTable.bigint53.as('year ∪ bigint53'),
					'year ∪ decimalnum': allTypesCodecsTable.decimalnum.as('year ∪ decimalnum'),
					'year ∪ double': allTypesCodecsTable.double.as('year ∪ double'),
					'year ∪ float': allTypesCodecsTable.float.as('year ∪ float'),
					'year ∪ int': allTypesCodecsTable.int.as('year ∪ int'),
					'year ∪ medint': allTypesCodecsTable.medint.as('year ∪ medint'),
					'year ∪ smallint': allTypesCodecsTable.smallint.as('year ∪ smallint'),
					'year ∪ real': allTypesCodecsTable.real.as('year ∪ real'),
					'year ∪ tinyint': allTypesCodecsTable.tinyint.as('year ∪ tinyint'),
					'year ∪ year': allTypesCodecsTable.year.as('year ∪ year'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'serial ∪ serial': 1,
				'serial ∪ bigint53': 1,
				'serial ∪ decimalnum': 1,
				'serial ∪ double': 1,
				'serial ∪ float': 1,
				'serial ∪ int': 1,
				'serial ∪ medint': 1,
				'serial ∪ smallint': 1,
				'serial ∪ real': 1,
				'serial ∪ tinyint': 1,
				'serial ∪ year': 1,
				'bigint53 ∪ serial': 9007199254740991,
				'bigint53 ∪ bigint53': 9007199254740991,
				'bigint53 ∪ decimalnum': 9007199254740991,
				'bigint53 ∪ double': 9007199254740991,
				'bigint53 ∪ float': 9007199254740991,
				'bigint53 ∪ int': 9007199254740991,
				'bigint53 ∪ medint': 9007199254740991,
				'bigint53 ∪ smallint': 9007199254740991,
				'bigint53 ∪ real': 9007199254740991,
				'bigint53 ∪ tinyint': 9007199254740991,
				'bigint53 ∪ year': 9007199254740991,
				'decimalnum ∪ serial': 9007199254740991,
				'decimalnum ∪ bigint53': 9007199254740991,
				'decimalnum ∪ decimalnum': 9007199254740991,
				'decimalnum ∪ double': 9007199254740991,
				'decimalnum ∪ float': 9007199254740991,
				'decimalnum ∪ int': 9007199254740991,
				'decimalnum ∪ medint': 9007199254740991,
				'decimalnum ∪ smallint': 9007199254740991,
				'decimalnum ∪ real': 9007199254740991,
				'decimalnum ∪ tinyint': 9007199254740991,
				'decimalnum ∪ year': 9007199254740991,
				'double ∪ serial': 15.35325689124218,
				'double ∪ bigint53': 15.35325689124218,
				'double ∪ decimalnum': 15.35325689124218,
				'double ∪ double': 15.35325689124218,
				'double ∪ float': 15.35325689124218,
				'double ∪ int': 15.35325689124218,
				'double ∪ medint': 15.35325689124218,
				'double ∪ smallint': 15.35325689124218,
				'double ∪ real': 15.35325689124218,
				'double ∪ tinyint': 15.35325689124218,
				'double ∪ year': 15.35325689124218,
				'float ∪ serial': 1.048596,
				'float ∪ bigint53': 1.048596,
				'float ∪ decimalnum': 1.0485960245132446,
				'float ∪ double': 1.0485960245132446,
				'float ∪ float': 1.048596,
				'float ∪ int': 1.0485960245132446,
				'float ∪ medint': 1.048596,
				'float ∪ smallint': 1.048596,
				'float ∪ real': 1.0485960245132446,
				'float ∪ tinyint': 1.048596,
				'float ∪ year': 1.048596,
				'int ∪ serial': 621,
				'int ∪ bigint53': 621,
				'int ∪ decimalnum': 621,
				'int ∪ double': 621,
				'int ∪ float': 621,
				'int ∪ int': 621,
				'int ∪ medint': 621,
				'int ∪ smallint': 621,
				'int ∪ real': 621,
				'int ∪ tinyint': 621,
				'int ∪ year': 621,
				'medint ∪ serial': 560,
				'medint ∪ bigint53': 560,
				'medint ∪ decimalnum': 560,
				'medint ∪ double': 560,
				'medint ∪ float': 560,
				'medint ∪ int': 560,
				'medint ∪ medint': 560,
				'medint ∪ smallint': 560,
				'medint ∪ real': 560,
				'medint ∪ tinyint': 560,
				'medint ∪ year': 560,
				'smallint ∪ serial': 14,
				'smallint ∪ bigint53': 14,
				'smallint ∪ decimalnum': 14,
				'smallint ∪ double': 14,
				'smallint ∪ float': 14,
				'smallint ∪ int': 14,
				'smallint ∪ medint': 14,
				'smallint ∪ smallint': 14,
				'smallint ∪ real': 14,
				'smallint ∪ tinyint': 14,
				'smallint ∪ year': 14,
				'real ∪ serial': 1.048596,
				'real ∪ bigint53': 1.048596,
				'real ∪ decimalnum': 1.048596,
				'real ∪ double': 1.048596,
				'real ∪ float': 1.048596,
				'real ∪ int': 1.048596,
				'real ∪ medint': 1.048596,
				'real ∪ smallint': 1.048596,
				'real ∪ real': 1.048596,
				'real ∪ tinyint': 1.048596,
				'real ∪ year': 1.048596,
				'tinyint ∪ serial': 7,
				'tinyint ∪ bigint53': 7,
				'tinyint ∪ decimalnum': 7,
				'tinyint ∪ double': 7,
				'tinyint ∪ float': 7,
				'tinyint ∪ int': 7,
				'tinyint ∪ medint': 7,
				'tinyint ∪ smallint': 7,
				'tinyint ∪ real': 7,
				'tinyint ∪ tinyint': 7,
				'tinyint ∪ year': 7,
				'year ∪ serial': 2025,
				'year ∪ bigint53': 2025,
				'year ∪ decimalnum': 2025,
				'year ∪ double': 2025,
				'year ∪ float': 2025,
				'year ∪ int': 2025,
				'year ∪ medint': 2025,
				'year ∪ smallint': 2025,
				'year ∪ real': 2025,
				'year ∪ tinyint': isTidb ? 2025 : 127,
				'year ∪ year': 2025,
			},
			{
				'serial ∪ serial': 1,
				'serial ∪ bigint53': 9007199254740991,
				'serial ∪ decimalnum': 9007199254740991,
				'serial ∪ double': 15.35325689124218,
				'serial ∪ float': 1.0485960245132446,
				'serial ∪ int': 621,
				'serial ∪ medint': 560,
				'serial ∪ smallint': 14,
				'serial ∪ real': 1.048596,
				'serial ∪ tinyint': 7,
				'serial ∪ year': 2025,
				'bigint53 ∪ serial': 1,
				'bigint53 ∪ bigint53': 9007199254740991,
				'bigint53 ∪ decimalnum': 9007199254740991,
				'bigint53 ∪ double': 15.35325689124218,
				'bigint53 ∪ float': 1.0485960245132446,
				'bigint53 ∪ int': 621,
				'bigint53 ∪ medint': 560,
				'bigint53 ∪ smallint': 14,
				'bigint53 ∪ real': 1.048596,
				'bigint53 ∪ tinyint': 7,
				'bigint53 ∪ year': 2025,
				'decimalnum ∪ serial': 1,
				'decimalnum ∪ bigint53': 9007199254740991,
				'decimalnum ∪ decimalnum': 9007199254740991,
				'decimalnum ∪ double': 15.35325689124218,
				'decimalnum ∪ float': 1.0485960245132446,
				'decimalnum ∪ int': 621,
				'decimalnum ∪ medint': 560,
				'decimalnum ∪ smallint': 14,
				'decimalnum ∪ real': 1.048596,
				'decimalnum ∪ tinyint': 7,
				'decimalnum ∪ year': 2025,
				'double ∪ serial': 1,
				'double ∪ bigint53': 9007199254740991,
				'double ∪ decimalnum': 9007199254740991,
				'double ∪ double': 15.35325689124218,
				'double ∪ float': 1.0485960245132446,
				'double ∪ int': 621,
				'double ∪ medint': 560,
				'double ∪ smallint': 14,
				'double ∪ real': 1.048596,
				'double ∪ tinyint': 7,
				'double ∪ year': 2025,
				'float ∪ serial': 1,
				'float ∪ bigint53': isTidb ? 9007200000000000 : 9007199000000000,
				'float ∪ decimalnum': 9007199254740991,
				'float ∪ double': 15.35325689124218,
				'float ∪ float': 1.048596,
				'float ∪ int': 621,
				'float ∪ medint': 560,
				'float ∪ smallint': 14,
				'float ∪ real': 1.048596,
				'float ∪ tinyint': 7,
				'float ∪ year': 2025,
				'int ∪ serial': 1,
				'int ∪ bigint53': 9007199254740991,
				'int ∪ decimalnum': 9007199254740991,
				'int ∪ double': 15.35325689124218,
				'int ∪ float': 1.0485960245132446,
				'int ∪ int': 621,
				'int ∪ medint': 560,
				'int ∪ smallint': 14,
				'int ∪ real': 1.048596,
				'int ∪ tinyint': 7,
				'int ∪ year': 2025,
				'medint ∪ serial': 1,
				'medint ∪ bigint53': 9007199254740991,
				'medint ∪ decimalnum': 9007199254740991,
				'medint ∪ double': 15.35325689124218,
				'medint ∪ float': 1.048596,
				'medint ∪ int': 621,
				'medint ∪ medint': 560,
				'medint ∪ smallint': 14,
				'medint ∪ real': 1.048596,
				'medint ∪ tinyint': 7,
				'medint ∪ year': 2025,
				'smallint ∪ serial': 1,
				'smallint ∪ bigint53': 9007199254740991,
				'smallint ∪ decimalnum': 9007199254740991,
				'smallint ∪ double': 15.35325689124218,
				'smallint ∪ float': 1.048596,
				'smallint ∪ int': 621,
				'smallint ∪ medint': 560,
				'smallint ∪ smallint': 14,
				'smallint ∪ real': 1.048596,
				'smallint ∪ tinyint': 7,
				'smallint ∪ year': 2025,
				'real ∪ serial': 1,
				'real ∪ bigint53': 9007199254740991,
				'real ∪ decimalnum': 9007199254740991,
				'real ∪ double': 15.35325689124218,
				'real ∪ float': 1.0485960245132446,
				'real ∪ int': 621,
				'real ∪ medint': 560,
				'real ∪ smallint': 14,
				'real ∪ real': 1.048596,
				'real ∪ tinyint': 7,
				'real ∪ year': 2025,
				'tinyint ∪ serial': 1,
				'tinyint ∪ bigint53': 9007199254740991,
				'tinyint ∪ decimalnum': 9007199254740991,
				'tinyint ∪ double': 15.35325689124218,
				'tinyint ∪ float': 1.048596,
				'tinyint ∪ int': 621,
				'tinyint ∪ medint': 560,
				'tinyint ∪ smallint': 14,
				'tinyint ∪ real': 1.048596,
				'tinyint ∪ tinyint': 7,
				'tinyint ∪ year': isTidb ? 2025 : 127,
				'year ∪ serial': 1,
				'year ∪ bigint53': 9007199254740991,
				'year ∪ decimalnum': 9007199254740991,
				'year ∪ double': 15.35325689124218,
				'year ∪ float': 1.048596,
				'year ∪ int': 621,
				'year ∪ medint': 560,
				'year ∪ smallint': 14,
				'year ∪ real': 1.048596,
				'year ∪ tinyint': 7,
				'year ∪ year': 2025,
			},
		]));

		// ---- strings ----
		expect(
			await unionAll(
				db.select({
					'bigintstr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ bigintstr'),
					'bigintstr ∪ char': allTypesCodecsTable.bigintstr.as('bigintstr ∪ char'),
					'bigintstr ∪ decimal': allTypesCodecsTable.bigintstr.as('bigintstr ∪ decimal'),
					'bigintstr ∪ text': allTypesCodecsTable.bigintstr.as('bigintstr ∪ text'),
					'bigintstr ∪ tinytext': allTypesCodecsTable.bigintstr.as('bigintstr ∪ tinytext'),
					'bigintstr ∪ mediumtext': allTypesCodecsTable.bigintstr.as('bigintstr ∪ mediumtext'),
					'bigintstr ∪ longtext': allTypesCodecsTable.bigintstr.as('bigintstr ∪ longtext'),
					'bigintstr ∪ varchar': allTypesCodecsTable.bigintstr.as('bigintstr ∪ varchar'),
					'bigintstr ∪ varbin': allTypesCodecsTable.bigintstr.as('bigintstr ∪ varbin'),
					'bigintstr ∪ stringblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringblob'),
					'bigintstr ∪ stringtinyblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringtinyblob'),
					'bigintstr ∪ stringmediumblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringmediumblob'),
					'bigintstr ∪ stringlongblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringlongblob'),
					'bigintstr ∪ datestr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ datestr'),
					'bigintstr ∪ datetimestr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ datetimestr'),
					'bigintstr ∪ timestampstr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ timestampstr'),
					'bigintstr ∪ time': allTypesCodecsTable.bigintstr.as('bigintstr ∪ time'),
					'char ∪ bigintstr': allTypesCodecsTable.char.as('char ∪ bigintstr'),
					'char ∪ char': allTypesCodecsTable.char.as('char ∪ char'),
					'char ∪ decimal': allTypesCodecsTable.char.as('char ∪ decimal'),
					'char ∪ text': allTypesCodecsTable.char.as('char ∪ text'),
					'char ∪ tinytext': allTypesCodecsTable.char.as('char ∪ tinytext'),
					'char ∪ mediumtext': allTypesCodecsTable.char.as('char ∪ mediumtext'),
					'char ∪ longtext': allTypesCodecsTable.char.as('char ∪ longtext'),
					'char ∪ varchar': allTypesCodecsTable.char.as('char ∪ varchar'),
					'char ∪ varbin': allTypesCodecsTable.char.as('char ∪ varbin'),
					'char ∪ stringblob': allTypesCodecsTable.char.as('char ∪ stringblob'),
					'char ∪ stringtinyblob': allTypesCodecsTable.char.as('char ∪ stringtinyblob'),
					'char ∪ stringmediumblob': allTypesCodecsTable.char.as('char ∪ stringmediumblob'),
					'char ∪ stringlongblob': allTypesCodecsTable.char.as('char ∪ stringlongblob'),
					'char ∪ datestr': allTypesCodecsTable.char.as('char ∪ datestr'),
					'char ∪ datetimestr': allTypesCodecsTable.char.as('char ∪ datetimestr'),
					'char ∪ timestampstr': allTypesCodecsTable.char.as('char ∪ timestampstr'),
					'char ∪ time': allTypesCodecsTable.char.as('char ∪ time'),
					'decimal ∪ bigintstr': allTypesCodecsTable.decimal.as('decimal ∪ bigintstr'),
					'decimal ∪ char': allTypesCodecsTable.decimal.as('decimal ∪ char'),
					'decimal ∪ decimal': allTypesCodecsTable.decimal.as('decimal ∪ decimal'),
					'decimal ∪ text': allTypesCodecsTable.decimal.as('decimal ∪ text'),
					'decimal ∪ tinytext': allTypesCodecsTable.decimal.as('decimal ∪ tinytext'),
					'decimal ∪ mediumtext': allTypesCodecsTable.decimal.as('decimal ∪ mediumtext'),
					'decimal ∪ longtext': allTypesCodecsTable.decimal.as('decimal ∪ longtext'),
					'decimal ∪ varchar': allTypesCodecsTable.decimal.as('decimal ∪ varchar'),
					'decimal ∪ varbin': allTypesCodecsTable.decimal.as('decimal ∪ varbin'),
					'decimal ∪ stringblob': allTypesCodecsTable.decimal.as('decimal ∪ stringblob'),
					'decimal ∪ stringtinyblob': allTypesCodecsTable.decimal.as('decimal ∪ stringtinyblob'),
					'decimal ∪ stringmediumblob': allTypesCodecsTable.decimal.as('decimal ∪ stringmediumblob'),
					'decimal ∪ stringlongblob': allTypesCodecsTable.decimal.as('decimal ∪ stringlongblob'),
					'decimal ∪ datestr': allTypesCodecsTable.decimal.as('decimal ∪ datestr'),
					'decimal ∪ datetimestr': allTypesCodecsTable.decimal.as('decimal ∪ datetimestr'),
					'decimal ∪ timestampstr': allTypesCodecsTable.decimal.as('decimal ∪ timestampstr'),
					'decimal ∪ time': allTypesCodecsTable.decimal.as('decimal ∪ time'),
					'text ∪ bigintstr': allTypesCodecsTable.text.as('text ∪ bigintstr'),
					'text ∪ char': allTypesCodecsTable.text.as('text ∪ char'),
					'text ∪ decimal': allTypesCodecsTable.text.as('text ∪ decimal'),
					'text ∪ text': allTypesCodecsTable.text.as('text ∪ text'),
					'text ∪ tinytext': allTypesCodecsTable.text.as('text ∪ tinytext'),
					'text ∪ mediumtext': allTypesCodecsTable.text.as('text ∪ mediumtext'),
					'text ∪ longtext': allTypesCodecsTable.text.as('text ∪ longtext'),
					'text ∪ varchar': allTypesCodecsTable.text.as('text ∪ varchar'),
					'text ∪ varbin': allTypesCodecsTable.text.as('text ∪ varbin'),
					'text ∪ stringblob': allTypesCodecsTable.text.as('text ∪ stringblob'),
					'text ∪ stringtinyblob': allTypesCodecsTable.text.as('text ∪ stringtinyblob'),
					'text ∪ stringmediumblob': allTypesCodecsTable.text.as('text ∪ stringmediumblob'),
					'text ∪ stringlongblob': allTypesCodecsTable.text.as('text ∪ stringlongblob'),
					'text ∪ datestr': allTypesCodecsTable.text.as('text ∪ datestr'),
					'text ∪ datetimestr': allTypesCodecsTable.text.as('text ∪ datetimestr'),
					'text ∪ timestampstr': allTypesCodecsTable.text.as('text ∪ timestampstr'),
					'text ∪ time': allTypesCodecsTable.text.as('text ∪ time'),
					'tinytext ∪ bigintstr': allTypesCodecsTable.tinytext.as('tinytext ∪ bigintstr'),
					'tinytext ∪ char': allTypesCodecsTable.tinytext.as('tinytext ∪ char'),
					'tinytext ∪ decimal': allTypesCodecsTable.tinytext.as('tinytext ∪ decimal'),
					'tinytext ∪ text': allTypesCodecsTable.tinytext.as('tinytext ∪ text'),
					'tinytext ∪ tinytext': allTypesCodecsTable.tinytext.as('tinytext ∪ tinytext'),
					'tinytext ∪ mediumtext': allTypesCodecsTable.tinytext.as('tinytext ∪ mediumtext'),
					'tinytext ∪ longtext': allTypesCodecsTable.tinytext.as('tinytext ∪ longtext'),
					'tinytext ∪ varchar': allTypesCodecsTable.tinytext.as('tinytext ∪ varchar'),
					'tinytext ∪ varbin': allTypesCodecsTable.tinytext.as('tinytext ∪ varbin'),
					'tinytext ∪ stringblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringblob'),
					'tinytext ∪ stringtinyblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringtinyblob'),
					'tinytext ∪ stringmediumblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringmediumblob'),
					'tinytext ∪ stringlongblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringlongblob'),
					'tinytext ∪ datestr': allTypesCodecsTable.tinytext.as('tinytext ∪ datestr'),
					'tinytext ∪ datetimestr': allTypesCodecsTable.tinytext.as('tinytext ∪ datetimestr'),
					'tinytext ∪ timestampstr': allTypesCodecsTable.tinytext.as('tinytext ∪ timestampstr'),
					'tinytext ∪ time': allTypesCodecsTable.tinytext.as('tinytext ∪ time'),
					'mediumtext ∪ bigintstr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ bigintstr'),
					'mediumtext ∪ char': allTypesCodecsTable.mediumtext.as('mediumtext ∪ char'),
					'mediumtext ∪ decimal': allTypesCodecsTable.mediumtext.as('mediumtext ∪ decimal'),
					'mediumtext ∪ text': allTypesCodecsTable.mediumtext.as('mediumtext ∪ text'),
					'mediumtext ∪ tinytext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ tinytext'),
					'mediumtext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ mediumtext'),
					'mediumtext ∪ longtext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ longtext'),
					'mediumtext ∪ varchar': allTypesCodecsTable.mediumtext.as('mediumtext ∪ varchar'),
					'mediumtext ∪ varbin': allTypesCodecsTable.mediumtext.as('mediumtext ∪ varbin'),
					'mediumtext ∪ stringblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringblob'),
					'mediumtext ∪ stringtinyblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringtinyblob'),
					'mediumtext ∪ stringmediumblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringmediumblob'),
					'mediumtext ∪ stringlongblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringlongblob'),
					'mediumtext ∪ datestr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ datestr'),
					'mediumtext ∪ datetimestr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ datetimestr'),
					'mediumtext ∪ timestampstr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ timestampstr'),
					'mediumtext ∪ time': allTypesCodecsTable.mediumtext.as('mediumtext ∪ time'),
					'longtext ∪ bigintstr': allTypesCodecsTable.longtext.as('longtext ∪ bigintstr'),
					'longtext ∪ char': allTypesCodecsTable.longtext.as('longtext ∪ char'),
					'longtext ∪ decimal': allTypesCodecsTable.longtext.as('longtext ∪ decimal'),
					'longtext ∪ text': allTypesCodecsTable.longtext.as('longtext ∪ text'),
					'longtext ∪ tinytext': allTypesCodecsTable.longtext.as('longtext ∪ tinytext'),
					'longtext ∪ mediumtext': allTypesCodecsTable.longtext.as('longtext ∪ mediumtext'),
					'longtext ∪ longtext': allTypesCodecsTable.longtext.as('longtext ∪ longtext'),
					'longtext ∪ varchar': allTypesCodecsTable.longtext.as('longtext ∪ varchar'),
					'longtext ∪ varbin': allTypesCodecsTable.longtext.as('longtext ∪ varbin'),
					'longtext ∪ stringblob': allTypesCodecsTable.longtext.as('longtext ∪ stringblob'),
					'longtext ∪ stringtinyblob': allTypesCodecsTable.longtext.as('longtext ∪ stringtinyblob'),
					'longtext ∪ stringmediumblob': allTypesCodecsTable.longtext.as('longtext ∪ stringmediumblob'),
					'longtext ∪ stringlongblob': allTypesCodecsTable.longtext.as('longtext ∪ stringlongblob'),
					'longtext ∪ datestr': allTypesCodecsTable.longtext.as('longtext ∪ datestr'),
					'longtext ∪ datetimestr': allTypesCodecsTable.longtext.as('longtext ∪ datetimestr'),
					'longtext ∪ timestampstr': allTypesCodecsTable.longtext.as('longtext ∪ timestampstr'),
					'longtext ∪ time': allTypesCodecsTable.longtext.as('longtext ∪ time'),
					'varchar ∪ bigintstr': allTypesCodecsTable.varchar.as('varchar ∪ bigintstr'),
					'varchar ∪ char': allTypesCodecsTable.varchar.as('varchar ∪ char'),
					'varchar ∪ decimal': allTypesCodecsTable.varchar.as('varchar ∪ decimal'),
					'varchar ∪ text': allTypesCodecsTable.varchar.as('varchar ∪ text'),
					'varchar ∪ tinytext': allTypesCodecsTable.varchar.as('varchar ∪ tinytext'),
					'varchar ∪ mediumtext': allTypesCodecsTable.varchar.as('varchar ∪ mediumtext'),
					'varchar ∪ longtext': allTypesCodecsTable.varchar.as('varchar ∪ longtext'),
					'varchar ∪ varchar': allTypesCodecsTable.varchar.as('varchar ∪ varchar'),
					'varchar ∪ varbin': allTypesCodecsTable.varchar.as('varchar ∪ varbin'),
					'varchar ∪ stringblob': allTypesCodecsTable.varchar.as('varchar ∪ stringblob'),
					'varchar ∪ stringtinyblob': allTypesCodecsTable.varchar.as('varchar ∪ stringtinyblob'),
					'varchar ∪ stringmediumblob': allTypesCodecsTable.varchar.as('varchar ∪ stringmediumblob'),
					'varchar ∪ stringlongblob': allTypesCodecsTable.varchar.as('varchar ∪ stringlongblob'),
					'varchar ∪ datestr': allTypesCodecsTable.varchar.as('varchar ∪ datestr'),
					'varchar ∪ datetimestr': allTypesCodecsTable.varchar.as('varchar ∪ datetimestr'),
					'varchar ∪ timestampstr': allTypesCodecsTable.varchar.as('varchar ∪ timestampstr'),
					'varchar ∪ time': allTypesCodecsTable.varchar.as('varchar ∪ time'),
					'varbin ∪ bigintstr': allTypesCodecsTable.varbin.as('varbin ∪ bigintstr'),
					'varbin ∪ char': allTypesCodecsTable.varbin.as('varbin ∪ char'),
					'varbin ∪ decimal': allTypesCodecsTable.varbin.as('varbin ∪ decimal'),
					'varbin ∪ text': allTypesCodecsTable.varbin.as('varbin ∪ text'),
					'varbin ∪ tinytext': allTypesCodecsTable.varbin.as('varbin ∪ tinytext'),
					'varbin ∪ mediumtext': allTypesCodecsTable.varbin.as('varbin ∪ mediumtext'),
					'varbin ∪ longtext': allTypesCodecsTable.varbin.as('varbin ∪ longtext'),
					'varbin ∪ varchar': allTypesCodecsTable.varbin.as('varbin ∪ varchar'),
					'varbin ∪ varbin': allTypesCodecsTable.varbin.as('varbin ∪ varbin'),
					'varbin ∪ stringblob': allTypesCodecsTable.varbin.as('varbin ∪ stringblob'),
					'varbin ∪ stringtinyblob': allTypesCodecsTable.varbin.as('varbin ∪ stringtinyblob'),
					'varbin ∪ stringmediumblob': allTypesCodecsTable.varbin.as('varbin ∪ stringmediumblob'),
					'varbin ∪ stringlongblob': allTypesCodecsTable.varbin.as('varbin ∪ stringlongblob'),
					'varbin ∪ datestr': allTypesCodecsTable.varbin.as('varbin ∪ datestr'),
					'varbin ∪ datetimestr': allTypesCodecsTable.varbin.as('varbin ∪ datetimestr'),
					'varbin ∪ timestampstr': allTypesCodecsTable.varbin.as('varbin ∪ timestampstr'),
					'varbin ∪ time': allTypesCodecsTable.varbin.as('varbin ∪ time'),
					'stringblob ∪ bigintstr': allTypesCodecsTable.stringblob.as('stringblob ∪ bigintstr'),
					'stringblob ∪ char': allTypesCodecsTable.stringblob.as('stringblob ∪ char'),
					'stringblob ∪ decimal': allTypesCodecsTable.stringblob.as('stringblob ∪ decimal'),
					'stringblob ∪ text': allTypesCodecsTable.stringblob.as('stringblob ∪ text'),
					'stringblob ∪ tinytext': allTypesCodecsTable.stringblob.as('stringblob ∪ tinytext'),
					'stringblob ∪ mediumtext': allTypesCodecsTable.stringblob.as('stringblob ∪ mediumtext'),
					'stringblob ∪ longtext': allTypesCodecsTable.stringblob.as('stringblob ∪ longtext'),
					'stringblob ∪ varchar': allTypesCodecsTable.stringblob.as('stringblob ∪ varchar'),
					'stringblob ∪ varbin': allTypesCodecsTable.stringblob.as('stringblob ∪ varbin'),
					'stringblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringblob'),
					'stringblob ∪ stringtinyblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringtinyblob'),
					'stringblob ∪ stringmediumblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringmediumblob'),
					'stringblob ∪ stringlongblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringlongblob'),
					'stringblob ∪ datestr': allTypesCodecsTable.stringblob.as('stringblob ∪ datestr'),
					'stringblob ∪ datetimestr': allTypesCodecsTable.stringblob.as('stringblob ∪ datetimestr'),
					'stringblob ∪ timestampstr': allTypesCodecsTable.stringblob.as('stringblob ∪ timestampstr'),
					'stringblob ∪ time': allTypesCodecsTable.stringblob.as('stringblob ∪ time'),
					'stringtinyblob ∪ bigintstr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ bigintstr'),
					'stringtinyblob ∪ char': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ char'),
					'stringtinyblob ∪ decimal': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ decimal'),
					'stringtinyblob ∪ text': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ text'),
					'stringtinyblob ∪ tinytext': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ tinytext'),
					'stringtinyblob ∪ mediumtext': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ mediumtext'),
					'stringtinyblob ∪ longtext': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ longtext'),
					'stringtinyblob ∪ varchar': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ varchar'),
					'stringtinyblob ∪ varbin': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ varbin'),
					'stringtinyblob ∪ stringblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringblob'),
					'stringtinyblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringtinyblob'),
					'stringtinyblob ∪ stringmediumblob': allTypesCodecsTable.stringtinyblob.as(
						'stringtinyblob ∪ stringmediumblob',
					),
					'stringtinyblob ∪ stringlongblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringlongblob'),
					'stringtinyblob ∪ datestr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ datestr'),
					'stringtinyblob ∪ datetimestr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ datetimestr'),
					'stringtinyblob ∪ timestampstr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ timestampstr'),
					'stringtinyblob ∪ time': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ time'),
					'stringmediumblob ∪ bigintstr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ bigintstr'),
					'stringmediumblob ∪ char': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ char'),
					'stringmediumblob ∪ decimal': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ decimal'),
					'stringmediumblob ∪ text': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ text'),
					'stringmediumblob ∪ tinytext': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ tinytext'),
					'stringmediumblob ∪ mediumtext': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ mediumtext'),
					'stringmediumblob ∪ longtext': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ longtext'),
					'stringmediumblob ∪ varchar': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ varchar'),
					'stringmediumblob ∪ varbin': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ varbin'),
					'stringmediumblob ∪ stringblob': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ stringblob'),
					'stringmediumblob ∪ stringtinyblob': allTypesCodecsTable.stringmediumblob.as(
						'stringmediumblob ∪ stringtinyblob',
					),
					'stringmediumblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
						'stringmediumblob ∪ stringmediumblob',
					),
					'stringmediumblob ∪ stringlongblob': allTypesCodecsTable.stringmediumblob.as(
						'stringmediumblob ∪ stringlongblob',
					),
					'stringmediumblob ∪ datestr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ datestr'),
					'stringmediumblob ∪ datetimestr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ datetimestr'),
					'stringmediumblob ∪ timestampstr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ timestampstr'),
					'stringmediumblob ∪ time': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ time'),
					'stringlongblob ∪ bigintstr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ bigintstr'),
					'stringlongblob ∪ char': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ char'),
					'stringlongblob ∪ decimal': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ decimal'),
					'stringlongblob ∪ text': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ text'),
					'stringlongblob ∪ tinytext': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ tinytext'),
					'stringlongblob ∪ mediumtext': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ mediumtext'),
					'stringlongblob ∪ longtext': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ longtext'),
					'stringlongblob ∪ varchar': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ varchar'),
					'stringlongblob ∪ varbin': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ varbin'),
					'stringlongblob ∪ stringblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringblob'),
					'stringlongblob ∪ stringtinyblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringtinyblob'),
					'stringlongblob ∪ stringmediumblob': allTypesCodecsTable.stringlongblob.as(
						'stringlongblob ∪ stringmediumblob',
					),
					'stringlongblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringlongblob'),
					'stringlongblob ∪ datestr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ datestr'),
					'stringlongblob ∪ datetimestr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ datetimestr'),
					'stringlongblob ∪ timestampstr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ timestampstr'),
					'stringlongblob ∪ time': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ time'),
					'datestr ∪ bigintstr': allTypesCodecsTable.datestr.as('datestr ∪ bigintstr'),
					'datestr ∪ char': allTypesCodecsTable.datestr.as('datestr ∪ char'),
					'datestr ∪ decimal': allTypesCodecsTable.datestr.as('datestr ∪ decimal'),
					'datestr ∪ text': allTypesCodecsTable.datestr.as('datestr ∪ text'),
					'datestr ∪ tinytext': allTypesCodecsTable.datestr.as('datestr ∪ tinytext'),
					'datestr ∪ mediumtext': allTypesCodecsTable.datestr.as('datestr ∪ mediumtext'),
					'datestr ∪ longtext': allTypesCodecsTable.datestr.as('datestr ∪ longtext'),
					'datestr ∪ varchar': allTypesCodecsTable.datestr.as('datestr ∪ varchar'),
					'datestr ∪ varbin': allTypesCodecsTable.datestr.as('datestr ∪ varbin'),
					'datestr ∪ stringblob': allTypesCodecsTable.datestr.as('datestr ∪ stringblob'),
					'datestr ∪ stringtinyblob': allTypesCodecsTable.datestr.as('datestr ∪ stringtinyblob'),
					'datestr ∪ stringmediumblob': allTypesCodecsTable.datestr.as('datestr ∪ stringmediumblob'),
					'datestr ∪ stringlongblob': allTypesCodecsTable.datestr.as('datestr ∪ stringlongblob'),
					'datestr ∪ datestr': allTypesCodecsTable.datestr.as('datestr ∪ datestr'),
					'datestr ∪ datetimestr': allTypesCodecsTable.datestr.as('datestr ∪ datetimestr'),
					'datestr ∪ timestampstr': allTypesCodecsTable.datestr.as('datestr ∪ timestampstr'),
					'datetimestr ∪ bigintstr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ bigintstr'),
					'datetimestr ∪ char': allTypesCodecsTable.datetimestr.as('datetimestr ∪ char'),
					'datetimestr ∪ decimal': allTypesCodecsTable.datetimestr.as('datetimestr ∪ decimal'),
					'datetimestr ∪ text': allTypesCodecsTable.datetimestr.as('datetimestr ∪ text'),
					'datetimestr ∪ tinytext': allTypesCodecsTable.datetimestr.as('datetimestr ∪ tinytext'),
					'datetimestr ∪ mediumtext': allTypesCodecsTable.datetimestr.as('datetimestr ∪ mediumtext'),
					'datetimestr ∪ longtext': allTypesCodecsTable.datetimestr.as('datetimestr ∪ longtext'),
					'datetimestr ∪ varchar': allTypesCodecsTable.datetimestr.as('datetimestr ∪ varchar'),
					'datetimestr ∪ varbin': allTypesCodecsTable.datetimestr.as('datetimestr ∪ varbin'),
					'datetimestr ∪ stringblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringblob'),
					'datetimestr ∪ stringtinyblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringtinyblob'),
					'datetimestr ∪ stringmediumblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringmediumblob'),
					'datetimestr ∪ stringlongblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringlongblob'),
					'datetimestr ∪ datestr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ datestr'),
					'datetimestr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ datetimestr'),
					'datetimestr ∪ timestampstr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ timestampstr'),
					'timestampstr ∪ bigintstr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ bigintstr'),
					'timestampstr ∪ char': allTypesCodecsTable.timestampstr.as('timestampstr ∪ char'),
					'timestampstr ∪ decimal': allTypesCodecsTable.timestampstr.as('timestampstr ∪ decimal'),
					'timestampstr ∪ text': allTypesCodecsTable.timestampstr.as('timestampstr ∪ text'),
					'timestampstr ∪ tinytext': allTypesCodecsTable.timestampstr.as('timestampstr ∪ tinytext'),
					'timestampstr ∪ mediumtext': allTypesCodecsTable.timestampstr.as('timestampstr ∪ mediumtext'),
					'timestampstr ∪ longtext': allTypesCodecsTable.timestampstr.as('timestampstr ∪ longtext'),
					'timestampstr ∪ varchar': allTypesCodecsTable.timestampstr.as('timestampstr ∪ varchar'),
					'timestampstr ∪ varbin': allTypesCodecsTable.timestampstr.as('timestampstr ∪ varbin'),
					'timestampstr ∪ stringblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringblob'),
					'timestampstr ∪ stringtinyblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringtinyblob'),
					'timestampstr ∪ stringmediumblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringmediumblob'),
					'timestampstr ∪ stringlongblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringlongblob'),
					'timestampstr ∪ datestr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ datestr'),
					'timestampstr ∪ datetimestr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ datetimestr'),
					'timestampstr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ timestampstr'),
					'time ∪ bigintstr': allTypesCodecsTable.time.as('time ∪ bigintstr'),
					'time ∪ char': allTypesCodecsTable.time.as('time ∪ char'),
					'time ∪ decimal': allTypesCodecsTable.time.as('time ∪ decimal'),
					'time ∪ text': allTypesCodecsTable.time.as('time ∪ text'),
					'time ∪ tinytext': allTypesCodecsTable.time.as('time ∪ tinytext'),
					'time ∪ mediumtext': allTypesCodecsTable.time.as('time ∪ mediumtext'),
					'time ∪ longtext': allTypesCodecsTable.time.as('time ∪ longtext'),
					'time ∪ varchar': allTypesCodecsTable.time.as('time ∪ varchar'),
					'time ∪ varbin': allTypesCodecsTable.time.as('time ∪ varbin'),
					'time ∪ stringblob': allTypesCodecsTable.time.as('time ∪ stringblob'),
					'time ∪ stringtinyblob': allTypesCodecsTable.time.as('time ∪ stringtinyblob'),
					'time ∪ stringmediumblob': allTypesCodecsTable.time.as('time ∪ stringmediumblob'),
					'time ∪ stringlongblob': allTypesCodecsTable.time.as('time ∪ stringlongblob'),
					'time ∪ time': allTypesCodecsTable.time.as('time ∪ time'),
					'binary ∪ binary': allTypesCodecsTable.binary.as('binary ∪ binary'),
				}).from(allTypesCodecsTable),
				db.select({
					'bigintstr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ bigintstr'),
					'bigintstr ∪ char': allTypesCodecsTable.char.as('bigintstr ∪ char'),
					'bigintstr ∪ decimal': allTypesCodecsTable.decimal.as('bigintstr ∪ decimal'),
					'bigintstr ∪ text': allTypesCodecsTable.text.as('bigintstr ∪ text'),
					'bigintstr ∪ tinytext': allTypesCodecsTable.tinytext.as('bigintstr ∪ tinytext'),
					'bigintstr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('bigintstr ∪ mediumtext'),
					'bigintstr ∪ longtext': allTypesCodecsTable.longtext.as('bigintstr ∪ longtext'),
					'bigintstr ∪ varchar': allTypesCodecsTable.varchar.as('bigintstr ∪ varchar'),
					'bigintstr ∪ varbin': allTypesCodecsTable.varbin.as('bigintstr ∪ varbin'),
					'bigintstr ∪ stringblob': allTypesCodecsTable.stringblob.as('bigintstr ∪ stringblob'),
					'bigintstr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('bigintstr ∪ stringtinyblob'),
					'bigintstr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('bigintstr ∪ stringmediumblob'),
					'bigintstr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('bigintstr ∪ stringlongblob'),
					'bigintstr ∪ datestr': allTypesCodecsTable.datestr.as('bigintstr ∪ datestr'),
					'bigintstr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('bigintstr ∪ datetimestr'),
					'bigintstr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('bigintstr ∪ timestampstr'),
					'bigintstr ∪ time': allTypesCodecsTable.time.as('bigintstr ∪ time'),
					'char ∪ bigintstr': allTypesCodecsTable.bigintstr.as('char ∪ bigintstr'),
					'char ∪ char': allTypesCodecsTable.char.as('char ∪ char'),
					'char ∪ decimal': allTypesCodecsTable.decimal.as('char ∪ decimal'),
					'char ∪ text': allTypesCodecsTable.text.as('char ∪ text'),
					'char ∪ tinytext': allTypesCodecsTable.tinytext.as('char ∪ tinytext'),
					'char ∪ mediumtext': allTypesCodecsTable.mediumtext.as('char ∪ mediumtext'),
					'char ∪ longtext': allTypesCodecsTable.longtext.as('char ∪ longtext'),
					'char ∪ varchar': allTypesCodecsTable.varchar.as('char ∪ varchar'),
					'char ∪ varbin': allTypesCodecsTable.varbin.as('char ∪ varbin'),
					'char ∪ stringblob': allTypesCodecsTable.stringblob.as('char ∪ stringblob'),
					'char ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('char ∪ stringtinyblob'),
					'char ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('char ∪ stringmediumblob'),
					'char ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('char ∪ stringlongblob'),
					'char ∪ datestr': allTypesCodecsTable.datestr.as('char ∪ datestr'),
					'char ∪ datetimestr': allTypesCodecsTable.datetimestr.as('char ∪ datetimestr'),
					'char ∪ timestampstr': allTypesCodecsTable.timestampstr.as('char ∪ timestampstr'),
					'char ∪ time': allTypesCodecsTable.time.as('char ∪ time'),
					'decimal ∪ bigintstr': allTypesCodecsTable.bigintstr.as('decimal ∪ bigintstr'),
					'decimal ∪ char': allTypesCodecsTable.char.as('decimal ∪ char'),
					'decimal ∪ decimal': allTypesCodecsTable.decimal.as('decimal ∪ decimal'),
					'decimal ∪ text': allTypesCodecsTable.text.as('decimal ∪ text'),
					'decimal ∪ tinytext': allTypesCodecsTable.tinytext.as('decimal ∪ tinytext'),
					'decimal ∪ mediumtext': allTypesCodecsTable.mediumtext.as('decimal ∪ mediumtext'),
					'decimal ∪ longtext': allTypesCodecsTable.longtext.as('decimal ∪ longtext'),
					'decimal ∪ varchar': allTypesCodecsTable.varchar.as('decimal ∪ varchar'),
					'decimal ∪ varbin': allTypesCodecsTable.varbin.as('decimal ∪ varbin'),
					'decimal ∪ stringblob': allTypesCodecsTable.stringblob.as('decimal ∪ stringblob'),
					'decimal ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('decimal ∪ stringtinyblob'),
					'decimal ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('decimal ∪ stringmediumblob'),
					'decimal ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('decimal ∪ stringlongblob'),
					'decimal ∪ datestr': allTypesCodecsTable.datestr.as('decimal ∪ datestr'),
					'decimal ∪ datetimestr': allTypesCodecsTable.datetimestr.as('decimal ∪ datetimestr'),
					'decimal ∪ timestampstr': allTypesCodecsTable.timestampstr.as('decimal ∪ timestampstr'),
					'decimal ∪ time': allTypesCodecsTable.time.as('decimal ∪ time'),
					'text ∪ bigintstr': allTypesCodecsTable.bigintstr.as('text ∪ bigintstr'),
					'text ∪ char': allTypesCodecsTable.char.as('text ∪ char'),
					'text ∪ decimal': allTypesCodecsTable.decimal.as('text ∪ decimal'),
					'text ∪ text': allTypesCodecsTable.text.as('text ∪ text'),
					'text ∪ tinytext': allTypesCodecsTable.tinytext.as('text ∪ tinytext'),
					'text ∪ mediumtext': allTypesCodecsTable.mediumtext.as('text ∪ mediumtext'),
					'text ∪ longtext': allTypesCodecsTable.longtext.as('text ∪ longtext'),
					'text ∪ varchar': allTypesCodecsTable.varchar.as('text ∪ varchar'),
					'text ∪ varbin': allTypesCodecsTable.varbin.as('text ∪ varbin'),
					'text ∪ stringblob': allTypesCodecsTable.stringblob.as('text ∪ stringblob'),
					'text ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('text ∪ stringtinyblob'),
					'text ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('text ∪ stringmediumblob'),
					'text ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('text ∪ stringlongblob'),
					'text ∪ datestr': allTypesCodecsTable.datestr.as('text ∪ datestr'),
					'text ∪ datetimestr': allTypesCodecsTable.datetimestr.as('text ∪ datetimestr'),
					'text ∪ timestampstr': allTypesCodecsTable.timestampstr.as('text ∪ timestampstr'),
					'text ∪ time': allTypesCodecsTable.time.as('text ∪ time'),
					'tinytext ∪ bigintstr': allTypesCodecsTable.bigintstr.as('tinytext ∪ bigintstr'),
					'tinytext ∪ char': allTypesCodecsTable.char.as('tinytext ∪ char'),
					'tinytext ∪ decimal': allTypesCodecsTable.decimal.as('tinytext ∪ decimal'),
					'tinytext ∪ text': allTypesCodecsTable.text.as('tinytext ∪ text'),
					'tinytext ∪ tinytext': allTypesCodecsTable.tinytext.as('tinytext ∪ tinytext'),
					'tinytext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('tinytext ∪ mediumtext'),
					'tinytext ∪ longtext': allTypesCodecsTable.longtext.as('tinytext ∪ longtext'),
					'tinytext ∪ varchar': allTypesCodecsTable.varchar.as('tinytext ∪ varchar'),
					'tinytext ∪ varbin': allTypesCodecsTable.varbin.as('tinytext ∪ varbin'),
					'tinytext ∪ stringblob': allTypesCodecsTable.stringblob.as('tinytext ∪ stringblob'),
					'tinytext ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('tinytext ∪ stringtinyblob'),
					'tinytext ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('tinytext ∪ stringmediumblob'),
					'tinytext ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('tinytext ∪ stringlongblob'),
					'tinytext ∪ datestr': allTypesCodecsTable.datestr.as('tinytext ∪ datestr'),
					'tinytext ∪ datetimestr': allTypesCodecsTable.datetimestr.as('tinytext ∪ datetimestr'),
					'tinytext ∪ timestampstr': allTypesCodecsTable.timestampstr.as('tinytext ∪ timestampstr'),
					'tinytext ∪ time': allTypesCodecsTable.time.as('tinytext ∪ time'),
					'mediumtext ∪ bigintstr': allTypesCodecsTable.bigintstr.as('mediumtext ∪ bigintstr'),
					'mediumtext ∪ char': allTypesCodecsTable.char.as('mediumtext ∪ char'),
					'mediumtext ∪ decimal': allTypesCodecsTable.decimal.as('mediumtext ∪ decimal'),
					'mediumtext ∪ text': allTypesCodecsTable.text.as('mediumtext ∪ text'),
					'mediumtext ∪ tinytext': allTypesCodecsTable.tinytext.as('mediumtext ∪ tinytext'),
					'mediumtext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ mediumtext'),
					'mediumtext ∪ longtext': allTypesCodecsTable.longtext.as('mediumtext ∪ longtext'),
					'mediumtext ∪ varchar': allTypesCodecsTable.varchar.as('mediumtext ∪ varchar'),
					'mediumtext ∪ varbin': allTypesCodecsTable.varbin.as('mediumtext ∪ varbin'),
					'mediumtext ∪ stringblob': allTypesCodecsTable.stringblob.as('mediumtext ∪ stringblob'),
					'mediumtext ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('mediumtext ∪ stringtinyblob'),
					'mediumtext ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('mediumtext ∪ stringmediumblob'),
					'mediumtext ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('mediumtext ∪ stringlongblob'),
					'mediumtext ∪ datestr': allTypesCodecsTable.datestr.as('mediumtext ∪ datestr'),
					'mediumtext ∪ datetimestr': allTypesCodecsTable.datetimestr.as('mediumtext ∪ datetimestr'),
					'mediumtext ∪ timestampstr': allTypesCodecsTable.timestampstr.as('mediumtext ∪ timestampstr'),
					'mediumtext ∪ time': allTypesCodecsTable.time.as('mediumtext ∪ time'),
					'longtext ∪ bigintstr': allTypesCodecsTable.bigintstr.as('longtext ∪ bigintstr'),
					'longtext ∪ char': allTypesCodecsTable.char.as('longtext ∪ char'),
					'longtext ∪ decimal': allTypesCodecsTable.decimal.as('longtext ∪ decimal'),
					'longtext ∪ text': allTypesCodecsTable.text.as('longtext ∪ text'),
					'longtext ∪ tinytext': allTypesCodecsTable.tinytext.as('longtext ∪ tinytext'),
					'longtext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('longtext ∪ mediumtext'),
					'longtext ∪ longtext': allTypesCodecsTable.longtext.as('longtext ∪ longtext'),
					'longtext ∪ varchar': allTypesCodecsTable.varchar.as('longtext ∪ varchar'),
					'longtext ∪ varbin': allTypesCodecsTable.varbin.as('longtext ∪ varbin'),
					'longtext ∪ stringblob': allTypesCodecsTable.stringblob.as('longtext ∪ stringblob'),
					'longtext ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('longtext ∪ stringtinyblob'),
					'longtext ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('longtext ∪ stringmediumblob'),
					'longtext ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('longtext ∪ stringlongblob'),
					'longtext ∪ datestr': allTypesCodecsTable.datestr.as('longtext ∪ datestr'),
					'longtext ∪ datetimestr': allTypesCodecsTable.datetimestr.as('longtext ∪ datetimestr'),
					'longtext ∪ timestampstr': allTypesCodecsTable.timestampstr.as('longtext ∪ timestampstr'),
					'longtext ∪ time': allTypesCodecsTable.time.as('longtext ∪ time'),
					'varchar ∪ bigintstr': allTypesCodecsTable.bigintstr.as('varchar ∪ bigintstr'),
					'varchar ∪ char': allTypesCodecsTable.char.as('varchar ∪ char'),
					'varchar ∪ decimal': allTypesCodecsTable.decimal.as('varchar ∪ decimal'),
					'varchar ∪ text': allTypesCodecsTable.text.as('varchar ∪ text'),
					'varchar ∪ tinytext': allTypesCodecsTable.tinytext.as('varchar ∪ tinytext'),
					'varchar ∪ mediumtext': allTypesCodecsTable.mediumtext.as('varchar ∪ mediumtext'),
					'varchar ∪ longtext': allTypesCodecsTable.longtext.as('varchar ∪ longtext'),
					'varchar ∪ varchar': allTypesCodecsTable.varchar.as('varchar ∪ varchar'),
					'varchar ∪ varbin': allTypesCodecsTable.varbin.as('varchar ∪ varbin'),
					'varchar ∪ stringblob': allTypesCodecsTable.stringblob.as('varchar ∪ stringblob'),
					'varchar ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('varchar ∪ stringtinyblob'),
					'varchar ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('varchar ∪ stringmediumblob'),
					'varchar ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('varchar ∪ stringlongblob'),
					'varchar ∪ datestr': allTypesCodecsTable.datestr.as('varchar ∪ datestr'),
					'varchar ∪ datetimestr': allTypesCodecsTable.datetimestr.as('varchar ∪ datetimestr'),
					'varchar ∪ timestampstr': allTypesCodecsTable.timestampstr.as('varchar ∪ timestampstr'),
					'varchar ∪ time': allTypesCodecsTable.time.as('varchar ∪ time'),
					'varbin ∪ bigintstr': allTypesCodecsTable.bigintstr.as('varbin ∪ bigintstr'),
					'varbin ∪ char': allTypesCodecsTable.char.as('varbin ∪ char'),
					'varbin ∪ decimal': allTypesCodecsTable.decimal.as('varbin ∪ decimal'),
					'varbin ∪ text': allTypesCodecsTable.text.as('varbin ∪ text'),
					'varbin ∪ tinytext': allTypesCodecsTable.tinytext.as('varbin ∪ tinytext'),
					'varbin ∪ mediumtext': allTypesCodecsTable.mediumtext.as('varbin ∪ mediumtext'),
					'varbin ∪ longtext': allTypesCodecsTable.longtext.as('varbin ∪ longtext'),
					'varbin ∪ varchar': allTypesCodecsTable.varchar.as('varbin ∪ varchar'),
					'varbin ∪ varbin': allTypesCodecsTable.varbin.as('varbin ∪ varbin'),
					'varbin ∪ stringblob': allTypesCodecsTable.stringblob.as('varbin ∪ stringblob'),
					'varbin ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('varbin ∪ stringtinyblob'),
					'varbin ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('varbin ∪ stringmediumblob'),
					'varbin ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('varbin ∪ stringlongblob'),
					'varbin ∪ datestr': allTypesCodecsTable.datestr.as('varbin ∪ datestr'),
					'varbin ∪ datetimestr': allTypesCodecsTable.datetimestr.as('varbin ∪ datetimestr'),
					'varbin ∪ timestampstr': allTypesCodecsTable.timestampstr.as('varbin ∪ timestampstr'),
					'varbin ∪ time': allTypesCodecsTable.time.as('varbin ∪ time'),
					'stringblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringblob ∪ bigintstr'),
					'stringblob ∪ char': allTypesCodecsTable.char.as('stringblob ∪ char'),
					'stringblob ∪ decimal': allTypesCodecsTable.decimal.as('stringblob ∪ decimal'),
					'stringblob ∪ text': allTypesCodecsTable.text.as('stringblob ∪ text'),
					'stringblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringblob ∪ tinytext'),
					'stringblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringblob ∪ mediumtext'),
					'stringblob ∪ longtext': allTypesCodecsTable.longtext.as('stringblob ∪ longtext'),
					'stringblob ∪ varchar': allTypesCodecsTable.varchar.as('stringblob ∪ varchar'),
					'stringblob ∪ varbin': allTypesCodecsTable.varbin.as('stringblob ∪ varbin'),
					'stringblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringblob'),
					'stringblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringblob ∪ stringtinyblob'),
					'stringblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('stringblob ∪ stringmediumblob'),
					'stringblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringblob ∪ stringlongblob'),
					'stringblob ∪ datestr': allTypesCodecsTable.datestr.as('stringblob ∪ datestr'),
					'stringblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringblob ∪ datetimestr'),
					'stringblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringblob ∪ timestampstr'),
					'stringblob ∪ time': allTypesCodecsTable.time.as('stringblob ∪ time'),
					'stringtinyblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringtinyblob ∪ bigintstr'),
					'stringtinyblob ∪ char': allTypesCodecsTable.char.as('stringtinyblob ∪ char'),
					'stringtinyblob ∪ decimal': allTypesCodecsTable.decimal.as('stringtinyblob ∪ decimal'),
					'stringtinyblob ∪ text': allTypesCodecsTable.text.as('stringtinyblob ∪ text'),
					'stringtinyblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringtinyblob ∪ tinytext'),
					'stringtinyblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringtinyblob ∪ mediumtext'),
					'stringtinyblob ∪ longtext': allTypesCodecsTable.longtext.as('stringtinyblob ∪ longtext'),
					'stringtinyblob ∪ varchar': allTypesCodecsTable.varchar.as('stringtinyblob ∪ varchar'),
					'stringtinyblob ∪ varbin': allTypesCodecsTable.varbin.as('stringtinyblob ∪ varbin'),
					'stringtinyblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringtinyblob ∪ stringblob'),
					'stringtinyblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringtinyblob'),
					'stringtinyblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
						'stringtinyblob ∪ stringmediumblob',
					),
					'stringtinyblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringtinyblob ∪ stringlongblob'),
					'stringtinyblob ∪ datestr': allTypesCodecsTable.datestr.as('stringtinyblob ∪ datestr'),
					'stringtinyblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringtinyblob ∪ datetimestr'),
					'stringtinyblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringtinyblob ∪ timestampstr'),
					'stringtinyblob ∪ time': allTypesCodecsTable.time.as('stringtinyblob ∪ time'),
					'stringmediumblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringmediumblob ∪ bigintstr'),
					'stringmediumblob ∪ char': allTypesCodecsTable.char.as('stringmediumblob ∪ char'),
					'stringmediumblob ∪ decimal': allTypesCodecsTable.decimal.as('stringmediumblob ∪ decimal'),
					'stringmediumblob ∪ text': allTypesCodecsTable.text.as('stringmediumblob ∪ text'),
					'stringmediumblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringmediumblob ∪ tinytext'),
					'stringmediumblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringmediumblob ∪ mediumtext'),
					'stringmediumblob ∪ longtext': allTypesCodecsTable.longtext.as('stringmediumblob ∪ longtext'),
					'stringmediumblob ∪ varchar': allTypesCodecsTable.varchar.as('stringmediumblob ∪ varchar'),
					'stringmediumblob ∪ varbin': allTypesCodecsTable.varbin.as('stringmediumblob ∪ varbin'),
					'stringmediumblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringmediumblob ∪ stringblob'),
					'stringmediumblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as(
						'stringmediumblob ∪ stringtinyblob',
					),
					'stringmediumblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
						'stringmediumblob ∪ stringmediumblob',
					),
					'stringmediumblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as(
						'stringmediumblob ∪ stringlongblob',
					),
					'stringmediumblob ∪ datestr': allTypesCodecsTable.datestr.as('stringmediumblob ∪ datestr'),
					'stringmediumblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringmediumblob ∪ datetimestr'),
					'stringmediumblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringmediumblob ∪ timestampstr'),
					'stringmediumblob ∪ time': allTypesCodecsTable.time.as('stringmediumblob ∪ time'),
					'stringlongblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringlongblob ∪ bigintstr'),
					'stringlongblob ∪ char': allTypesCodecsTable.char.as('stringlongblob ∪ char'),
					'stringlongblob ∪ decimal': allTypesCodecsTable.decimal.as('stringlongblob ∪ decimal'),
					'stringlongblob ∪ text': allTypesCodecsTable.text.as('stringlongblob ∪ text'),
					'stringlongblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringlongblob ∪ tinytext'),
					'stringlongblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringlongblob ∪ mediumtext'),
					'stringlongblob ∪ longtext': allTypesCodecsTable.longtext.as('stringlongblob ∪ longtext'),
					'stringlongblob ∪ varchar': allTypesCodecsTable.varchar.as('stringlongblob ∪ varchar'),
					'stringlongblob ∪ varbin': allTypesCodecsTable.varbin.as('stringlongblob ∪ varbin'),
					'stringlongblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringlongblob ∪ stringblob'),
					'stringlongblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringlongblob ∪ stringtinyblob'),
					'stringlongblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
						'stringlongblob ∪ stringmediumblob',
					),
					'stringlongblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringlongblob'),
					'stringlongblob ∪ datestr': allTypesCodecsTable.datestr.as('stringlongblob ∪ datestr'),
					'stringlongblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringlongblob ∪ datetimestr'),
					'stringlongblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringlongblob ∪ timestampstr'),
					'stringlongblob ∪ time': allTypesCodecsTable.time.as('stringlongblob ∪ time'),
					'datestr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('datestr ∪ bigintstr'),
					'datestr ∪ char': allTypesCodecsTable.char.as('datestr ∪ char'),
					'datestr ∪ decimal': allTypesCodecsTable.decimal.as('datestr ∪ decimal'),
					'datestr ∪ text': allTypesCodecsTable.text.as('datestr ∪ text'),
					'datestr ∪ tinytext': allTypesCodecsTable.tinytext.as('datestr ∪ tinytext'),
					'datestr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('datestr ∪ mediumtext'),
					'datestr ∪ longtext': allTypesCodecsTable.longtext.as('datestr ∪ longtext'),
					'datestr ∪ varchar': allTypesCodecsTable.varchar.as('datestr ∪ varchar'),
					'datestr ∪ varbin': allTypesCodecsTable.varbin.as('datestr ∪ varbin'),
					'datestr ∪ stringblob': allTypesCodecsTable.stringblob.as('datestr ∪ stringblob'),
					'datestr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('datestr ∪ stringtinyblob'),
					'datestr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('datestr ∪ stringmediumblob'),
					'datestr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('datestr ∪ stringlongblob'),
					'datestr ∪ datestr': allTypesCodecsTable.datestr.as('datestr ∪ datestr'),
					'datestr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('datestr ∪ datetimestr'),
					'datestr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('datestr ∪ timestampstr'),
					'datetimestr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('datetimestr ∪ bigintstr'),
					'datetimestr ∪ char': allTypesCodecsTable.char.as('datetimestr ∪ char'),
					'datetimestr ∪ decimal': allTypesCodecsTable.decimal.as('datetimestr ∪ decimal'),
					'datetimestr ∪ text': allTypesCodecsTable.text.as('datetimestr ∪ text'),
					'datetimestr ∪ tinytext': allTypesCodecsTable.tinytext.as('datetimestr ∪ tinytext'),
					'datetimestr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('datetimestr ∪ mediumtext'),
					'datetimestr ∪ longtext': allTypesCodecsTable.longtext.as('datetimestr ∪ longtext'),
					'datetimestr ∪ varchar': allTypesCodecsTable.varchar.as('datetimestr ∪ varchar'),
					'datetimestr ∪ varbin': allTypesCodecsTable.varbin.as('datetimestr ∪ varbin'),
					'datetimestr ∪ stringblob': allTypesCodecsTable.stringblob.as('datetimestr ∪ stringblob'),
					'datetimestr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('datetimestr ∪ stringtinyblob'),
					'datetimestr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('datetimestr ∪ stringmediumblob'),
					'datetimestr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('datetimestr ∪ stringlongblob'),
					'datetimestr ∪ datestr': allTypesCodecsTable.datestr.as('datetimestr ∪ datestr'),
					'datetimestr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ datetimestr'),
					'datetimestr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('datetimestr ∪ timestampstr'),
					'timestampstr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('timestampstr ∪ bigintstr'),
					'timestampstr ∪ char': allTypesCodecsTable.char.as('timestampstr ∪ char'),
					'timestampstr ∪ decimal': allTypesCodecsTable.decimal.as('timestampstr ∪ decimal'),
					'timestampstr ∪ text': allTypesCodecsTable.text.as('timestampstr ∪ text'),
					'timestampstr ∪ tinytext': allTypesCodecsTable.tinytext.as('timestampstr ∪ tinytext'),
					'timestampstr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('timestampstr ∪ mediumtext'),
					'timestampstr ∪ longtext': allTypesCodecsTable.longtext.as('timestampstr ∪ longtext'),
					'timestampstr ∪ varchar': allTypesCodecsTable.varchar.as('timestampstr ∪ varchar'),
					'timestampstr ∪ varbin': allTypesCodecsTable.varbin.as('timestampstr ∪ varbin'),
					'timestampstr ∪ stringblob': allTypesCodecsTable.stringblob.as('timestampstr ∪ stringblob'),
					'timestampstr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('timestampstr ∪ stringtinyblob'),
					'timestampstr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('timestampstr ∪ stringmediumblob'),
					'timestampstr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('timestampstr ∪ stringlongblob'),
					'timestampstr ∪ datestr': allTypesCodecsTable.datestr.as('timestampstr ∪ datestr'),
					'timestampstr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('timestampstr ∪ datetimestr'),
					'timestampstr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ timestampstr'),
					'time ∪ bigintstr': allTypesCodecsTable.bigintstr.as('time ∪ bigintstr'),
					'time ∪ char': allTypesCodecsTable.char.as('time ∪ char'),
					'time ∪ decimal': allTypesCodecsTable.decimal.as('time ∪ decimal'),
					'time ∪ text': allTypesCodecsTable.text.as('time ∪ text'),
					'time ∪ tinytext': allTypesCodecsTable.tinytext.as('time ∪ tinytext'),
					'time ∪ mediumtext': allTypesCodecsTable.mediumtext.as('time ∪ mediumtext'),
					'time ∪ longtext': allTypesCodecsTable.longtext.as('time ∪ longtext'),
					'time ∪ varchar': allTypesCodecsTable.varchar.as('time ∪ varchar'),
					'time ∪ varbin': allTypesCodecsTable.varbin.as('time ∪ varbin'),
					'time ∪ stringblob': allTypesCodecsTable.stringblob.as('time ∪ stringblob'),
					'time ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('time ∪ stringtinyblob'),
					'time ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('time ∪ stringmediumblob'),
					'time ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('time ∪ stringlongblob'),
					'time ∪ time': allTypesCodecsTable.time.as('time ∪ time'),
					'binary ∪ binary': allTypesCodecsTable.binary.as('binary ∪ binary'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'bigintstr ∪ bigintstr': '5044565289845416380',
				'bigintstr ∪ char': '5044565289845416380',
				'bigintstr ∪ decimal': '5044565289845416380',
				'bigintstr ∪ text': '5044565289845416380',
				'bigintstr ∪ tinytext': '5044565289845416380',
				'bigintstr ∪ mediumtext': '5044565289845416380',
				'bigintstr ∪ longtext': '5044565289845416380',
				'bigintstr ∪ varchar': '5044565289845416380',
				'bigintstr ∪ varbin': binWidens ? '0000000000000010000' : '5044565289845416380',
				'bigintstr ∪ stringblob': '5044565289845416380',
				'bigintstr ∪ stringtinyblob': '5044565289845416380',
				'bigintstr ∪ stringmediumblob': '5044565289845416380',
				'bigintstr ∪ stringlongblob': '5044565289845416380',
				'bigintstr ∪ datestr': '5044565289845416380',
				'bigintstr ∪ datetimestr': '5044565289845416380',
				'bigintstr ∪ timestampstr': '5044565289845416380',
				'bigintstr ∪ time': '5044565289845416380',
				'char ∪ bigintstr': 'c',
				'char ∪ char': 'c',
				'char ∪ decimal': 'c',
				'char ∪ text': 'c',
				'char ∪ tinytext': 'c',
				'char ∪ mediumtext': 'c',
				'char ∪ longtext': 'c',
				'char ∪ varchar': 'c',
				'char ∪ varbin': binWidens ? '0' : 'c',
				'char ∪ stringblob': 'c',
				'char ∪ stringtinyblob': 'c',
				'char ∪ stringmediumblob': 'c',
				'char ∪ stringlongblob': 'c',
				'char ∪ datestr': 'c',
				'char ∪ datetimestr': 'c',
				'char ∪ timestampstr': 'c',
				'char ∪ time': 'c',
				'decimal ∪ bigintstr': '47521',
				'decimal ∪ char': '47521',
				'decimal ∪ decimal': '47521',
				'decimal ∪ text': '47521',
				'decimal ∪ tinytext': '47521',
				'decimal ∪ mediumtext': '47521',
				'decimal ∪ longtext': '47521',
				'decimal ∪ varchar': '47521',
				'decimal ∪ varbin': binWidens ? '00001' : '47521',
				'decimal ∪ stringblob': '47521',
				'decimal ∪ stringtinyblob': '47521',
				'decimal ∪ stringmediumblob': '47521',
				'decimal ∪ stringlongblob': '47521',
				'decimal ∪ datestr': '47521',
				'decimal ∪ datetimestr': '47521',
				'decimal ∪ timestampstr': '47521',
				'decimal ∪ time': '47521',
				'text ∪ bigintstr': 'C4-',
				'text ∪ char': 'C4-',
				'text ∪ decimal': 'C4-',
				'text ∪ text': 'C4-',
				'text ∪ tinytext': 'C4-',
				'text ∪ mediumtext': 'C4-',
				'text ∪ longtext': 'C4-',
				'text ∪ varchar': 'C4-',
				'text ∪ varbin': 'C4-',
				'text ∪ stringblob': 'C4-',
				'text ∪ stringtinyblob': 'C4-',
				'text ∪ stringmediumblob': 'C4-',
				'text ∪ stringlongblob': 'C4-',
				'text ∪ datestr': 'C4-',
				'text ∪ datetimestr': 'C4-',
				'text ∪ timestampstr': 'C4-',
				'text ∪ time': 'C4-',
				'tinytext ∪ bigintstr': 'tiny text',
				'tinytext ∪ char': 'tiny text',
				'tinytext ∪ decimal': 'tiny text',
				'tinytext ∪ text': 'tiny text',
				'tinytext ∪ tinytext': 'tiny text',
				'tinytext ∪ mediumtext': 'tiny text',
				'tinytext ∪ longtext': 'tiny text',
				'tinytext ∪ varchar': 'tiny text',
				'tinytext ∪ varbin': 'tiny text',
				'tinytext ∪ stringblob': 'tiny text',
				'tinytext ∪ stringtinyblob': 'tiny text',
				'tinytext ∪ stringmediumblob': 'tiny text',
				'tinytext ∪ stringlongblob': 'tiny text',
				'tinytext ∪ datestr': 'tiny text',
				'tinytext ∪ datetimestr': 'tiny text',
				'tinytext ∪ timestampstr': 'tiny text',
				'tinytext ∪ time': 'tiny text',
				'mediumtext ∪ bigintstr': 'medium text',
				'mediumtext ∪ char': 'medium text',
				'mediumtext ∪ decimal': 'medium text',
				'mediumtext ∪ text': 'medium text',
				'mediumtext ∪ tinytext': 'medium text',
				'mediumtext ∪ mediumtext': 'medium text',
				'mediumtext ∪ longtext': 'medium text',
				'mediumtext ∪ varchar': 'medium text',
				'mediumtext ∪ varbin': 'medium text',
				'mediumtext ∪ stringblob': 'medium text',
				'mediumtext ∪ stringtinyblob': 'medium text',
				'mediumtext ∪ stringmediumblob': 'medium text',
				'mediumtext ∪ stringlongblob': 'medium text',
				'mediumtext ∪ datestr': 'medium text',
				'mediumtext ∪ datetimestr': 'medium text',
				'mediumtext ∪ timestampstr': 'medium text',
				'mediumtext ∪ time': 'medium text',
				'longtext ∪ bigintstr': 'long text',
				'longtext ∪ char': 'long text',
				'longtext ∪ decimal': 'long text',
				'longtext ∪ text': 'long text',
				'longtext ∪ tinytext': 'long text',
				'longtext ∪ mediumtext': 'long text',
				'longtext ∪ longtext': 'long text',
				'longtext ∪ varchar': 'long text',
				'longtext ∪ varbin': 'long text',
				'longtext ∪ stringblob': 'long text',
				'longtext ∪ stringtinyblob': 'long text',
				'longtext ∪ stringmediumblob': 'long text',
				'longtext ∪ stringlongblob': 'long text',
				'longtext ∪ datestr': 'long text',
				'longtext ∪ datetimestr': 'long text',
				'longtext ∪ timestampstr': 'long text',
				'longtext ∪ time': 'long text',
				'varchar ∪ bigintstr': 'VCHAR',
				'varchar ∪ char': 'VCHAR',
				'varchar ∪ decimal': 'VCHAR',
				'varchar ∪ text': 'VCHAR',
				'varchar ∪ tinytext': 'VCHAR',
				'varchar ∪ mediumtext': 'VCHAR',
				'varchar ∪ longtext': 'VCHAR',
				'varchar ∪ varchar': 'VCHAR',
				'varchar ∪ varbin': binWidens ? '00000' : 'VCHAR',
				'varchar ∪ stringblob': 'VCHAR',
				'varchar ∪ stringtinyblob': 'VCHAR',
				'varchar ∪ stringmediumblob': 'VCHAR',
				'varchar ∪ stringlongblob': 'VCHAR',
				'varchar ∪ datestr': 'VCHAR',
				'varchar ∪ datetimestr': 'VCHAR',
				'varchar ∪ timestampstr': 'VCHAR',
				'varchar ∪ time': 'VCHAR',
				'varbin ∪ bigintstr': '1010110101001101',
				'varbin ∪ char': '1010110101001101',
				'varbin ∪ decimal': '1010110101001101',
				'varbin ∪ text': '1010110101001101',
				'varbin ∪ tinytext': '1010110101001101',
				'varbin ∪ mediumtext': '1010110101001101',
				'varbin ∪ longtext': '1010110101001101',
				'varbin ∪ varchar': '1010110101001101',
				'varbin ∪ varbin': '1010110101001101',
				'varbin ∪ stringblob': '1010110101001101',
				'varbin ∪ stringtinyblob': '1010110101001101',
				'varbin ∪ stringmediumblob': '1010110101001101',
				'varbin ∪ stringlongblob': '1010110101001101',
				'varbin ∪ datestr': '1010110101001101',
				'varbin ∪ datetimestr': '1010110101001101',
				'varbin ∪ timestampstr': '1010110101001101',
				'varbin ∪ time': '1010110101001101',
				'stringblob ∪ bigintstr': 'string',
				'stringblob ∪ char': 'string',
				'stringblob ∪ decimal': 'string',
				'stringblob ∪ text': 'string',
				'stringblob ∪ tinytext': 'string',
				'stringblob ∪ mediumtext': 'string',
				'stringblob ∪ longtext': 'string',
				'stringblob ∪ varchar': 'string',
				'stringblob ∪ varbin': 'string',
				'stringblob ∪ stringblob': 'string',
				'stringblob ∪ stringtinyblob': 'string',
				'stringblob ∪ stringmediumblob': 'string',
				'stringblob ∪ stringlongblob': 'string',
				'stringblob ∪ datestr': 'string',
				'stringblob ∪ datetimestr': 'string',
				'stringblob ∪ timestampstr': 'string',
				'stringblob ∪ time': 'string',
				'stringtinyblob ∪ bigintstr': 'string',
				'stringtinyblob ∪ char': 'string',
				'stringtinyblob ∪ decimal': 'string',
				'stringtinyblob ∪ text': 'string',
				'stringtinyblob ∪ tinytext': 'string',
				'stringtinyblob ∪ mediumtext': 'string',
				'stringtinyblob ∪ longtext': 'string',
				'stringtinyblob ∪ varchar': 'string',
				'stringtinyblob ∪ varbin': 'string',
				'stringtinyblob ∪ stringblob': 'string',
				'stringtinyblob ∪ stringtinyblob': 'string',
				'stringtinyblob ∪ stringmediumblob': 'string',
				'stringtinyblob ∪ stringlongblob': 'string',
				'stringtinyblob ∪ datestr': 'string',
				'stringtinyblob ∪ datetimestr': 'string',
				'stringtinyblob ∪ timestampstr': 'string',
				'stringtinyblob ∪ time': 'string',
				'stringmediumblob ∪ bigintstr': 'string',
				'stringmediumblob ∪ char': 'string',
				'stringmediumblob ∪ decimal': 'string',
				'stringmediumblob ∪ text': 'string',
				'stringmediumblob ∪ tinytext': 'string',
				'stringmediumblob ∪ mediumtext': 'string',
				'stringmediumblob ∪ longtext': 'string',
				'stringmediumblob ∪ varchar': 'string',
				'stringmediumblob ∪ varbin': 'string',
				'stringmediumblob ∪ stringblob': 'string',
				'stringmediumblob ∪ stringtinyblob': 'string',
				'stringmediumblob ∪ stringmediumblob': 'string',
				'stringmediumblob ∪ stringlongblob': 'string',
				'stringmediumblob ∪ datestr': 'string',
				'stringmediumblob ∪ datetimestr': 'string',
				'stringmediumblob ∪ timestampstr': 'string',
				'stringmediumblob ∪ time': 'string',
				'stringlongblob ∪ bigintstr': 'string',
				'stringlongblob ∪ char': 'string',
				'stringlongblob ∪ decimal': 'string',
				'stringlongblob ∪ text': 'string',
				'stringlongblob ∪ tinytext': 'string',
				'stringlongblob ∪ mediumtext': 'string',
				'stringlongblob ∪ longtext': 'string',
				'stringlongblob ∪ varchar': 'string',
				'stringlongblob ∪ varbin': 'string',
				'stringlongblob ∪ stringblob': 'string',
				'stringlongblob ∪ stringtinyblob': 'string',
				'stringlongblob ∪ stringmediumblob': 'string',
				'stringlongblob ∪ stringlongblob': 'string',
				'stringlongblob ∪ datestr': 'string',
				'stringlongblob ∪ datetimestr': 'string',
				'stringlongblob ∪ timestampstr': 'string',
				'stringlongblob ∪ time': 'string',
				'datestr ∪ bigintstr': '2025-03-12',
				'datestr ∪ char': '2025-03-12',
				'datestr ∪ decimal': '2025-03-12',
				'datestr ∪ text': '2025-03-12',
				'datestr ∪ tinytext': '2025-03-12',
				'datestr ∪ mediumtext': '2025-03-12',
				'datestr ∪ longtext': '2025-03-12',
				'datestr ∪ varchar': '2025-03-12',
				'datestr ∪ varbin': binWidens ? '0000000010' : '2025-03-12',
				'datestr ∪ stringblob': '2025-03-12',
				'datestr ∪ stringtinyblob': '2025-03-12',
				'datestr ∪ stringmediumblob': '2025-03-12',
				'datestr ∪ stringlongblob': '2025-03-12',
				'datestr ∪ datestr': '2025-03-12',
				'datestr ∪ datetimestr': '2025-03-12 00:00:00.000',
				'datestr ∪ timestampstr': '2025-03-12 00:00:00.000',
				'datetimestr ∪ bigintstr': '2025-03-12 01:32:41.623',
				'datetimestr ∪ char': '2025-03-12 01:32:41.623',
				'datetimestr ∪ decimal': '2025-03-12 01:32:41.623',
				'datetimestr ∪ text': '2025-03-12 01:32:41.623',
				'datetimestr ∪ tinytext': '2025-03-12 01:32:41.623',
				'datetimestr ∪ mediumtext': '2025-03-12 01:32:41.623',
				'datetimestr ∪ longtext': '2025-03-12 01:32:41.623',
				'datetimestr ∪ varchar': '2025-03-12 01:32:41.623',
				'datetimestr ∪ varbin': binWidens ? '00000000100010000010000' : '2025-03-12 01:32:41.623',
				'datetimestr ∪ stringblob': '2025-03-12 01:32:41.623',
				'datetimestr ∪ stringtinyblob': '2025-03-12 01:32:41.623',
				'datetimestr ∪ stringmediumblob': '2025-03-12 01:32:41.623',
				'datetimestr ∪ stringlongblob': '2025-03-12 01:32:41.623',
				'datetimestr ∪ datestr': '2025-03-12 01:32:41.623',
				'datetimestr ∪ datetimestr': '2025-03-12 01:32:41.623',
				'datetimestr ∪ timestampstr': '2025-03-12 01:32:41.623',
				'timestampstr ∪ bigintstr': '2025-03-12 01:32:41.623',
				'timestampstr ∪ char': '2025-03-12 01:32:41.623',
				'timestampstr ∪ decimal': '2025-03-12 01:32:41.623',
				'timestampstr ∪ text': '2025-03-12 01:32:41.623',
				'timestampstr ∪ tinytext': '2025-03-12 01:32:41.623',
				'timestampstr ∪ mediumtext': '2025-03-12 01:32:41.623',
				'timestampstr ∪ longtext': '2025-03-12 01:32:41.623',
				'timestampstr ∪ varchar': '2025-03-12 01:32:41.623',
				'timestampstr ∪ varbin': binWidens ? '00000000100010000010000' : '2025-03-12 01:32:41.623',
				'timestampstr ∪ stringblob': '2025-03-12 01:32:41.623',
				'timestampstr ∪ stringtinyblob': '2025-03-12 01:32:41.623',
				'timestampstr ∪ stringmediumblob': '2025-03-12 01:32:41.623',
				'timestampstr ∪ stringlongblob': '2025-03-12 01:32:41.623',
				'timestampstr ∪ datestr': '2025-03-12 01:32:41.623',
				'timestampstr ∪ datetimestr': '2025-03-12 01:32:41.623',
				'timestampstr ∪ timestampstr': '2025-03-12 01:32:41.623',
				'time ∪ bigintstr': '04:13:22',
				'time ∪ char': '04:13:22',
				'time ∪ decimal': '04:13:22',
				'time ∪ text': '04:13:22',
				'time ∪ tinytext': '04:13:22',
				'time ∪ mediumtext': '04:13:22',
				'time ∪ longtext': '04:13:22',
				'time ∪ varchar': '04:13:22',
				'time ∪ varbin': binWidens ? '00010000' : '04:13:22',
				'time ∪ stringblob': '04:13:22',
				'time ∪ stringtinyblob': '04:13:22',
				'time ∪ stringmediumblob': '04:13:22',
				'time ∪ stringlongblob': '04:13:22',
				'time ∪ time': '04:13:22',
				'binary ∪ binary': '1',
			},
			{
				'bigintstr ∪ bigintstr': '5044565289845416380',
				'bigintstr ∪ char': 'c',
				'bigintstr ∪ decimal': '47521',
				'bigintstr ∪ text': 'C4-',
				'bigintstr ∪ tinytext': 'tiny text',
				'bigintstr ∪ mediumtext': 'medium text',
				'bigintstr ∪ longtext': 'long text',
				'bigintstr ∪ varchar': 'VCHAR',
				'bigintstr ∪ varbin': '1010110101001101',
				'bigintstr ∪ stringblob': 'string',
				'bigintstr ∪ stringtinyblob': 'string',
				'bigintstr ∪ stringmediumblob': 'string',
				'bigintstr ∪ stringlongblob': 'string',
				'bigintstr ∪ datestr': '2025-03-12',
				'bigintstr ∪ datetimestr': '2025-03-12 01:32:41.623',
				'bigintstr ∪ timestampstr': '2025-03-12 01:32:41.623',
				'bigintstr ∪ time': '04:13:22',
				'char ∪ bigintstr': '5044565289845416380',
				'char ∪ char': 'c',
				'char ∪ decimal': '47521',
				'char ∪ text': 'C4-',
				'char ∪ tinytext': 'tiny text',
				'char ∪ mediumtext': 'medium text',
				'char ∪ longtext': 'long text',
				'char ∪ varchar': 'VCHAR',
				'char ∪ varbin': '1010110101001101',
				'char ∪ stringblob': 'string',
				'char ∪ stringtinyblob': 'string',
				'char ∪ stringmediumblob': 'string',
				'char ∪ stringlongblob': 'string',
				'char ∪ datestr': '2025-03-12',
				'char ∪ datetimestr': '2025-03-12 01:32:41.623',
				'char ∪ timestampstr': '2025-03-12 01:32:41.623',
				'char ∪ time': '04:13:22',
				'decimal ∪ bigintstr': '5044565289845416380',
				'decimal ∪ char': 'c',
				'decimal ∪ decimal': '47521',
				'decimal ∪ text': 'C4-',
				'decimal ∪ tinytext': 'tiny text',
				'decimal ∪ mediumtext': 'medium text',
				'decimal ∪ longtext': 'long text',
				'decimal ∪ varchar': 'VCHAR',
				'decimal ∪ varbin': '1010110101001101',
				'decimal ∪ stringblob': 'string',
				'decimal ∪ stringtinyblob': 'string',
				'decimal ∪ stringmediumblob': 'string',
				'decimal ∪ stringlongblob': 'string',
				'decimal ∪ datestr': '2025-03-12',
				'decimal ∪ datetimestr': '2025-03-12 01:32:41.623',
				'decimal ∪ timestampstr': '2025-03-12 01:32:41.623',
				'decimal ∪ time': '04:13:22',
				'text ∪ bigintstr': '5044565289845416380',
				'text ∪ char': 'c',
				'text ∪ decimal': '47521',
				'text ∪ text': 'C4-',
				'text ∪ tinytext': 'tiny text',
				'text ∪ mediumtext': 'medium text',
				'text ∪ longtext': 'long text',
				'text ∪ varchar': 'VCHAR',
				'text ∪ varbin': '1010110101001101',
				'text ∪ stringblob': 'string',
				'text ∪ stringtinyblob': 'string',
				'text ∪ stringmediumblob': 'string',
				'text ∪ stringlongblob': 'string',
				'text ∪ datestr': '2025-03-12',
				'text ∪ datetimestr': '2025-03-12 01:32:41.623',
				'text ∪ timestampstr': '2025-03-12 01:32:41.623',
				'text ∪ time': '04:13:22',
				'tinytext ∪ bigintstr': '5044565289845416380',
				'tinytext ∪ char': 'c',
				'tinytext ∪ decimal': '47521',
				'tinytext ∪ text': 'C4-',
				'tinytext ∪ tinytext': 'tiny text',
				'tinytext ∪ mediumtext': 'medium text',
				'tinytext ∪ longtext': 'long text',
				'tinytext ∪ varchar': 'VCHAR',
				'tinytext ∪ varbin': '1010110101001101',
				'tinytext ∪ stringblob': 'string',
				'tinytext ∪ stringtinyblob': 'string',
				'tinytext ∪ stringmediumblob': 'string',
				'tinytext ∪ stringlongblob': 'string',
				'tinytext ∪ datestr': '2025-03-12',
				'tinytext ∪ datetimestr': '2025-03-12 01:32:41.623',
				'tinytext ∪ timestampstr': '2025-03-12 01:32:41.623',
				'tinytext ∪ time': '04:13:22',
				'mediumtext ∪ bigintstr': '5044565289845416380',
				'mediumtext ∪ char': 'c',
				'mediumtext ∪ decimal': '47521',
				'mediumtext ∪ text': 'C4-',
				'mediumtext ∪ tinytext': 'tiny text',
				'mediumtext ∪ mediumtext': 'medium text',
				'mediumtext ∪ longtext': 'long text',
				'mediumtext ∪ varchar': 'VCHAR',
				'mediumtext ∪ varbin': '1010110101001101',
				'mediumtext ∪ stringblob': 'string',
				'mediumtext ∪ stringtinyblob': 'string',
				'mediumtext ∪ stringmediumblob': 'string',
				'mediumtext ∪ stringlongblob': 'string',
				'mediumtext ∪ datestr': '2025-03-12',
				'mediumtext ∪ datetimestr': '2025-03-12 01:32:41.623',
				'mediumtext ∪ timestampstr': '2025-03-12 01:32:41.623',
				'mediumtext ∪ time': '04:13:22',
				'longtext ∪ bigintstr': '5044565289845416380',
				'longtext ∪ char': 'c',
				'longtext ∪ decimal': '47521',
				'longtext ∪ text': 'C4-',
				'longtext ∪ tinytext': 'tiny text',
				'longtext ∪ mediumtext': 'medium text',
				'longtext ∪ longtext': 'long text',
				'longtext ∪ varchar': 'VCHAR',
				'longtext ∪ varbin': '1010110101001101',
				'longtext ∪ stringblob': 'string',
				'longtext ∪ stringtinyblob': 'string',
				'longtext ∪ stringmediumblob': 'string',
				'longtext ∪ stringlongblob': 'string',
				'longtext ∪ datestr': '2025-03-12',
				'longtext ∪ datetimestr': '2025-03-12 01:32:41.623',
				'longtext ∪ timestampstr': '2025-03-12 01:32:41.623',
				'longtext ∪ time': '04:13:22',
				'varchar ∪ bigintstr': '5044565289845416380',
				'varchar ∪ char': 'c',
				'varchar ∪ decimal': '47521',
				'varchar ∪ text': 'C4-',
				'varchar ∪ tinytext': 'tiny text',
				'varchar ∪ mediumtext': 'medium text',
				'varchar ∪ longtext': 'long text',
				'varchar ∪ varchar': 'VCHAR',
				'varchar ∪ varbin': '1010110101001101',
				'varchar ∪ stringblob': 'string',
				'varchar ∪ stringtinyblob': 'string',
				'varchar ∪ stringmediumblob': 'string',
				'varchar ∪ stringlongblob': 'string',
				'varchar ∪ datestr': '2025-03-12',
				'varchar ∪ datetimestr': '2025-03-12 01:32:41.623',
				'varchar ∪ timestampstr': '2025-03-12 01:32:41.623',
				'varchar ∪ time': '04:13:22',
				'varbin ∪ bigintstr': binWidens ? '0000000000000010000' : '5044565289845416380',
				'varbin ∪ char': binWidens ? '0' : 'c',
				'varbin ∪ decimal': binWidens ? '00001' : '47521',
				'varbin ∪ text': 'C4-',
				'varbin ∪ tinytext': 'tiny text',
				'varbin ∪ mediumtext': 'medium text',
				'varbin ∪ longtext': 'long text',
				'varbin ∪ varchar': binWidens ? '00000' : 'VCHAR',
				'varbin ∪ varbin': '1010110101001101',
				'varbin ∪ stringblob': 'string',
				'varbin ∪ stringtinyblob': 'string',
				'varbin ∪ stringmediumblob': 'string',
				'varbin ∪ stringlongblob': 'string',
				'varbin ∪ datestr': binWidens ? '0000000010' : '2025-03-12',
				'varbin ∪ datetimestr': binWidens ? '00000000100010000010000' : '2025-03-12 01:32:41.623',
				'varbin ∪ timestampstr': binWidens ? '00000000100010000010000' : '2025-03-12 01:32:41.623',
				'varbin ∪ time': binWidens ? '00010000' : '04:13:22',
				'stringblob ∪ bigintstr': '5044565289845416380',
				'stringblob ∪ char': 'c',
				'stringblob ∪ decimal': '47521',
				'stringblob ∪ text': 'C4-',
				'stringblob ∪ tinytext': 'tiny text',
				'stringblob ∪ mediumtext': 'medium text',
				'stringblob ∪ longtext': 'long text',
				'stringblob ∪ varchar': 'VCHAR',
				'stringblob ∪ varbin': '1010110101001101',
				'stringblob ∪ stringblob': 'string',
				'stringblob ∪ stringtinyblob': 'string',
				'stringblob ∪ stringmediumblob': 'string',
				'stringblob ∪ stringlongblob': 'string',
				'stringblob ∪ datestr': '2025-03-12',
				'stringblob ∪ datetimestr': '2025-03-12 01:32:41.623',
				'stringblob ∪ timestampstr': '2025-03-12 01:32:41.623',
				'stringblob ∪ time': '04:13:22',
				'stringtinyblob ∪ bigintstr': '5044565289845416380',
				'stringtinyblob ∪ char': 'c',
				'stringtinyblob ∪ decimal': '47521',
				'stringtinyblob ∪ text': 'C4-',
				'stringtinyblob ∪ tinytext': 'tiny text',
				'stringtinyblob ∪ mediumtext': 'medium text',
				'stringtinyblob ∪ longtext': 'long text',
				'stringtinyblob ∪ varchar': 'VCHAR',
				'stringtinyblob ∪ varbin': '1010110101001101',
				'stringtinyblob ∪ stringblob': 'string',
				'stringtinyblob ∪ stringtinyblob': 'string',
				'stringtinyblob ∪ stringmediumblob': 'string',
				'stringtinyblob ∪ stringlongblob': 'string',
				'stringtinyblob ∪ datestr': '2025-03-12',
				'stringtinyblob ∪ datetimestr': '2025-03-12 01:32:41.623',
				'stringtinyblob ∪ timestampstr': '2025-03-12 01:32:41.623',
				'stringtinyblob ∪ time': '04:13:22',
				'stringmediumblob ∪ bigintstr': '5044565289845416380',
				'stringmediumblob ∪ char': 'c',
				'stringmediumblob ∪ decimal': '47521',
				'stringmediumblob ∪ text': 'C4-',
				'stringmediumblob ∪ tinytext': 'tiny text',
				'stringmediumblob ∪ mediumtext': 'medium text',
				'stringmediumblob ∪ longtext': 'long text',
				'stringmediumblob ∪ varchar': 'VCHAR',
				'stringmediumblob ∪ varbin': '1010110101001101',
				'stringmediumblob ∪ stringblob': 'string',
				'stringmediumblob ∪ stringtinyblob': 'string',
				'stringmediumblob ∪ stringmediumblob': 'string',
				'stringmediumblob ∪ stringlongblob': 'string',
				'stringmediumblob ∪ datestr': '2025-03-12',
				'stringmediumblob ∪ datetimestr': '2025-03-12 01:32:41.623',
				'stringmediumblob ∪ timestampstr': '2025-03-12 01:32:41.623',
				'stringmediumblob ∪ time': '04:13:22',
				'stringlongblob ∪ bigintstr': '5044565289845416380',
				'stringlongblob ∪ char': 'c',
				'stringlongblob ∪ decimal': '47521',
				'stringlongblob ∪ text': 'C4-',
				'stringlongblob ∪ tinytext': 'tiny text',
				'stringlongblob ∪ mediumtext': 'medium text',
				'stringlongblob ∪ longtext': 'long text',
				'stringlongblob ∪ varchar': 'VCHAR',
				'stringlongblob ∪ varbin': '1010110101001101',
				'stringlongblob ∪ stringblob': 'string',
				'stringlongblob ∪ stringtinyblob': 'string',
				'stringlongblob ∪ stringmediumblob': 'string',
				'stringlongblob ∪ stringlongblob': 'string',
				'stringlongblob ∪ datestr': '2025-03-12',
				'stringlongblob ∪ datetimestr': '2025-03-12 01:32:41.623',
				'stringlongblob ∪ timestampstr': '2025-03-12 01:32:41.623',
				'stringlongblob ∪ time': '04:13:22',
				'datestr ∪ bigintstr': '5044565289845416380',
				'datestr ∪ char': 'c',
				'datestr ∪ decimal': '47521',
				'datestr ∪ text': 'C4-',
				'datestr ∪ tinytext': 'tiny text',
				'datestr ∪ mediumtext': 'medium text',
				'datestr ∪ longtext': 'long text',
				'datestr ∪ varchar': 'VCHAR',
				'datestr ∪ varbin': '1010110101001101',
				'datestr ∪ stringblob': 'string',
				'datestr ∪ stringtinyblob': 'string',
				'datestr ∪ stringmediumblob': 'string',
				'datestr ∪ stringlongblob': 'string',
				'datestr ∪ datestr': '2025-03-12',
				'datestr ∪ datetimestr': '2025-03-12 01:32:41.623',
				'datestr ∪ timestampstr': '2025-03-12 01:32:41.623',
				'datetimestr ∪ bigintstr': '5044565289845416380',
				'datetimestr ∪ char': 'c',
				'datetimestr ∪ decimal': '47521',
				'datetimestr ∪ text': 'C4-',
				'datetimestr ∪ tinytext': 'tiny text',
				'datetimestr ∪ mediumtext': 'medium text',
				'datetimestr ∪ longtext': 'long text',
				'datetimestr ∪ varchar': 'VCHAR',
				'datetimestr ∪ varbin': '1010110101001101',
				'datetimestr ∪ stringblob': 'string',
				'datetimestr ∪ stringtinyblob': 'string',
				'datetimestr ∪ stringmediumblob': 'string',
				'datetimestr ∪ stringlongblob': 'string',
				'datetimestr ∪ datestr': '2025-03-12 00:00:00.000',
				'datetimestr ∪ datetimestr': '2025-03-12 01:32:41.623',
				'datetimestr ∪ timestampstr': '2025-03-12 01:32:41.623',
				'timestampstr ∪ bigintstr': '5044565289845416380',
				'timestampstr ∪ char': 'c',
				'timestampstr ∪ decimal': '47521',
				'timestampstr ∪ text': 'C4-',
				'timestampstr ∪ tinytext': 'tiny text',
				'timestampstr ∪ mediumtext': 'medium text',
				'timestampstr ∪ longtext': 'long text',
				'timestampstr ∪ varchar': 'VCHAR',
				'timestampstr ∪ varbin': '1010110101001101',
				'timestampstr ∪ stringblob': 'string',
				'timestampstr ∪ stringtinyblob': 'string',
				'timestampstr ∪ stringmediumblob': 'string',
				'timestampstr ∪ stringlongblob': 'string',
				'timestampstr ∪ datestr': '2025-03-12 00:00:00.000',
				'timestampstr ∪ datetimestr': '2025-03-12 01:32:41.623',
				'timestampstr ∪ timestampstr': '2025-03-12 01:32:41.623',
				'time ∪ bigintstr': '5044565289845416380',
				'time ∪ char': 'c',
				'time ∪ decimal': '47521',
				'time ∪ text': 'C4-',
				'time ∪ tinytext': 'tiny text',
				'time ∪ mediumtext': 'medium text',
				'time ∪ longtext': 'long text',
				'time ∪ varchar': 'VCHAR',
				'time ∪ varbin': '1010110101001101',
				'time ∪ stringblob': 'string',
				'time ∪ stringtinyblob': 'string',
				'time ∪ stringmediumblob': 'string',
				'time ∪ stringlongblob': 'string',
				'time ∪ time': '04:13:22',
				'binary ∪ binary': '1',
			},
		]));

		// ---- bigint ----
		expect(
			await unionAll(
				db.select({
					'bigint64 ∪ bigint64': allTypesCodecsTable.bigint64.as('bigint64 ∪ bigint64'),
					'bigint64 ∪ decimalbig': allTypesCodecsTable.bigint64.as('bigint64 ∪ decimalbig'),
					'decimalbig ∪ bigint64': allTypesCodecsTable.decimalbig.as('decimalbig ∪ bigint64'),
					'decimalbig ∪ decimalbig': allTypesCodecsTable.decimalbig.as('decimalbig ∪ decimalbig'),
				}).from(allTypesCodecsTable),
				db.select({
					'bigint64 ∪ bigint64': allTypesCodecsTable.bigint64.as('bigint64 ∪ bigint64'),
					'bigint64 ∪ decimalbig': allTypesCodecsTable.decimalbig.as('bigint64 ∪ decimalbig'),
					'decimalbig ∪ bigint64': allTypesCodecsTable.bigint64.as('decimalbig ∪ bigint64'),
					'decimalbig ∪ decimalbig': allTypesCodecsTable.decimalbig.as('decimalbig ∪ decimalbig'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'bigint64 ∪ bigint64': 5044565289845416380n,
				'bigint64 ∪ decimalbig': 5044565289845416380n,
				'decimalbig ∪ bigint64': 5044565289845416380n,
				'decimalbig ∪ decimalbig': 5044565289845416380n,
			},
			{
				'bigint64 ∪ bigint64': 5044565289845416380n,
				'bigint64 ∪ decimalbig': 5044565289845416380n,
				'decimalbig ∪ bigint64': 5044565289845416380n,
				'decimalbig ∪ decimalbig': 5044565289845416380n,
			},
		]));

		// ---- boolean ----
		expect(
			await unionAll(
				db.select({
					'boolean ∪ boolean': allTypesCodecsTable.boolean.as('boolean ∪ boolean'),
				}).from(allTypesCodecsTable),
				db.select({
					'boolean ∪ boolean': allTypesCodecsTable.boolean.as('boolean ∪ boolean'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'boolean ∪ boolean': true,
			},
			{
				'boolean ∪ boolean': true,
			},
		]));

		// ---- date ----
		expect(
			await unionAll(
				db.select({
					'date ∪ date': allTypesCodecsTable.date.as('date ∪ date'),
					'date ∪ datetime': allTypesCodecsTable.date.as('date ∪ datetime'),
					'date ∪ timestamp': allTypesCodecsTable.date.as('date ∪ timestamp'),
					'datetime ∪ date': allTypesCodecsTable.datetime.as('datetime ∪ date'),
					'datetime ∪ datetime': allTypesCodecsTable.datetime.as('datetime ∪ datetime'),
					'datetime ∪ timestamp': allTypesCodecsTable.datetime.as('datetime ∪ timestamp'),
					'timestamp ∪ date': allTypesCodecsTable.timestamp.as('timestamp ∪ date'),
					'timestamp ∪ datetime': allTypesCodecsTable.timestamp.as('timestamp ∪ datetime'),
					'timestamp ∪ timestamp': allTypesCodecsTable.timestamp.as('timestamp ∪ timestamp'),
				}).from(allTypesCodecsTable),
				db.select({
					'date ∪ date': allTypesCodecsTable.date.as('date ∪ date'),
					'date ∪ datetime': allTypesCodecsTable.datetime.as('date ∪ datetime'),
					'date ∪ timestamp': allTypesCodecsTable.timestamp.as('date ∪ timestamp'),
					'datetime ∪ date': allTypesCodecsTable.date.as('datetime ∪ date'),
					'datetime ∪ datetime': allTypesCodecsTable.datetime.as('datetime ∪ datetime'),
					'datetime ∪ timestamp': allTypesCodecsTable.timestamp.as('datetime ∪ timestamp'),
					'timestamp ∪ date': allTypesCodecsTable.date.as('timestamp ∪ date'),
					'timestamp ∪ datetime': allTypesCodecsTable.datetime.as('timestamp ∪ datetime'),
					'timestamp ∪ timestamp': allTypesCodecsTable.timestamp.as('timestamp ∪ timestamp'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'date ∪ date': new Date('2025-03-12'),
				'date ∪ datetime': new Date('2025-03-12'),
				'date ∪ timestamp': new Date('2025-03-12'),
				'datetime ∪ date': new Date(1741743161623),
				'datetime ∪ datetime': new Date(1741743161623),
				'datetime ∪ timestamp': new Date(1741743161623),
				'timestamp ∪ date': new Date(1741743161623),
				'timestamp ∪ datetime': new Date(1741743161623),
				'timestamp ∪ timestamp': new Date(1741743161623),
			},
			{
				'date ∪ date': new Date('2025-03-12'),
				'date ∪ datetime': new Date(1741743161623),
				'date ∪ timestamp': new Date(1741743161623),
				'datetime ∪ date': new Date('2025-03-12'),
				'datetime ∪ datetime': new Date(1741743161623),
				'datetime ∪ timestamp': new Date(1741743161623),
				'timestamp ∪ date': new Date('2025-03-12'),
				'timestamp ∪ datetime': new Date(1741743161623),
				'timestamp ∪ timestamp': new Date(1741743161623),
			},
		]));

		// ---- buffer ----
		expect(
			await unionAll(
				db.select({
					'blob ∪ blob': allTypesCodecsTable.blob.as('blob ∪ blob'),
					'blob ∪ tinyblob': allTypesCodecsTable.blob.as('blob ∪ tinyblob'),
					'blob ∪ mediumblob': allTypesCodecsTable.blob.as('blob ∪ mediumblob'),
					'blob ∪ longblob': allTypesCodecsTable.blob.as('blob ∪ longblob'),
					'tinyblob ∪ blob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ blob'),
					'tinyblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ tinyblob'),
					'tinyblob ∪ mediumblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ mediumblob'),
					'tinyblob ∪ longblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ longblob'),
					'mediumblob ∪ blob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ blob'),
					'mediumblob ∪ tinyblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ tinyblob'),
					'mediumblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ mediumblob'),
					'mediumblob ∪ longblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ longblob'),
					'longblob ∪ blob': allTypesCodecsTable.longblob.as('longblob ∪ blob'),
					'longblob ∪ tinyblob': allTypesCodecsTable.longblob.as('longblob ∪ tinyblob'),
					'longblob ∪ mediumblob': allTypesCodecsTable.longblob.as('longblob ∪ mediumblob'),
					'longblob ∪ longblob': allTypesCodecsTable.longblob.as('longblob ∪ longblob'),
				}).from(allTypesCodecsTable),
				db.select({
					'blob ∪ blob': allTypesCodecsTable.blob.as('blob ∪ blob'),
					'blob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('blob ∪ tinyblob'),
					'blob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('blob ∪ mediumblob'),
					'blob ∪ longblob': allTypesCodecsTable.longblob.as('blob ∪ longblob'),
					'tinyblob ∪ blob': allTypesCodecsTable.blob.as('tinyblob ∪ blob'),
					'tinyblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ tinyblob'),
					'tinyblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('tinyblob ∪ mediumblob'),
					'tinyblob ∪ longblob': allTypesCodecsTable.longblob.as('tinyblob ∪ longblob'),
					'mediumblob ∪ blob': allTypesCodecsTable.blob.as('mediumblob ∪ blob'),
					'mediumblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('mediumblob ∪ tinyblob'),
					'mediumblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ mediumblob'),
					'mediumblob ∪ longblob': allTypesCodecsTable.longblob.as('mediumblob ∪ longblob'),
					'longblob ∪ blob': allTypesCodecsTable.blob.as('longblob ∪ blob'),
					'longblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('longblob ∪ tinyblob'),
					'longblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('longblob ∪ mediumblob'),
					'longblob ∪ longblob': allTypesCodecsTable.longblob.as('longblob ∪ longblob'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'blob ∪ blob': Buffer.from('string'),
				'blob ∪ tinyblob': Buffer.from('string'),
				'blob ∪ mediumblob': Buffer.from('string'),
				'blob ∪ longblob': Buffer.from('string'),
				'tinyblob ∪ blob': Buffer.from('string'),
				'tinyblob ∪ tinyblob': Buffer.from('string'),
				'tinyblob ∪ mediumblob': Buffer.from('string'),
				'tinyblob ∪ longblob': Buffer.from('string'),
				'mediumblob ∪ blob': Buffer.from('string'),
				'mediumblob ∪ tinyblob': Buffer.from('string'),
				'mediumblob ∪ mediumblob': Buffer.from('string'),
				'mediumblob ∪ longblob': Buffer.from('string'),
				'longblob ∪ blob': Buffer.from('string'),
				'longblob ∪ tinyblob': Buffer.from('string'),
				'longblob ∪ mediumblob': Buffer.from('string'),
				'longblob ∪ longblob': Buffer.from('string'),
			},
			{
				'blob ∪ blob': Buffer.from('string'),
				'blob ∪ tinyblob': Buffer.from('string'),
				'blob ∪ mediumblob': Buffer.from('string'),
				'blob ∪ longblob': Buffer.from('string'),
				'tinyblob ∪ blob': Buffer.from('string'),
				'tinyblob ∪ tinyblob': Buffer.from('string'),
				'tinyblob ∪ mediumblob': Buffer.from('string'),
				'tinyblob ∪ longblob': Buffer.from('string'),
				'mediumblob ∪ blob': Buffer.from('string'),
				'mediumblob ∪ tinyblob': Buffer.from('string'),
				'mediumblob ∪ mediumblob': Buffer.from('string'),
				'mediumblob ∪ longblob': Buffer.from('string'),
				'longblob ∪ blob': Buffer.from('string'),
				'longblob ∪ tinyblob': Buffer.from('string'),
				'longblob ∪ mediumblob': Buffer.from('string'),
				'longblob ∪ longblob': Buffer.from('string'),
			},
		]));

		// ---- enum ----
		expect(
			await unionAll(
				db.select({
					'enum ∪ enum': allTypesCodecsTable.enum.as('enum ∪ enum'),
				}).from(allTypesCodecsTable),
				db.select({
					'enum ∪ enum': allTypesCodecsTable.enum.as('enum ∪ enum'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'enum ∪ enum': 'enV1',
			},
			{
				'enum ∪ enum': 'enV1',
			},
		]));

		// ---- json ----
		expect(
			await unionAll(
				db.select({
					'json1 ∪ json1': allTypesCodecsTable.json1.as('json1 ∪ json1'),
					'json1 ∪ json2': allTypesCodecsTable.json1.as('json1 ∪ json2'),
					'json1 ∪ json3': allTypesCodecsTable.json1.as('json1 ∪ json3'),
					'json1 ∪ json4': allTypesCodecsTable.json1.as('json1 ∪ json4'),
					'json2 ∪ json1': allTypesCodecsTable.json2.as('json2 ∪ json1'),
					'json2 ∪ json2': allTypesCodecsTable.json2.as('json2 ∪ json2'),
					'json2 ∪ json3': allTypesCodecsTable.json2.as('json2 ∪ json3'),
					'json2 ∪ json4': allTypesCodecsTable.json2.as('json2 ∪ json4'),
					'json3 ∪ json1': allTypesCodecsTable.json3.as('json3 ∪ json1'),
					'json3 ∪ json2': allTypesCodecsTable.json3.as('json3 ∪ json2'),
					'json3 ∪ json3': allTypesCodecsTable.json3.as('json3 ∪ json3'),
					'json3 ∪ json4': allTypesCodecsTable.json3.as('json3 ∪ json4'),
					'json4 ∪ json1': allTypesCodecsTable.json4.as('json4 ∪ json1'),
					'json4 ∪ json2': allTypesCodecsTable.json4.as('json4 ∪ json2'),
					'json4 ∪ json3': allTypesCodecsTable.json4.as('json4 ∪ json3'),
					'json4 ∪ json4': allTypesCodecsTable.json4.as('json4 ∪ json4'),
				}).from(allTypesCodecsTable),
				db.select({
					'json1 ∪ json1': allTypesCodecsTable.json1.as('json1 ∪ json1'),
					'json1 ∪ json2': allTypesCodecsTable.json2.as('json1 ∪ json2'),
					'json1 ∪ json3': allTypesCodecsTable.json3.as('json1 ∪ json3'),
					'json1 ∪ json4': allTypesCodecsTable.json4.as('json1 ∪ json4'),
					'json2 ∪ json1': allTypesCodecsTable.json1.as('json2 ∪ json1'),
					'json2 ∪ json2': allTypesCodecsTable.json2.as('json2 ∪ json2'),
					'json2 ∪ json3': allTypesCodecsTable.json3.as('json2 ∪ json3'),
					'json2 ∪ json4': allTypesCodecsTable.json4.as('json2 ∪ json4'),
					'json3 ∪ json1': allTypesCodecsTable.json1.as('json3 ∪ json1'),
					'json3 ∪ json2': allTypesCodecsTable.json2.as('json3 ∪ json2'),
					'json3 ∪ json3': allTypesCodecsTable.json3.as('json3 ∪ json3'),
					'json3 ∪ json4': allTypesCodecsTable.json4.as('json3 ∪ json4'),
					'json4 ∪ json1': allTypesCodecsTable.json1.as('json4 ∪ json1'),
					'json4 ∪ json2': allTypesCodecsTable.json2.as('json4 ∪ json2'),
					'json4 ∪ json3': allTypesCodecsTable.json3.as('json4 ∪ json3'),
					'json4 ∪ json4': allTypesCodecsTable.json4.as('json4 ∪ json4'),
				}).from(allTypesCodecsTable),
			),
		).toEqual(expect.arrayContaining([
			{
				'json1 ∪ json1': { str: 'strval', arr: ['str', 10] },
				'json1 ∪ json2': { str: 'strval', arr: ['str', 10] },
				'json1 ∪ json3': { str: 'strval', arr: ['str', 10] },
				'json1 ∪ json4': { str: 'strval', arr: ['str', 10] },
				'json2 ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json2 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json2 ∪ json3': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json2 ∪ json4': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json3 ∪ json1': 5,
				'json3 ∪ json2': 5,
				'json3 ∪ json3': 5,
				'json3 ∪ json4': 5,
				'json4 ∪ json1': '5',
				'json4 ∪ json2': '5',
				'json4 ∪ json3': '5',
				'json4 ∪ json4': '5',
			},
			{
				'json1 ∪ json1': { str: 'strval', arr: ['str', 10] },
				'json1 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json1 ∪ json3': 5,
				'json1 ∪ json4': '5',
				'json2 ∪ json1': { str: 'strval', arr: ['str', 10] },
				'json2 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json2 ∪ json3': 5,
				'json2 ∪ json4': '5',
				'json3 ∪ json1': { str: 'strval', arr: ['str', 10] },
				'json3 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json3 ∪ json3': 5,
				'json3 ∪ json4': '5',
				'json4 ∪ json1': { str: 'strval', arr: ['str', 10] },
				'json4 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
				'json4 ∪ json3': 5,
				'json4 ∪ json4': '5',
			},
		]));

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
