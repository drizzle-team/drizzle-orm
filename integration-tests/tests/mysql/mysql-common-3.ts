/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import {
	and,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	eq,
	exists,
	gt,
	gte,
	inArray,
	like,
	lt,
	max,
	min,
	not,
	notInArray,
	sql,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	date,
	datetime,
	decimal,
	except,
	exceptAll,
	getTableConfig,
	getViewConfig,
	index,
	int,
	intersect,
	intersectAll,
	json,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	primaryKey,
	serial,
	text,
	time,
	timestamp,
	union,
	unionAll,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { expect, expectTypeOf } from 'vitest';
import { Expect, toLocalDate } from '~/utils.ts';
import type { Equal } from '~/utils.ts';
import { type Test } from './instrumentation';
import {
	aggregateTable,
	allTypesTable,
	cities3,
	citiesMySchemaTable,
	citiesTable,
	createUserTable,
	mySchema,
	orders,
	users2MySchemaTable,
	users2Table,
	users3,
	usersMySchemaTable,
	usersTable,
} from './schema2';

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test('orderBy with aliased column', ({ db }) => {
		const query = db.select({
			test: sql`something`.as('test'),
		}).from(users2Table).orderBy((fields) => fields.test).toSQL();

		expect(query.sql).toBe('select something as `test` from `users2` order by `test`');
	});

	test('timestamp timezone', async ({ db }) => {
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

	test('transaction', async ({ db, push }) => {
		const users = mysqlTable('users_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions', {
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

		await db.execute(sql`drop table ${users}`);
		await db.execute(sql`drop table ${products}`);
	});

	test.concurrent('transaction with options (set isolationLevel)', async ({ db, push }) => {
		const users = mysqlTable('users_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions', {
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

	test('transaction rollback', async ({ db }) => {
		const users = mysqlTable('users_transactions_rollback', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table users_transactions_rollback (id serial not null primary key, balance int not null)`,
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

	test('nested transaction', async ({ db }) => {
		const users = mysqlTable('users_nested_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table users_nested_transactions (id serial not null primary key, balance int not null)`,
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

	test('nested transaction rollback', async ({ db }) => {
		const users = mysqlTable('users_nested_transactions_rollback', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table users_nested_transactions_rollback (id serial not null primary key, balance int not null)`,
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

	test('join subquery with join', async ({ db }) => {
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

		await db.execute(sql`create table internal_staff (user_id integer not null)`);
		await db.execute(sql`create table custom_user (id integer not null)`);
		await db.execute(sql`create table ticket (staff_id integer not null)`);

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

	test('subquery with view', async ({ db }) => {
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

	test('join view as subquery', async ({ db }) => {
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

	test('select iterator', async ({ db }) => {
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

	test('select iterator w/ prepared statement', async ({ db }) => {
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

	test('insert undefined', async ({ db }) => {
		const users = mysqlTable('users_27', {
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

	test('update undefined', async ({ db }) => {
		const users = mysqlTable('users_28', {
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

	test('utc config for datetime', async ({ db }) => {
		await db.execute(sql`drop table if exists \`datestable\``);
		await db.execute(
			sql`
					create table \`datestable\` (
						\`datetime_utc\` datetime(3),
						\`datetime\` datetime(3),
						\`datetime_as_string\` datetime
					)
				`,
		);
		const datesTable = mysqlTable('datestable', {
			datetimeUTC: datetime('datetime_utc', { fsp: 3, mode: 'date' }),
			datetime: datetime('datetime', { fsp: 3 }),
			datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
		});

		const dateObj = new Date('2022-11-11');
		const dateUtc = new Date('2022-11-11T12:12:12.122Z');

		await db.insert(datesTable).values({
			datetimeUTC: dateUtc,
			datetime: dateObj,
			datetimeAsString: '2022-11-11 12:12:12',
		});

		const res = await db.select().from(datesTable);

		const [rawSelect] = await db.execute(sql`select \`datetime_utc\` from \`datestable\``);
		const selectedRow = (rawSelect as unknown as [{ datetime_utc: string }])[0];

		expect(selectedRow.datetime_utc).toBe('2022-11-11 12:12:12.122');
		expect(new Date(selectedRow.datetime_utc.replace(' ', 'T') + 'Z')).toEqual(dateUtc);

		expect(res[0]?.datetime).toBeInstanceOf(Date);
		expect(res[0]?.datetimeUTC).toBeInstanceOf(Date);
		expect(typeof res[0]?.datetimeAsString).toBe('string');

		expect(res).toEqual([{
			datetimeUTC: dateUtc,
			datetime: new Date('2022-11-11'),
			datetimeAsString: '2022-11-11 12:12:12',
		}]);

		await db.execute(sql`drop table if exists \`datestable\``);
	});

	test.concurrent('set operations (union) from query builder with subquery', async ({ db, client }) => {
		const sq = db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).as('sq');

		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).union(
				db.select().from(sq),
			).limit(8);

		expect(result).toStrictEqual([
			{ id: 1, name: 'Paris' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		// union should throw if selected fields are not in the same order
		await expect((async () => {
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).union(
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table),
				);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (union) as function', async ({ db, client }) => {
		const result = await union(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 1, name: 'Paris' },
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			union(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (union all) from query builder', async ({ db, client }) => {
		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).limit(2).unionAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).limit(2),
			).orderBy(asc(sql`id`)).limit(3);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).limit(2).unionAll(
					db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (union all) as function', async ({ db, client }) => {
		const result = await unionAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(1);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id: 1, name: 'Paris' },
		]);

		await expect((async () => {
			unionAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(1);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (intersect) from query builder', async ({ db, client }) => {
		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			);

		expect(result).toStrictEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select({ name: citiesTable.name, id: citiesTable.id })
				.from(citiesTable).intersect(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				);
		})()).rejects.toThrowError();
	});
}
