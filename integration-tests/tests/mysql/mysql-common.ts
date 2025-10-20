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
	timestamp,
	union,
	unionAll,
	varchar,
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
	courseCategoriesTable,
	coursesTable,
	datesTable,
	ivanhans,
	mySchema,
	oneUser,
	orders,
	threeUsers,
	users2MySchemaTable,
	users2Table,
	users3,
	usersDistinct,
	usersMySchemaTable,
	usersTable,
} from './schema2';

async function setupReturningFunctionsTest(batch: (s: string[]) => Promise<void>) {
	await batch([`drop table if exists \`users_default_fn\``]);
	await batch([`create table \`users_default_fn\` (
					\`id\` varchar(256) primary key,
					\`name\` text not null
				);`]);
}

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.only('select all fields', async ({ db, pushseed }) => {
		const users = mysqlTable('users_1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
		});
		await pushseed({ users });
		const result = await db.select().from(users);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test.concurrent('select sql', async ({ db }) => {
		const users = await db.select({
			name: sql`upper(${oneUser.name})`,
		}).from(oneUser);

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test.concurrent('select typed sql', async ({ db }) => {
		const users = await db.select({
			name: sql<string>`upper(${oneUser.name})`,
		}).from(oneUser);

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test.concurrent('select with empty array in inArray', async ({ db }) => {
		const result = await db
			.select({
				name: sql`upper(${threeUsers.name})`,
			})
			.from(threeUsers)
			.where(inArray(threeUsers.id, []));

		expect(result).toEqual([]);
	});

	test.concurrent('select with empty array in notInArray', async ({ db }) => {
		const result = await db
			.select({
				name: sql`upper(${threeUsers.name})`,
			})
			.from(threeUsers)
			.where(notInArray(threeUsers.id, []));

		expect(result).toEqual([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
	});

	test.concurrent('select distinct', async ({ db }) => {
		const users = await db.selectDistinct().from(usersDistinct).orderBy(
			usersDistinct.id,
			usersDistinct.name,
		);
		expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
	});

	test.concurrent('select with group by as field', async ({ db }) => {
		const result = await db.select({ name: threeUsers.name }).from(threeUsers)
			.groupBy(threeUsers.name);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
	});

	test.concurrent('select with exists', async ({ db }) => {
		const user = alias(threeUsers, 'user');
		const result = await db.select({ name: threeUsers.name }).from(threeUsers).where(
			exists(
				db.select({ one: sql`1` }).from(user).where(and(eq(threeUsers.name, 'John'), eq(user.id, threeUsers.id))),
			),
		);

		expect(result).toEqual([{ name: 'John' }]);
	});

	test.concurrent('select with group by as sql', async ({ db }) => {
		const result = await db.select({ name: threeUsers.name }).from(threeUsers)
			.groupBy(sql`${threeUsers.name}`);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
	});

	test.concurrent('select with group by as sql + column', async ({ db }) => {
		const result = await db.select({ name: threeUsers.name }).from(threeUsers)
			.groupBy(sql`${threeUsers.name}`, threeUsers.id);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test.concurrent('select with group by as column + sql', async ({ db }) => {
		const result = await db.select({ name: threeUsers.name }).from(threeUsers)
			.groupBy(threeUsers.id, sql`${threeUsers.name}`);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test.concurrent('select with group by complex query', async ({ db }) => {
		const result = await db.select({ name: threeUsers.name }).from(threeUsers)
			.groupBy(threeUsers.id, sql`${threeUsers.name}`)
			.orderBy(asc(threeUsers.name))
			.limit(1);

		expect(result).toEqual([{ name: 'Jane' }]);
	});

	test.concurrent('build query', async ({ db }) => {
		const query = db.select({ id: threeUsers.id, name: threeUsers.name }).from(threeUsers)
			.groupBy(threeUsers.id, threeUsers.name)
			.toSQL();

		expect(query).toEqual({
			sql: `select \`id\`, \`name\` from \`userstest\` group by \`userstest\`.\`id\`, \`userstest\`.\`name\``,
			params: [],
		});
	});

	test.concurrent('Query check: Insert all defaults in 1 row', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		const query = db
			.insert(users)
			.values({})
			.toSQL();

		expect(query).toEqual({
			sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default)',
			params: [],
		});
	});

	test.concurrent('Query check: Insert all defaults in multiple rows', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').default('Dan'),
			state: text('state').default('UA'),
		});

		const query = db
			.insert(users)
			.values([{}, {}])
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into `users` (`id`, `name`, `state`) values (default, default, default), (default, default, default)',
			params: [],
		});
	});

	test.concurrent('build query insert with onDuplicate', async ({ db }) => {
		const query = db.insert(usersTable)
			.values({ name: 'John', jsonb: ['foo', 'bar'] })
			.onDuplicateKeyUpdate({ set: { name: 'John1' } })
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into `userstest` (`id`, `name`, `verified`, `jsonb`, `created_at`) values (default, ?, default, ?, default) on duplicate key update `name` = ?',
			params: ['John', '["foo","bar"]', 'John1'],
		});
	});

	test.concurrent('partial join with alias', async ({ db }) => {
		const customerAlias = alias(ivanhans, 'customer');

		const result = await db
			.select({
				user: {
					id: ivanhans.id,
					name: ivanhans.name,
				},
				customer: {
					id: customerAlias.id,
					name: customerAlias.name,
				},
			}).from(ivanhans)
			.leftJoin(customerAlias, eq(customerAlias.id, 11))
			.where(eq(ivanhans.id, 10));

		expect(result).toEqual([{
			user: { id: 10, name: 'Ivan' },
			customer: { id: 11, name: 'Hans' },
		}]);
	});

	test.concurrent('prepared statement', async ({ db }) => {
		const statement = db.select({
			id: oneUser.id,
			name: oneUser.name,
		}).from(oneUser)
			.prepare();
		const result = await statement.execute();

		expect(result).toEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('prepared statement with placeholder in .where', async ({ db }) => {
		const stmt = db.select({
			id: oneUser.id,
			name: oneUser.name,
		}).from(oneUser)
			.where(eq(oneUser.id, sql.placeholder('id')))
			.prepare();
		const result = await stmt.execute({ id: 1 });

		expect(result).toEqual([{ id: 1, name: 'John' }]);
	});

	test.concurrent('prepared statement with placeholder in .limit', async ({ db }) => {
		const stmt = db
			.select({
				id: oneUser.id,
				name: oneUser.name,
			})
			.from(oneUser)
			.where(eq(oneUser.id, sql.placeholder('id')))
			.limit(sql.placeholder('limit'))
			.prepare();

		const result = await stmt.execute({ id: 1, limit: 1 });

		expect(result).toEqual([{ id: 1, name: 'John' }]);
		expect(result).toHaveLength(1);
	});

	test.concurrent('prepared statement with placeholder in .offset', async ({ db }) => {
		const stmt = db
			.select({
				id: threeUsers.id,
				name: threeUsers.name,
			})
			.from(threeUsers)
			.limit(sql.placeholder('limit'))
			.offset(sql.placeholder('offset'))
			.prepare();

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toEqual([{ id: 2, name: 'Jane' }]);
	});

	test.concurrent('prepared statement built using $dynamic', async ({ db }) => {
		function withLimitOffset(qb: any) {
			return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
		}

		const stmt = db
			.select({
				id: threeUsers.id,
				name: threeUsers.name,
			})
			.from(threeUsers)
			.$dynamic();
		withLimitOffset(stmt).prepare('stmt_limit');

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toEqual([{ id: 2, name: 'Jane' }]);
		expect(result).toHaveLength(1);
	});

	test.concurrent('insert + select all possible dates', async ({ db }) => {
		await db.execute(sql`drop table if exists \`datestable\``);
		await db.execute(
			sql`
				create table \`datestable\` (
				    \`date\` date,
				    \`date_as_string\` date,
				    \`time\` time,
				    \`datetime\` datetime,
				    \`datetime_as_string\` datetime,
				    \`timestamp\` timestamp(3),
				    \`timestamp_as_string\` timestamp(3),
				    \`year\` year
				)
			`,
		);

		const date = new Date('2022-11-11');
		const dateWithMilliseconds = new Date('2022-11-11 12:12:12.123');

		await db.insert(datesTable).values({
			date: date,
			dateAsString: '2022-11-11',
			time: '12:12:12',
			datetime: date,
			year: 22,
			datetimeAsString: '2022-11-11 12:12:12',
			timestamp: dateWithMilliseconds,
			timestampAsString: '2022-11-11 12:12:12.123',
		});

		const res = await db.select().from(datesTable);

		expect(res[0]?.date).toBeInstanceOf(Date);
		expect(res[0]?.datetime).toBeInstanceOf(Date);
		expect(typeof res[0]?.dateAsString).toBe('string');
		expect(typeof res[0]?.datetimeAsString).toBe('string');

		expect(res).toEqual([{
			date: toLocalDate(new Date('2022-11-11')),
			dateAsString: '2022-11-11',
			time: '12:12:12',
			datetime: new Date('2022-11-11'),
			year: 2022,
			datetimeAsString: '2022-11-11 12:12:12',
			timestamp: new Date('2022-11-11 12:12:12.123'),
			timestampAsString: '2022-11-11 12:12:12.123',
		}]);

		await db.execute(sql`drop table if exists \`datestable\``);
	});

	test.concurrent('Mysql enum as ts enum', async ({ db }) => {
		const tableWithEnums = mysqlTable('enums_test_case', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
			enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
			enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
		});

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

	test.concurrent('Mysql enum test case #1', async ({ db }) => {
		const tableWithEnums = mysqlTable('enums_test_case2', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
			enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
			enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
		});

		await db.execute(sql`drop table if exists \`enums_test_case2\``);

		await db.execute(sql`
			create table \`enums_test_case2\` (
			    \`id\` serial primary key,
			    \`enum1\` ENUM('a', 'b', 'c') not null,
			    \`enum2\` ENUM('a', 'b', 'c') default 'a',
			    \`enum3\` ENUM('a', 'b', 'c') not null default 'b'
			)
		`);

		await db.insert(tableWithEnums).values([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a' },
		]);

		const res = await db.select().from(tableWithEnums);

		await db.execute(sql`drop table \`enums_test_case2\``);

		expect(res).toEqual([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
		]);
	});

	test('left join (flat object fields)', async ({ db }) => {
		const res = await db.select({
			userId: users2Table.id,
			userName: users2Table.name,
			cityId: citiesTable.id,
			cityName: citiesTable.name,
		}).from(users2Table)
			.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

		expect(res).toEqual([
			{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
			{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
		]);
	});

	test('left join (grouped fields)', async ({ db }) => {
		const res = await db.select({
			id: users2Table.id,
			user: {
				name: users2Table.name,
				nameUpper: sql<string>`upper(${users2Table.name})`,
			},
			city: {
				id: citiesTable.id,
				name: citiesTable.name,
				nameUpper: sql<string>`upper(${citiesTable.name})`,
			},
		}).from(users2Table)
			.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

		expect(res).toEqual([
			{
				id: 1,
				user: { name: 'John', nameUpper: 'JOHN' },
				city: { id: 1, name: 'Paris', nameUpper: 'PARIS' },
			},
			{
				id: 2,
				user: { name: 'Jane', nameUpper: 'JANE' },
				city: null,
			},
		]);
	});

	test('left join (all fields)', async ({ db }) => {
		const res = await db.select().from(users2Table)
			.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

		expect(res).toEqual([
			{
				users2: {
					id: 1,
					name: 'John',
					cityId: 1,
				},
				cities: {
					id: 1,
					name: 'Paris',
				},
			},
			{
				users2: {
					id: 2,
					name: 'Jane',
					cityId: null,
				},
				cities: null,
			},
		]);
	});

	test('join subquery', async ({ db }) => {
		await db.execute(sql`drop table if exists \`courses\``);
		await db.execute(sql`drop table if exists \`course_categories\``);

		await db.execute(
			sql`
				create table \`course_categories\` (
				    \`id\` serial primary key,
				    \`name\` text not null
				)
			`,
		);

		await db.execute(
			sql`
				create table \`courses\` (
				    \`id\` serial primary key,
				    \`name\` text not null,
				    \`category_id\` int references \`course_categories\`(\`id\`)
				)
			`,
		);

		await db.insert(courseCategoriesTable).values([
			{ name: 'Category 1' },
			{ name: 'Category 2' },
			{ name: 'Category 3' },
			{ name: 'Category 4' },
		]);

		await db.insert(coursesTable).values([
			{ name: 'Development', categoryId: 2 },
			{ name: 'IT & Software', categoryId: 3 },
			{ name: 'Marketing', categoryId: 4 },
			{ name: 'Design', categoryId: 1 },
		]);

		const sq2 = db
			.select({
				categoryId: courseCategoriesTable.id,
				category: courseCategoriesTable.name,
				total: sql<number>`count(${courseCategoriesTable.id})`,
			})
			.from(courseCategoriesTable)
			.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
			.as('sq2');

		const res = await db
			.select({
				courseName: coursesTable.name,
				categoryId: sq2.categoryId,
			})
			.from(coursesTable)
			.leftJoin(sq2, eq(coursesTable.categoryId, sq2.categoryId))
			.orderBy(coursesTable.name);

		expect(res).toEqual([
			{ courseName: 'Design', categoryId: 1 },
			{ courseName: 'Development', categoryId: 2 },
			{ courseName: 'IT & Software', categoryId: 3 },
			{ courseName: 'Marketing', categoryId: 4 },
		]);

		await db.execute(sql`drop table if exists \`courses\``);
		await db.execute(sql`drop table if exists \`course_categories\``);
	});

	test('with ... select', async ({ db }) => {
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

	test('with ... update', async ({ db }) => {
		const products = mysqlTable('products', {
			id: serial('id').primaryKey(),
			price: decimal('price', {
				precision: 15,
				scale: 2,
			}).notNull(),
			cheap: boolean('cheap').notNull().default(false),
		});

		await db.execute(sql`drop table if exists ${products}`);
		await db.execute(sql`
			create table ${products} (
			    id serial primary key,
			    price decimal(15, 2) not null,
			    cheap boolean not null default false
			)
		`);

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

	test('with ... delete', async ({ db }) => {
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

	test('select from subquery sql', async ({ db }) => {
		const sq = db
			.select({ name: sql<string>`concat(${users2Table.name}, " modified")`.as('name') })
			.from(users2Table)
			.as('sq');

		const res = await db.select({ name: sq.name }).from(sq);

		expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
	});

	test('select a field without joining its table', ({ db }) => {
		expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).toThrowError();
	});

	test('select all fields from subquery without alias', ({ db }) => {
		const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

		expect(() => db.select().from(sq).prepare()).toThrowError();
	});

	test('select count()', async ({ db }) => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

		const res = await db.select({ count: sql`count(*)` }).from(usersTable);

		expect(res).toEqual([{ count: 2 }]);
	});

	test('select for ...', ({ db }) => {
		{
			const query = db.select().from(users2Table).for('update').toSQL();
			expect(query.sql).toMatch(/ for update$/);
		}
		{
			const query = db.select().from(users2Table).for('share', { skipLocked: true }).toSQL();
			expect(query.sql).toMatch(/ for share skip locked$/);
		}
		{
			const query = db.select().from(users2Table).for('update', { noWait: true }).toSQL();
			expect(query.sql).toMatch(/ for update nowait$/);
		}
	});

	test('having', async ({ db }) => {
		const result = await db
			.select({
				id: citiesTable.id,
				name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
				usersCount: sql<number>`count(${users2Table.id})`.as('users_count'),
			})
			.from(citiesTable)
			.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
			.where(({ name }) => sql`length(${name}) >= 3`)
			.groupBy(citiesTable.id)
			.having(({ usersCount }) => sql`${usersCount} > 0`)
			.orderBy(({ name }) => name);

		expect(result).toEqual([
			{
				id: 1,
				name: 'LONDON',
				usersCount: 2,
			},
			{
				id: 2,
				name: 'PARIS',
				usersCount: 1,
			},
		]);
	});

	test('view', async ({ db }) => {
		const newYorkers1 = mysqlView('new_yorkers')
			.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

		const newYorkers2 = mysqlView('new_yorkers', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

		const newYorkers3 = mysqlView('new_yorkers', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).existing();

		await db.execute(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

		{
			const result = await db.select().from(newYorkers1);
			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers2);
			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers3);
			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
			expect(result).toEqual([
				{ name: 'John' },
				{ name: 'Jane' },
			]);
		}

		await db.execute(sql`drop view ${newYorkers1}`);
	});

	test('select from raw sql', async ({ db }) => {
		const result = await db.select({
			id: sql<number>`id`,
			name: sql<string>`name`,
		}).from(sql`(select 1 as id, 'John' as name) as users`);

		Expect<Equal<{ id: number; name: string }[], typeof result>>;

		expect(result).toEqual([
			{ id: 1, name: 'John' },
		]);
	});

	test('select from raw sql with joins', async ({ db }) => {
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

	test('join on aliased sql from select', async ({ db }) => {
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

	test('join on aliased sql from with clause', async ({ db }) => {
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

	test('prefixed table', async ({ db }) => {
		const mysqlTable = mysqlTableCreator((name) => `myprefix_${name}`);

		const users = mysqlTable('test_prefixed_table_with_unique_name', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table myprefix_test_prefixed_table_with_unique_name (id int not null primary key, name text not null)`,
		);

		await db.insert(users).values({ id: 1, name: 'John' });

		const result = await db.select().from(users);

		expect(result).toEqual([{ id: 1, name: 'John' }]);

		await db.execute(sql`drop table ${users}`);
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

	test('transaction', async ({ db }) => {
		const users = mysqlTable('users_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions', {
			id: serial('id').primaryKey(),
			price: int('price').notNull(),
			stock: int('stock').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${products}`);

		await db.execute(sql`create table users_transactions (id serial not null primary key, balance int not null)`);
		await db.execute(
			sql`create table products_transactions (id serial not null primary key, price int not null, stock int not null)`,
		);

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

	test('transaction with options (set isolationLevel)', async ({ db }) => {
		const users = mysqlTable('users_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions', {
			id: serial('id').primaryKey(),
			price: int('price').notNull(),
			stock: int('stock').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${products}`);

		await db.execute(sql`create table users_transactions (id serial not null primary key, balance int not null)`);
		await db.execute(
			sql`create table products_transactions (id serial not null primary key, price int not null, stock int not null)`,
		);

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

		await db.execute(sql`drop table ${users}`);
		await db.execute(sql`drop table ${products}`);
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
		const users = mysqlTable('users', {
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
		const users = mysqlTable('users', {
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

	test.concurrent('set operations (intersect) as function', async ({ db, client }) => {
		const result = await intersect(
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

		expect(result).toHaveLength(0);

		expect(result).toEqual([]);

		await expect((async () => {
			intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(1);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (intersect all) from query builder', async ({ db, client }) => {
		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).limit(2).intersectAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).limit(2),
			).orderBy(asc(sql`id`));

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).limit(2).intersectAll(
					db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (intersect all) as function', async ({ db, client }) => {
		const result = await intersectAll(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			intersectAll(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (except) from query builder', async ({ db, client }) => {
		const result = await db
			.select()
			.from(citiesTable).except(
				db
					.select()
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id: 1, name: 'Paris' },
		]);
	});

	test.concurrent('set operations (except) as function', async ({ db, client }) => {
		const result = await except(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable),
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(3);

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			except(
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable),
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(3);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (except all) from query builder', async ({ db, client }) => {
		const result = await db
			.select()
			.from(citiesTable).exceptAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
			).orderBy(asc(sql`id`));

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select()
				.from(citiesTable).exceptAll(
					db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (except all) as function', async ({ db, client }) => {
		const result = await exceptAll(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(gt(users2Table.id, 7)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(6).orderBy(asc(sql.identifier('id')));

		expect(result).toHaveLength(6);

		expect(result).toEqual([
			{ id: 2, name: 'Jane' },
			{ id: 3, name: 'Jack' },
			{ id: 4, name: 'Peter' },
			{ id: 5, name: 'Ben' },
			{ id: 6, name: 'Jill' },
			{ id: 7, name: 'Mary' },
		]);

		await expect((async () => {
			exceptAll(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(gt(users2Table.id, 7)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(6);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (mixed) from query builder', async ({ db, client }) => {
		const result = await db
			.select()
			.from(citiesTable).except(
				({ unionAll }) =>
					unionAll(
						db
							.select()
							.from(citiesTable).where(gt(citiesTable.id, 1)),
						db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
					).orderBy(asc(citiesTable.id)).limit(1).offset(1),
			);

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 1, name: 'New York' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select()
				.from(citiesTable).except(
					({ unionAll }) =>
						unionAll(
							db
								.select({ name: citiesTable.name, id: citiesTable.id })
								.from(citiesTable).where(gt(citiesTable.id, 1)),
							db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
						),
				);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (mixed all) as function with subquery', async ({ db, client }) => {
		const sq = except(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(gte(users2Table.id, 5)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 7)),
		).orderBy(asc(sql.identifier('id'))).as('sq');

		const result = await union(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db.select().from(sq).limit(1),
			db
				.select().from(citiesTable).where(gt(citiesTable.id, 1)),
		);

		expect(result).toHaveLength(4);

		expect(result).toEqual([
			{ id: 1, name: 'John' },
			{ id: 5, name: 'Ben' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			union(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				except(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(gte(users2Table.id, 5)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 7)),
				).limit(1),
				db
					.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test.concurrent('aggregate function: count', async ({ db, client }) => {
		const result1 = await db.select({ value: count() }).from(aggregateTable);
		const result2 = await db.select({ value: count(aggregateTable.a) }).from(aggregateTable);
		const result3 = await db.select({ value: countDistinct(aggregateTable.name) }).from(aggregateTable);

		expect(result1[0]?.value).toBe(7);
		expect(result2[0]?.value).toBe(5);
		expect(result3[0]?.value).toBe(6);
	});

	test.concurrent('aggregate function: avg', async ({ db, client }) => {
		const table = aggregateTable;
		const result1 = await db.select({ value: avg(table.b) }).from(table);
		const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
		const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

		expect(result1[0]?.value).toBe('33.3333');
		expect(result2[0]?.value).toBe(null);
		expect(result3[0]?.value).toBe('42.5000');
	});

	test.concurrent('aggregate function: sum', async ({ db, client }) => {
		const table = aggregateTable;

		const result1 = await db.select({ value: sum(table.b) }).from(table);
		const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
		const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

		expect(result1[0]?.value).toBe('200');
		expect(result2[0]?.value).toBe(null);
		expect(result3[0]?.value).toBe('170');
	});

	test.concurrent('aggregate function: max', async ({ db, client }) => {
		const table = aggregateTable;

		const result1 = await db.select({ value: max(table.b) }).from(table);
		const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

		expect(result1[0]?.value).toBe(90);
		expect(result2[0]?.value).toBe(null);
	});

	test.concurrent('aggregate function: min', async ({ db, client }) => {
		const table = aggregateTable;

		const result1 = await db.select({ value: min(table.b) }).from(table);
		const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

		expect(result1[0]?.value).toBe(10);
		expect(result2[0]?.value).toBe(null);
	});

	// mySchema tests
	test('mySchema :: select all fields', async ({ db }) => {
		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const result = await db.select().from(usersMySchemaTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test('mySchema :: select sql', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.select({
			name: sql`upper(${usersMySchemaTable.name})`,
		}).from(usersMySchemaTable);

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: select typed sql', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.select({
			name: sql<string>`upper(${usersMySchemaTable.name})`,
		}).from(usersMySchemaTable);

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: select distinct', async ({ db }) => {
		const usersDistinctTable = mysqlTable('users_distinct', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${usersDistinctTable}`);
		await db.execute(sql`create table ${usersDistinctTable} (id int, name text)`);

		await db.insert(usersDistinctTable).values([
			{ id: 1, name: 'John' },
			{ id: 1, name: 'John' },
			{ id: 2, name: 'John' },
			{ id: 1, name: 'Jane' },
		]);
		const users = await db.selectDistinct().from(usersDistinctTable).orderBy(
			usersDistinctTable.id,
			usersDistinctTable.name,
		);

		await db.execute(sql`drop table ${usersDistinctTable}`);

		expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
	});

	test('mySchema :: insert returning sql', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		const [result, _] = await db.insert(usersMySchemaTable).values({ name: 'John' });

		expect(result.insertId).toBe(1);
	});

	test('mySchema :: delete returning sql', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

		expect(users[0].affectedRows).toBe(1);
	});

	test('mySchema :: update with returning partial', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const updatedUsers = await db.update(usersMySchemaTable).set({ name: 'Jane' }).where(
			eq(usersMySchemaTable.name, 'John'),
		);

		const users = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
			usersMySchemaTable,
		)
			.where(
				eq(usersMySchemaTable.id, 1),
			);

		expect(updatedUsers[0].changedRows).toBe(1);

		expect(users).toEqual([{ id: 1, name: 'Jane' }]);
	});

	test('mySchema :: delete with returning all fields', async ({ db }) => {
		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const deletedUser = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

		expect(deletedUser[0].affectedRows).toBe(1);
	});

	test('mySchema :: insert + select', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const result = await db.select().from(usersMySchemaTable);
		expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

		await db.insert(usersMySchemaTable).values({ name: 'Jane' });
		const result2 = await db.select().from(usersMySchemaTable);
		expect(result2).toEqual([
			{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
			{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
		]);
	});

	test('mySchema :: insert with overridden default values', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John', verified: true });
		const result = await db.select().from(usersMySchemaTable);

		expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test('mySchema :: insert many', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);
		const result = await db.select({
			id: usersMySchemaTable.id,
			name: usersMySchemaTable.name,
			jsonb: usersMySchemaTable.jsonb,
			verified: usersMySchemaTable.verified,
		}).from(usersMySchemaTable);

		expect(result).toEqual([
			{ id: 1, name: 'John', jsonb: null, verified: false },
			{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
			{ id: 3, name: 'Jane', jsonb: null, verified: false },
			{ id: 4, name: 'Austin', jsonb: null, verified: true },
		]);
	});

	test('mySchema :: select with group by as field', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.name);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
	});

	test('mySchema :: select with group by as column + sql', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.id, sql`${usersMySchemaTable.name}`);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test('mySchema :: build query', async ({ db }) => {
		const query = db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.id, usersMySchemaTable.name)
			.toSQL();

		expect(query).toEqual({
			sql:
				`select \`id\`, \`name\` from \`mySchema\`.\`userstest\` group by \`mySchema\`.\`userstest\`.\`id\`, \`mySchema\`.\`userstest\`.\`name\``,
			params: [],
		});
	});

	test('mySchema :: insert with spaces', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: sql`'Jo   h     n'` });
		const result = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
			usersMySchemaTable,
		);

		expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
	});

	test('mySchema :: prepared statement with placeholder in .where', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const stmt = db.select({
			id: usersMySchemaTable.id,
			name: usersMySchemaTable.name,
		}).from(usersMySchemaTable)
			.where(eq(usersMySchemaTable.id, sql.placeholder('id')))
			.prepare();
		const result = await stmt.execute({ id: 1 });

		expect(result).toEqual([{ id: 1, name: 'John' }]);
	});

	test('mySchema :: select from tables with same name from different schema using alias', async ({ db }) => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.execute(sql`drop table if exists \`userstest\``);
		await db.execute(
			sql`
				create table \`userstest\` (
				    \`id\` serial primary key,
				    \`name\` text not null,
				    \`verified\` boolean not null default false,
				    \`jsonb\` json,
				    \`created_at\` timestamp not null default now()
				)
			`,
		);

		await db.insert(usersMySchemaTable).values({ id: 10, name: 'Ivan' });
		await db.insert(usersTable).values({ id: 11, name: 'Hans' });

		const customerAlias = alias(usersTable, 'customer');

		const result = await db
			.select().from(usersMySchemaTable)
			.leftJoin(customerAlias, eq(customerAlias.id, 11))
			.where(eq(usersMySchemaTable.id, 10));

		expect(result).toEqual([{
			userstest: {
				id: 10,
				name: 'Ivan',
				verified: false,
				jsonb: null,
				createdAt: result[0]!.userstest.createdAt,
			},
			customer: {
				id: 11,
				name: 'Hans',
				verified: false,
				jsonb: null,
				createdAt: result[0]!.customer!.createdAt,
			},
		}]);
	});

	test('insert $returningId: serial as id', async ({ db }) => {
		const result = await db.insert(usersTable).values({ name: 'John' }).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test('insert $returningId: serial as id, not first column', async ({ db }) => {
		const usersTableDefNotFirstColumn = mysqlTable('users2', {
			name: text('name').notNull(),
			id: serial('id').primaryKey(),
		});

		const result = await db.insert(usersTableDefNotFirstColumn).values({ name: 'John' }).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test('insert $returningId: serial as id, batch insert', async ({ db }) => {
		const result = await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }, { id: 2 }]);
	});

	test('insert $returningId: $default as primary key', async ({ db, client }) => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await setupReturningFunctionsTest(client.batch);

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

	test('insert $returningId: $default as primary key with value', async ({ db, client }) => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await setupReturningFunctionsTest(client.batch);

		const result = await db.insert(usersTableDefFn).values([{ name: 'John', customId: 'test' }, { name: 'John1' }])
			//    ^?
			.$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			customId: string;
		}[]>();

		expect(result).toStrictEqual([{ customId: 'test' }, { customId: 'ao865jf3mcmkfkk8o5ri495z' }]);
	});

	test('mySchema :: view', async ({ db }) => {
		const newYorkers1 = mySchema.view('new_yorkers')
			.as((qb) => qb.select().from(users2MySchemaTable).where(eq(users2MySchemaTable.cityId, 1)));

		const newYorkers2 = mySchema.view('new_yorkers', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).as(sql`select * from ${users2MySchemaTable} where ${eq(users2MySchemaTable.cityId, 1)}`);

		const newYorkers3 = mySchema.view('new_yorkers', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).existing();

		await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

		await db.insert(citiesMySchemaTable).values([{ name: 'New York' }, { name: 'Paris' }]);

		await db.insert(users2MySchemaTable).values([
			{ name: 'John', cityId: 1 },
			{ name: 'Jane', cityId: 1 },
			{ name: 'Jack', cityId: 2 },
		]);

		{
			const result = await db.select().from(newYorkers1);
			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers2);
			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers3);
			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
			expect(result).toEqual([
				{ name: 'John' },
				{ name: 'Jane' },
			]);
		}

		await db.execute(sql`drop view ${newYorkers1}`);
	});

	test.concurrent('$count separate', async ({ db }) => {
		const countTestTable = mysqlTable('count_test1', {
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

		const count = await db.$count(countTestTable);

		await db.execute(sql`drop table ${countTestTable}`);

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

	test('all types', async ({ db }) => {
		await db.insert(allTypesTable).values({
			serial: 1,
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
			binary: '1',
			boolean: true,
			char: 'c',
			date: new Date(1741743161623),
			dateStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			datetime: new Date(1741743161623),
			datetimeStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			decimal: '47521',
			decimalNum: 9007199254740991,
			decimalBig: 5044565289845416380n,
			double: 15.35325689124218,
			enum: 'enV1',
			float: 1.048596,
			real: 1.048596,
			text: 'C4-',
			int: 621,
			json: {
				str: 'strval',
				arr: ['str', 10],
			},
			medInt: 560,
			smallInt: 14,
			time: '04:13:22',
			timestamp: new Date(1741743161623),
			timestampStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			tinyInt: 7,
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
		});

		const rawRes = await db.select().from(allTypesTable);

		type ExpectedType = {
			serial: number;
			bigint53: number | null;
			bigint64: bigint | null;
			binary: string | null;
			boolean: boolean | null;
			char: string | null;
			date: Date | null;
			dateStr: string | null;
			datetime: Date | null;
			datetimeStr: string | null;
			decimal: string | null;
			decimalNum: number | null;
			decimalBig: bigint | null;
			double: number | null;
			float: number | null;
			int: number | null;
			json: unknown;
			medInt: number | null;
			smallInt: number | null;
			real: number | null;
			text: string | null;
			time: string | null;
			timestamp: Date | null;
			timestampStr: string | null;
			tinyInt: number | null;
			varbin: string | null;
			varchar: string | null;
			year: number | null;
			enum: 'enV1' | 'enV2' | null;
			blob: Buffer | null;
			tinyblob: Buffer | null;
			mediumblob: Buffer | null;
			longblob: Buffer | null;
			stringblob: string | null;
			stringtinyblob: string | null;
			stringmediumblob: string | null;
			stringlongblob: string | null;
		}[];

		const expectedRes: ExpectedType = [
			{
				serial: 1,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				binary: '1',
				boolean: true,
				char: 'c',
				date: new Date('2025-03-12T00:00:00.000Z'),
				dateStr: '2025-03-12',
				datetime: new Date('2025-03-12T01:32:42.000Z'),
				datetimeStr: '2025-03-12 01:32:41',
				decimal: '47521',
				decimalNum: 9007199254740991,
				decimalBig: 5044565289845416380n,
				double: 15.35325689124218,
				float: 1.0486,
				int: 621,
				json: { arr: ['str', 10], str: 'strval' },
				medInt: 560,
				smallInt: 14,
				real: 1.048596,
				text: 'C4-',
				time: '04:13:22',
				timestamp: new Date('2025-03-12T01:32:42.000Z'),
				timestampStr: '2025-03-12 01:32:41',
				tinyInt: 7,
				varbin: '1010110101001101',
				varchar: 'VCHAR',
				year: 2025,
				enum: 'enV1',
				blob: Buffer.from('string'),
				longblob: Buffer.from('string'),
				mediumblob: Buffer.from('string'),
				tinyblob: Buffer.from('string'),
				stringblob: 'string',
				stringlongblob: 'string',
				stringmediumblob: 'string',
				stringtinyblob: 'string',
			},
		];

		expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
		expect(rawRes).toStrictEqual(expectedRes);
	});

	test('insert into ... select', async ({ db }) => {
		const notifications = mysqlTable('notifications', {
			id: serial('id').primaryKey(),
			sentAt: timestamp('sent_at').notNull().defaultNow(),
			message: text('message').notNull(),
		});
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const userNotications = mysqlTable('user_notifications', {
			userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
			notificationId: int('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
		}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

		await db.execute(sql`drop table if exists ${notifications}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${userNotications}`);
		await db.execute(sql`
			create table ${notifications} (
				\`id\` serial primary key,
				\`sent_at\` timestamp not null default now(),
				\`message\` text not null
			)
		`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`);
		await db.execute(sql`
			create table ${userNotications} (
				\`user_id\` int references users(id) on delete cascade,
				\`notification_id\` int references notifications(id) on delete cascade,
				primary key (user_id, notification_id)
			)
		`);

		await db
			.insert(notifications)
			.values({ message: 'You are one of the 3 lucky winners!' });
		const newNotification = await db
			.select({ id: notifications.id })
			.from(notifications)
			.then((result) => result[0]);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db
			.insert(userNotications)
			.select(
				db
					.select({
						userId: users.id,
						notificationId: sql`(${newNotification!.id})`.as('notification_id'),
					})
					.from(users)
					.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
					.orderBy(asc(users.id)),
			);
		const sentNotifications = await db.select().from(userNotications);

		expect(sentNotifications).toStrictEqual([
			{ userId: 1, notificationId: newNotification!.id },
			{ userId: 3, notificationId: newNotification!.id },
			{ userId: 5, notificationId: newNotification!.id },
		]);
	});

	test('insert into ... select with keys in different order', async ({ db }) => {
		const users1 = mysqlTable('users1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const users2 = mysqlTable('users2', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${users1}`);
		await db.execute(sql`drop table if exists ${users2}`);
		await db.execute(sql`
			create table ${users1} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`);
		await db.execute(sql`
			create table ${users2} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`);

		expect(
			() =>
				db
					.insert(users1)
					.select(
						db
							.select({
								name: users2.name,
								id: users2.id,
							})
							.from(users2),
					),
		).toThrowError();
	});

	test('MySqlTable :: select with `use index` hint', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index').on(users.name);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		const result = await db.select()
			.from(users, {
				useIndex: [usersTableNameIndex],
			})
			.where(eq(users.name, 'David'));

		expect(result).toHaveLength(1);
		expect(result).toEqual([{ id: 4, name: 'David' }]);
	});

	test('MySqlTable :: select with `use index` hint on 1 index', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index').on(users.name);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);

		const query = db.select()
			.from(users, {
				useIndex: usersTableNameIndex,
			})
			.where(eq(users.name, 'David'))
			.toSQL();

		expect(query.sql).to.include('USE INDEX (users_name_index)');
	});

	test('MySqlTable :: select with `use index` hint on multiple indexes', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
			age: int('age').notNull(),
		}, () => [usersTableNameIndex, usersTableAgeIndex]);
		const usersTableNameIndex = index('users_name_index').on(users.name);
		const usersTableAgeIndex = index('users_age_index').on(users.age);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null,
				\`age\` int not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);
		await db.execute(sql`create index users_age_index ON users(age)`);

		const query = db.select()
			.from(users, {
				useIndex: [usersTableNameIndex, usersTableAgeIndex],
			})
			.where(eq(users.name, 'David'))
			.toSQL();

		expect(query.sql).to.include('USE INDEX (users_name_index, users_age_index)');
	});

	test('MySqlTable :: select with `use index` hint on not existed index', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index').on(users.name);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await expect((async () => {
			return await db.select()
				.from(users, {
					useIndex: ['some_other_index'],
				})
				.where(eq(users.name, 'David'));
		})()).rejects.toThrowError();
	});

	test('MySqlTable :: select with `use index` + `force index` incompatible hints', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
			age: int('age').notNull(),
		}, () => [usersTableNameIndex, usersTableAgeIndex]);
		const usersTableNameIndex = index('users_name_index').on(users.name);
		const usersTableAgeIndex = index('users_age_index').on(users.age);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null,
				\`age\` int not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);
		await db.execute(sql`create index users_age_index ON users(age)`);

		await db.insert(users).values([
			{ name: 'Alice', age: 18 },
			{ name: 'Bob', age: 19 },
			{ name: 'Charlie', age: 20 },
			{ name: 'David', age: 21 },
			{ name: 'Eve', age: 22 },
		]);

		await expect((async () => {
			return await db.select()
				.from(users, {
					useIndex: [usersTableNameIndex],
					forceIndex: [usersTableAgeIndex],
				})
				.where(eq(users.name, 'David'));
		})()).rejects.toThrowError();
	});

	test('MySqlTable :: select with join `use index` hint', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		const result = await db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: [postsTableUserIdIndex],
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			));

		expect(result).toHaveLength(1);
		expect(result).toEqual([{ userId: 4, name: 'David', postId: 4, text: 'David post' }]);
	});

	test('MySqlTable :: select with join `use index` hint on 1 index', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: postsTableUserIdIndex,
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			)).toSQL();

		expect(query.sql).to.include('USE INDEX (posts_user_id_index)');
	});

	test('MySqlTable :: select with cross join `use index` hint', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		await db.insert(users).values([
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
		]);

		await db.insert(posts).values([
			{ id: 1, text: 'Alice post', userId: 1 },
			{ id: 2, text: 'Bob post', userId: 2 },
		]);

		const result = await db.select()
			.from(users)
			.crossJoin(posts, {
				useIndex: [postsTableUserIdIndex],
			})
			.orderBy(users.id, posts.id);

		expect(result).toStrictEqual([{
			users: { id: 1, name: 'Alice' },
			posts: { id: 1, text: 'Alice post', userId: 1 },
		}, {
			users: { id: 1, name: 'Alice' },
			posts: { id: 2, text: 'Bob post', userId: 2 },
		}, {
			users: { id: 2, name: 'Bob' },
			posts: { id: 1, text: 'Alice post', userId: 1 },
		}, {
			users: { id: 2, name: 'Bob' },
			posts: { id: 2, text: 'Bob post', userId: 2 },
		}]);
	});

	test('MySqlTable :: select with cross join `use index` hint on 1 index', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.crossJoin(posts, {
				useIndex: postsTableUserIdIndex,
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			)).toSQL();

		expect(query.sql).to.include('USE INDEX (posts_user_id_index)');
	});

	test('MySqlTable :: select with join `use index` hint on multiple indexes', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex, postsTableTextIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);
		const postsTableTextIndex = index('posts_text_index').on(posts.text);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);
		await db.execute(sql`create index posts_text_index ON posts(text)`);

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: [postsTableUserIdIndex, postsTableTextIndex],
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			)).toSQL();

		expect(query.sql).to.include('USE INDEX (posts_user_id_index, posts_text_index)');
	});

	test('MySqlTable :: select with join `use index` hint on not existed index', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		await expect((async () => {
			return await db.select({
				userId: users.id,
				name: users.name,
				postId: posts.id,
				text: posts.text,
			})
				.from(users)
				.leftJoin(posts, eq(users.id, posts.userId), {
					useIndex: ['some_other_index'],
				})
				.where(and(
					eq(users.name, 'David'),
					eq(posts.text, 'David post'),
				));
		})()).rejects.toThrowError();
	});

	test('MySqlTable :: select with join `use index` + `force index` incompatible hints', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex, postsTableTextIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);
		const postsTableTextIndex = index('posts_text_index').on(posts.text);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);
		await db.execute(sql`create index posts_text_index ON posts(text)`);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		await expect((async () => {
			return await db.select({
				userId: users.id,
				name: users.name,
				postId: posts.id,
				text: posts.text,
			})
				.from(users)
				.leftJoin(posts, eq(users.id, posts.userId), {
					useIndex: [postsTableUserIdIndex],
					forceIndex: [postsTableTextIndex],
				})
				.where(and(
					eq(users.name, 'David'),
					eq(posts.text, 'David post'),
				));
		})()).rejects.toThrowError();
	});

	test('MySqlTable :: select with Subquery join `use index`', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		const sq = db.select().from(posts, { useIndex: [postsTableUserIdIndex] }).where(eq(posts.userId, 1)).as('sq');

		const result = await db.select({
			userId: users.id,
			name: users.name,
			postId: sq.id,
			text: sq.text,
		})
			.from(users)
			.leftJoin(sq, eq(users.id, sq.userId))
			.where(eq(users.name, 'Alice'));

		expect(result).toHaveLength(1);
		expect(result).toEqual([{ userId: 1, name: 'Alice', postId: 1, text: 'Alice post' }]);
	});

	test('MySqlTable :: select with Subquery join with `use index` in join', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

		await db.execute(sql`drop table if exists ${posts}`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`
			create table ${posts} (
				\`id\` serial primary key,
				\`text\` varchar(100) not null,
				\`user_id\` int not null references users(id) on delete cascade
			)
		`);
		await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

		const sq = db.select().from(posts).where(eq(posts.userId, 1)).as('sq');

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: sq.id,
			text: sq.text,
		})
			.from(users)
			// @ts-expect-error
			.leftJoin(sq, eq(users.id, sq.userId, { useIndex: [postsTableUserIdIndex] }))
			.where(eq(users.name, 'Alice'))
			.toSQL();

		expect(query.sql).not.include('USE INDEX');
	});

	test('View :: select with `use index` hint', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);

		const usersTableNameIndex = index('users_name_index').on(users.name);

		const usersView = mysqlView('users_view').as((qb) => qb.select().from(users));

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);
		await db.execute(sql`create view ${usersView} as select * from ${users}`);

		// @ts-expect-error
		const query = db.select().from(usersView, {
			useIndex: [usersTableNameIndex],
		}).toSQL();

		expect(query.sql).not.include('USE INDEX');

		await db.execute(sql`drop view ${usersView}`);
	});

	test('Subquery :: select with `use index` hint', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index').on(users.name);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`create index users_name_index ON users(name)`);

		const sq = db.select().from(users).as('sq');

		// @ts-expect-error
		const query = db.select().from(sq, {
			useIndex: [usersTableNameIndex],
		}).toSQL();

		expect(query.sql).not.include('USE INDEX');
	});

	test('sql operator as cte', async ({ db }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`create table ${users} (id serial not null primary key, name text not null)`);
		await db.insert(users).values([
			{ name: 'John' },
			{ name: 'Jane' },
		]);

		const sq1 = db.$with('sq', {
			userId: users.id,
			data: {
				name: users.name,
			},
		}).as(sql`select * from ${users} where ${users.name} = 'John'`);
		const result1 = await db.with(sq1).select().from(sq1);

		const sq2 = db.$with('sq', {
			userId: users.id,
			data: {
				name: users.name,
			},
		}).as(() => sql`select * from ${users} where ${users.name} = 'Jane'`);
		const result2 = await db.with(sq2).select().from(sq1);

		expect(result1).toEqual([{ userId: 1, data: { name: 'John' } }]);
		expect(result2).toEqual([{ userId: 2, data: { name: 'Jane' } }]);
	});

	test('contraint names config', async ({ db }) => {
		const users = mysqlTable('users', {
			id: int('id').unique(),
			id1: int('id1').unique('custom_name'),
		});

		const tableConf = getTableConfig(users);

		expect(tableConf.columns.find((it) => it.name === 'id')!.uniqueName).toBe(undefined);
		expect(tableConf.columns.find((it) => it.name === 'id1')!.uniqueName).toBe('custom_name');
	});
}
