/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { eq, gt, like, not, sql } from 'drizzle-orm';
import { int, mysqlTable, serial, text, varchar } from 'drizzle-orm/mysql-core';
import { expect, expectTypeOf } from 'vitest';
import type { Test } from './instrumentation';
import { rqbPost, rqbUser } from './schema';
import { createCitiesTable, createCountTestTable, createUsers2Table, createUserTable } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	let firstTime = true;
	let resolveValue: (val: any) => void;
	const promise = new Promise((resolve) => {
		resolveValue = resolve;
	});
	test.beforeEach(async ({ task, skip, client, db }) => {
		if (firstTime) {
			firstTime = false;

			await client.batch([
				`CREATE TABLE \`user_rqb_test\` (
		        	\`id\` SERIAL PRIMARY KEY,
		        	\`name\` TEXT NOT NULL,
		        	\`created_at\` TIMESTAMP NOT NULL
		     	);`,
				`CREATE TABLE \`post_rqb_test\` ( 
		        	\`id\` SERIAL PRIMARY KEY,
		        	\`user_id\` BIGINT(20) UNSIGNED NOT NULL,
		        	\`content\` TEXT,
		        	\`created_at\` TIMESTAMP NOT NULL
				);`,
				`CREATE TABLE \`empty\` (\`id\` int);`,
			]);

			const date = new Date(120000);
			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(rqbPost).values([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);

			resolveValue('');
		}

		await promise;
		if (exclude.has(task.name)) skip();
	});

	// .sequential is needed for beforeEach to be executed before all tests
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
		const users = createUserTable('users_61');
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
		const countTestTable = createCountTestTable('count_test_1');

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

	test.concurrent('$count embedded', async ({ db, push }) => {
		const countTestTable = createCountTestTable('count_test_2');

		await push({ countTestTable });

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.select({
			count: db.$count(countTestTable),
		}).from(countTestTable);

		expect(count).toStrictEqual([
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
		]);
	});

	test.concurrent('$count separate reuse', async ({ db, push }) => {
		const countTestTable = createCountTestTable('count_test_3');

		await push({ countTestTable });

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

		expect(count1).toStrictEqual(4);
		expect(count2).toStrictEqual(5);
		expect(count3).toStrictEqual(6);
	});

	test.concurrent('$count embedded reuse', async ({ db, push }) => {
		const countTestTable = createCountTestTable('count_test_4');

		await push({ countTestTable });

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

	test.concurrent('$count separate with filters', async ({ db, push }) => {
		const countTestTable = createCountTestTable('count_test_5');

		await push({ countTestTable });

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable, gt(countTestTable.id, 1));

		expect(count).toStrictEqual(3);
	});

	test.concurrent('$count embedded with filters', async ({ db, push }) => {
		const countTestTable = createCountTestTable('count_test_6');

		await push({ countTestTable });

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.select({
			count: db.$count(countTestTable, gt(countTestTable.id, 1)),
		}).from(countTestTable);

		expect(count).toStrictEqual([
			{ count: 3 },
			{ count: 3 },
			{ count: 3 },
			{ count: 3 },
		]);
	});

	test.concurrent('limit 0', async ({ db, push }) => {
		const users = createUserTable('users_62');
		await push({ users });
		await db.insert(users).values({ name: 'John' });

		const result = await db
			.select()
			.from(users)
			.limit(0);

		expect(result).toEqual([]);
	});

	test.concurrent('limit -1', async ({ db, push }) => {
		const users = createUserTable('users_631');
		await push({ users });
		await db.insert(users).values({ name: 'John' });

		const result = await db
			.select()
			.from(users)
			.limit(-1);

		expect(result.length).toBeGreaterThan(0);
	});

	test.concurrent('cross join', async ({ db, push, seed }) => {
		const users = createUserTable('users_63');
		const cities = createCitiesTable('cities_63');

		await push({ users, cities });
		await seed({ users, cities }, (funcs) => ({
			users: { count: 2, columns: { name: funcs.firstName() } },
			cities: { count: 2, columns: { name: funcs.city() } },
		}));

		const result = await db
			.select({
				user: users.name,
				city: cities.name,
			})
			.from(users)
			.crossJoin(cities)
			.orderBy(users.name, cities.name);

		expect(result).toStrictEqual([
			{ city: 'Hoogvliet', user: 'Agripina' },
			{ city: 'South Milwaukee', user: 'Agripina' },
			{ city: 'Hoogvliet', user: 'Candy' },
			{ city: 'South Milwaukee', user: 'Candy' },
		]);
	});

	test.concurrent('left join (lateral)', async ({ db, push }) => {
		const cities = createCitiesTable('cities_64');
		const users2 = createUsers2Table('users2_64', cities);

		await push({ cities, users2 });

		await db
			.insert(cities)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

		await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

		const sq = db
			.select({
				userId: users2.id,
				userName: users2.name,
				cityId: users2.cityId,
			})
			.from(users2)
			.where(eq(users2.cityId, cities.id))
			.as('sq');

		const res = await db
			.select({
				cityId: cities.id,
				cityName: cities.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(cities)
			.leftJoinLateral(sq, sql`true`);

		expect(res).toStrictEqual([
			{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
			{ cityId: 2, cityName: 'London', userId: null, userName: null },
		]);
	});

	test.concurrent('inner join (lateral)', async ({ db, push }) => {
		const cities = createCitiesTable('cities_65');
		const users2 = createUsers2Table('users2_65', cities);

		await push({ cities, users2 });

		await db.insert(cities).values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);
		await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

		const sq = db
			.select({
				userId: users2.id,
				userName: users2.name,
				cityId: users2.cityId,
			})
			.from(users2)
			.where(eq(users2.cityId, cities.id))
			.as('sq');

		const res = await db
			.select({
				cityId: cities.id,
				cityName: cities.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(cities)
			.innerJoinLateral(sq, sql`true`);

		expect(res).toStrictEqual([
			{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
		]);
	});

	test.concurrent('cross join (lateral)', async ({ db, push }) => {
		const cities = createCitiesTable('cities_66');
		const users2 = createUsers2Table('users2_66', cities);

		await push({ cities, users2 });

		await db
			.insert(cities)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }, { id: 3, name: 'Berlin' }]);

		await db.insert(users2).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }, {
			name: 'Patrick',
			cityId: 2,
		}]);

		const sq = db
			.select({
				userId: users2.id,
				userName: users2.name,
				cityId: users2.cityId,
			})
			.from(users2)
			.where(not(like(cities.name, 'L%')))
			.as('sq');

		const res = await db
			.select({
				cityId: cities.id,
				cityName: cities.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(cities)
			.crossJoinLateral(sq)
			.orderBy(cities.id, sq.userId);

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

	test.concurrent('RQB v2 simple find first - no rows', async ({ db }) => {
		const result = await db.query.empty.findFirst();
		expect(result).toStrictEqual(undefined);
	});

	test.concurrent('RQB v2 simple find first - multiple rows', async ({ db }) => {
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

	test.concurrent('RQB v2 simple find first - with relation', async ({ db }) => {
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
