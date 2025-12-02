/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { eq, gt, inArray, lt, sql } from 'drizzle-orm';
import {
	boolean,
	decimal,
	getViewConfig,
	int,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
} from 'drizzle-orm/mysql-core';
import { expect } from 'vitest';
import { Expect } from '~/utils';
import type { Equal } from '~/utils';
import type { Test } from './instrumentation';
import { createOrdersTable } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('left join (flat object fields)', async ({ db, push, seed }) => {
		const users = mysqlTable('users_19', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id'),
		});
		const cities = mysqlTable('cities_19', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users, cities });
		await seed(
			{ users, cities },
			(funcs) => ({
				users: { count: 2, columns: { cityId: funcs.valuesFromArray({ values: [1, null as any] }) } },
				cities: { count: 1 },
			}),
		);

		const res = await db.select({
			userId: users.id,
			userName: users.name,
			cityId: cities.id,
			cityName: cities.name,
		}).from(users)
			.leftJoin(cities, eq(users.cityId, cities.id));

		expect(res).toEqual([
			{ userId: 1, userName: 'Agripina', cityId: 1, cityName: 'Lakeitha' },
			{ userId: 2, userName: 'Candy', cityId: null, cityName: null },
		]);
	});

	test.concurrent('left join (grouped fields)', async ({ db, push, seed }) => {
		const users = mysqlTable('users_24', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id'),
		});
		const cities = mysqlTable('cities_4', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users, cities });
		await seed(
			{ users, cities },
			(funcs) => ({
				users: { count: 2, columns: { cityId: funcs.valuesFromArray({ values: [1, null as any] }) } },
				cities: { count: 1 },
			}),
		);

		const res = await db.select({
			id: users.id,
			user: {
				name: users.name,
				nameUpper: sql<string>`upper(${users.name})`,
			},
			city: {
				id: cities.id,
				name: cities.name,
				nameUpper: sql<string>`upper(${cities.name})`,
			},
		}).from(users)
			.leftJoin(cities, eq(users.cityId, cities.id));

		expect(res).toEqual([
			{
				id: 1,
				user: { name: 'Agripina', nameUpper: 'AGRIPINA' },
				city: { id: 1, name: 'Lakeitha', nameUpper: 'LAKEITHA' },
			},
			{
				id: 2,
				user: { name: 'Candy', nameUpper: 'CANDY' },
				city: null,
			},
		]);
	});

	test.concurrent('left join (all fields)', async ({ db, push, seed }) => {
		const users = mysqlTable('users_25', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id'),
		});
		const cities = mysqlTable('cities_25', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users, cities });
		await seed(
			{ users, cities },
			(funcs) => ({
				users: { count: 2, columns: { cityId: funcs.valuesFromArray({ values: [1, null as any] }) } },
				cities: { count: 1 },
			}),
		);

		const res = await db.select().from(users)
			.leftJoin(cities, eq(users.cityId, cities.id));

		expect(res).toEqual([
			{
				users_25: {
					id: 1,
					name: 'Agripina',
					cityId: 1,
				},
				cities_25: {
					id: 1,
					name: 'Lakeitha',
				},
			},
			{
				users_25: {
					id: 2,
					name: 'Candy',
					cityId: null,
				},
				cities_25: null,
			},
		]);
	});

	test.concurrent('join subquery', async ({ db, push }) => {
		const courseCategories = mysqlTable('course_categories_1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const courses = mysqlTable('courses_1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			categoryId: int('category_id'),
		});

		await push({ courseCategories, courses });

		await db.insert(courseCategories).values([
			{ name: 'Category 1' },
			{ name: 'Category 2' },
			{ name: 'Category 3' },
			{ name: 'Category 4' },
		]);

		await db.insert(courses).values([
			{ name: 'Development', categoryId: 2 },
			{ name: 'IT & Software', categoryId: 3 },
			{ name: 'Marketing', categoryId: 4 },
			{ name: 'Design', categoryId: 1 },
		]);

		const sq2 = db
			.select({
				categoryId: courseCategories.id,
				category: courseCategories.name,
				total: sql<number>`count(${courseCategories.id})`,
			})
			.from(courseCategories)
			.groupBy(courseCategories.id, courseCategories.name)
			.as('sq2');

		const res = await db
			.select({
				courseName: courses.name,
				categoryId: sq2.categoryId,
			})
			.from(courses)
			.leftJoin(sq2, eq(courses.categoryId, sq2.categoryId))
			.orderBy(courses.name);

		expect(res).toEqual([
			{ courseName: 'Design', categoryId: 1 },
			{ courseName: 'Development', categoryId: 2 },
			{ courseName: 'IT & Software', categoryId: 3 },
			{ courseName: 'Marketing', categoryId: 4 },
		]);
	});

	test.concurrent('with ... select', async ({ db, push }) => {
		const orders = createOrdersTable('orders_1');

		await push({ orders });

		await db.insert(orders).values([
			{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
			{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
			{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
			{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
			{ region: 'US', product: 'A', amount: 30, quantity: 3 },
			{ region: 'US', product: 'A', amount: 40, quantity: 4 },
			{ region: 'US', product: 'B', amount: 40, quantity: 4 },
			{ region: 'US', product: 'B', amount: 50, quantity: 5 },
		]);

		const regionalSales = db
			.$with('regional_sales')
			.as(
				db
					.select({
						region: orders.region,
						totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
					})
					.from(orders)
					.groupBy(orders.region),
			);

		const topRegions = db
			.$with('top_regions')
			.as(
				db
					.select({
						region: regionalSales.region,
					})
					.from(regionalSales)
					.where(
						gt(
							regionalSales.totalSales,
							db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
						),
					),
			);

		const result = await db
			.with(regionalSales, topRegions)
			.select({
				region: orders.region,
				product: orders.product,
				productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
				productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
			})
			.from(orders)
			.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
			.groupBy(orders.region, orders.product)
			.orderBy(orders.region, orders.product);

		expect(result).toEqual([
			{
				region: 'Europe',
				product: 'A',
				productUnits: 3,
				productSales: 30,
			},
			{
				region: 'Europe',
				product: 'B',
				productUnits: 5,
				productSales: 50,
			},
			{
				region: 'US',
				product: 'A',
				productUnits: 7,
				productSales: 70,
			},
			{
				region: 'US',
				product: 'B',
				productUnits: 9,
				productSales: 90,
			},
		]);
	});

	test.concurrent('with ... update', async ({ db, push }) => {
		const products = mysqlTable('products', {
			id: serial('id').primaryKey(),
			price: decimal('price', {
				precision: 15,
				scale: 2,
			}).notNull(),
			cheap: boolean('cheap').notNull().default(false),
		});

		await push({ products });

		await db.insert(products).values([
			{ price: '10.99' },
			{ price: '25.85' },
			{ price: '32.99' },
			{ price: '2.50' },
			{ price: '4.59' },
		]);

		const averagePrice = db
			.$with('average_price')
			.as(
				db
					.select({
						value: sql`avg(${products.price})`.as('value'),
					})
					.from(products),
			);

		await db
			.with(averagePrice)
			.update(products)
			.set({
				cheap: true,
			})
			.where(lt(products.price, sql`(select * from ${averagePrice})`));

		const result = await db
			.select({
				id: products.id,
			})
			.from(products)
			.where(eq(products.cheap, true));

		expect(result).toEqual([
			{ id: 1 },
			{ id: 4 },
			{ id: 5 },
		]);
	});

	test.concurrent('with ... delete', async ({ db, push }) => {
		const orders = createOrdersTable('orders_2');

		await push({ orders });

		await db.insert(orders).values([
			{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
			{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
			{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
			{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
			{ region: 'US', product: 'A', amount: 30, quantity: 3 },
			{ region: 'US', product: 'A', amount: 40, quantity: 4 },
			{ region: 'US', product: 'B', amount: 40, quantity: 4 },
			{ region: 'US', product: 'B', amount: 50, quantity: 5 },
		]);

		const averageAmount = db
			.$with('average_amount')
			.as(
				db
					.select({
						value: sql`avg(${orders.amount})`.as('value'),
					})
					.from(orders),
			);

		await db
			.with(averageAmount)
			.delete(orders)
			.where(gt(orders.amount, sql`(select * from ${averageAmount})`));

		const result = await db
			.select({
				id: orders.id,
			})
			.from(orders);

		expect(result).toEqual([
			{ id: 1 },
			{ id: 2 },
			{ id: 3 },
			{ id: 4 },
			{ id: 5 },
		]);
	});

	test.concurrent('select from subquery sql', async ({ db, push, seed }) => {
		const users = mysqlTable('users_30', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });
		await seed({ users }, () => ({ users: { count: 2 } }));

		const sq = db
			.select({ name: sql<string>`concat(${users.name}, " modified")`.as('name') })
			.from(users)
			.as('sq');

		const res = await db.select({ name: sq.name }).from(sq);

		expect(res).toEqual([{ name: 'Agripina modified' }, { name: 'Candy modified' }]);
	});

	test.concurrent('select a field without joining its table', ({ db, push }) => {
		const users1 = mysqlTable('users_31', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const users2 = mysqlTable('users_32', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		push({ users1, users2 });

		expect(() => db.select({ name: users2.name }).from(users1).prepare()).toThrowError();
	});

	test.concurrent('select all fields from subquery without alias', async ({ db, push, seed }) => {
		const users = mysqlTable('users_33', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });
		await seed({ users }, () => ({ users: { count: 2 } }));

		const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users.name})` }).from(users));

		expect(() => db.select().from(sq).prepare()).toThrowError();
	});

	test.concurrent('select count()', async ({ db, push, seed }) => {
		const users = mysqlTable('users_34', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });
		await seed({ users }, () => ({ users: { count: 2 } }));

		const res = await db.select({ count: sql`count(*)` }).from(users);

		expect(res).toEqual([{ count: 2 }]);
	});

	test.concurrent('select for ...', ({ db, push }) => {
		const users = mysqlTable('users_35', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		push({ users });

		{
			const query = db.select().from(users).for('update').toSQL();
			expect(query.sql).toMatch(/ for update$/);
		}
		{
			const query = db.select().from(users).for('share', { skipLocked: true }).toSQL();
			expect(query.sql).toMatch(/ for share skip locked$/);
		}
		{
			const query = db.select().from(users).for('update', { noWait: true }).toSQL();
			expect(query.sql).toMatch(/ for update nowait$/);
		}
	});

	test.concurrent('having', async ({ db, push, seed }) => {
		const cities = mysqlTable('cities_37', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const users = mysqlTable('users_37', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id'),
		});

		await push({ cities, users });
		await seed({ cities, users }, (funcs: any) => ({
			cities: { count: 3 },
			users: { count: 3, columns: { cityId: funcs.valuesFromArray({ values: [1, 1, 2] }) } },
		}));

		const result = await db
			.select({
				id: cities.id,
				name: sql<string>`upper(${cities.name})`.as('upper_name'),
				usersCount: sql<number>`count(${users.id})`.as('users_count'),
			})
			.from(cities)
			.leftJoin(users, eq(users.cityId, cities.id))
			.where(({ name }) => sql`length(${name}) >= 3`)
			.groupBy(cities.id)
			.having(({ usersCount }) => sql`${usersCount} > 0`)
			.orderBy(({ name }) => name);

		expect(result).toEqual([
			{
				id: 2,
				name: 'HOVANES',
				usersCount: 1,
			},
			{
				id: 1,
				name: 'LAKEITHA',
				usersCount: 2,
			},
		]);
	});

	test.concurrent('view', async ({ db, push, seed }) => {
		const users = mysqlTable('users_39', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		});

		const newYorkers1 = mysqlView('new_yorkers_1')
			.as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

		const newYorkers2 = mysqlView('new_yorkers_2', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

		const newYorkers3 = mysqlView('new_yorkers_3', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).existing();

		await push({ users, newYorkers1, newYorkers2, newYorkers3 });
		await db.execute(sql`create view new_yorkers_3 as ${getViewConfig(newYorkers1).query}`);
		await seed({ users }, (funcs: any) => ({
			users: { count: 3, columns: { cityId: funcs.valuesFromArray({ values: [1, 1, 2] }) } },
		}));

		{
			const result = await db.select().from(newYorkers1);
			expect(result).toEqual([
				{ id: 2, name: 'Candy', cityId: 1 },
				{ id: 3, name: 'Ilse', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers2);
			expect(result).toEqual([
				{ id: 2, name: 'Candy', cityId: 1 },
				{ id: 3, name: 'Ilse', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers3);
			expect(result).toEqual([
				{ id: 2, name: 'Candy', cityId: 1 },
				{ id: 3, name: 'Ilse', cityId: 1 },
			]);
		}

		{
			const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
			expect(result).toEqual([
				{ name: 'Candy' },
				{ name: 'Ilse' },
			]);
		}
	});

	test.concurrent('select from raw sql', async ({ db }) => {
		const result = await db.select({
			id: sql<number>`id`,
			name: sql<string>`name`,
		}).from(sql`(select 1 as id, 'John' as name) as users`);

		Expect<Equal<{ id: number; name: string }[], typeof result>>;

		expect(result).toEqual([
			{ id: 1, name: 'John' },
		]);
	});

	test.concurrent('select from raw sql with joins', async ({ db }) => {
		const result = await db
			.select({
				id: sql<number>`users.id`,
				name: sql<string>`users.name`,
				userCity: sql<string>`users.city`,
				cityName: sql<string>`cities.name`,
			})
			.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
			.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

		Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

		expect(result).toEqual([
			{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
		]);
	});

	test.concurrent('join on aliased sql from select', async ({ db }) => {
		const result = await db
			.select({
				userId: sql<number>`users.id`.as('userId'),
				name: sql<string>`users.name`,
				userCity: sql<string>`users.city`,
				cityId: sql<number>`cities.id`.as('cityId'),
				cityName: sql<string>`cities.name`,
			})
			.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
			.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

		Expect<
			Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
		>;

		expect(result).toEqual([
			{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
		]);
	});

	test.concurrent('join on aliased sql from with clause', async ({ db }) => {
		const users = db.$with('users').as(
			db.select({
				id: sql<number>`id`.as('userId'),
				name: sql<string>`name`.as('userName'),
				city: sql<string>`city`.as('city'),
			}).from(
				sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
			),
		);

		const cities = db.$with('cities').as(
			db.select({
				id: sql<number>`id`.as('cityId'),
				name: sql<string>`name`.as('cityName'),
			}).from(
				sql`(select 1 as id, 'Paris' as name) as cities`,
			),
		);

		const result = await db
			.with(users, cities)
			.select({
				userId: users.id,
				name: users.name,
				userCity: users.city,
				cityId: cities.id,
				cityName: cities.name,
			})
			.from(users)
			.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId));

		Expect<
			Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
		>;

		expect(result).toEqual([
			{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
		]);
	});

	test.concurrent('prefixed table', async ({ db, push }) => {
		const mysqlTable = mysqlTableCreator((name) => `myprefix_${name}`);

		const users = mysqlTable('test_prefixed_table_with_unique_name', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });

		await db.insert(users).values({ id: 1, name: 'John' });

		const result = await db.select().from(users);

		expect(result).toEqual([{ id: 1, name: 'John' }]);
	});
}
