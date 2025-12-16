/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import {
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	eq,
	getTableColumns,
	gt,
	gte,
	inArray,
	isNull,
	lt,
	max,
	min,
	sql,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import type { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';
import {
	alias,
	bigint,
	binary,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	except,
	float,
	getTableConfig,
	index,
	int,
	intersect,
	json,
	mediumint,
	primaryKey,
	real,
	serial,
	singlestoreEnum,
	singlestoreSchema,
	singlestoreTable,
	singlestoreTableCreator,
	/* singlestoreView, */
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	union,
	unionAll,
	varbinary,
	varchar,
	vector,
	year,
} from 'drizzle-orm/singlestore-core';
import { dotProduct, euclideanDistance } from 'drizzle-orm/singlestore-core/expressions';
import { describe, expect, expectTypeOf } from 'vitest';
import { Expect } from '../utils';
import type { Equal } from '../utils';
import type { Test } from './instrumentation';
import type relations from './relations';

type TestSingleStoreDB = SingleStoreDatabase<any, any, any, typeof relations>;

const allTypesTable = singlestoreTable('all_types', {
	serial: serial('scol'),
	bigint53: bigint('bigint53', {
		mode: 'number',
	}),
	bigint64: bigint('bigint64', {
		mode: 'bigint',
	}),
	bigintString: bigint('bigint_string', {
		mode: 'string',
	}),
	binary: binary('binary'),
	boolean: boolean('boolean'),
	char: char('char'),
	date: date('date', {
		mode: 'date',
	}),
	dateStr: date('date_str', {
		mode: 'string',
	}),
	datetime: datetime('datetime', {
		mode: 'date',
	}),
	datetimeStr: datetime('datetime_str', {
		mode: 'string',
	}),
	decimal: decimal('decimal'),
	decimalNum: decimal('decimal_num', {
		scale: 30,
		mode: 'number',
	}),
	decimalBig: decimal('decimal_big', {
		scale: 30,
		mode: 'bigint',
	}),
	double: double('double'),
	float: float('float'),
	int: int('int'),
	json: json('json'),
	medInt: mediumint('med_int'),
	smallInt: smallint('small_int'),
	real: real('real'),
	text: text('text'),
	time: time('time'),
	timestamp: timestamp('timestamp', {
		mode: 'date',
	}),
	timestampStr: timestamp('timestamp_str', {
		mode: 'string',
	}),
	tinyInt: tinyint('tiny_int'),
	varbin: varbinary('varbin', {
		length: 16,
	}),
	varchar: varchar('varchar', {
		length: 255,
	}),
	year: year('year'),
	enum: singlestoreEnum('enum', ['enV1', 'enV2']),
	vectorI8: vector('vec_i8', {
		dimensions: 5,
		elementType: 'I8',
	}),
	vectorI16: vector('vec_i16', {
		dimensions: 5,
		elementType: 'I16',
	}),
	vectorI32: vector('vec_i32', {
		dimensions: 5,
		elementType: 'I32',
	}),
	vectorI64: vector('vec_i64', {
		dimensions: 5,
		elementType: 'I64',
	}),
	vectorF32: vector('vec_f32', {
		dimensions: 5,
		elementType: 'F32',
	}),
	vectorF64: vector('vec_f64', {
		dimensions: 5,
		elementType: 'F64',
	}),
});

const usersTable = singlestoreTable('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

const users2Table = singlestoreTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int('city_id'),
});

const citiesTable = singlestoreTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const usersOnUpdate = singlestoreTable('users_on_update', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	updateCounter: int('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: datetime('updated_at', { mode: 'date' }).$onUpdateFn(() => new Date()),
	alwaysNull: text('always_null').$type<string | null>().$onUpdateFn(() => null), // need to add $type because $onUpdate add a default value
});

const orders = singlestoreTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

// To test aggregate functions
const aggregateTable = singlestoreTable('aggregate_table', {
	id: serial('id').notNull(),
	name: text('name').notNull(),
	a: int('a'),
	b: int('b'),
	c: int('c'),
	nullOnly: int('null_only'),
});

const vectorSearchTable = singlestoreTable('vector_search', {
	id: serial('id').notNull(),
	text: text('text').notNull(),
	embedding: vector('embedding', { dimensions: 10 }),
});

// To test another schema and multischema
const mySchema = singlestoreSchema(`mySchema`);

const usersMySchemaTable = mySchema.table('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export function tests(test: Test) {
	const connDict: Record<string, any> = {};

	describe('common', () => {
		test.beforeEach(async ({ db, client }) => {
			const connKey = `${client.config.user}:${client.config.password}@${client.config.host}:${client.config.port}`;

			if (connDict[connKey] === undefined) {
				connDict[connKey] = false;

				await Promise.all([
					db.execute(sql`drop schema if exists \`mySchema\`;`),
					db.execute(sql`drop table if exists userstest;`),
					db.execute(sql`drop table if exists users2;`),
					db.execute(sql`drop table if exists cities;`),
					db.execute(sql`drop table if exists aggregate_table;`),
					db.execute(sql`drop table if exists vector_search;`),
					db.execute(sql`drop table if exists users_default_fn;`),
				]);
				await db.execute(sql`create schema \`mySchema\`;`);
				await Promise.all([
					db.execute(sql`create table userstest (
                        id serial primary key,
                        name text not null,
                        verified boolean not null default false,
                        jsonb json,
                        created_at timestamp not null default now()
                    );`),
					db.execute(sql`create table users2 (
                        id serial primary key,
                        name text not null,
                        city_id int
                	);`),
					db.execute(sql`create table cities (
                	    id serial primary key,
                	    name text not null
                	);`),
					db.execute(sql`create table \`mySchema\`.\`userstest\` (
                	    id serial primary key,
                	    name text not null,
                	    verified boolean not null default false,
                	    jsonb json,
                	    created_at timestamp not null default now()
                	);`),
					db.execute(sql`create table \`mySchema\`.\`cities\` (
                	    \`id\` serial primary key,
                	    \`name\` text not null
                	);`),
					db.execute(sql`create table \`mySchema\`.\`users2\` (
                	    \`id\` serial primary key,
                	    \`name\` text not null,
                	    \`city_id\` int 
                	);`),
					db.execute(sql`create table aggregate_table (
                	    id integer primary key auto_increment not null,
                	    name text not null,
                	    a integer,
                	    b integer,
                	    c integer,
                	    null_only integer
                	);`),
					db.execute(sql`create table vector_search (
                	    id integer primary key auto_increment not null,
                	    text text not null,
                	    embedding vector(10) not null
                	);`),
					db.execute(sql`create table users_default_fn (
                	    id varchar(256) primary key,
                	    name text not null
                	);`),
				]);
			}

			await Promise.all([
				db.execute(sql`truncate table userstest;`),
				db.execute(sql`truncate table users2;`),
				db.execute(sql`truncate table cities;`),
				db.execute(sql`truncate table aggregate_table;`),
				db.execute(sql`truncate table vector_search;`),
				db.execute(sql`truncate table users_default_fn;`),

				db.execute(sql`truncate table \`mySchema\`.\`userstest\`;`),
				db.execute(sql`truncate table \`mySchema\`.\`cities\`;`),
				db.execute(sql`truncate table \`mySchema\`.\`users2\`;`),
			]);
		});

		async function setupReturningFunctionsTest(db: SingleStoreDatabase<any, any>) {
			await db.execute(sql`truncate table users_default_fn`);
		}

		async function setupSetOperationTest(db: TestSingleStoreDB) {
			await Promise.all([db.execute(sql`truncate table \`users2\`;`), db.execute(sql`truncate table \`cities\``)]);
			await Promise.all(
				[
					db.insert(citiesTable).values([
						{ id: 1, name: 'New York' },
						{ id: 2, name: 'London' },
						{ id: 3, name: 'Tampa' },
					]),
					db.insert(users2Table).values([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 2 },
						{ id: 3, name: 'Jack', cityId: 3 },
						{ id: 4, name: 'Peter', cityId: 3 },
						{ id: 5, name: 'Ben', cityId: 2 },
						{ id: 6, name: 'Jill', cityId: 1 },
						{ id: 7, name: 'Mary', cityId: 2 },
						{ id: 8, name: 'Sally', cityId: 1 },
					]),
				],
			);
		}

		async function setupAggregateFunctionsTest(db: TestSingleStoreDB) {
			await db.execute(sql`truncate table aggregate_table`);
			await db.insert(aggregateTable).values([
				{ id: 1, name: 'value 1', a: 5, b: 10, c: 20 },
				{ id: 2, name: 'value 1', a: 5, b: 20, c: 30 },
				{ id: 3, name: 'value 2', a: 10, b: 50, c: 60 },
				{ id: 4, name: 'value 3', a: 20, b: 20, c: null },
				{ id: 5, name: 'value 4', a: null, b: 90, c: 120 },
				{ id: 6, name: 'value 5', a: 80, b: 10, c: null },
				{ id: 7, name: 'value 6', a: null, b: null, c: 150 },
			]);
		}

		async function setupVectorSearchTest(db: TestSingleStoreDB) {
			await db.execute(sql`truncate table vector_search`);
			await db.insert(vectorSearchTable).values([
				{
					id: 1,
					text: 'I like dogs',
					embedding: [0.6119, 0.1395, 0.2921, 0.3664, 0.4561, 0.7852, 0.1997, 0.5142, 0.5924, 0.0465],
				},
				{
					id: 2,
					text: 'I like cats',
					embedding: [0.6075, 0.1705, 0.0651, 0.9489, 0.9656, 0.8084, 0.3046, 0.0977, 0.6842, 0.4402],
				},
			]);
		}

		test.concurrent('with ... select', async ({ db }) => {
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

		test.concurrent('with ... update', async ({ db }) => {
			const products = singlestoreTable('products', {
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
				{ id: 1, price: '10.99' },
				{ id: 2, price: '25.85' },
				{ id: 3, price: '32.99' },
				{ id: 4, price: '2.50' },
				{ id: 5, price: '4.59' },
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
				.where(eq(products.cheap, true))
				.orderBy(asc(products.id));

			expect(result).toEqual([
				{ id: 1 },
				{ id: 4 },
				{ id: 5 },
			]);
		});

		test.concurrent('with ... delete', async ({ db }) => {
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
				{ id: 1, region: 'Europe', product: 'A', amount: 10, quantity: 1 },
				{ id: 2, region: 'Europe', product: 'A', amount: 20, quantity: 2 },
				{ id: 3, region: 'Europe', product: 'B', amount: 20, quantity: 2 },
				{ id: 4, region: 'Europe', product: 'B', amount: 30, quantity: 3 },
				{ id: 5, region: 'US', product: 'A', amount: 30, quantity: 3 },
				{ id: 6, region: 'US', product: 'A', amount: 40, quantity: 4 },
				{ id: 7, region: 'US', product: 'B', amount: 40, quantity: 4 },
				{ id: 8, region: 'US', product: 'B', amount: 50, quantity: 5 },
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
				.from(orders)
				.orderBy(asc(orders.id));

			expect(result).toEqual([
				{ id: 1 },
				{ id: 2 },
				{ id: 3 },
				{ id: 4 },
				{ id: 5 },
			]);
		});

		test.concurrent('select from subquery sql', async ({ db }) => {
			await db.insert(users2Table).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);

			const sq = db
				.select({ name: sql<string>`concat(${users2Table.name}, " modified")`.as('name') })
				.from(users2Table)
				.orderBy(asc(users2Table.id))
				.as('sq');

			const res = await db.select({ name: sq.name }).from(sq);

			expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
		});

		test.concurrent('select a field without joining its table', ({ db }) => {
			expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).toThrowError();
		});

		test.concurrent('select all fields from subquery without alias', ({ db }) => {
			const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

			expect(() => db.select().from(sq).prepare()).toThrowError();
		});

		test.concurrent('select count()', async ({ db }) => {
			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const res = await db.select({ count: sql`count(*)` }).from(usersTable);

			expect(res).toEqual([{ count: 2 }]);
		});

		test.concurrent('select for ...', ({ db }) => {
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

		test.concurrent('having', async ({ db }) => {
			await db.insert(citiesTable).values([{ id: 1, name: 'London' }, { id: 2, name: 'Paris' }, {
				id: 3,
				name: 'New York',
			}]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane', cityId: 1 }, {
				id: 3,
				name: 'Jack',
				cityId: 2,
			}]);

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

		// TODO: Unskip when views are supported
		/* test.skip('view', async ({ db }) => {


            const newYorkers1 = singlestoreView('new_yorkers')
                .as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

            const newYorkers2 = singlestoreView('new_yorkers', {
                id: serial('id').primaryKey(),
                name: text('name').notNull(),
                cityId: int('city_id').notNull(),
            }).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

            const newYorkers3 = singlestoreView('new_yorkers', {
                id: serial('id').primaryKey(),
                name: text('name').notNull(),
                cityId: int('city_id').notNull(),
            }).existing();

            await db.execute(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

            await db.insert(citiesTable).values([{ id: 1, name: 'New York' }, { id: 2, name: 'Paris' }]);

            await db.insert(users2Table).values([
                { id: 1, name: 'John', cityId: 1 },
                { id: 2, name: 'Jane', cityId: 1 },
                { id: 3, name: 'Jack', cityId: 2 },
            ]);

            {
                const result = await db.select().from(newYorkers1).orderBy(asc(newYorkers1.id));
                expect(result).toEqual([
                    { id: 1, name: 'John', cityId: 1 },
                    { id: 2, name: 'Jane', cityId: 1 },
                ]);
            }

            {
                const result = await db.select().from(newYorkers2).orderBy(asc(newYorkers2.id));
                expect(result).toEqual([
                    { id: 1, name: 'John', cityId: 1 },
                    { id: 2, name: 'Jane', cityId: 1 },
                ]);
            }

            {
                const result = await db.select().from(newYorkers3).orderBy(asc(newYorkers3.id));
                expect(result).toEqual([
                    { id: 1, name: 'John', cityId: 1 },
                    { id: 2, name: 'Jane', cityId: 1 },
                ]);
            }

            {
                const result = await db.select({ name: newYorkers1.name }).from(newYorkers1).orderBy(asc(newYorkers1.id));
                expect(result).toEqual([
                    { name: 'John' },
                    { name: 'Jane' },
                ]);
            }

            await db.execute(sql`drop view ${newYorkers1}`);
        }); */

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

		test.concurrent('prefixed table', async ({ db }) => {
			const singlestoreTable = singlestoreTableCreator((name) => `myprefix_${name}`);

			const users = singlestoreTable('test_prefixed_table_with_unique_name', {
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

		test.concurrent('orderBy with aliased column', ({ db }) => {
			const query = db.select({
				test: sql`something`.as('test'),
			}).from(users2Table).orderBy((fields) => fields.test).toSQL();

			expect(query.sql).toBe('select something as `test` from `users2` order by `test`');
		});

		test.concurrent('timestamp timezone', async ({ db }) => {
			const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

			await db.insert(usersTable).values({ id: 1, name: 'With default times' });
			await db.insert(usersTable).values({
				id: 2,
				name: 'Without default times',
				createdAt: date,
			});
			const users = await db.select().from(usersTable).orderBy(asc(usersTable.id));

			// check that the timestamps are set correctly for default times
			expect(Math.abs(users[0]!.createdAt.getTime() - Date.now())).toBeLessThan(5000);

			// check that the timestamps are set correctly for non default times
			expect(Math.abs(users[1]!.createdAt.getTime() - date.getTime())).toBeLessThan(2000);
		});

		test.concurrent('transaction', async ({ db }) => {
			const users = singlestoreTable('users_transactions', {
				id: serial('id').primaryKey(),
				balance: int('balance').notNull(),
			});
			const products = singlestoreTable('products_transactions', {
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

			const [{ insertId: userId }] = await db.insert(users).values({ id: 1, balance: 100 });
			const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]!);
			const [{ insertId: productId }] = await db.insert(products).values({ id: 1, price: 10, stock: 10 });
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

		test.concurrent('transaction rollback', async ({ db }) => {
			const users = singlestoreTable('users_transactions_rollback', {
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

		test.concurrent('join subquery with join', async ({ db }) => {
			const internalStaff = singlestoreTable('internal_staff', {
				userId: int('user_id').notNull(),
			});

			const customUser = singlestoreTable('custom_user', {
				id: int('id').notNull(),
			});

			const ticket = singlestoreTable('ticket', {
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

		// TODO: Unskip when views are supported
		/* test.skip('subquery with view', async ({ db }) => {


            const users = singlestoreTable('users_subquery_view', {
                id: serial('id').primaryKey(),
                name: text('name').notNull(),
                cityId: int('city_id').notNull(),
            });

            const newYorkers = singlestoreView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

            await db.execute(sql`drop table if exists ${users}`);
            await db.execute(sql`drop view if exists ${newYorkers}`);

            await db.execute(
                sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
            );
            await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

            await db.insert(users).values([
                { id: 1, name: 'John', cityId: 1 },
                { id: 2, name: 'Jane', cityId: 2 },
                { id: 3, name: 'Jack', cityId: 1 },
                { id: 4, name: 'Jill', cityId: 2 },
            ]);

            const sq = db.$with('sq').as(db.select().from(newYorkers));
            const result = await db.with(sq).select().from(sq).orderBy(asc(sq.id));

            expect(result).toEqual([
                { id: 1, name: 'John', cityId: 1 },
                { id: 3, name: 'Jack', cityId: 1 },
            ]);

            await db.execute(sql`drop view ${newYorkers}`);
            await db.execute(sql`drop table ${users}`);
        }); */

		// TODO: Unskip when views are supported
		/* test.skip('join view as subquery', async ({ db }) => {


            const users = singlestoreTable('users_join_view', {
                id: serial('id').primaryKey(),
                name: text('name').notNull(),
                cityId: int('city_id').notNull(),
            });

            const newYorkers = singlestoreView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

            await db.execute(sql`drop table if exists ${users}`);
            await db.execute(sql`drop view if exists ${newYorkers}`);

            await db.execute(
                sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
            );
            await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

            await db.insert(users).values([
                { id: 1, name: 'John', cityId: 1 },
                { id: 2, name: 'Jane', cityId: 2 },
                { id: 3, name: 'Jack', cityId: 1 },
                { id: 4, name: 'Jill', cityId: 2 },
            ]);

            const sq = db.select().from(newYorkers).as('new_yorkers_sq');

            const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).orderBy(asc(users.id));

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
        }); */

		test.concurrent('select iterator', async ({ db }) => {
			const users = singlestoreTable('users_iterator', {
				id: serial('id').primaryKey(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id serial not null primary key)`);

			await db.insert(users).values([{ id: 1 }, { id: 2 }, { id: 3 }]);

			const iter = db.select().from(users)
				.orderBy(asc(users.id))
				.iterator();

			const result: typeof users.$inferSelect[] = [];

			for await (const row of iter) {
				result.push(row);
			}

			expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
		});

		test.concurrent('select iterator w/ prepared statement', async ({ db }) => {
			const users = singlestoreTable('users_iterator', {
				id: serial('id').primaryKey(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id serial not null primary key)`);

			await db.insert(users).values([{ id: 1 }, { id: 2 }, { id: 3 }]);

			const prepared = db.select().from(users)
				.orderBy(asc(users.id))
				.prepare();
			const iter = prepared.iterator();
			const result: typeof users.$inferSelect[] = [];

			for await (const row of iter) {
				result.push(row);
			}

			expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
		});

		test.concurrent('insert undefined', async ({ db }) => {
			const users = singlestoreTable('users', {
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

		test.concurrent('update undefined', async ({ db }) => {
			const users = singlestoreTable('users', {
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

		test.concurrent('utc config for datetime', async ({ db }) => {
			await db.execute(sql`drop table if exists \`datestable\``);
			await db.execute(
				sql`
                    create table \`datestable\` (
                        \`datetime_utc\` datetime(6),
                        \`datetime\` datetime(6)
                    )
                `,
			);
			const datesTable = singlestoreTable('datestable', {
				datetimeUTC: datetime('datetime_utc', { mode: 'date' }),
				datetime: datetime('datetime'),
			});

			const dateObj = new Date('2022-11-11');
			const dateUtc = new Date('2022-11-11T12:12:12.122Z');

			await db.insert(datesTable).values({
				datetimeUTC: dateUtc,
				datetime: dateObj,
			});

			const res = await db.select().from(datesTable);

			const [rawSelect] = await db.execute(sql`select \`datetime_utc\` from \`datestable\``);
			const selectedRow = (rawSelect as unknown as [{ datetime_utc: string }])[0];

			expect(selectedRow.datetime_utc).toBe('2022-11-11 12:12:12.122000');
			expect(new Date(selectedRow.datetime_utc.replace(' ', 'T') + 'Z')).toEqual(dateUtc);

			expect(res[0]?.datetime).toBeInstanceOf(Date);
			expect(res[0]?.datetimeUTC).toBeInstanceOf(Date);

			expect(res).toEqual([{
				datetimeUTC: dateUtc,
				datetime: new Date('2022-11-11'),
			}]);

			await db.execute(sql`drop table if exists \`datestable\``);
		});

		// TODO (https://memsql.atlassian.net/browse/MCDB-63261) allow chaining limit and orderby in subquery
		test.concurrent('set operations (union) from query builder with subquery', async ({ db }) => {
			await setupSetOperationTest(db);
			const citiesQuery = db
				.select({
					id: citiesTable.id,
					name: citiesTable.name,
					orderCol: sql`0`.as('orderCol'),
				})
				.from(citiesTable);

			const usersQuery = db
				.select({
					id: users2Table.id,
					name: users2Table.name,
					orderCol: sql`1`.as('orderCol'),
				})
				.from(users2Table);

			const unionQuery = db
				.select({
					id: sql`id`,
					name: sql`name`,
				})
				.from(
					citiesQuery.union(usersQuery).as('combined'),
				)
				.orderBy(sql`orderCol`, sql`id`)
				.limit(8);

			const result = await unionQuery;

			expect(result).toHaveLength(8);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
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
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).union(
						db
							.select({ name: users2Table.name, id: users2Table.id })
							.from(users2Table),
					);
			})()).rejects.toThrowError();
		});

		test.concurrent('set operations (union) as function', async ({ db }) => {
			await setupSetOperationTest(db);

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
				{ id: 1, name: 'New York' },
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

		test.concurrent('set operations (union all) from query builder', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq = db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).orderBy(asc(sql`id`)).limit(2).unionAll(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).orderBy(asc(sql`id`)).limit(2),
				).as('sq');

			const result = await db.select().from(sq).orderBy(asc(sql`id`)).limit(3);

			expect(result).toHaveLength(3);

			expect(result).toEqual([
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

		test.concurrent('set operations (union all) as function', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq = unionAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).as('sq');

			const result = await db.select().from(sq).limit(1);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
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

		test.concurrent('set operations (intersect) from query builder', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq = db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).intersect(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				)
				.as('sq');

			const result = await db.select().from(sq).orderBy(asc(sql`id`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
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

		test.concurrent('set operations (intersect) as function', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq = await intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).as('sq');

			const result = await db.select().from(sq).limit(1);

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

		test.concurrent('set operations (except) from query builder', async ({ db }) => {
			await setupSetOperationTest(db);

			const result = await db
				.select()
				.from(citiesTable).except(
					db
						.select()
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
			]);
		});

		test.concurrent('set operations (except) as function', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq = except(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable),
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).as('sq');

			const result = await db.select().from(sq).limit(3);

			expect(result).toHaveLength(2);

			expect(result).toContainEqual({ id: 2, name: 'London' });
			expect(result).toContainEqual({ id: 3, name: 'Tampa' });

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

		test.concurrent('define constraints as array', async ({ db }) => {
			const table = singlestoreTable('name', {
				id: int(),
			}, (t) => [
				index('name').on(t.id),
				primaryKey({ columns: [t.id], name: 'custom' }),
			]);

			const { indexes, primaryKeys } = getTableConfig(table);

			expect(indexes.length).toBe(1);
			expect(primaryKeys.length).toBe(1);
		});

		test.concurrent('define constraints as array inside third param', async ({ db }) => {
			const table = singlestoreTable('name', {
				id: int(),
			}, (t) => [
				[index('name').on(t.id), primaryKey({ columns: [t.id], name: 'custom' })],
			]);

			const { indexes, primaryKeys } = getTableConfig(table);

			expect(indexes.length).toBe(1);
			expect(primaryKeys.length).toBe(1);
		});

		test.skip('set operations (mixed) from query builder', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq1 = unionAll(
				db
					.select()
					.from(citiesTable).where(gt(citiesTable.id, 1)),
				db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
			).as('sq1');

			const sq2 = await db.select().from(sq1).orderBy(asc(sql`id`)).as('sq2');

			const sq3 = await db.select().from(sq2).limit(1).offset(1).as('sq3');

			const result = await db
				.select()
				.from(citiesTable)
				.except(
					db
						.select()
						.from(sq3),
				);

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 3, name: 'Tampa' },
				{ id: 1, name: 'New York' },
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

		test.concurrent('set operations (mixed all) as function with subquery', async ({ db }) => {
			await setupSetOperationTest(db);

			const sq1 = except(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(gte(users2Table.id, 5)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 7)),
			).as('sq1');

			const sq2 = await db.select().from(sq1).orderBy(asc(sql`id`)).as('sq2');

			const sq3 = await db.select().from(sq2).limit(1).as('sq3');

			const result = await union(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db.select().from(sq3),
				db
					.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			);

			expect(result).toHaveLength(4);

			// multiple results possible as a result of the filters >= 5 and ==7 because singlestore doesn't guarantee order
			// dynamically validate results
			const hasValidEntry = (entry: { id: number; name: string }) => {
				if (entry.id === 1) return entry.name === 'John';
				if (entry.id > 1 && entry.id < 5) return entry.name === 'Tampa' || entry.name === 'London';
				if (entry.id >= 5 && entry.id !== 7) return true; // Accept any entry with id >= 5 and not 7
				return false;
			};

			for (const entry of result) {
				expect(hasValidEntry(entry)).toBe(true);
			}

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

		test.concurrent('aggregate function: count', async ({ db }) => {
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: count() }).from(table);
			const result2 = await db.select({ value: count(table.a) }).from(table);
			const result3 = await db.select({ value: countDistinct(table.name) }).from(table);

			expect(result1[0]?.value).toBe(7);
			expect(result2[0]?.value).toBe(5);
			expect(result3[0]?.value).toBe(6);
		});

		test.concurrent('aggregate function: avg', async ({ db }) => {
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: avg(table.b) }).from(table);
			const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
			const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

			expect(result1[0]?.value).toBe('33.3333');
			expect(result2[0]?.value).toBe(null);
			expect(result3[0]?.value).toBe('42.5000');
		});

		test.concurrent('aggregate function: sum', async ({ db }) => {
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: sum(table.b) }).from(table);
			const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
			const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

			expect(result1[0]?.value).toBe('200');
			expect(result2[0]?.value).toBe(null);
			expect(result3[0]?.value).toBe('170');
		});

		test.concurrent('aggregate function: max', async ({ db }) => {
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: max(table.b) }).from(table);
			const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toBe(90);
			expect(result2[0]?.value).toBe(null);
		});

		test.concurrent('aggregate function: min', async ({ db }) => {
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: min(table.b) }).from(table);
			const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toBe(10);
			expect(result2[0]?.value).toBe(null);
		});

		test.concurrent('simple vector search', async ({ db }) => {
			const table = vectorSearchTable;
			const embedding = [0.42, 0.93, 0.88, 0.57, 0.32, 0.64, 0.76, 0.52, 0.19, 0.81]; // ChatGPT's 10 dimension embedding for "dogs are cool" not sure how accurate but it works
			await setupVectorSearchTest(db);

			const withRankEuclidean = db.select({
				id: table.id,
				text: table.text,
				rank: sql`row_number() over (order by ${euclideanDistance(table.embedding, embedding)})`.as('rank'),
			}).from(table).as('with_rank');
			const withRankDotProduct = db.select({
				id: table.id,
				text: table.text,
				rank: sql`row_number() over (order by ${dotProduct(table.embedding, embedding)})`.as('rank'),
			}).from(table).as('with_rank');
			const result1 = await db.select({ id: withRankEuclidean.id, text: withRankEuclidean.text }).from(
				withRankEuclidean,
			).where(eq(withRankEuclidean.rank, 1));
			const result2 = await db.select({ id: withRankDotProduct.id, text: withRankDotProduct.text }).from(
				withRankDotProduct,
			).where(eq(withRankDotProduct.rank, 1));

			expect(result1.length).toEqual(1);
			expect(result1[0]).toEqual({ id: 1, text: 'I like dogs' });

			expect(result2.length).toEqual(1);
			expect(result2[0]).toEqual({ id: 1, text: 'I like dogs' });
		});

		test.concurrent('test $onUpdateFn and $onUpdate works as $default', async ({ db }) => {
			await db.execute(sql`drop table if exists ${usersOnUpdate}`);

			await db.execute(
				sql`
                    create table ${usersOnUpdate} (
                    id serial not null primary key,
                    name text not null,
                    update_counter integer default 1 not null,
                    updated_at datetime(6),
                    always_null text
                    )
                `,
			);

			await db.insert(usersOnUpdate).values([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Jane' },
				{ id: 3, name: 'Jack' },
				{ id: 4, name: 'Jill' },
			]);
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

			const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			expect(response).toEqual([
				{ name: 'John', id: 1, updateCounter: 1, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 5000;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test.concurrent('test $onUpdateFn and $onUpdate works updating', async ({ db }) => {
			await db.execute(sql`drop table if exists ${usersOnUpdate}`);

			await db.execute(
				sql`
                    create table ${usersOnUpdate} (
                    id serial not null primary key,
                    name text not null,
                    update_counter integer default 1 not null,
                    updated_at datetime(6),
                    always_null text
                    )
                `,
			);

			await db.insert(usersOnUpdate).values([
				{ id: 1, name: 'John', alwaysNull: 'this will will be null after updating' },
				{ id: 2, name: 'Jane' },
				{ id: 3, name: 'Jack' },
				{ id: 4, name: 'Jill' },
			]);
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
			const initial = await db.select({ id: usersOnUpdate.id, updatedAt: usersOnUpdate.updatedAt }).from(usersOnUpdate);

			await db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));

			const justDates = await db.select({ id: usersOnUpdate.id, updatedAt: usersOnUpdate.updatedAt }).from(
				usersOnUpdate,
			);

			const response = await db.select().from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			expect(response).toEqual([
				{ id: 1, name: 'Angel', updateCounter: 2, updatedAt: expect.any(Date), alwaysNull: null },
				{ id: 2, name: 'Jane', updateCounter: 1, updatedAt: expect.any(Date), alwaysNull: null },
				{ id: 3, name: 'Jack', updateCounter: 1, updatedAt: expect.any(Date), alwaysNull: null },
				{ id: 4, name: 'Jill', updateCounter: 1, updatedAt: expect.any(Date), alwaysNull: null },
			]);

			const initialRecord = initial.find((record) => record.id === 1);
			const updatedRecord = justDates.find((record) => record.id === 1);

			expect(initialRecord?.updatedAt?.valueOf()).not.toBe(updatedRecord?.updatedAt?.valueOf());

			const msDelay = 5000;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		// mySchema tests
		test.concurrent('mySchema :: select all fields', async ({ db }) => {
			await db.insert(usersMySchemaTable).values({ id: 1, name: 'John' });
			const result = await db.select().from(usersMySchemaTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('mySchema :: select sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersMySchemaTable.name})`,
			}).from(usersMySchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('mySchema :: select typed sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersMySchemaTable.name})`,
			}).from(usersMySchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('mySchema :: select distinct', async ({ db }) => {
			const usersDistinctTable = singlestoreTable('users_distinct', {
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

		test.concurrent('mySchema :: insert returning sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			const [result, _] = await db.insert(usersMySchemaTable).values({ id: 1, name: 'John' });

			expect(result.insertId).toBe(1);
		});

		test.concurrent('mySchema :: delete returning sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

			expect(users[0].affectedRows).toBe(1);
		});

		test.concurrent('mySchema :: update with returning partial', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ id: 1, name: 'John' });
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

		test.concurrent('mySchema :: delete with returning all fields', async ({ db }) => {
			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

			expect(deletedUser[0].affectedRows).toBe(1);
		});

		test.concurrent('mySchema :: insert + select', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ id: 1, name: 'John' });
			const result = await db.select().from(usersMySchemaTable);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

			await db.insert(usersMySchemaTable).values({ id: 2, name: 'Jane' });
			const result2 = await db.select().from(usersMySchemaTable).orderBy(asc(usersMySchemaTable.id));
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test.concurrent('mySchema :: insert with overridden default values', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ id: 1, name: 'John', verified: true });
			const result = await db.select().from(usersMySchemaTable);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('mySchema :: insert many', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ id: 3, name: 'Jane' },
				{ id: 4, name: 'Austin', verified: true },
			]);
			const result = await db.select({
				id: usersMySchemaTable.id,
				name: usersMySchemaTable.name,
				jsonb: usersMySchemaTable.jsonb,
				verified: usersMySchemaTable.verified,
			}).from(usersMySchemaTable)
				.orderBy(asc(usersMySchemaTable.id));

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test.concurrent('mySchema :: select with group by as field', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, {
				id: 3,
				name: 'Jane',
			}]);

			const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.name)
				.orderBy(asc(usersMySchemaTable.id));

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test.concurrent('mySchema :: select with group by as column + sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, {
				id: 3,
				name: 'Jane',
			}]);

			const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.id, sql`${usersMySchemaTable.name}`)
				.orderBy(asc(usersMySchemaTable.id));

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test.concurrent('mySchema :: build query', async ({ db }) => {
			const query = db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.id, usersMySchemaTable.name)
				.toSQL();

			expect(query).toEqual({
				sql:
					`select \`id\`, \`name\` from \`mySchema\`.\`userstest\` group by \`mySchema\`.\`userstest\`.\`id\`, \`mySchema\`.\`userstest\`.\`name\``,
				params: [],
			});
		});

		test.concurrent('mySchema :: insert with spaces', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ id: 1, name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
				usersMySchemaTable,
			);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test.concurrent('mySchema :: prepared statement with placeholder in .where', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ id: 1, name: 'John' });
			const stmt = db.select({
				id: usersMySchemaTable.id,
				name: usersMySchemaTable.name,
			}).from(usersMySchemaTable)
				.where(eq(usersMySchemaTable.id, sql.placeholder('id')))
				.prepare();
			const result = await stmt.execute({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('mySchema :: select from tables with same name from different schema using alias', async ({ db }) => {
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

		test.concurrent('insert $returningId: serial as id', async ({ db }) => {
			const result = await db.insert(usersTable).values({ id: 1, name: 'John' }).$returningId();

			expectTypeOf(result).toEqualTypeOf<{
				id: number;
			}[]>();

			expect(result).toStrictEqual([{ id: 1 }]);
		});

		test.concurrent('insert $returningId: serial as id, batch insert', async ({ db }) => {
			const result = await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'John1' }])
				.$returningId();

			expectTypeOf(result).toEqualTypeOf<{
				id: number;
			}[]>();

			// singlestore auto increments when batch inserting, so the ids increment by one
			expect(result).toStrictEqual([{ id: 2 }, { id: 3 }]);
		});

		test.concurrent('insert $returningId: $default as primary key', async ({ db }) => {
			const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
			let iterator = 0;

			const usersTableDefFn = singlestoreTable('users_default_fn', {
				customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
					const value = uniqueKeys[iterator]!;
					iterator++;
					return value;
				}),
				name: text('name').notNull(),
			});

			await setupReturningFunctionsTest(db);

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

		test.concurrent('insert $returningId: $default as primary key with value', async ({ db }) => {
			const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
			let iterator = 0;

			const usersTableDefFn = singlestoreTable('users_default_fn', {
				customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
					const value = uniqueKeys[iterator]!;
					iterator++;
					return value;
				}),
				name: text('name').notNull(),
			});

			await setupReturningFunctionsTest(db);

			const result = await db.insert(usersTableDefFn).values([{ name: 'John', customId: 'test' }, { name: 'John1' }])
				//    ^?
				.$returningId();

			expectTypeOf(result).toEqualTypeOf<{
				customId: string;
			}[]>();

			expect(result).toStrictEqual([{ customId: 'test' }, { customId: 'ao865jf3mcmkfkk8o5ri495z' }]);
		});

		// TODO: Unkip this test when views are supported
		/* test.skip('mySchema :: view', async ({ db }) => {


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

            await db.insert(citiesMySchemaTable).values([{ id: 1, name: 'New York' }, { id: 2, name: 'Paris' }]);

            await db.insert(users2MySchemaTable).values([
                { id: 1, name: 'John', cityId: 1 },
                { id: 2, name: 'Jane', cityId: 1 },
                { id: 3, name: 'Jack', cityId: 2 },
            ]);

            {
                const result = await db.select().from(newYorkers1).orderBy(asc(newYorkers1.id));
                expect(result).toEqual([
                    { id: 1, name: 'John', cityId: 1 },
                    { id: 2, name: 'Jane', cityId: 1 },
                ]);
            }

            {
                const result = await db.select().from(newYorkers2).orderBy(asc(newYorkers2.id));
                expect(result).toEqual([
                    { id: 1, name: 'John', cityId: 1 },
                    { id: 2, name: 'Jane', cityId: 1 },
                ]);
            }

            {
                const result = await db.select().from(newYorkers3).orderBy(asc(newYorkers3.id));
                expect(result).toEqual([
                    { id: 1, name: 'John', cityId: 1 },
                    { id: 2, name: 'Jane', cityId: 1 },
                ]);
            }

            {
                const result = await db.select({ name: newYorkers1.name }).from(newYorkers1).orderBy(asc(newYorkers1.id));
                expect(result).toEqual([
                    { name: 'John' },
                    { name: 'Jane' },
                ]);
            }

            await db.execute(sql`drop view ${newYorkers1}`);
        }); */

		test.concurrent('limit 0', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.select()
				.from(usersTable)
				.limit(0);

			expect(users).toEqual([]);
		});

		test.concurrent('limit -1', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.select()
				.from(usersTable)
				.limit(-1);

			expect(users.length).toBeGreaterThan(0);
		});

		test.concurrent('sql operator as cte', async ({ db }) => {
			const users = singlestoreTable('users', {
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

		test.concurrent('cross join', async ({ db }) => {
			await db
				.insert(usersTable)
				.values([
					{ name: 'John' },
					{ name: 'Jane' },
				]);

			await db
				.insert(citiesTable)
				.values([
					{ name: 'Seattle' },
					{ name: 'New York City' },
				]);

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

		test.concurrent('left join (lateral)', async ({ db }) => {
			await db
				.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

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
				.leftJoinLateral(sq, sql`true`)
				.orderBy(citiesTable.id);

			expect(res).toStrictEqual([
				{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
				{ cityId: 2, cityName: 'London', userId: null, userName: null },
			]);
		});

		test.concurrent('inner join (lateral)', async ({ db }) => {
			await db
				.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

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
			await db
				.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 2 }, {
				name: 'Patrick',
				cityId: 2,
			}]);

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
				.crossJoinLateral(sq)
				.orderBy(sq.userId, citiesTable.id);

			expect(res).toStrictEqual([
				{
					cityId: 1,
					cityName: 'Paris',
					userId: 1,
					userName: 'John',
				},
				{
					cityId: 2,
					cityName: 'London',
					userId: 2,
					userName: 'Jane',
				},
				{
					cityId: 2,
					cityName: 'London',
					userId: 3,
					userName: 'Patrick',
				},
			]);
		});

		test.concurrent('column.as', async ({ db, push }) => {
			const users = singlestoreTable('users_column_as', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id'),
			});

			const cities = singlestoreTable('cities_column_as', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users, cities });

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
			} finally {
				await db.execute(sql`DROP TABLE ${users}`).catch(() => null);
				await db.execute(sql`DROP TABLE ${cities}`).catch(() => null);
			}
		});

		test.concurrent('select from a many subquery', async ({ db, push }) => {
			const users2Table = singlestoreTable('users_many_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id'),
			});

			const citiesTable = singlestoreTable('cities_many_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ citiesTable, users2Table });

			await db.insert(citiesTable)
				.values([{ name: 'Paris' }, { name: 'London' }]);

			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 2 },
				{ name: 'Jack', cityId: 2 },
			]);

			const res = await db.select({
				population: db.select({ count: count().as('count') }).from(users2Table).where(
					eq(users2Table.cityId, citiesTable.id),
				).as(
					'population',
				),
				name: citiesTable.name,
			}).from(citiesTable);

			expectTypeOf(res).toEqualTypeOf<
				{
					population: number;
					name: string;
				}[]
			>();

			expect(res).toStrictEqual(expect.arrayContaining([{
				population: 1,
				name: 'Paris',
			}, {
				population: 2,
				name: 'London',
			}]));
		});

		test.concurrent('select from a one subquery', async ({ db, push }) => {
			const users2Table = singlestoreTable('users_one_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id'),
			});

			const citiesTable = singlestoreTable('cities_one_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ citiesTable, users2Table });

			await db.insert(citiesTable)
				.values([{ name: 'Paris' }, { name: 'London' }]);

			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 2 },
				{ name: 'Jack', cityId: 2 },
			]);

			const res = await db.select({
				cityName: db.select({ name: citiesTable.name }).from(citiesTable).where(eq(users2Table.cityId, citiesTable.id))
					.as(
						'cityName',
					),
				name: users2Table.name,
			}).from(users2Table);

			expectTypeOf(res).toEqualTypeOf<
				{
					cityName: string;
					name: string;
				}[]
			>();

			expect(res).toStrictEqual(expect.arrayContaining([{
				cityName: 'Paris',
				name: 'John',
			}, {
				cityName: 'London',
				name: 'Jane',
			}, {
				cityName: 'London',
				name: 'Jack',
			}]));
		});

		test.concurrent('test $onUpdateFn and $onUpdate works with sql value', async ({ db, push }) => {
			const users = singlestoreTable('users_on_update_sql', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				updatedAt: timestamp('updated_at')
					.notNull()
					.$onUpdate(() => sql`current_timestamp`),
			});

			await push({ users });

			await db.insert(users).values({
				name: 'John',
			});
			const insertResp = await db.select({ updatedAt: users.updatedAt }).from(users);
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const now = Date.now();
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await db.update(users).set({
				name: 'John',
			});
			const updateResp = await db.select({ updatedAt: users.updatedAt }).from(users);

			expect(insertResp[0]?.updatedAt.getTime() ?? 0).lessThan(now);
			expect(updateResp[0]?.updatedAt.getTime() ?? 0).greaterThan(now);
		});

		test.concurrent('placeholder + sql dates', async ({ db, push }) => {
			const dateTable = singlestoreTable('dates_placeholder_test', (t) => ({
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

		test.concurrent('all types', async ({ db }) => {
			await db.execute(sql`drop table if exists ${allTypesTable};`);
			await db.execute(sql`
                CREATE TABLE \`all_types\` (
                        \`scol\` serial,
                        \`bigint53\` bigint,
                        \`bigint64\` bigint,
                        \`bigint_string\` bigint,
                        \`binary\` binary,
                        \`boolean\` boolean,
                        \`char\` char,
                        \`date\` date,
                        \`date_str\` date,
                        \`datetime\` datetime,
                        \`datetime_str\` datetime,
                        \`decimal\` decimal,
                        \`decimal_num\` decimal(30),
                        \`decimal_big\` decimal(30),
                        \`double\` double,
                        \`float\` float,
                        \`int\` int,
                        \`json\` json,
                        \`med_int\` mediumint,
                        \`small_int\` smallint,
                        \`real\` real,
                        \`text\` text,
                        \`time\` time,
                        \`timestamp\` timestamp,
                        \`timestamp_str\` timestamp,
                        \`tiny_int\` tinyint,
                        \`varbin\` varbinary(16),
                        \`varchar\` varchar(255),
                        \`year\` year,
                        \`enum\` enum('enV1','enV2'),
                        \`vec_i8\` vector(5, I8),
                        \`vec_i16\` vector(5, I16),
                        \`vec_i32\` vector(5, I32),
                        \`vec_i64\` vector(5, I64),
                        \`vec_f32\` vector(5, F32),
                        \`vec_f64\` vector(5, F64),
                        shard key(\`scol\`)
                    );
            `);

			await db.insert(allTypesTable).values({
				serial: 1,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				bigintString: '5044565289845416380',
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
				vectorF32: [0.735482, -0.291647, 1.183529, -2.406378, 0.014263],
				vectorF64: [
					0.3918573842719283,
					-1.682530118745203,
					2.014963587205109,
					-0.005832741903218165,
					0.7841029456712038,
				],
				vectorI8: [-2, 8, 127, 85, -128],
				vectorI16: [-2, 8, 127, 85, -128],
				vectorI32: [15342, -27894, 6271, -10385, 31056],
				vectorI64: [
					4829301283746501823n,
					-7203847501293847201n,
					1623847561928374650n,
					-5938475628374651983n,
					803745610293847561n,
				],
			});

			const rawRes = await db.select().from(allTypesTable);

			type ExpectedType = {
				serial: number;
				bigint53: number | null;
				bigint64: bigint | null;
				bigintString: string | null;
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
				vectorI8: number[] | null;
				vectorI16: number[] | null;
				vectorI32: number[] | null;
				vectorI64: bigint[] | null;
				vectorF32: number[] | null;
				vectorF64: number[] | null;
			}[];

			const expectedRes: ExpectedType = [
				{
					serial: 1,
					bigint53: 9007199254740991,
					bigint64: 5044565289845416380n,
					bigintString: '5044565289845416380',
					binary: '1',
					boolean: true,
					char: 'c',
					date: new Date('2025-03-12T00:00:00.000Z'),
					dateStr: '2025-03-12',
					datetime: new Date('2025-03-12T01:32:41.000Z'),
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
					timestamp: new Date('2025-03-12T01:32:41.000Z'),
					timestampStr: '2025-03-12 01:32:41',
					tinyInt: 7,
					varbin: '1010110101001101',
					varchar: 'VCHAR',
					year: 2025,
					enum: 'enV1',
					vectorF32: [...new Float32Array([0.735482, -0.291647, 1.183529, -2.406378, 0.014263])],
					vectorF64: [
						0.3918573842719283,
						-1.682530118745203,
						2.014963587205109,
						-0.005832741903218165,
						0.7841029456712038,
					],
					vectorI8: [-2, 8, 127, 85, -128],
					vectorI16: [-2, 8, 127, 85, -128],
					vectorI32: [15342, -27894, 6271, -10385, 31056],
					vectorI64: [
						4829301283746501823n,
						-7203847501293847201n,
						1623847561928374650n,
						-5938475628374651983n,
						803745610293847561n,
					],
				},
			];

			expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
			expect(rawRes).toStrictEqual(expectedRes);
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4878
		test.concurrent('.where with isNull in it', async ({ db, push }) => {
			const table = singlestoreTable('table_where_is_null', {
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

			expect(res.length).toBe(2);
			expect(res.find((it) => it.col1 === true && it.col2 === null)).toStrictEqual({ col1: true, col2: null });
			expect(res.find((it) => it.col1 === false && it.col2 === 'qwerty')).toStrictEqual({
				col1: false,
				col2: 'qwerty',
			});
		});
	});
}
