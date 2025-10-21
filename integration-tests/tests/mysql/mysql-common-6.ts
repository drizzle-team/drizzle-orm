/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { eq, like, not, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { type Test } from './instrumentation';
import { cities3, citiesTable, users2Table, users3, usersTable } from './schema2';

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
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
