/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { eq, like, not, sql } from 'drizzle-orm';
import { int, mysqlTable, serial, text, varchar } from 'drizzle-orm/mysql-core';
import { expect, expectTypeOf } from 'vitest';
import { type Test } from './instrumentation';
import { cities3, citiesTable, createUserTable, users2Table, users3, usersTable } from './schema2';

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('insert $returningId: serial as id', async ({ db, push }) => {
		const users = createUserTable('users_60');
		await push({ users });
		const result = await db.insert(users).values({ name: 'John' }).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test.concurrent('insert $returningId: serial as id, not first column', async ({ db, push }) => {
		const usersTableDefNotFirstColumn = mysqlTable('users2_52', {
			name: text('name').notNull(),
			id: serial('id').primaryKey(),
		});

		await push({ usersTableDefNotFirstColumn });

		const result = await db.insert(usersTableDefNotFirstColumn).values({ name: 'John' }).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test.concurrent('insert $returningId: serial as id, batch insert', async ({ db, push }) => {
		const users = createUserTable('users_60');
		await push({ users });

		const result = await db.insert(users).values([{ name: 'John' }, { name: 'John1' }]).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }, { id: 2 }]);
	});

	test.concurrent('insert $returningId: $default as primary key', async ({ db, push }) => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn_1', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await push({ usersTableDefFn });

		const result = await db.insert(usersTableDefFn).values([{ name: 'John' }, { name: 'John1' }])
			//    ^?
			.$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			customId: string;
		}[]>();

		expect(result).toStrictEqual([{ customId: 'ao865jf3mcmkfkk8o5ri495z' }, {
			customId: 'dyqs529eom0iczo2efxzbcut',
		}]);
	});

	test.concurrent('insert $returningId: $default as primary key with value', async ({ db, push }) => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn_2', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await push({ usersTableDefFn });

		const result = await db.insert(usersTableDefFn).values([{ name: 'John', customId: 'test' }, { name: 'John1' }])
			//    ^?
			.$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			customId: string;
		}[]>();

		expect(result).toStrictEqual([{ customId: 'test' }, { customId: 'ao865jf3mcmkfkk8o5ri495z' }]);
	});

	test.concurrent('$count separate', async ({ db, push }) => {
		const countTestTable = mysqlTable('count_test1', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await push({ countTestTable });

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable);

		expect(count).toStrictEqual(4);
	});

	test.concurrent('$count embedded', async ({ db }) => {
		const countTestTable = mysqlTable('count_test2', {
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
			count: db.$count(countTestTable),
		}).from(countTestTable);

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual([
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
		]);
	});

	test.concurrent('$count separate reuse', async ({ db }) => {
		const countTestTable = mysqlTable('count_test3', {
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

		const count = db.$count(countTestTable);

		const count1 = await count;

		await db.insert(countTestTable).values({ id: 5, name: 'fifth' });

		const count2 = await count;

		await db.insert(countTestTable).values({ id: 6, name: 'sixth' });

		const count3 = await count;

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count1).toStrictEqual(4);
		expect(count2).toStrictEqual(5);
		expect(count3).toStrictEqual(6);
	});

	test.concurrent('$count embedded reuse', async ({ db }) => {
		const countTestTable = mysqlTable('count_test4', {
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

		const count = db.select({
			count: db.$count(countTestTable),
		}).from(countTestTable);

		const count1 = await count;

		await db.insert(countTestTable).values({ id: 5, name: 'fifth' });

		const count2 = await count;

		await db.insert(countTestTable).values({ id: 6, name: 'sixth' });

		const count3 = await count;

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count1).toStrictEqual([
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
		]);
		expect(count2).toStrictEqual([
			{ count: 5 },
			{ count: 5 },
			{ count: 5 },
			{ count: 5 },
			{ count: 5 },
		]);
		expect(count3).toStrictEqual([
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
		]);
	});

	test.concurrent('limit 0', async ({ db }) => {
		const users = await db
			.select()
			.from(usersTable)
			.limit(0);

		expect(users).toEqual([]);
	});

	test.concurrent('limit -1', async ({ db }) => {
		const users = await db
			.select()
			.from(usersTable)
			.limit(-1);

		expect(users.length).toBeGreaterThan(0);
	});

	test('cross join', async ({ db }) => {
		const result = await db
			.select({
				user: usersTable.name,
				city: citiesTable.name,
			})
			.from(usersTable)
			.crossJoin(citiesTable)
			.orderBy(usersTable.name, citiesTable.name);

		expect(result).toStrictEqual([
			{ city: 'New York City', user: 'Jane' },
			{ city: 'Seattle', user: 'Jane' },
			{ city: 'New York City', user: 'John' },
			{ city: 'Seattle', user: 'John' },
		]);
	});

	test('left join (lateral)', async ({ db }) => {
		const sq = db
			.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(eq(users2Table.cityId, citiesTable.id))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id,
				cityName: citiesTable.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(citiesTable)
			.leftJoinLateral(sq, sql`true`);

		expect(res).toStrictEqual([
			{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
			{ cityId: 2, cityName: 'London', userId: null, userName: null },
		]);
	});

	test('inner join (lateral)', async ({ db }) => {
		const sq = db
			.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(eq(users2Table.cityId, citiesTable.id))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id,
				cityName: citiesTable.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(citiesTable)
			.innerJoinLateral(sq, sql`true`);

		expect(res).toStrictEqual([
			{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
		]);
	});

	test.concurrent('cross join (lateral)', async ({ db }) => {
		const sq = db
			.select({
				userId: users3.id,
				userName: users3.name,
				cityId: users3.cityId,
			})
			.from(users3)
			.where(not(like(cities3.name, 'L%')))
			.as('sq');

		const res = await db
			.select({
				cityId: cities3.id,
				cityName: cities3.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(cities3)
			.crossJoinLateral(sq)
			.orderBy(cities3.id, sq.userId);

		expect(res).toStrictEqual([
			{
				cityId: 1,
				cityName: 'Paris',
				userId: 1,
				userName: 'John',
			},
			{
				cityId: 1,
				cityName: 'Paris',
				userId: 2,
				userName: 'Jane',
			},
			{
				cityId: 1,
				cityName: 'Paris',
				userId: 3,
				userName: 'Patrick',
			},
			{
				cityId: 3,
				cityName: 'Berlin',
				userId: 1,
				userName: 'John',
			},
			{
				cityId: 3,
				cityName: 'Berlin',
				userId: 2,
				userName: 'Jane',
			},
			{
				cityId: 3,
				cityName: 'Berlin',
				userId: 3,
				userName: 'Patrick',
			},
		]);
	});

	test('RQB v2 simple find first - no rows', async ({ db }) => {
		const result = await db.query.empty.findFirst();
		expect(result).toStrictEqual(undefined);
	});

	test('RQB v2 simple find first - multiple rows', async ({ db }) => {
		const result = await db.query.rqbUser.findFirst({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual({
			id: 2,
			createdAt: new Date(120000),
			name: 'Second',
		});
	});

	test('RQB v2 simple find first - with relation', async ({ db }) => {
		const result = await db.query.rqbUser.findFirst({
			with: {
				posts: {
					orderBy: {
						id: 'asc',
					},
				},
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual({
			id: 1,
			createdAt: new Date(120000),
			name: 'First',
			posts: [{
				id: 1,
				userId: 1,
				createdAt: new Date(120000),
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: new Date(120000),
				content: 'Has message this time',
			}],
		});
	});

	test('RQB v2 simple find first - placeholders', async ({ db }) => {
		const query = db.query.rqbUser.findFirst({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare();

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual({
			id: 2,
			createdAt: new Date(120000),
			name: 'Second',
		});
	});

	test('RQB v2 simple find many - no rows', async ({ db }) => {
		const result = await db.query.empty.findMany();

		expect(result).toStrictEqual([]);
	});

	test('RQB v2 simple find many - multiple rows', async ({ db }) => {
		const result = await db.query.rqbUser.findMany({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual([{
			id: 2,
			createdAt: new Date(120000),
			name: 'Second',
		}, {
			id: 1,
			createdAt: new Date(120000),
			name: 'First',
		}]);
	});

	test('RQB v2 simple find many - with relation', async ({ db }) => {
		const result = await db.query.rqbPost.findMany({
			with: {
				author: true,
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual([{
			id: 1,
			userId: 1,
			createdAt: new Date(120000),
			content: null,
			author: {
				id: 1,
				createdAt: new Date(120000),
				name: 'First',
			},
		}, {
			id: 2,
			userId: 1,
			createdAt: new Date(120000),
			content: 'Has message this time',
			author: {
				id: 1,
				createdAt: new Date(120000),
				name: 'First',
			},
		}]);
	});

	test('RQB v2 simple find many - placeholders', async ({ db }) => {
		const query = db.query.rqbUser.findMany({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare();

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual([{
			id: 2,
			createdAt: new Date(120000),
			name: 'Second',
		}]);
	});

	test('RQB v2 transaction find first - no rows', async ({ db }) => {
		await db.transaction(async (db) => {
			const result = await db.query.empty.findFirst();

			expect(result).toStrictEqual(undefined);
		});
	});

	test('RQB v2 transaction find first - multiple rows', async ({ db }) => {
		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: new Date(120000),
				name: 'Second',
			});
		});
	});

	test('RQB v2 transaction find first - with relation', async ({ db }) => {
		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst({
				with: {
					posts: {
						orderBy: {
							id: 'asc',
						},
					},
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).toStrictEqual({
				id: 1,
				createdAt: new Date(120000),
				name: 'First',
				posts: [{
					id: 1,
					userId: 1,
					createdAt: new Date(120000),
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: new Date(120000),
					content: 'Has message this time',
				}],
			});
		});
	});

	test('RQB v2 transaction find first - placeholders', async ({ db }) => {
		await db.transaction(async (db) => {
			const query = db.query.rqbUser.findFirst({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare();

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: new Date(120000),
				name: 'Second',
			});
		});
	});

	test('RQB v2 transaction find many - no rows', async ({ db }) => {
		await db.transaction(async (db) => {
			const result = await db.query.empty.findMany();

			expect(result).toStrictEqual([]);
		});
	});

	test('RQB v2 transaction find many - multiple rows', async ({ db }) => {
		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findMany({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: new Date(120000),
				name: 'Second',
			}, {
				id: 1,
				createdAt: new Date(120000),
				name: 'First',
			}]);
		});
	});

	test('RQB v2 transaction find many - with relation', async ({ db }) => {
		await db.transaction(async (db) => {
			const result = await db.query.rqbPost.findMany({
				with: {
					author: true,
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).toStrictEqual([{
				id: 1,
				userId: 1,
				createdAt: new Date(120000),
				content: null,
				author: {
					id: 1,
					createdAt: new Date(120000),
					name: 'First',
				},
			}, {
				id: 2,
				userId: 1,
				createdAt: new Date(120000),
				content: 'Has message this time',
				author: {
					id: 1,
					createdAt: new Date(120000),
					name: 'First',
				},
			}]);
		});
	});

	test('RQB v2 transaction find many - placeholders', async ({ db }) => {
		await db.transaction(async (db) => {
			const query = db.query.rqbUser.findMany({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare();

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: new Date(120000),
				name: 'Second',
			}]);
		});
	});
}
