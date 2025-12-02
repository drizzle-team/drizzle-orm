import 'dotenv/config';
import { asc, eq, gt, sql, TransactionRollbackError } from 'drizzle-orm';
import { datetime, int, mysqlTable, mysqlView, serial, text, union, unionAll } from 'drizzle-orm/mysql-core';
import { expect } from 'vitest';

import type { Test } from './instrumentation';
import { createCitiesTable, createUsers2Table, createUserTable } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('orderBy with aliased column', ({ db }) => {
		const users2 = createUserTable('users2_41');
		const query = db.select({
			test: sql`something`.as('test'),
		}).from(users2).orderBy((fields) => fields.test).toSQL();

		expect(query.sql).toBe('select something as `test` from `users2_41` order by `test`');
	});

	test.concurrent('timestamp timezone', async ({ db, push }) => {
		const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

		const users = createUserTable('users_48');
		await push({ users });
		await db.insert(users).values({ name: 'With default times' });
		await db.insert(users).values({
			name: 'Without default times',
			createdAt: date,
		});
		const result = await db.select().from(users);

		// check that the timestamps are set correctly for default times
		expect(Math.abs(result[0]!.createdAt.getTime() - Date.now())).toBeLessThan(2000);

		// check that the timestamps are set correctly for non default times
		expect(Math.abs(result[1]!.createdAt.getTime() - date.getTime())).toBeLessThan(2000);
	});

	test('transaction', async ({ db, push }) => {
		const users = mysqlTable('users_transactions_48', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions_48', {
			id: serial('id').primaryKey(),
			price: int('price').notNull(),
			stock: int('stock').notNull(),
		});

		await push({ users, products });

		const [{ insertId: userId }] = await db.insert(users).values({ balance: 100 });
		const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]!);
		const [{ insertId: productId }] = await db.insert(products).values({ price: 10, stock: 10 });
		const product = await db.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]!);

		await db.transaction(async (tx) => {
			await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
			await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
		});

		const result = await db.select().from(users);

		expect(result).toEqual([{ id: 1, balance: 90 }]);
	});

	test('transaction with options (set isolationLevel)', async ({ db, push }) => {
		const users = mysqlTable('users_transactions_49', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions_49', {
			id: serial('id').primaryKey(),
			price: int('price').notNull(),
			stock: int('stock').notNull(),
		});

		await push({ users, products });

		const [{ insertId: userId }] = await db.insert(users).values({ balance: 100 });
		const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]!);
		const [{ insertId: productId }] = await db.insert(products).values({ price: 10, stock: 10 });
		const product = await db.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]!);

		await db.transaction(async (tx) => {
			await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
			await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
		}, { isolationLevel: 'serializable' });

		const result = await db.select().from(users);
		expect(result).toEqual([{ id: 1, balance: 90 }]);
	});

	test('transaction rollback', async ({ db, push }) => {
		const users = mysqlTable('users_transactions_rollback_50', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await push({ users });

		await expect((async () => {
			await db.transaction(async (tx) => {
				await tx.insert(users).values({ balance: 100 });
				tx.rollback();
			});
		})()).rejects.toThrowError(TransactionRollbackError);

		const result = await db.select().from(users);

		expect(result).toEqual([]);
	});

	test('nested transaction', async ({ db, push }) => {
		const users = mysqlTable('users_nested_transactions_51', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await push({ users });

		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });

			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
			});
		});

		const result = await db.select().from(users);

		expect(result).toEqual([{ id: 1, balance: 200 }]);
	});

	test('nested transaction rollback', async ({ db, push }) => {
		const users = mysqlTable('users_52', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await push({ users });

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
	});

	test.concurrent('join subquery with join', async ({ db, push }) => {
		const internalStaff = mysqlTable('users_53_internal_staff', {
			userId: int('user_id').notNull(),
		});

		const customUser = mysqlTable('users_53_custom_user', {
			id: int('id').notNull(),
		});

		const ticket = mysqlTable('users_53_ticket', {
			staffId: int('staff_id').notNull(),
		});

		await push({ internalStaff, customUser, ticket });

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
			.leftJoin(subq, eq(subq.users_53_internal_staff.userId, ticket.staffId));

		expect(mainQuery).toEqual([{
			users_53_ticket: { staffId: 1 },
			internal_staff: {
				users_53_internal_staff: { userId: 1 },
				users_53_custom_user: { id: 1 },
			},
		}]);
	});

	test.concurrent('subquery with view', async ({ db, push }) => {
		const users = mysqlTable('users_54', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		});

		const newYorkers = mysqlView('users_54_new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

		await push({ users, newYorkers });

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
	});

	test.concurrent('join view as subquery', async ({ db, push }) => {
		const users = mysqlTable('users_join_view', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		});

		const newYorkers = mysqlView('users_55_new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

		await push({ users, newYorkers });

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
	});

	test.concurrent('select iterator', async ({ db, push }) => {
		const users = mysqlTable('users_iterator_1', {
			id: serial('id').primaryKey(),
		});

		await push({ users });

		await db.insert(users).values([{}, {}, {}]);

		const iter = db.select().from(users).iterator();

		const result: typeof users.$inferSelect[] = [];

		for await (const row of iter) {
			result.push(row);
		}

		expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test.concurrent('select iterator w/ prepared statement', async ({ db, push }) => {
		const users = mysqlTable('users_iterator_2', {
			id: serial('id').primaryKey(),
		});

		await push({ users });

		await db.insert(users).values([{}, {}, {}]);

		const prepared = db.select().from(users).prepare();
		const iter = prepared.iterator();
		const result: typeof users.$inferSelect[] = [];

		for await (const row of iter) {
			result.push(row);
		}

		expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test.concurrent('insert undefined', async ({ db, push }) => {
		const users = mysqlTable('users_58', {
			id: serial('id').primaryKey(),
			name: text('name'),
		});

		await push({ users });

		await expect((async () => {
			await db.insert(users).values({ name: undefined });
		})()).resolves.not.toThrowError();
	});

	test.concurrent('update undefined', async ({ db, push }) => {
		const users = mysqlTable('users_59', {
			id: serial('id').primaryKey(),
			name: text('name'),
		});

		await push({ users });

		await expect((async () => {
			await db.update(users).set({ name: undefined });
		})()).rejects.toThrowError();

		await expect((async () => {
			await db.update(users).set({ id: 1, name: undefined });
		})()).resolves.not.toThrowError();
	});

	test.concurrent('utc config for datetime', async ({ db, push, client }) => {
		const query = client.query;
		const datesTable = mysqlTable('datestable_2', {
			datetimeUTC: datetime('datetime_utc', { fsp: 3, mode: 'date' }),
			datetime: datetime('datetime', { fsp: 3 }),
			datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
		});

		await push({ datesTable });

		await query(`SET time_zone = '+00:00'`, []);

		const dateObj = new Date('2022-11-11');
		const dateUtc = new Date('2022-11-11T12:12:12.122Z');

		await db.insert(datesTable).values({
			datetimeUTC: dateUtc,
			datetime: dateObj,
			datetimeAsString: '2022-11-11 12:12:12',
		});

		const res = await db.select().from(datesTable);

		expect(res[0]?.datetime).toBeInstanceOf(Date);
		expect(res[0]?.datetimeUTC).toBeInstanceOf(Date);
		expect(typeof res[0]?.datetimeAsString).toBe('string');

		expect(res).toEqual([{
			datetimeUTC: dateUtc,
			datetime: new Date('2022-11-11'),
			datetimeAsString: '2022-11-11 12:12:12',
		}]);
	});

	test('set operations (union) from query builder with subquery', async ({ db, push }) => {
		const cities = createCitiesTable('cities_38');
		const users2 = createUsers2Table('users2_38', cities);
		await push({ cities, users2 });

		await db.insert(cities).values([
			{ id: 1, name: 'Paris' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await db.insert(users2).values([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 2 },
			{ id: 3, name: 'Jack', cityId: 3 },
			{ id: 4, name: 'Peter', cityId: 3 },
			{ id: 5, name: 'Ben', cityId: 2 },
			{ id: 6, name: 'Jill', cityId: 1 },
			{ id: 7, name: 'Mary', cityId: 2 },
			{ id: 8, name: 'Sally', cityId: 1 },
		]);

		const sq = db
			.select({ id: users2.id, name: users2.name })
			.from(users2).as('sq');

		const result = await db
			.select({ id: cities.id, name: cities.name })
			.from(cities).union(
				db.select().from(sq),
			).limit(8);

		expect(result).toStrictEqual([
			{ id: 1, name: 'Paris' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
			{ id: 1, name: 'John' },
			{ id: 2, name: 'Jane' },
			{ id: 3, name: 'Jack' },
			{ id: 4, name: 'Peter' },
			{ id: 5, name: 'Ben' },
		]);

		// union should throw if selected fields are not in the same order
		await expect((async () => {
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).union(
					db
						.select({ name: users2.name, id: users2.id })
						.from(users2),
				);
		})()).rejects.toThrowError();
	});

	test('set operations (union) as function', async ({ db, push }) => {
		const cities = createCitiesTable('cities_39');
		const users2 = createUsers2Table('users2_39', cities);
		await push({ cities, users2 });

		await db.insert(cities).values([
			{ id: 1, name: 'Paris' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await db.insert(users2).values([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 2 },
			{ id: 3, name: 'Jack', cityId: 3 },
			{ id: 4, name: 'Peter', cityId: 3 },
			{ id: 5, name: 'Ben', cityId: 2 },
			{ id: 6, name: 'Jill', cityId: 1 },
			{ id: 7, name: 'Mary', cityId: 2 },
			{ id: 8, name: 'Sally', cityId: 1 },
		]);

		const result = await union(
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).where(eq(cities.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
		);

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 1, name: 'Paris' },
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			union(
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).where(eq(cities.id, 1)),
				db
					.select({ id: users2.id, name: users2.name })
					.from(users2).where(eq(users2.id, 1)),
				db
					.select({ name: users2.name, id: users2.id })
					.from(users2).where(eq(users2.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('set operations (union all) from query builder', async ({ db, push }) => {
		const cities = createCitiesTable('cities_40');
		await push({ cities });

		await db.insert(cities).values([
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		const result = await db
			.select({ id: cities.id, name: cities.name })
			.from(cities).limit(2).unionAll(
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).limit(2),
			).orderBy(asc(sql`id`)).limit(3);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).limit(2).unionAll(
					db
						.select({ name: cities.name, id: cities.id })
						.from(cities).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (union all) as function', async ({ db, push }) => {
		const cities = createCitiesTable('cities_41');
		const users2 = createUsers2Table('users2_41', cities);
		await push({ cities, users2 });

		await db.insert(cities).values([
			{ id: 1, name: 'Paris' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await db.insert(users2).values([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 2 },
			{ id: 3, name: 'Jack', cityId: 3 },
			{ id: 4, name: 'Peter', cityId: 3 },
			{ id: 5, name: 'Ben', cityId: 2 },
			{ id: 6, name: 'Jill', cityId: 1 },
			{ id: 7, name: 'Mary', cityId: 2 },
			{ id: 8, name: 'Sally', cityId: 1 },
		]);

		const result = await unionAll(
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).where(eq(cities.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
		).limit(1);

		expect(result).toStrictEqual([
			{ id: 1, name: 'Paris' },
		]);

		await expect((async () => {
			unionAll(
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).where(eq(cities.id, 1)),
				db
					.select({ name: users2.name, id: users2.id })
					.from(users2).where(eq(users2.id, 1)),
				db
					.select({ id: users2.id, name: users2.name })
					.from(users2).where(eq(users2.id, 1)),
			).limit(1);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (intersect) from query builder', async ({ db, push }) => {
		const cities = createCitiesTable('cities_42');
		await push({ cities });

		await db.insert(cities).values([
			{ id: 1, name: 'Paris' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		const result = await db
			.select({ id: cities.id, name: cities.name })
			.from(cities).intersect(
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).where(gt(cities.id, 1)),
			);

		expect(result).toStrictEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select({ name: cities.name, id: cities.id })
				.from(cities).intersect(
					db
						.select({ id: cities.id, name: cities.name })
						.from(cities).where(gt(cities.id, 1)),
				);
		})()).rejects.toThrowError();
	});
}
