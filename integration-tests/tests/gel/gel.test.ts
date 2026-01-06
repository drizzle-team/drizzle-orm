import {
	and,
	arrayContained,
	arrayContains,
	arrayOverlaps,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	eq,
	type Equal,
	exists,
	getTableColumns,
	gt,
	gte,
	ilike,
	inArray,
	is,
	isNull,
	like,
	lt,
	max,
	min,
	not,
	notInArray,
	or,
	SQL,
	sql,
	type SQLWrapper,
	sum,
	sumDistinct,
} from 'drizzle-orm';
import { drizzle, type GelJsDatabase } from 'drizzle-orm/gel';
import type { GelColumn } from 'drizzle-orm/gel-core';
import {
	alias,
	boolean,
	dateDuration,
	decimal,
	duration,
	except,
	exceptAll,
	foreignKey,
	GelDialect,
	GelPolicy,
	gelPolicy,
	gelSchema,
	gelTable,
	gelTableCreator,
	getTableConfig,
	integer,
	intersect,
	intersectAll,
	json,
	localDate,
	localTime,
	primaryKey,
	relDuration,
	text,
	timestamp,
	timestamptz,
	union,
	unionAll,
	unique,
	uuid as gelUuid,
} from 'drizzle-orm/gel-core';
import createClient, {
	type Client,
	DateDuration,
	Duration,
	LocalDate,
	LocalDateTime,
	LocalTime,
	RelativeDuration,
} from 'gel';
import { v4 as uuidV4 } from 'uuid';
import { afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { Expect } from '~/utils';
import 'zx/globals';
import { TestCache, TestGlobalCache } from './cache';
import relations from './relations';
import { rqbPost, rqbUser } from './schema';

$.quiet = true;

let client: Client;
let db: GelJsDatabase<never, typeof relations>;
let dbGlobalCached: GelJsDatabase;
let cachedDb: GelJsDatabase;
const tlsSecurity: string = 'insecure';
let dsn: string;

// function sleep(ms: number) {
// 	return new Promise((resolve) => setTimeout(resolve, ms));
// }

declare module 'vitest' {
	interface TestContext {
		gel: {
			db: GelJsDatabase<never, typeof relations>;
		};
		cachedGel: {
			db: GelJsDatabase;
			dbGlobalCached: GelJsDatabase;
		};
	}
}

const usersTable = gelTable('users', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	json: json('json').$type<string[]>(),
	createdAt: timestamptz('created_at').notNull().defaultNow(),
});

const postsTable = gelTable('posts', {
	id: integer().primaryKey(),
	description: text().notNull(),
	userId: integer('city_id').references(() => usersTable.id1),
});

const usersOnUpdate = gelTable('users_on_update', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	updateCounter: integer('update_counter')
		.default(sql`1`)
		.$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: timestamptz('updated_at').$onUpdate(() => new Date()),
	alwaysNull: text('always_null')
		.$type<string | null>()
		.$onUpdate(() => null),
});

const citiesTable = gelTable('cities', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	state: text('state'),
});

const cities2Table = gelTable('cities', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
});

const users2Table = gelTable('some_new_users', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	cityId: integer('cityId'),
});

const users3Table = gelTable('users3', {
	id1: integer('id1'),
	name: text('name').notNull(),
});

const coursesTable = gelTable('courses', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	categoryId: integer('categoryId').references(() => courseCategoriesTable.id1),
});

const courseCategoriesTable = gelTable('course_categories', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
});

const orders = gelTable('orders', {
	id1: integer('id1'),
	region: text('region').notNull(),
	product: text('product')
		.notNull()
		.$default(() => 'random_string'),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

const salEmp = gelTable('sal_emp', {
	name: text('name'),
	payByQuarter: integer('pay_by_quarter').array(),
});

const jsonTestTable = gelTable('jsontest', {
	id1: integer('id1').primaryKey(),
	json: json('json').$type<{ string: string; number: number }>(),
});

// To test aggregate functions
const aggregateTable = gelTable('aggregate_table', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('nullOnly'),
});

// To test another schema and multischema
const mySchema = gelSchema('mySchema');

const usersMySchemaTable = mySchema.table('users', {
	id1: integer('id1').notNull(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	json: json('json').$type<string[]>(),
	createdAt: timestamptz('created_at').notNull().defaultNow(),
});

beforeAll(async () => {
	const url = process.env['GEL_CONNECTION_STRING'];
	if (!url) throw new Error('GEL_CONNECTION_STRING is not set');

	client = createClient({ dsn: url, tlsSecurity: 'insecure' });
	db = drizzle({ client, relations });
	cachedDb = drizzle({ client, cache: new TestCache() });
	dbGlobalCached = drizzle({ client, cache: new TestGlobalCache() });

	dsn = url;
});

beforeEach((ctx) => {
	ctx.gel = {
		db,
	};
	ctx.cachedGel = {
		db: cachedDb,
		dbGlobalCached,
	};
});

describe('some', async () => {
	beforeEach(async (ctx) => {
		await ctx.cachedGel.db.$cache?.invalidate({ tables: 'users' });
		await ctx.cachedGel.dbGlobalCached.$cache?.invalidate({ tables: 'users' });
	});
	beforeAll(async () => {
		await $`gel database wipe --tls-security=${tlsSecurity} --dsn=${dsn} --non-interactive`;

		await $`gel query "CREATE TYPE default::users {
		        create property id1: int16 {
		            create constraint exclusive;
		        };
		        create required property name: str;
		  create required property verified: bool {
		      SET default := false;
		  };
		  create PROPERTY json: json;
		  create required property  created_at: datetime {
		      SET default := datetime_of_statement();
		  };
		};
		CREATE TYPE default::users_with_cities {
		create property id1: int16 {
		    create constraint exclusive;
		};
		create required property name: str;
		create property cityId: int32;
		};
		CREATE TYPE default::users_with_undefined {
		    create property id1: int16 {
		        create constraint exclusive;
		    };
		    create property name: str;
		    };
		CREATE TYPE default::users_insert_select {
		        create property id1: int16 {
		            create constraint exclusive;
		        };
		        create property name: str;
		        };
		CREATE MODULE mySchema;
		CREATE TYPE mySchema::users {
		        create property id1: int16;
		        create required property name: str;
		  create required property verified: bool {
		      SET default := false;
		  };
		  create PROPERTY json: json;
		  create required property  created_at: datetime {
		      SET default := datetime_of_statement();
		  };
		};
		CREATE TYPE default::orders {
		CREATE PROPERTY id1 -> int16;
		CREATE REQUIRED PROPERTY region -> str;
		CREATE REQUIRED PROPERTY product -> str;
		CREATE REQUIRED PROPERTY amount -> int64;
		CREATE REQUIRED PROPERTY quantity -> int64;
		};
		CREATE TYPE default::users_distinct {
		create required property id1 -> int16;
		create required property name -> str;
		create required property age -> int16;
		};
		CREATE TYPE default::users3 {
		create property id1 -> int16;
		create required property name -> str;
		};
		CREATE TYPE default::cities {
		create required property id1 -> int16;
		create required property name -> str;
		create property state -> str;
		};
		CREATE TYPE default::courses {
		create required property id1 -> int16;
		create required property name -> str;
		create property categoryId -> int16;
		};
		CREATE TYPE default::course_categories {
		create required property id1 -> int16;
		create required property name -> str;
		};
		CREATE TYPE default::jsontest {
		create property id1 -> int16;
		create required property json -> json;
		};
		CREATE TYPE default::sal_emp {
		create property name -> str;
		create property pay_by_quarter -> array<int16>;
		};
		CREATE TYPE default::some_new_users {
		create required property id1 -> int16;
		create required property name -> str;
		create property cityId -> int32;
		};
		CREATE TYPE default::aggregate_table {
		create property id1: int16;
		create required property name: str;
		create property a: int16;
		create property b: int16;
		create property c: int16;
		create PROPERTY nullOnly: int16;
		};
		CREATE TYPE default::prefixed_users {
		CREATE PROPERTY id1 -> int16;
		CREATE REQUIRED PROPERTY name -> str;
		};
		CREATE TYPE default::empty_insert_single {
		CREATE PROPERTY id1 -> int16;
		CREATE REQUIRED PROPERTY name -> str {
		SET default := 'Dan';
		};
		CREATE PROPERTY state -> str;
		};
		CREATE TYPE default::empty_insert_multiple {
		CREATE PROPERTY id1 -> int16;
		CREATE REQUIRED PROPERTY name -> str {
		SET default := 'Dan';
		};
		CREATE PROPERTY state -> str;
		};
		CREATE TYPE default::products {
		CREATE PROPERTY id1 -> int16;
		CREATE REQUIRED PROPERTY price -> decimal;
		CREATE REQUIRED PROPERTY cheap -> bool {
		SET default := false
		};
		};
		CREATE TYPE default::myprefix_test_prefixed_table_with_unique_name {
		create property id1 -> int16;
		create required property name -> str;
		};
		CREATE TYPE default::metric_entry {
		create required property id1 -> uuid;
		create required property createdAt -> datetime;
		};
		CREATE TYPE default::users_transactions {
		create required property id1 -> int16;
		create required property balance -> int16;
		};
		CREATE TYPE default::products_transactions {
		create required property id1 -> int16;
		create required property price -> int16;
		create required property stock -> int16;
		};
		CREATE TYPE default::users_transactions_rollback {
		create required property id1 -> int16;
		create required property balance -> int16;
		};
		CREATE TYPE default::users_nested_transactions {
		create required property id1 -> int16;
		create required property balance -> int16;
		};
		CREATE TYPE default::internal_staff {
		create required property userId -> int16;
		};
		CREATE TYPE default::custom_user {
		create required property id1 -> int16;
		};
		CREATE TYPE default::ticket {
		create required property staffId -> int16;
		};
		CREATE TYPE default::posts {
		create required property id1 -> int16;
		create property tags -> array<str>;
		};
		CREATE TYPE dates_column {
		create property datetimeColumn -> datetime;
		create property local_datetimeColumn -> cal::local_datetime;
		create property local_dateColumn -> cal::local_date;
		create property local_timeColumn -> cal::local_time;
		create property durationColumn -> duration;
		create property relative_durationColumn -> cal::relative_duration;
		create property dateDurationColumn -> cal::date_duration;
		};
		CREATE TYPE users_with_insert {
		create required property username -> str;
		create required property admin -> bool;
		};
		CREATE TYPE users_test_with_and_without_timezone {
		create required property username -> str;
		create required property admin -> bool;
		};
		CREATE TYPE default::arrays_tests {
		create property id1: int16 {
		    create constraint exclusive;
		};
		create property tags: array<str>;
		create required property numbers: array<int32>;
		};
		CREATE TYPE default::users_on_update {
		create required property id1 -> int16;
		create required property name -> str;
		create property update_counter -> int16 {
		    SET default := 1
		};
		create property always_null -> str;
		create property updated_at -> datetime;
		};
		CREATE TYPE default::json_table {
		create PROPERTY json: json;
		};
		CREATE TYPE default::notifications {
		create required property id1 -> int16;
		 create required property  sentAt: datetime {
		      SET default := datetime_of_statement();
		  };
		create property message -> str;
		};
		CREATE TYPE default::user_notifications {
		create required property userId -> int16;
		create required property notificationId -> int16;
		create property categoryId -> int16;
		};
		CREATE TYPE default::users1 {
		create required property id1: int16;
		create required property name: str;
		};
		CREATE TYPE default::users2 {
		create required property id1: int16;
		create required property name: str;
		};
		CREATE TYPE default::count_test {
		create required property id1: int16;
		create required property name: str;
		};
		CREATE TYPE default::users_with_names {
		create required property id1: int16;
		create required property firstName: str;
		create required property lastName: str;
		create required property admin: bool;
		};
		CREATE TYPE default::users_with_age {
		    create required property id1: int16;
		    create required property name: str;
		    create required property age: int32;
		    create required property city: str;
		    };
		CREATE TYPE default::user_rqb_test {
		    create property custom_id: int32 {
		        create constraint exclusive;
		    };
		    create property name: str;
			create required property created_at -> datetime;
		};
		CREATE TYPE default::post_rqb_test {
		    create property custom_id: int32 {
		        create constraint exclusive;
		    };
		    create required property user_id: int32;
		    create property content: str;
			create required property created_at -> datetime;
		};
		CREATE TYPE default::users_on_update_sql {
			create required property id1: int16;
			create required property name: str;
			create required property updated_at: datetime;
		};
		CREATE TYPE default::table_where_is_null {
			create required property col1: bool;
			create property col2: str;
		};
		" --tls-security=${tlsSecurity} --dsn=${dsn}`;
	});

	afterEach(async () => {
		await Promise.all([
			client.querySQL(`DELETE FROM "users";`),
			client.querySQL(`DELETE FROM "prefixed_users";`),
			client.querySQL(`DELETE FROM "some_new_users";`),
			client.querySQL(`DELETE FROM "orders";`),
			client.querySQL(`DELETE FROM "cities";`),
			client.querySQL(`DELETE FROM "users_on_update";`),
			client.querySQL(`DELETE FROM "aggregate_table";`),
			client.querySQL(`DELETE FROM "count_test"`),
			client.querySQL(`DELETE FROM "users1"`),
			client.querySQL(`DELETE FROM "users2"`),
			client.querySQL(`DELETE FROM "jsontest"`),
			client.querySQL(`DELETE FROM "user_rqb_test"`),
			client.querySQL(`DELETE FROM "post_rqb_test"`),
			client.querySQL(`DELETE FROM "mySchema"."users";`),
			client.querySQL(`DELETE FROM "users_on_update_sql";`),
			client.querySQL(`DELETE FROM "table_where_is_null";`),
		]);
	});

	async function setupSetOperationTest(db: GelJsDatabase<any, any>) {
		await db.insert(cities2Table).values([
			{ id1: 1, name: 'New York' },
			{ id1: 2, name: 'London' },
			{ id1: 3, name: 'Tampa' },
		]);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId: 1 },
			{ id1: 2, name: 'Jane', cityId: 2 },
			{ id1: 3, name: 'Jack', cityId: 3 },
			{ id1: 4, name: 'Peter', cityId: 3 },
			{ id1: 5, name: 'Ben', cityId: 2 },
			{ id1: 6, name: 'Jill', cityId: 1 },
			{ id1: 7, name: 'Mary', cityId: 2 },
			{ id1: 8, name: 'Sally', cityId: 1 },
		]);
	}

	async function setupAggregateFunctionsTest(db: GelJsDatabase<any, any>) {
		await db.insert(aggregateTable).values([
			{ id1: 1, name: 'value 1', a: 5, b: 10, c: 20 },
			{ id1: 2, name: 'value 1', a: 5, b: 20, c: 30 },
			{ id1: 3, name: 'value 2', a: 10, b: 50, c: 60 },
			{ id1: 4, name: 'value 3', a: 20, b: 20, c: null },
			{ id1: 5, name: 'value 4', a: null, b: 90, c: 120 },
			{ id1: 6, name: 'value 5', a: 80, b: 10, c: null },
			{ id1: 7, name: 'value 6', a: null, b: null, c: 150 },
		]);
	}

	test('table configs: unique third param', async () => {
		const cities1Table = gelTable(
			'cities1',
			{
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			},
			(t) => [unique('custom_name').on(t.name, t.state).nullsNotDistinct(), unique('custom_name1').on(t.name, t.state)],
		);

		const tableConfig = getTableConfig(cities1Table);

		expect(tableConfig.uniqueConstraints).toHaveLength(2);

		expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
		expect(tableConfig.uniqueConstraints[0]?.nullsNotDistinct).toBe(true);
		expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

		expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
		expect(tableConfig.uniqueConstraints[1]?.nullsNotDistinct).toBe(false);
		expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
	});

	test('table configs: unique in column', async () => {
		const cities1Table = gelTable('cities1', {
			id: integer('id').primaryKey(),
			name: text('name').notNull().unique(),
			state: text('state').unique('custom'),
			field: text('field').unique('custom_field', { nulls: 'not distinct' }),
		});

		const tableConfig = getTableConfig(cities1Table);

		const columnName = tableConfig.columns.find((it) => it.name === 'name');

		expect(columnName?.uniqueName).toBe(undefined);
		expect(columnName?.isUnique).toBe(true);

		const columnState = tableConfig.columns.find((it) => it.name === 'state');
		expect(columnState?.uniqueName).toBe('custom');
		expect(columnState?.isUnique).toBe(true);

		const columnField = tableConfig.columns.find((it) => it.name === 'field');
		expect(columnField?.uniqueName).toBe('custom_field');
		expect(columnField?.isUnique).toBe(true);
		expect(columnField?.uniqueType).toBe('not distinct');
	});

	test('table config: foreign keys name', async () => {
		const table = gelTable(
			'cities',
			{
				id1: integer('id1').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			},
			(t) => [foreignKey({ foreignColumns: [t.id1], columns: [t.id1], name: 'custom_fk' })],
		);

		const tableConfig = getTableConfig(table);

		expect(tableConfig.foreignKeys).toHaveLength(1);
		expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
	});

	test('table config: primary keys name', async () => {
		const table = gelTable(
			'cities',
			{
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			},
			(t) => [primaryKey({ columns: [t.id, t.name], name: 'custom_pk' })],
		);

		const tableConfig = getTableConfig(table);

		expect(tableConfig.primaryKeys).toHaveLength(1);
		expect(tableConfig.primaryKeys[0]!.getName()).toBe('custom_pk');
	});

	test('select all fields', async (ctx) => {
		const { db } = ctx.gel;

		const now = Date.now();

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		const result = await db.select().from(usersTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// TODO 100 ms
		expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(500);
		expect(result.map((it) => ({ ...it, id: undefined }))).toEqual([
			{
				id: undefined,
				id1: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			},
		]);
	});

	test('select sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db
			.select({
				name: sql`upper(${usersTable.name})`,
			})
			.from(usersTable);

		expect(users.map((it) => ({ ...it, id: undefined }))).toStrictEqual([{ id: undefined, name: 'JOHN' }]);
	});

	test('select typed sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		const users = await db
			.select({
				name: sql<string>`upper(${usersTable.name})`,
			})
			.from(usersTable);

		expect(users.map((it) => ({ ...it, id: undefined }))).toEqual([{ name: 'JOHN' }]);
	});

	test('select with empty array in inArray', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);
		const result = await db
			.select({
				name: sql`upper(${usersTable.name})`,
			})
			.from(usersTable)
			.where(inArray(usersTable.id1, []));

		expect(result.map((it) => ({ ...it, id: undefined }))).toEqual([]);
	});

	test('select with empty array in notInArray', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);
		const result = await db
			.select({
				name: sql`upper(${usersTable.name})`,
			})
			.from(usersTable)
			.where(notInArray(usersTable.id1, []));

		expect(result.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ name: 'JOHN' },
			{ name: 'JANE' },
			{
				name: 'JANE',
			},
		]);
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/4878
	test.concurrent('.where with isNull in it', async (ctx) => {
		const { db } = ctx.gel;
		const table = gelTable('table_where_is_null', {
			col1: boolean(),
			col2: text(),
		});

		await db.insert(table).values([{ col1: true }, { col1: false, col2: 'qwerty' }]);

		const query = db.select().from(table).where(eq(table.col1, isNull(table.col2)));
		expect(query.toSQL()).toStrictEqual({
			sql:
				'select "table_where_is_null"."col1", "table_where_is_null"."col2" from "table_where_is_null" where "table_where_is_null"."col1" = ("table_where_is_null"."col2" is null)',
			params: [],
		});
		const res = await query;
		expect(res).toStrictEqual([{ col1: true, col2: null }, { col1: false, col2: 'qwerty' }]);
	});

	test('$default function', async (ctx) => {
		const { db } = ctx.gel;

		const insertedOrder = await db.insert(orders).values({ id1: 1, region: 'Ukraine', amount: 1, quantity: 1 })
			.returning();
		const selectedOrder = await db.select().from(orders);

		expect(insertedOrder.map((it) => ({ ...it, id: undefined }))).toEqual([
			{
				id: undefined,
				amount: 1,
				id1: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			},
		]);

		expect(selectedOrder.map((it) => ({ ...it, id: undefined }))).toEqual([
			{
				id: undefined,
				id1: 1,
				amount: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			},
		]);
	});

	test('select distinct', async (ctx) => {
		const { db } = ctx.gel;

		const usersDistinctTable = gelTable('users_distinct', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
			age: integer('age').notNull(),
		});

		await db.insert(usersDistinctTable).values([
			{ id1: 1, name: 'John', age: 24 },
			{ id1: 1, name: 'John', age: 24 },
			{ id1: 2, name: 'John', age: 25 },
			{ id1: 1, name: 'Jane', age: 24 },
			{ id1: 1, name: 'Jane', age: 26 },
		]);

		const users1 = await db.selectDistinct().from(usersDistinctTable).orderBy(
			usersDistinctTable.id1,
			usersDistinctTable.name,
		);

		const users2 = await db.selectDistinctOn([usersDistinctTable.id1]).from(usersDistinctTable).orderBy(
			usersDistinctTable.id1,
		);

		const users3 = await db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
			usersDistinctTable,
		).orderBy(usersDistinctTable.name);

		const users4 = await db.selectDistinctOn([usersDistinctTable.id1, usersDistinctTable.age]).from(
			usersDistinctTable,
		).orderBy(usersDistinctTable.id1, usersDistinctTable.age);

		expect(users1).toEqual([
			{ id1: 1, name: 'Jane', age: 24 },
			{ id1: 1, name: 'Jane', age: 26 },
			{ id1: 1, name: 'John', age: 24 },
			{ id1: 2, name: 'John', age: 25 },
		]);

		expect(users2).toHaveLength(2);
		expect(users2[0]?.id1).toBe(1);
		expect(users2[1]?.id1).toBe(2);

		expect(users3).toHaveLength(2);
		expect(users3[0]?.name).toBe('Jane');
		expect(users3[1]?.name).toBe('John');

		expect(users4).toEqual([
			{ id1: 1, name: 'John', age: 24 },
			{ id1: 1, name: 'Jane', age: 26 },
			{ id1: 2, name: 'John', age: 25 },
		]);
	});

	test('insert returning sql', async (ctx) => {
		const { db } = ctx.gel;

		const users = await db
			.insert(usersTable)
			.values({ id1: 1, name: 'John' })
			.returning({
				name: sql`upper(${usersTable.name})`,
			});

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('delete returning sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db
			.delete(usersTable)
			.where(eq(usersTable.name, 'John'))
			.returning({
				name: sql`upper(${usersTable.name})`,
			});

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('update returning sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db
			.update(usersTable)
			.set({ name: 'Jane' })
			.where(eq(usersTable.name, 'John'))
			.returning({
				name: sql`upper(${usersTable.name})`,
			});

		expect(users).toEqual([{ name: 'JANE' }]);
	});

	test('update with returning all fields', async (ctx) => {
		const { db } = ctx.gel;

		const now = Date.now();

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning();

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(500);
		expect(users).toEqual([
			{
				id1: 1,
				name: 'Jane',
				verified: false,
				json: null,
				createdAt: users[0]!.createdAt,
			},
		]);
	});

	test('update with returning partial', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
			id1: usersTable.id1,
			name: usersTable.name,
		});

		expect(users).toEqual([{ id1: 1, name: 'Jane' }]);
	});

	test('delete with returning all fields', async (ctx) => {
		const { db } = ctx.gel;

		const now = Date.now();

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(500);
		expect(users.map((it) => ({ ...it, id: undefined }))).toEqual([
			{
				name: 'John',
				id1: 1,
				id: undefined,
				verified: false,
				json: null,
				createdAt: users[0]!.createdAt,
			},
		]);
	});

	test('delete with returning partial', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
			id1: usersTable.id1,
			name: usersTable.name,
		});

		expect(users.map((it) => ({ ...it, id: undefined }))).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('insert + select', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const result = await db.select().from(usersTable);
		expect(result).toEqual([
			{
				name: 'John',
				id1: 1,
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			},
		]);

		await db.insert(usersTable).values({ id1: 2, name: 'Jane' });
		const result2 = await db.select().from(usersTable);
		expect(result2).toEqual([
			{ id1: 1, name: 'John', verified: false, json: null, createdAt: result2[0]!.createdAt },
			{ id1: 2, name: 'Jane', verified: false, json: null, createdAt: result2[1]!.createdAt },
		]);
	});

	test('json insert', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John', json: ['foo', 'bar'] });
		const result = await db
			.select({
				id1: usersTable.id1,
				name: usersTable.name,
				json: usersTable.json,
			})
			.from(usersTable);

		expect(result).toEqual([
			{
				id1: 1,
				name: 'John',
				json: ['foo', 'bar'],
			},
		]);
	});

	test('insert with overridden default values', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John', verified: true });
		const result = await db.select().from(usersTable);

		expect(result).toEqual([
			{
				id1: 1,
				name: 'John',
				verified: true,
				json: null,
				createdAt: result[0]!.createdAt,
			},
		]);
	});

	test('insert many', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Bruce', json: ['foo', 'bar'], verified: true },
			{ id1: 3, name: 'Jane' },
			{ id1: 4, name: 'Austin', verified: true },
		]);
		const result = await db
			.select({
				name: usersTable.name,
				json: usersTable.json,
				verified: usersTable.verified,
			})
			.from(usersTable);

		expect(result).toEqual([
			{ name: 'John', json: null, verified: false },
			{ name: 'Bruce', json: ['foo', 'bar'], verified: true },
			{ name: 'Jane', json: null, verified: false },
			{ name: 'Austin', json: null, verified: true },
		]);
	});

	test('insert many with returning', async (ctx) => {
		const { db } = ctx.gel;

		const result = await db
			.insert(usersTable)
			.values([
				{ id1: 1, name: 'John' },
				{ id1: 2, name: 'Bruce', json: ['foo', 'bar'] },
				{ id1: 3, name: 'Jane' },
				{
					id1: 4,
					name: 'Austin',
					verified: true,
				},
			])
			.returning({
				name: usersTable.name,
				json: usersTable.json,
				verified: usersTable.verified,
			});

		expect(result).toEqual([
			{ name: 'John', json: null, verified: false },
			{ name: 'Bruce', json: ['foo', 'bar'], verified: false },
			{ name: 'Jane', json: null, verified: false },
			{ name: 'Austin', json: null, verified: true },
		]);
	});

	test('select with group by as field', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db.select({ name: usersTable.name }).from(usersTable).groupBy(usersTable.name);

		expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
	});

	test('select with exists', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const user = alias(usersTable, 'user');
		const result = await db
			.select({ name: usersTable.name })
			.from(usersTable)
			.where(
				exists(
					db
						.select({ one: sql`1` })
						.from(user)
						.where(and(eq(usersTable.name, 'John'), eq(user.id1, usersTable.id1))),
				),
			);

		expect(result).toEqual([{ name: 'John' }]);
	});

	test('select with group by as sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db
			.select({ name: usersTable.name })
			.from(usersTable)
			.groupBy(sql`${usersTable.name}`);

		expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
	});

	test.skip('select with group by as sql + column', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db
			.select({ name: usersTable.name })
			.from(usersTable)
			.groupBy(sql`${usersTable.name}`, usersTable.id1);

		expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }, { name: 'Jane' }]);
	});

	test('select with group by as column + sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db
			.select({ name: usersTable.name })
			.from(usersTable)
			.groupBy(usersTable.id1, sql`${usersTable.name}`);

		expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test('select with group by complex query', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db
			.select({ name: usersTable.name })
			.from(usersTable)
			.groupBy(usersTable.id1, sql`${usersTable.name}`)
			.orderBy(asc(usersTable.name))
			.limit(1);

		expect(result).toEqual([{ name: 'Jane' }]);
	});

	test('build query', async (ctx) => {
		const { db } = ctx.gel;

		const query = db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable).groupBy(
			usersTable.id1,
			usersTable.name,
		).toSQL();

		expect(query).toEqual({
			sql: 'select "users"."id1", "users"."name" from "users" group by "users"."id1", "users"."name"',
			params: [],
		});
	});

	test('insert sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: sql`${'John'}` });
		const result = await db.select({ name: usersTable.name }).from(usersTable);
		expect(result).toEqual([{ name: 'John' }]);
	});

	test('partial join with alias', async (ctx) => {
		const { db } = ctx.gel;
		const customerAlias = alias(usersTable, 'customer');

		await db.insert(usersTable).values([
			{ id1: 10, name: 'Ivan' },
			{ id1: 11, name: 'Hans' },
		]);
		const result = await db
			.select({
				user: {
					id1: usersTable.id1,
					name: usersTable.name,
				},
				customer: {
					id1: customerAlias.id1,
					name: customerAlias.name,
				},
			})
			.from(usersTable)
			.leftJoin(customerAlias, eq(customerAlias.id1, 11))
			.where(eq(usersTable.id1, 10));

		expect(result).toEqual([
			{
				user: { id1: 10, name: 'Ivan' },
				customer: { id1: 11, name: 'Hans' },
			},
		]);
	});

	test('full join with alias', async (ctx) => {
		const { db } = ctx.gel;

		const gelTable = gelTableCreator((name) => `prefixed_${name}`);

		const users = gelTable('users', {
			id1: integer('id1').primaryKey(),
			name: text('name').notNull(),
		});

		const customers = alias(users, 'customer');

		await db.insert(users).values([
			{ id1: 10, name: 'Ivan' },
			{ id1: 11, name: 'Hans' },
		]);
		const result = await db.select().from(users).leftJoin(customers, eq(customers.id1, 11)).where(
			eq(users.id1, 10),
		);

		expect(result).toEqual([
			{
				users: {
					id1: 10,
					name: 'Ivan',
				},
				customer: {
					id1: 11,
					name: 'Hans',
				},
			},
		]);
	});

	test('select from alias', async (ctx) => {
		const { db } = ctx.gel;

		const gelTable = gelTableCreator((name) => `prefixed_${name}`);

		const users = gelTable('users', {
			id1: integer('id1'),
			name: text('name').notNull(),
		});

		const user = alias(users, 'user');
		const customers = alias(users, 'customer');

		await db.insert(users).values([
			{ id1: 10, name: 'Ivan' },
			{ id1: 11, name: 'Hans' },
		]);
		const result = await db.select().from(user).leftJoin(customers, eq(customers.id1, 11)).where(eq(user.id1, 10));

		expect(result).toEqual([
			{
				user: {
					id1: 10,
					name: 'Ivan',
				},
				customer: {
					id1: 11,
					name: 'Hans',
				},
			},
		]);
	});

	test('insert with spaces', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: sql`'Jo   h     n'` });
		const result = await db.select({ id1: usersTable.id1, name: usersTable.name }).from(usersTable);

		expect(result).toEqual([{ id1: 1, name: 'Jo   h     n' }]);
	});

	test('prepared statement', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const statement = db
			.select({
				name: usersTable.name,
			})
			.from(usersTable)
			.prepare('statement1');
		const result = await statement.execute();

		expect(result).toEqual([{ name: 'John' }]);
	});

	test('insert: placeholders on columns with encoder', async (ctx) => {
		const { db } = ctx.gel;

		const statement = db
			.insert(usersTable)
			.values({
				id1: 1,
				name: 'John',
				json: sql.placeholder('json'),
			})
			.prepare('encoder_statement');

		await statement.execute({ json: ['foo', 'bar'] });

		const result = await db
			.select({
				json: usersTable.json,
			})
			.from(usersTable);

		expect(result).toEqual([{ json: ['foo', 'bar'] }]);
	});

	test('prepared statement reuse', async (ctx) => {
		const { db } = ctx.gel;

		const stmt = db
			.insert(usersTable)
			.values({
				id1: sql.placeholder('id1'),
				verified: true,
				name: sql.placeholder('name'),
			})
			.prepare('stmt2');

		for (let i = 1; i < 11; i++) {
			await stmt.execute({ id1: i, name: `John ${i}` });
		}

		const result = await db
			.select({
				name: usersTable.name,
				verified: usersTable.verified,
			})
			.from(usersTable);

		expect(result).toEqual([
			{ name: 'John 1', verified: true },
			{ name: 'John 2', verified: true },
			{ name: 'John 3', verified: true },
			{ name: 'John 4', verified: true },
			{ name: 'John 5', verified: true },
			{ name: 'John 6', verified: true },
			{ name: 'John 7', verified: true },
			{ name: 'John 8', verified: true },
			{ name: 'John 9', verified: true },
			{ name: 'John 10', verified: true },
		]);
	});

	test('prepared statement with placeholder in .where', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const stmt = db
			.select({
				id1: usersTable.id1,
				name: usersTable.name,
			})
			.from(usersTable)
			.where(eq(usersTable.id1, sql.placeholder('id1')))
			.prepare('stmt3');
		const result = await stmt.execute({ id1: 1 });

		expect(result).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('prepared statement with placeholder in .limit', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const stmt = db
			.select({
				id1: usersTable.id1,
				name: usersTable.name,
			})
			.from(usersTable)
			.where(eq(usersTable.id1, sql.placeholder('id1')))
			.limit(sql.placeholder('limit'))
			.prepare('stmt_limit');

		const result = await stmt.execute({ id1: 1, limit: 1 });

		expect(result).toEqual([{ id1: 1, name: 'John' }]);
		expect(result).toHaveLength(1);
	});

	test('prepared statement with placeholder in .offset', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'John1' },
		]);
		const stmt = db
			.select({
				id1: usersTable.id1,
				name: usersTable.name,
			})
			.from(usersTable)
			.offset(sql.placeholder('offset'))
			.prepare('stmt_offset');

		const result = await stmt.execute({ offset: 1 });

		expect(result).toEqual([{ id1: 2, name: 'John1' }]);
	});

	test('prepared statement built using $dynamic', async (ctx) => {
		const { db } = ctx.gel;

		function withLimitOffset(qb: any) {
			return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
		}

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'John1' },
		]);
		const stmt = db
			.select({
				id1: usersTable.id1,
				name: usersTable.name,
			})
			.from(usersTable)
			.$dynamic();
		withLimitOffset(stmt).prepare('stmt_limit');

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toEqual([{ id1: 2, name: 'John1' }]);
		expect(result).toHaveLength(1);
	});

	test('Query check: Insert all defaults in 1 row', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users', {
			id: integer('id'),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		const query = db.insert(users).values({}).toSQL();

		expect(query).toEqual({
			sql: 'insert into "users" ("id", "name", "state") values (default, default, default)',
			params: [],
		});
	});

	test('Query check: Insert all defaults in multiple rows', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users', {
			id: integer('id'),
			name: text('name').default('Dan'),
			state: text('state').default('UA'),
		});

		const query = db.insert(users).values([{}, {}]).toSQL();

		expect(query).toEqual({
			sql:
				'insert into "users" ("id", "name", "state") values (default, default, default), (default, default, default)',
			params: [],
		});
	});

	test('Insert all defaults in 1 row', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('empty_insert_single', {
			id1: integer('id1'),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		await db.insert(users).values({});

		const res = await db.select().from(users);

		expect(res).toEqual([{ id1: null, name: 'Dan', state: null }]);
	});

	test('Insert all defaults in multiple rows', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('empty_insert_multiple', {
			id: integer('id'),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		await db.insert(users).values([{}, {}]);

		const res = await db.select().from(users);

		expect(res.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id: undefined, name: 'Dan', state: null },
			{ id: undefined, name: 'Dan', state: null },
		]);
	});

	// TODO not supported in gel
	test.todo('build query insert with onConflict do update', async (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.insert(usersTable)
			.values({ id1: 1, name: 'John', json: ['foo', 'bar'] })
			// .onConflictDoUpdate({ target: usersTable.id1, set: { name: 'John1' } })
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into "users" ("id1", "name", "verified", "json", "created_at") values ($1, $2, default, $3, default) on conflict ("id1") do update set "name" = $4',
			params: [1, 'John', ['foo', 'bar'], 'John1'],
		});
	});

	// TODO on conflict not supported in gel
	test.todo('build query insert with onConflict do update / multiple columns', async (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.insert(usersTable)
			.values({ id1: 1, name: 'John', json: ['foo', 'bar'] })
			// .onConflictDoUpdate({ target: [usersTable.id1, usersTable.name], set: { name: 'John1' } })
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into "users" ("id1", "name", "verified", "json", "created_at") values ($1, $2, default, $3, default) on conflict ("id1","name") do update set "name" = $4',
			params: [1, 'John', ['foo', 'bar'], 'John1'],
		});
	});

	// TODO on conflict not supported in gel
	test.todo('build query insert with onConflict do nothing', async (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.insert(usersTable)
			.values({ id1: 1, name: 'John', json: ['foo', 'bar'] })
			// .onConflictDoNothing()
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into "users" ("id1", "name", "verified", "json", "created_at") values ($1, $2, default, 32, default) on conflict do nothing',
			params: [1, 'John', ['foo', 'bar']],
		});
	});

	// TODO on conflict not supported
	test.todo('build query insert with onConflict do nothing + target', async (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.insert(usersTable)
			.values({ id1: 1, name: 'John', json: ['foo', 'bar'] })
			// .onConflictDoNothing({ target: usersTable.id1 })
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into "users" ("id1", "name", "verified", "json", "created_at") values ($1, $2, default, $3, default) on conflict ("id1") do nothing',
			params: [1, 'John', ['foo', 'bar']],
		});
	});

	// TODO on conflict not supported in gel
	test.todo('insert with onConflict do update', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		await db
			.insert(usersTable)
			.values({ id1: 1, name: 'John' });
		// .onConflictDoUpdate({ target: usersTable.id1, set: { name: 'John1' } });

		const res = await db.select({ id1: usersTable.id1, name: usersTable.name }).from(usersTable).where(
			eq(usersTable.id1, 1),
		);

		expect(res).toEqual([{ id1: 1, name: 'John1' }]);
	});

	// TODO on conflict does not supported
	test.todo('insert with onConflict do nothing', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		// await db.insert(usersTable).values({ id1: 1, name: 'John' }).onConflictDoNothing();

		const res = await db.select({ id1: usersTable.id1, name: usersTable.name }).from(usersTable).where(
			eq(usersTable.id1, 1),
		);

		expect(res).toEqual([{ id1: 1, name: 'John' }]);
	});

	// TODO on conflict does not supported
	test.todo('insert with onConflict do nothing + target', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		// await db.insert(usersTable).values({ id1: 1, name: 'John' }).onConflictDoNothing({
		// target: usersTable.id1,
		// });

		const res = await db.select({ id1: usersTable.id1, name: usersTable.name }).from(usersTable).where(
			eq(usersTable.id1, 1),
		);

		expect(res).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('left join (flat object fields)', async (ctx) => {
		const { db } = ctx.gel;

		const { id1: cityId } = await db
			.insert(citiesTable)
			.values([
				{ id1: 1, name: 'Paris', state: 'Unknown' },
				{ id1: 2, name: 'London', state: 'Unknown' },
			])
			.returning({ id1: citiesTable.id1 })
			.then((rows) => rows[0]!);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId },
			{ id1: 2, name: 'Jane', cityId },
		]);

		const res = await db
			.select({
				userId: users2Table.id1,
				userName: users2Table.name,
				cityId: citiesTable.id1,
				cityName: citiesTable.name,
			})
			.from(users2Table)
			.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id1));

		expect(res).toEqual([
			{ userId: 1, userName: 'John', cityId, cityName: 'Paris' },
			{ userId: 2, userName: 'Jane', cityId, cityName: 'Paris' },
		]);
	});

	test('left join (grouped fields)', async (ctx) => {
		const { db } = ctx.gel;

		const { id1: cityId } = await db
			.insert(citiesTable)
			.values([
				{ id1: 1, name: 'Paris' },
				{ id1: 2, name: 'London' },
			])
			.returning({ id1: citiesTable.id1 })
			.then((rows) => rows[0]!);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId },
			{ id1: 2, name: 'Jane', cityId },
		]);

		const res = await db
			.select({
				id: users2Table.id1,
				user: {
					name: users2Table.name,
					nameUpper: sql<string>`upper(${users2Table.name})`,
				},
				city: {
					id: citiesTable.id1,
					name: citiesTable.name,
					nameUpper: sql<string>`upper(${citiesTable.name})`,
				},
			})
			.from(users2Table)
			.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id1));

		expect(res).toEqual([
			{
				id: 1,
				user: { name: 'John', nameUpper: 'JOHN' },
				city: { id: cityId, name: 'Paris', nameUpper: 'PARIS' },
			},
			{
				id: 2,
				user: { name: 'Jane', nameUpper: 'JANE' },
				city: { id: cityId, name: 'Paris', nameUpper: 'PARIS' },
			},
		]);
	});

	test('left join (all fields)', async (ctx) => {
		const { db } = ctx.gel;

		const { id1: cityId } = await db
			.insert(citiesTable)
			.values([
				{ id1: 1, name: 'Paris' },
				{ id1: 2, name: 'London' },
			])
			.returning({ id1: citiesTable.id1 })
			.then((rows) => rows[0]!);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId },
			{ id1: 2, name: 'Jane', cityId },
		]);

		const res = await db.select().from(users2Table).leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id1));

		expect(res).toEqual([
			{
				some_new_users: {
					id1: 1,
					name: 'John',
					cityId,
				},
				cities: {
					id1: cityId,
					name: 'Paris',
					state: null,
				},
			},
			{
				some_new_users: {
					id1: 2,
					name: 'Jane',
					cityId,
				},
				cities: {
					id1: cityId,
					name: 'Paris',
					state: null,
				},
			},
		]);
	});

	test('select from a many subquery', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(citiesTable)
			.values([{ id1: 1, name: 'Paris' }, { id1: 2, name: 'London' }]);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId: 1 },
			{ id1: 2, name: 'Jane', cityId: 2 },
			{ id1: 3, name: 'Jack', cityId: 2 },
		]);

		const res = await db.select({
			population: db.select({ count: count().as('count') }).from(users2Table).where(
				eq(users2Table.cityId, citiesTable.id1),
			).as(
				'population',
			),
			name: citiesTable.name,
		}).from(citiesTable);

		expectTypeOf(res).toEqualTypeOf<{
			population: number;
			name: string;
		}[]>();

		expect(res).toStrictEqual([{
			population: 1,
			name: 'Paris',
		}, {
			population: 2,
			name: 'London',
		}]);
	});

	test('select from a one subquery', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(citiesTable)
			.values([{ id1: 1, name: 'Paris' }, { id1: 2, name: 'London' }]);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId: 1 },
			{ id1: 2, name: 'Jane', cityId: 2 },
			{ id1: 3, name: 'Jack', cityId: 2 },
		]);

		const res = await db.select({
			cityName: db.select({ name: citiesTable.name }).from(citiesTable).where(eq(users2Table.cityId, citiesTable.id1))
				.as(
					'cityName',
				),
			name: users2Table.name,
		}).from(users2Table);

		expectTypeOf(res).toEqualTypeOf<{
			cityName: string;
			name: string;
		}[]>();

		expect(res).toStrictEqual([{
			cityName: 'Paris',
			name: 'John',
		}, {
			cityName: 'London',
			name: 'Jane',
		}, {
			cityName: 'London',
			name: 'Jack',
		}]);
	});

	test('join subquery', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(courseCategoriesTable).values([
			{ id1: 1, name: 'Category 1' },
			{ id1: 2, name: 'Category 2' },
			{
				id1: 3,
				name: 'Category 3',
			},
			{ id1: 4, name: 'Category 4' },
		]);

		await db.insert(coursesTable).values([
			{ id1: 1, name: 'Development', categoryId: 2 },
			{ id1: 2, name: 'IT & Software', categoryId: 3 },
			{ id1: 3, name: 'Marketing', categoryId: 4 },
			{ id1: 4, name: 'Design', categoryId: 1 },
		]);

		const sq2 = db
			.select({
				categoryId: courseCategoriesTable.id1,
				category: courseCategoriesTable.name,
				total: sql<number>`count(${courseCategoriesTable.id1})`,
			})
			.from(courseCategoriesTable)
			.groupBy(courseCategoriesTable.id1, courseCategoriesTable.name)
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
	});

	test('with ... select', async (ctx) => {
		const { db } = ctx.gel;

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

		const regionalSales = db.$with('regional_sales').as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

		const topRegions = db.$with('top_regions').as(
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

		const result1 = await db
			.with(regionalSales, topRegions)
			.select({
				region: orders.region,
				product: orders.product,
				productUnits: sql<number>`sum(${orders.quantity})::int`,
				productSales: sql<number>`sum(${orders.amount})::int`,
			})
			.from(orders)
			.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
			.groupBy(orders.region, orders.product)
			.orderBy(orders.region, orders.product);
		const result2 = await db
			.with(regionalSales, topRegions)
			.selectDistinct({
				region: orders.region,
				product: orders.product,
				productUnits: sql<number>`sum(${orders.quantity})::int`,
				productSales: sql<number>`sum(${orders.amount})::int`,
			})
			.from(orders)
			.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
			.groupBy(orders.region, orders.product)
			.orderBy(orders.region, orders.product);
		const result3 = await db
			.with(regionalSales, topRegions)
			.selectDistinctOn([orders.region], {
				region: orders.region,
				productUnits: sql<number>`sum(${orders.quantity})::int`,
				productSales: sql<number>`sum(${orders.amount})::int`,
			})
			.from(orders)
			.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
			.groupBy(orders.region)
			.orderBy(orders.region);

		expect(result1).toEqual([
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
		expect(result2).toEqual(result1);
		expect(result3).toEqual([
			{
				region: 'Europe',
				productUnits: 8,
				productSales: 80,
			},
			{
				region: 'US',
				productUnits: 16,
				productSales: 160,
			},
		]);
	});

	test('with ... update', async (ctx) => {
		const { db } = ctx.gel;

		const products = gelTable('products', {
			id1: integer('id1'),
			price: decimal('price').notNull(),
			cheap: boolean('cheap').notNull().default(false),
		});

		await db.insert(products).values([
			{ id1: 1, price: '10.99' },
			{ id1: 2, price: '25.85' },
			{ id1: 3, price: '32.99' },
			{ id1: 4, price: '2.50' },
			{ id1: 5, price: '4.59' },
		]);

		const averagePrice = db.$with('average_price').as(
			db
				.select({
					value: sql`avg(${products.price})`.as('value'),
				})
				.from(products),
		);

		const result = await db
			.with(averagePrice)
			.update(products)
			.set({
				cheap: true,
			})
			.where(lt(products.price, sql`(select * from ${averagePrice})`))
			.returning({
				id1: products.id1,
			});

		expect(result).toEqual([{ id1: 1 }, { id1: 4 }, { id1: 5 }]);
	});

	test('with ... insert', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_with_insert', {
			username: text('username').notNull(),
			admin: boolean('admin').notNull(),
		});

		const userCount = db.$with('user_count').as(
			db
				.select({
					value: sql`count(*)`.as('value'),
				})
				.from(users),
		);

		const result = await db
			.with(userCount)
			.insert(users)
			.values([{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` }])
			.returning({
				admin: users.admin,
			});

		expect(result).toEqual([{ admin: true }]);
	});

	test('with ... delete', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(orders).values([
			{ id1: 1, region: 'Europe', product: 'A', amount: 10, quantity: 1 },
			{ id1: 2, region: 'Europe', product: 'A', amount: 20, quantity: 2 },
			{ id1: 3, region: 'Europe', product: 'B', amount: 20, quantity: 2 },
			{ id1: 4, region: 'Europe', product: 'B', amount: 30, quantity: 3 },
			{ id1: 5, region: 'US', product: 'A', amount: 30, quantity: 3 },
			{ id1: 6, region: 'US', product: 'A', amount: 40, quantity: 4 },
			{ id1: 7, region: 'US', product: 'B', amount: 40, quantity: 4 },
			{ id1: 8, region: 'US', product: 'B', amount: 50, quantity: 5 },
		]);

		const averageAmount = db.$with('average_amount').as(
			db
				.select({
					value: sql`avg(${orders.amount})`.as('value'),
				})
				.from(orders),
		);

		const result = await db
			.with(averageAmount)
			.delete(orders)
			.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
			.returning({
				id1: orders.id1,
			});

		expect(result).toEqual([{ id1: 6 }, { id1: 7 }, { id1: 8 }]);
	});

	test('select from subquery sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(users3Table).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
		]);

		const sq = db
			.select({ name: sql<string>`${users3Table.name} || ' modified'`.as('name') })
			.from(users3Table)
			.as('sq');

		const res = await db.select({ name: sq.name }).from(sq);

		expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
	});

	test('select a field without joining its table', (ctx) => {
		const { db } = ctx.gel;

		expect(() => db.select({ name: users3Table.name }).from(usersTable).prepare('query')).toThrowError();
	});

	test('select all fields from subquery without alias', (ctx) => {
		const { db } = ctx.gel;

		const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users3Table.name})` }).from(users3Table));

		expect(() => db.select().from(sq).prepare('query')).toThrowError();
	});

	test('select count()', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
		]);

		const res = await db.select({ count: sql`count(*)` }).from(usersTable);

		expect(res).toEqual([{ count: 2 }]);
	});

	test('select count w/ custom mapper', async (ctx) => {
		const { db } = ctx.gel;

		function count(value: GelColumn | SQLWrapper): SQL<number>;
		function count(value: GelColumn | SQLWrapper, alias: string): SQL.Aliased<number>;
		function count(value: GelColumn | SQLWrapper, alias?: string): SQL<number> | SQL.Aliased<number> {
			const result = sql`count(${value})`.mapWith(Number);
			if (!alias) {
				return result;
			}
			return result.as(alias);
		}

		await db.insert(usersTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
		]);

		const res = await db.select({ count: count(sql`*`) }).from(usersTable);

		expect(res).toEqual([{ count: 2 }]);
	});

	test('array types', async (ctx) => {
		const { db } = ctx.gel;

		const values: (typeof salEmp.$inferSelect)[] = [
			{
				name: 'John',
				payByQuarter: [10000, 10000, 10000, 10000],
			},
			{
				name: 'Carol',
				payByQuarter: [20000, 25000, 25000, 25000],
			},
		];

		await db.insert(salEmp).values(values);

		const res = await db.select().from(salEmp);

		expect(res.map((it) => ({ ...it, id: undefined }))).toEqual(values);
	});

	test('select for ...', (ctx) => {
		const { db } = ctx.gel;

		{
			const query = db.select().from(users3Table).for('update').toSQL();

			expect(query.sql).toMatch(/ for update$/);
		}

		{
			const query = db
				.select()
				.from(users2Table)
				.for('update', { of: [users3Table, coursesTable] })
				.toSQL();

			expect(query.sql).toMatch(/ for update of "users3", "courses"$/);
		}

		{
			const query = db.select().from(users3Table).for('no key update', { of: users3Table }).toSQL();

			expect(query.sql).toMatch(/for no key update of "users3"$/);
		}

		{
			const query = db.select().from(users3Table).for('no key update', { of: users3Table, skipLocked: true })
				.toSQL();

			expect(query.sql).toMatch(/ for no key update of "users3" skip locked$/);
		}

		{
			const query = db.select().from(users3Table).for('share', { of: users3Table, noWait: true }).toSQL();

			expect(query.sql).toMatch(/for share of "users3" nowait$/);
		}
	});

	// TODO
	// column "rel~1.0e3b7152-d977-11ef-a173-530b4c6088b1" must appear in the GROUP BY
	test.todo('having', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(citiesTable).values([
			{ id1: 1, name: 'London' },
			{ id1: 2, name: 'Paris' },
			{
				id1: 3,
				name: 'New York',
			},
		]);

		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId: 1 },
			{ id1: 2, name: 'Jane', cityId: 1 },
			{
				id1: 3,
				name: 'Jack',
				cityId: 2,
			},
		]);

		const result = await db
			.select({
				id1: citiesTable.id1,
				name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
				usersCount: sql<number>`count(${users2Table.id1})::int`.as('users_count'),
			})
			.from(citiesTable)
			.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id1))
			.where(({ name }) => sql`length(${name}) >= 3`)
			.groupBy(citiesTable.id1)
			.having(({ usersCount }) => sql`${usersCount} > 0`)
			.orderBy(({ name }) => name);

		expect(result).toEqual([
			{
				id1: 1,
				name: 'LONDON',
				usersCount: 2,
			},
			{
				id1: 2,
				name: 'PARIS',
				usersCount: 1,
			},
		]);
	});

	test('select from raw sql', async (ctx) => {
		const { db } = ctx.gel;

		const result = await db
			.select({
				id: sql<number>`id`,
				name: sql<string>`name`,
			})
			.from(sql`(select 1 as id, 'John' as name) as users`);

		Expect<Equal<{ id: number; name: string }[], typeof result>>;
		expect(result).toEqual([{ id: 1, name: 'John' }]);
	});

	test('select from raw sql with joins', async (ctx) => {
		const { db } = ctx.gel;

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

		expect(result).toEqual([{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' }]);
	});

	test('join on aliased sql from select', async (ctx) => {
		const { db } = ctx.gel;

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

		expect(result).toEqual([{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' }]);
	});

	test('join on aliased sql from with clause', async (ctx) => {
		const { db } = ctx.gel;

		const users = db.$with('users').as(
			db
				.select({
					id: sql<number>`id`.as('userId'),
					name: sql<string>`name`.as('userName'),
					city: sql<string>`city`.as('city'),
				})
				.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`),
		);

		const cities = db.$with('cities').as(
			db
				.select({
					id: sql<number>`id`.as('cityId'),
					name: sql<string>`name`.as('cityName'),
				})
				.from(sql`(select 1 as id, 'Paris' as name) as cities`),
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

		expect(result).toEqual([{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' }]);
	});

	test('prefixed table', async (ctx) => {
		const { db } = ctx.gel;

		const gelTable = gelTableCreator((name) => `myprefix_${name}`);

		const users = gelTable('test_prefixed_table_with_unique_name', {
			id1: integer('id1').primaryKey(),
			name: text('name').notNull(),
		});

		await db.insert(users).values({ id1: 1, name: 'John' });

		const result = await db.select().from(users);

		expect(result.map((it) => ({ ...it, id: undefined }))).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('all date and time columns', async (ctx) => {
		const { db } = ctx.gel;

		const table = gelTable('dates_column', {
			datetimeColumn: timestamptz().notNull(),
			local_datetimeColumn: timestamp().notNull(),
			local_dateColumn: localDate().notNull(),
			local_timeColumn: localTime().notNull(),

			durationColumn: duration().notNull(),
			relative_durationColumn: relDuration().notNull(),
			dateDurationColumn: dateDuration().notNull(),
		});

		await db.insert(table).values({
			datetimeColumn: new Date('2022-01-01T00:00:00.123Z'),
			local_datetimeColumn: new LocalDateTime(2014, 2, 1, 4, 1, 6, 2, 0, 0),
			local_dateColumn: new LocalDate(2013, 2, 1),
			local_timeColumn: new LocalTime(12, 42, 2, 3, 1, 0),
			durationColumn: new Duration(0, 0, 0, 0, 12, 3, 0, 0, 1, 3),
			relative_durationColumn: new RelativeDuration(2014, 2, 1, 4, 1, 6, 2, 0, 0),
			dateDurationColumn: new DateDuration(2032, 2, 1, 5),
		});

		const result = await db.select().from(table);

		Expect<
			Equal<
				{
					datetimeColumn: Date;
					local_datetimeColumn: LocalDateTime;
					local_dateColumn: LocalDate;
					local_timeColumn: LocalTime;
					durationColumn: Duration;
					relative_durationColumn: RelativeDuration;
					dateDurationColumn: DateDuration;
				}[],
				typeof result
			>
		>;

		Expect<
			Equal<
				{
					datetimeColumn: Date;
					local_datetimeColumn: LocalDateTime;
					local_dateColumn: LocalDate;
					local_timeColumn: LocalTime;
					durationColumn: Duration;
					relative_durationColumn: RelativeDuration;
					dateDurationColumn: DateDuration;
				},
				typeof table.$inferInsert
			>
		>;
	});

	test('orderBy with aliased column', (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.select({
				test: sql`something`.as('test'),
			})
			.from(users3Table)
			.orderBy((fields) => fields.test)
			.toSQL();

		expect(query.sql).toBe('select something as "test" from "users3" order by "test"');
	});

	test('select from sql', async (ctx) => {
		const { db } = ctx.gel;

		const metricEntry = gelTable('metric_entry', {
			id1: gelUuid('id1').notNull(),
			createdAt: timestamptz('created_at').notNull(),
		});

		const metricId = uuidV4();

		const intervals = db.$with('intervals').as(
			db
				.select({
					startTime: sql<string>`(date'2023-03-01'+ x * '1 day'::interval)`.as('start_time'),
					endTime: sql<string>`(date'2023-03-01'+ (x+1) *'1 day'::interval)`.as('end_time'),
				})
				.from(sql`generate_series(0, 29, 1) as t(x)`),
		);

		const func = () =>
			db
				.with(intervals)
				.select({
					startTime: intervals.startTime,
					endTime: intervals.endTime,
					count: sql<number>`count(${metricEntry})`,
				})
				.from(metricEntry)
				.rightJoin(
					intervals,
					and(
						eq(metricEntry.id1, metricId),
						gte(metricEntry.createdAt, intervals.startTime),
						lt(metricEntry.createdAt, intervals.endTime),
					),
				)
				.groupBy(intervals.startTime, intervals.endTime)
				.orderBy(asc(intervals.startTime));

		await expect(
			(async () => {
				func();
			})(),
		).resolves.not.toThrowError();
	});

	test('transaction', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_transactions', {
			id1: integer('id1').notNull(),
			balance: integer('balance').notNull(),
		});
		const products = gelTable('products_transactions', {
			id1: integer('id1').notNull(),
			price: integer('price').notNull(),
			stock: integer('stock').notNull(),
		});

		const user = await db
			.insert(users)
			.values({ id1: 1, balance: 100 })
			.returning()
			.then((rows) => rows[0]!);
		const product = await db
			.insert(products)
			.values({ id1: 1, price: 10, stock: 10 })
			.returning()
			.then((rows) => rows[0]!);

		await db.transaction(async (tx) => {
			await tx
				.update(users)
				.set({ balance: user.balance - product.price })
				.where(eq(users.id1, user.id1));
			await tx
				.update(products)
				.set({ stock: product.stock - 1 })
				.where(eq(products.id1, product.id1));
		});

		const result = await db.select().from(users);

		expect(result).toEqual([{ id1: 1, balance: 90 }]);
	});

	test('transaction rollback', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_transactions_rollback', {
			id1: integer('id1').notNull(),
			balance: integer('balance').notNull(),
		});

		await expect(
			(async () => {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ id1: 1, balance: 100 });
					tx.rollback();
				});
			})(),
		).rejects.toThrowError(Error);

		const result = await db.select().from(users);

		expect(result).toEqual([]);
	});

	test('join subquery with join', async (ctx) => {
		const { db } = ctx.gel;

		const internalStaff = gelTable('internal_staff', {
			userId: integer('userId').notNull(),
		});

		const customUser = gelTable('custom_user', {
			id1: integer('id1').notNull(),
		});

		const ticket = gelTable('ticket', {
			staffId: integer('staffId').notNull(),
		});

		await db.insert(internalStaff).values({ userId: 1 });
		await db.insert(customUser).values({ id1: 1 });
		await db.insert(ticket).values({ staffId: 1 });

		const subq = db.select().from(internalStaff).leftJoin(customUser, eq(internalStaff.userId, customUser.id1)).as(
			'internal_staff',
		);

		const mainQuery = await db.select().from(ticket).leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId));

		expect(mainQuery).toEqual([
			{
				ticket: { staffId: 1 },
				internal_staff: {
					internal_staff: { userId: 1 },
					custom_user: { id1: 1 },
				},
			},
		]);
	});

	test('table selection with single table', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_with_cities', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
			cityId: integer('cityId').notNull(),
		});

		await db.insert(users).values({ id1: 1, name: 'John', cityId: 1 });

		const result = await db.select({ users }).from(users);

		expect(result).toEqual([{ users: { id1: 1, name: 'John', cityId: 1 } }]);
	});

	test('set null to json field', async (ctx) => {
		const { db } = ctx.gel;

		const result = await db.insert(usersTable).values({ id1: 1, name: 'Alex', json: null }).returning();

		expect(result.map((it) => ({ ...it, verified: undefined, createdAt: undefined }))).toEqual([
			{
				id1: 1,
				name: 'Alex',
				json: null,
				verified: undefined,
				createdAt: undefined,
			},
		]);
	});

	test('insert undefined', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_with_undefined', {
			id1: integer('id1').notNull(),
			name: text('name'),
		});

		await expect(
			(async () => {
				await db.insert(users).values({ id1: 1, name: undefined });
			})(),
		).resolves.not.toThrowError();
	});

	test('update undefined', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users', {
			id1: integer('id1').notNull(),
			name: text('name'),
		});

		await expect(
			(async () => {
				await db.update(users).set({ name: undefined });
			})(),
		).rejects.toThrowError();
		await expect(
			(async () => {
				db.update(users).set({ name: undefined });
			})(),
		).rejects.toThrowError();
	});

	test('array operators', async (ctx) => {
		const { db } = ctx.gel;

		const posts = gelTable('posts', {
			id1: integer('id1').notNull(),
			tags: text('tags').array(),
		});

		await db.insert(posts).values([
			{
				id1: 1,
				tags: ['ORM'],
			},
			{
				id1: 2,
				tags: ['Typescript'],
			},
			{
				id1: 3,
				tags: ['Typescript', 'ORM'],
			},
			{ id1: 4, tags: ['Typescript', 'Frontend', 'React'] },
			{
				id1: 5,
				tags: ['Typescript', 'ORM', 'Database', 'Postgres'],
			},
			{
				id1: 6,
				tags: ['Java', 'Spring', 'OOP'],
			},
		]);

		const contains = await db
			.select({ id1: posts.id1 })
			.from(posts)
			.where(arrayContains(posts.tags, ['Typescript', 'ORM']));
		const contained = await db
			.select({ id1: posts.id1 })
			.from(posts)
			.where(arrayContained(posts.tags, ['Typescript', 'ORM']));
		const overlaps = await db
			.select({ id1: posts.id1 })
			.from(posts)
			.where(arrayOverlaps(posts.tags, ['Typescript', 'ORM']));
		const withSubQuery = await db
			.select({ id1: posts.id1 })
			.from(posts)
			.where(arrayContains(posts.tags, db.select({ tags: posts.tags }).from(posts).where(eq(posts.id1, 1))));

		expect(contains).toEqual([{ id1: 3 }, { id1: 5 }]);
		expect(contained).toEqual([{ id1: 1 }, { id1: 2 }, { id1: 3 }]);
		expect(overlaps).toEqual([{ id1: 1 }, { id1: 2 }, { id1: 3 }, { id1: 4 }, { id1: 5 }]);
		expect(withSubQuery).toEqual([{ id1: 1 }, { id1: 3 }, { id1: 5 }]);
	});

	test('set operations (union) from query builder with subquery', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const sq = db
			.select({ id: users2Table.id1, name: users2Table.name })
			.from(users2Table).as('sq');

		const result = await db
			.select({ id: cities2Table.id1, name: citiesTable.name })
			.from(cities2Table).union(
				db.select().from(sq),
			).orderBy(asc(sql`name`)).limit(2).offset(1);

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 3, name: 'Jack' },
			{ id: 2, name: 'Jane' },
		]);

		await expect((async () => {
			db
				.select({ id: cities2Table.id1, name: citiesTable.name, name2: users2Table.name })
				.from(cities2Table).union(
					// @ts-expect-error
					db
						.select({ id: users2Table.id1, name: users2Table.name })
						.from(users2Table),
				).orderBy(asc(sql`name`));
		})()).rejects.toThrowError();
	});

	test('set operations (union) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await union(
			db
				.select({ id: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
		).orderBy(asc(sql`name`)).limit(1).offset(1);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id: 1, name: 'New York' },
		]);

		await expect((async () => {
			union(
				db
					.select({ name: citiesTable.name, id: cities2Table.id1 })
					.from(cities2Table).where(eq(citiesTable.id1, 1)),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
			).orderBy(asc(sql`name`));
		})()).rejects.toThrowError();
	});

	test('set operations (union all) from query builder', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await db
			.select({ id1: cities2Table.id1, name: citiesTable.name })
			.from(cities2Table).limit(2).unionAll(
				db
					.select({ id1: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table).limit(2),
			).orderBy(asc(sql`id1`));

		expect(result).toHaveLength(4);

		expect(result).toEqual([
			{ id1: 1, name: 'New York' },
			{ id1: 1, name: 'New York' },
			{ id1: 2, name: 'London' },
			{ id1: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id1: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).limit(2).unionAll(
					db
						.select({ name: citiesTable.name, id1: cities2Table.id1 })
						.from(cities2Table).limit(2),
				).orderBy(asc(sql`id1`));
		})()).rejects.toThrowError();
	});

	test('set operations (union all) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await unionAll(
			db
				.select({ id: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
		);

		expect(result).toHaveLength(3);

		expect(result).toEqual([
			{ id: 1, name: 'New York' },
			{ id: 1, name: 'John' },
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			unionAll(
				db
					.select({ id: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id1, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id1 })
					.from(users2Table).where(eq(users2Table.id1, 1)),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('set operations (intersect) from query builder', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await db
			.select({ id: cities2Table.id1, name: citiesTable.name })
			.from(cities2Table).intersect(
				db
					.select({ id: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table).where(gt(citiesTable.id1, 1)),
			).orderBy(asc(sql`name`));

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select({ id: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).intersect(
					// @ts-expect-error
					db
						.select({ id: cities2Table.id1, name: citiesTable.name, id2: cities2Table.id1 })
						.from(cities2Table).where(gt(citiesTable.id1, 1)),
				).orderBy(asc(sql`name`));
		})()).rejects.toThrowError();
	});

	test('set operations (intersect) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await intersect(
			db
				.select({ id: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
		);

		expect(result).toHaveLength(0);

		expect(result).toEqual([]);

		await expect((async () => {
			intersect(
				db
					.select({ id: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id1, 1)),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id1 })
					.from(users2Table).where(eq(users2Table.id1, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('set operations (intersect all) from query builder', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await db
			.select({ id1: cities2Table.id1, name: citiesTable.name })
			.from(cities2Table).limit(2).intersectAll(
				db
					.select({ id1: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table).limit(2),
			).orderBy(asc(sql`id1`));

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id1: 1, name: 'New York' },
			{ id1: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).limit(2).intersectAll(
					db
						.select({ name: users2Table.name, id: users2Table.id1 })
						.from(cities2Table).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test('set operations (intersect all) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await intersectAll(
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
			db
				.select({ id: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
		);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			intersectAll(
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id1 })
					.from(users2Table).where(eq(users2Table.id1, 1)),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('set operations (except) from query builder', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await db
			.select()
			.from(cities2Table).except(
				db
					.select()
					.from(cities2Table).where(gt(citiesTable.id1, 1)),
			);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id1: 1, name: 'New York' },
		]);

		await expect((async () => {
			db
				.select()
				.from(cities2Table).except(
					db
						.select({ name: users2Table.name, id1: users2Table.id1 })
						.from(cities2Table).where(gt(citiesTable.id1, 1)),
				);
		})()).rejects.toThrowError();
	});

	test('set operations (except) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await except(
			db
				.select({ id1: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table),
			db
				.select({ id1: cities2Table.id1, name: citiesTable.name })
				.from(cities2Table).where(eq(citiesTable.id1, 1)),
			db
				.select({ id1: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
		).orderBy(asc(sql`id1`));

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id1: 2, name: 'London' },
			{ id1: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			except(
				db
					.select({ id1: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table),
				db
					.select({ name: users2Table.name, id1: users2Table.id1 })
					.from(cities2Table).where(eq(citiesTable.id1, 1)),
				db
					.select({ id1: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
			).orderBy(asc(sql`id1`));
		})()).rejects.toThrowError();
	});

	test('set operations (except all) from query builder', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await db
			.select()
			.from(cities2Table).exceptAll(
				db
					.select({ id1: cities2Table.id1, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id1, 1)),
			).orderBy(asc(sql`id1`));

		expect(result).toHaveLength(2);

		expect(result).toEqual([
			{ id1: 2, name: 'London' },
			{ id1: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select({ name: cities2Table.name, id1: cities2Table.id1 })
				.from(cities2Table).exceptAll(
					db
						.select({ id1: cities2Table.id1, name: citiesTable.name })
						.from(cities2Table).where(eq(citiesTable.id1, 1)),
				).orderBy(asc(sql`id1`));
		})()).rejects.toThrowError();
	});

	test('set operations (except all) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await exceptAll(
			db
				.select({ id1: users2Table.id1, name: users2Table.name })
				.from(users2Table),
			db
				.select({ id1: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(gt(users2Table.id1, 7)),
			db
				.select({ id1: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
		).orderBy(asc(sql`id1`)).limit(5).offset(2);

		expect(result).toHaveLength(4);

		expect(result).toEqual([
			{ id1: 4, name: 'Peter' },
			{ id1: 5, name: 'Ben' },
			{ id1: 6, name: 'Jill' },
			{ id1: 7, name: 'Mary' },
		]);

		await expect((async () => {
			exceptAll(
				db
					.select({ name: users2Table.name, id: users2Table.id1 })
					.from(users2Table),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(gt(users2Table.id1, 7)),
				db
					.select({ id: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
			).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test('set operations (mixed) from query builder with subquery', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);
		const sq = db
			.select()
			.from(cities2Table).where(gt(citiesTable.id1, 1)).as('sq');

		const result = await db
			.select()
			.from(cities2Table).except(
				({ unionAll }) =>
					unionAll(
						db.select().from(sq),
						db.select().from(cities2Table).where(eq(citiesTable.id1, 2)),
					),
			);

		expect(result).toHaveLength(1);

		expect(result).toEqual([
			{ id1: 1, name: 'New York' },
		]);

		await expect((async () => {
			db
				.select()
				.from(cities2Table).except(
					({ unionAll }) =>
						unionAll(
							db
								.select({ name: cities2Table.name, id1: cities2Table.id1 })
								.from(cities2Table).where(gt(citiesTable.id1, 1)),
							db.select().from(cities2Table).where(eq(citiesTable.id1, 2)),
						),
				);
		})()).rejects.toThrowError();
	});

	test('set operations (mixed all) as function', async (ctx) => {
		const { db } = ctx.gel;

		await setupSetOperationTest(db);

		const result = await union(
			db
				.select({ id1: users2Table.id1, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id1, 1)),
			except(
				db
					.select({ id1: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(gte(users2Table.id1, 5)),
				db
					.select({ id1: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 7)),
			),
			db
				.select().from(cities2Table).where(gt(citiesTable.id1, 1)),
		).orderBy(asc(sql`id1`));

		expect(result).toHaveLength(6);

		expect(result).toEqual([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'London' },
			{ id1: 3, name: 'Tampa' },
			{ id1: 5, name: 'Ben' },
			{ id1: 6, name: 'Jill' },
			{ id1: 8, name: 'Sally' },
		]);

		await expect((async () => {
			union(
				db
					.select({ id1: users2Table.id1, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id1, 1)),
				except(
					db
						.select({ id1: users2Table.id1, name: users2Table.name })
						.from(users2Table).where(gte(users2Table.id1, 5)),
					db
						.select({ name: users2Table.name, id1: users2Table.id1 })
						.from(users2Table).where(eq(users2Table.id1, 7)),
				),
				db
					.select().from(cities2Table).where(gt(citiesTable.id1, 1)),
			).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});
	test('aggregate function: count', async (ctx) => {
		const { db } = ctx.gel;
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: count() }).from(table);
		const result2 = await db.select({ value: count(table.a) }).from(table);
		const result3 = await db.select({ value: countDistinct(table.name) }).from(table);

		expect(result1[0]?.value).toBe(7);
		expect(result2[0]?.value).toBe(5);
		expect(result3[0]?.value).toBe(6);
	});

	test('aggregate function: avg', async (ctx) => {
		const { db } = ctx.gel;
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: avg(table.b) }).from(table);
		const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
		const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

		expect(result1[0]?.value).toBe('33.3333333333333333');
		expect(result2[0]?.value).toBeNull();
		expect(result3[0]?.value).toBe('42.5000000000000000');
	});

	test('aggregate function: sum', async (ctx) => {
		const { db } = ctx.gel;
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: sum(table.b) }).from(table);
		const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
		const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

		expect(result1[0]?.value).toBe('200');
		expect(result2[0]?.value).toBeNull();
		expect(result3[0]?.value).toBe('170');
	});

	test('aggregate function: max', async (ctx) => {
		const { db } = ctx.gel;
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: max(table.b) }).from(table);
		const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

		expect(result1[0]?.value).toBe(90);
		expect(result2[0]?.value).toBeNull();
	});

	test('aggregate function: min', async (ctx) => {
		const { db } = ctx.gel;
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: min(table.b) }).from(table);
		const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

		expect(result1[0]?.value).toBe(10);
		expect(result2[0]?.value).toBeNull();
	});

	test('array mapping and parsing', async (ctx) => {
		const { db } = ctx.gel;

		const arrays = gelTable('arrays_tests', {
			id1: integer('id1').notNull(),
			tags: text('tags').array(),
			numbers: integer('numbers').notNull().array(),
		});

		await db.insert(arrays).values({
			id1: 1,
			tags: ['', 'b', 'c'],
			numbers: [1, 2, 3],
		});

		const result = await db.select().from(arrays);

		expect(result).toEqual([
			{
				id1: 1,
				tags: ['', 'b', 'c'],
				numbers: [1, 2, 3],
			},
		]);
	});

	test('test $onUpdateFn and $onUpdate works as $default', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersOnUpdate).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jack',
			},
			{ id1: 4, name: 'Jill' },
		]);

		// const { updatedAt, ..._ } = getTableColumns(usersOnUpdate);

		// const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id1));

		const response = await db.select(getTableColumns(usersOnUpdate)).from(usersOnUpdate).orderBy(
			asc(usersOnUpdate.id1),
		);

		expect(response.map((it) => ({ ...it, updatedAt: undefined }))).toEqual([
			{ name: 'John', id1: 1, updateCounter: 1, alwaysNull: null, updatedAt: undefined },
			{ name: 'Jane', id1: 2, updateCounter: 1, alwaysNull: null, updatedAt: undefined },
			{ name: 'Jack', id1: 3, updateCounter: 1, alwaysNull: null, updatedAt: undefined },
			{ name: 'Jill', id1: 4, updateCounter: 1, alwaysNull: null, updatedAt: undefined },
		]);

		// const msDelay = 250;

		// for (const eachUser of justDates) {
		// 	expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
		// }
	});

	test('test $onUpdateFn and $onUpdate works updating', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersOnUpdate).values([
			{ id1: 1, name: 'John', alwaysNull: 'this will be null after updating' },
			{ id1: 2, name: 'Jane' },
			{ id1: 3, name: 'Jack' },
			{ id1: 4, name: 'Jill' },
		]);

		const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
		await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id1));

		await db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id1, 1));
		await db.update(usersOnUpdate).set({ updateCounter: null }).where(eq(usersOnUpdate.id1, 2));

		// const justDates = await db.select({ updatedAt: usersOnUpdate.updatedAt }).from(usersOnUpdate).orderBy(
		// 	asc(usersOnUpdate.id1),
		// );

		const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(
			asc(usersOnUpdate.id1),
		);

		expect(response).toEqual([
			{ name: 'Angel', id1: 1, updateCounter: 2, alwaysNull: null },
			{ name: 'Jane', id1: 2, updateCounter: null, alwaysNull: null },
			{ name: 'Jack', id1: 3, updateCounter: 1, alwaysNull: null },
			{ name: 'Jill', id1: 4, updateCounter: 1, alwaysNull: null },
		]);
		// const msDelay = 500;

		// for (const eachUser of justDates) {
		// 	expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
		// }
	});

	test('test if method with sql operators', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_with_age', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
			age: integer('age').notNull(),
			city: text('city').notNull(),
		});

		await db.insert(users).values([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition1 = true;

		const [result1] = await db.select().from(users).where(eq(users.id1, 1).if(condition1));

		expect({ ...result1, id: undefined }).toEqual({
			id1: 1,
			name: 'John',
			age: 20,
			city: 'New York',
		});

		const condition2 = 1;

		const [result2] = await db
			.select()
			.from(users)
			.where(sql`${users.id1} = 1`.if(condition2));

		expect({ ...result2, id: undefined }).toEqual({ id1: 1, name: 'John', age: 20, city: 'New York' });

		const condition3 = 'non-empty string';

		const result3 = await db
			.select()
			.from(users)
			.where(or(eq(users.id1, 1).if(condition3), eq(users.id1, 2).if(condition3)));

		expect(result3.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{
				id1: 2,
				name: 'Alice',
				age: 21,
				city: 'New York',
			},
		]);

		const condtition4 = false;

		const result4 = await db.select().from(users).where(eq(users.id1, 1).if(condtition4));

		expect(result4.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition5 = undefined;

		const result5 = await db
			.select()
			.from(users)
			.where(sql`${users.id1} = 1`.if(condition5));

		expect(result5.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition6 = null;

		const result6 = await db
			.select()
			.from(users)
			.where(or(eq(users.id1, 1).if(condition6), eq(users.id1, 2).if(condition6)));

		expect(result6.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition7 = {
			term1: 0,
			term2: 1,
		};

		const result7 = await db
			.select()
			.from(users)
			.where(and(gt(users.age, 20).if(condition7.term1), eq(users.city, 'New York').if(condition7.term2)));

		expect(result7.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
		]);

		const condition8 = {
			term1: '',
			term2: 'non-empty string',
		};

		const result8 = await db
			.select()
			.from(users)
			.where(or(lt(users.age, 21).if(condition8.term1), eq(users.city, 'London').if(condition8.term2)));

		expect(result8.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition9 = {
			term1: 1,
			term2: true,
		};

		const result9 = await db
			.select()
			.from(users)
			.where(
				and(
					inArray(users.city, ['New York', 'London']).if(condition9.term1),
					ilike(users.name, 'a%').if(condition9.term2),
				),
			);

		expect(result9.map((it) => ({ ...it, id: undefined }))).toEqual([
			{
				id1: 2,
				name: 'Alice',
				age: 21,
				city: 'New York',
			},
		]);

		const condition10 = {
			term1: 4,
			term2: 19,
		};

		const result10 = await db
			.select()
			.from(users)
			.where(
				and(
					sql`length(${users.name}) <= ${condition10.term1}`.if(condition10.term1),
					gt(users.age, condition10.term2).if(condition10.term2 > 20),
				),
			);

		expect(result10.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition11 = true;

		const result11 = await db
			.select()
			.from(users)
			.where(or(eq(users.city, 'New York'), gte(users.age, 22))!.if(condition11));

		expect(result11.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition12 = false;

		const result12 = await db
			.select()
			.from(users)
			.where(and(eq(users.city, 'London'), gte(users.age, 23))!.if(condition12));

		expect(result12.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition13 = true;

		const result13 = await db
			.select()
			.from(users)
			.where(sql`(city = 'New York' or age >= 22)`.if(condition13));

		expect(result13.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);

		const condition14 = false;

		const result14 = await db
			.select()
			.from(users)
			.where(sql`(city = 'London' and age >= 23)`.if(condition14));

		expect(result14.map((it) => ({ ...it, id: undefined }))).toEqual([
			{ id1: 1, name: 'John', age: 20, city: 'New York' },
			{ id1: 2, name: 'Alice', age: 21, city: 'New York' },
			{ id1: 3, name: 'Nick', age: 22, city: 'London' },
			{ id1: 4, name: 'Lina', age: 23, city: 'London' },
		]);
	});

	// MySchema tests
	test('mySchema :: select all fields', async (ctx) => {
		const { db } = ctx.gel;

		const now = Date.now();

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const result = await db.select().from(usersMySchemaTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(500);
		expect(result).toEqual([
			{
				id1: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			},
		]);
	});

	test('mySchema :: select sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const users = await db
			.select({
				name: sql`upper(${usersMySchemaTable.name})`,
			})
			.from(usersMySchemaTable);

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: select typed sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const users = await db
			.select({
				name: sql<string>`upper(${usersMySchemaTable.name})`,
			})
			.from(usersMySchemaTable);

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: select distinct', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'John' },
			{ id1: 1, name: 'Jane' },
		]);
		const users1 = await db.selectDistinct().from(usersMySchemaTable).orderBy(
			usersMySchemaTable.id1,
			usersMySchemaTable.name,
		);
		const users2 = await db.selectDistinctOn([usersMySchemaTable.id1]).from(usersMySchemaTable).orderBy(
			usersMySchemaTable.id1,
		);
		const users3 = await db.selectDistinctOn([usersMySchemaTable.name], { name: usersMySchemaTable.name }).from(
			usersMySchemaTable,
		).orderBy(usersMySchemaTable.name);

		expect(users1.map((it) => ({ ...it, id: undefined, createdAt: undefined }))).toEqual([
			{ id1: 1, name: 'Jane', id: undefined, verified: false, json: null, createdAt: undefined },
			{ id1: 1, name: 'John', id: undefined, verified: false, json: null, createdAt: undefined },
			{ id1: 2, name: 'John', id: undefined, verified: false, json: null, createdAt: undefined },
		]);

		expect(users2).toHaveLength(2);
		expect(users2[0]?.id1).toBe(1);
		expect(users2[1]?.id1).toBe(2);

		expect(users3).toHaveLength(2);
		expect(users3[0]?.name).toBe('Jane');
		expect(users3[1]?.name).toBe('John');
	});

	test('mySchema :: insert returning sql', async (ctx) => {
		const { db } = ctx.gel;

		const users = await db
			.insert(usersMySchemaTable)
			.values({ id1: 1, name: 'John' })
			.returning({
				name: sql`upper(${usersMySchemaTable.name})`,
			});

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: delete returning sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const users = await db
			.delete(usersMySchemaTable)
			.where(eq(usersMySchemaTable.name, 'John'))
			.returning({
				name: sql`upper(${usersMySchemaTable.name})`,
			});

		expect(users).toEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: update with returning partial', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const users = await db.update(usersMySchemaTable).set({ name: 'Jane' }).where(
			eq(usersMySchemaTable.name, 'John'),
		)
			.returning({
				id1: usersMySchemaTable.id1,
				name: usersMySchemaTable.name,
			});

		expect(users).toEqual([{ id1: 1, name: 'Jane' }]);
	});

	test('mySchema :: delete with returning all fields', async (ctx) => {
		const { db } = ctx.gel;

		const now = Date.now();

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John')).returning();

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(500);
		expect(users).toEqual([
			{
				id1: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: users[0]!.createdAt,
			},
		]);
	});

	test('mySchema :: insert + select', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const result = await db.select().from(usersMySchemaTable);
		expect(result).toEqual([
			{
				id1: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			},
		]);

		await db.insert(usersMySchemaTable).values({ id1: 2, name: 'Jane' });
		const result2 = await db.select().from(usersMySchemaTable);
		expect(result2).toEqual([
			{ id1: 1, name: 'John', verified: false, json: null, createdAt: result2[0]!.createdAt },
			{ id1: 2, name: 'Jane', verified: false, json: null, createdAt: result2[1]!.createdAt },
		]);
	});

	test('mySchema :: insert with overridden default values', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John', verified: true });
		const result = await db.select().from(usersMySchemaTable);

		expect(result).toEqual([
			{
				id1: 1,
				name: 'John',
				verified: true,
				json: null,
				createdAt: result[0]!.createdAt,
			},
		]);
	});

	test('mySchema :: insert many', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values([
			{ id1: 1, name: 'John' },
			{
				id1: 2,
				name: 'Bruce',
				json: ['foo', 'bar'],
			},
			{
				id1: 3,
				name: 'Jane',
			},
			{ id1: 4, name: 'Austin', verified: true },
		]);
		const result = await db
			.select({
				id1: usersMySchemaTable.id1,
				name: usersMySchemaTable.name,
				json: usersMySchemaTable.json,
				verified: usersMySchemaTable.verified,
			})
			.from(usersMySchemaTable);

		expect(result).toEqual([
			{ id1: 1, name: 'John', json: null, verified: false },
			{ id1: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
			{ id1: 3, name: 'Jane', json: null, verified: false },
			{ id1: 4, name: 'Austin', json: null, verified: true },
		]);
	});

	test('mySchema :: select with group by as field', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable).groupBy(
			usersMySchemaTable.name,
		);

		expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
	});

	test('mySchema :: select with group by as column + sql', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values([
			{ id1: 1, name: 'John' },
			{ id1: 2, name: 'Jane' },
			{
				id1: 3,
				name: 'Jane',
			},
		]);

		const result = await db
			.select({ name: usersMySchemaTable.name })
			.from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.id1, sql`${usersMySchemaTable.name}`);

		expect(result.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
			{ name: 'Jane' },
			{ name: 'Jane' },
			{
				name: 'John',
			},
		]);
	});

	test('mySchema :: build query', async (ctx) => {
		const { db } = ctx.gel;

		const query = db.select({ id1: usersMySchemaTable.id1, name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.id1, usersMySchemaTable.name).toSQL();

		expect(query).toEqual({
			sql:
				'select "mySchema"."users"."id1", "mySchema"."users"."name" from "mySchema"."users" group by "mySchema"."users"."id1", "mySchema"."users"."name"',
			params: [],
		});
	});

	test('mySchema :: partial join with alias', async (ctx) => {
		const { db } = ctx.gel;
		const customerAlias = alias(usersMySchemaTable, 'customer');

		await db.insert(usersMySchemaTable).values([
			{ id1: 10, name: 'Ivan' },
			{ id1: 11, name: 'Hans' },
		]);
		const result = await db
			.select({
				user: {
					id1: usersMySchemaTable.id1,
					name: usersMySchemaTable.name,
				},
				customer: {
					id1: customerAlias.id1,
					name: customerAlias.name,
				},
			})
			.from(usersMySchemaTable)
			.leftJoin(customerAlias, eq(customerAlias.id1, 11))
			.where(eq(usersMySchemaTable.id1, 10));

		expect(result).toEqual([
			{
				user: { id1: 10, name: 'Ivan' },
				customer: { id1: 11, name: 'Hans' },
			},
		]);
	});

	test('mySchema :: insert with spaces', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: sql`'Jo   h     n'` });
		const result = await db.select({ id1: usersMySchemaTable.id1, name: usersMySchemaTable.name }).from(
			usersMySchemaTable,
		);

		expect(result).toEqual([{ id1: 1, name: 'Jo   h     n' }]);
	});

	test('mySchema :: prepared statement with placeholder in .limit', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 1, name: 'John' });
		const stmt = db
			.select({
				id1: usersMySchemaTable.id1,
				name: usersMySchemaTable.name,
			})
			.from(usersMySchemaTable)
			.where(eq(usersMySchemaTable.id1, sql.placeholder('id1')))
			.limit(sql.placeholder('limit'))
			.prepare('mySchema_stmt_limit');

		const result = await stmt.execute({ id1: 1, limit: 1 });

		expect(result.map((it) => ({ ...it, id: undefined }))).toEqual([{ id1: 1, name: 'John' }]);
		expect(result).toHaveLength(1);
	});

	// TODO on conflict does not supported in gel
	test.todo('mySchema :: build query insert with onConflict do update / multiple columns', async (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.insert(usersMySchemaTable)
			.values({ id1: 1, name: 'John', json: ['foo', 'bar'] })
			// .onConflictDoUpdate({ target: [usersMySchemaTable.id1, usersMySchemaTable.name], set: { name: 'John1' } })
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into "mySchema"."users" ("id1", "name", "verified", "json", "created_at") values ($1, $2, default, $3, default) on conflict ("id1","name") do update set "name" = $4',
			params: [1, 'John', ['foo', 'bar'], 'John1'],
		});
	});

	// TODO on conflict not supported in gel
	test.todo('mySchema :: build query insert with onConflict do nothing + target', async (ctx) => {
		const { db } = ctx.gel;

		const query = db
			.insert(usersMySchemaTable)
			.values({ id1: 1, name: 'John', json: ['foo', 'bar'] })
			// .onConflictDoNothing({ target: usersMySchemaTable.id1 })
			.toSQL();

		expect(query).toEqual({
			sql:
				'insert into "mySchema"."users" ("id1", "name", "verified", "json", "created_at") values ($1, $2, default, $3, default) on conflict ("id1") do nothing',
			params: [1, 'John', ['foo', 'bar']],
		});
	});

	test('mySchema :: select from tables with same name from different schema using alias', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersMySchemaTable).values({ id1: 10, name: 'Ivan' });
		await db.insert(usersTable).values({ id1: 11, name: 'Hans' });

		const customerAlias = alias(usersTable, 'customer');

		const result = await db.select().from(usersMySchemaTable).leftJoin(customerAlias, eq(customerAlias.id1, 11))
			.where(eq(customerAlias.id1, 11));

		expect(result).toEqual([
			{
				users: {
					id1: 10,
					name: 'Ivan',
					verified: false,
					json: null,
					createdAt: result[0]!.users.createdAt,
				},
				customer: {
					id1: 11,
					name: 'Hans',
					verified: false,
					json: null,
					createdAt: result[0]!.customer!.createdAt,
				},
			},
		]);
	});

	test('limit 0', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 1, name: 'John' });
		const users = await db.select().from(usersTable).limit(0);

		expect(users).toEqual([]);
	});

	test('limit -1', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(usersTable).values({ id1: 2, name: 'John' });
		const users = await db.select().from(usersTable).limit(-1);

		expect(users.length).toBeGreaterThan(0);
	});

	test('Object keys as column names', async (ctx) => {
		const { db } = ctx.gel;

		// Tests the following:
		// Column with required config
		// Column with optional config without providing a value
		// Column with optional config providing a value
		// Column without config
		const users = gelTable('users_with_names', {
			id1: integer().notNull(),
			firstName: text(),
			lastName: text(),
			admin: boolean(),
		});

		await db.insert(users).values([
			{ id1: 1, firstName: 'John', lastName: 'Doe', admin: true },
			{ id1: 2, firstName: 'Jane', lastName: 'Smith', admin: false },
		]);
		const result = await db.select({ id1: users.id1, firstName: users.firstName, lastName: users.lastName }).from(
			users,
		).where(eq(users.admin, true));

		expect(result).toEqual([{ id1: 1, firstName: 'John', lastName: 'Doe' }]);
	});

	test('proper json handling', async (ctx) => {
		const { db } = ctx.gel;

		const jsonTable = gelTable('json_table', {
			json: json('json').$type<{ name: string; age: number }>(),
		});

		await db.insert(jsonTable).values({ json: { name: 'Tom', age: 75 } });

		const result = await db.select().from(jsonTable);

		const justNames = await db
			.select({
				name1: sql<string>`${jsonTable.json}->>'name'`.as('name1'),
				name2: sql<string>`${jsonTable.json}->>'name'`.as('name2'),
			})
			.from(jsonTable);

		expect(result).toStrictEqual([
			{
				json: { name: 'Tom', age: 75 },
			},
		]);

		expect(justNames).toStrictEqual([
			{
				name1: 'Tom',
				name2: 'Tom',
			},
		]);
	});

	test('set json fields with objects and retrieve with the ->> operator', async (ctx) => {
		const { db } = ctx.gel;

		const obj = { string: 'test', number: 123 };
		const { string: testString, number: testNumber } = obj;

		await db.insert(jsonTestTable).values({
			id1: 1,
			json: obj,
		});

		const result = await db
			.select({
				jsonStringField: sql<string>`${jsonTestTable.json}->>'string'`,
				jsonNumberField: sql<string>`${jsonTestTable.json}->>'number'`,
			})
			.from(jsonTestTable);

		expect(result).toStrictEqual([
			{
				jsonStringField: testString,
				jsonNumberField: String(testNumber),
			},
		]);
	});

	test('set json fields with objects and retrieve with the -> operator', async (ctx) => {
		const { db } = ctx.gel;

		const obj = { string: 'test', number: 123 };
		const { string: testString, number: testNumber } = obj;

		await db.insert(jsonTestTable).values({ id1: 1, json: obj });

		const result = await db
			.select({
				jsonStringField: sql<string>`${jsonTestTable.json}->'string'`,
				jsonNumberField: sql<number>`${jsonTestTable.json}->'number'`,
			})
			.from(jsonTestTable);

		expect(result).toStrictEqual([
			{
				jsonStringField: testString,
				jsonNumberField: testNumber,
			},
		]);
	});

	test('set json fields with strings and retrieve with the -> operator', async (ctx) => {
		const { db } = ctx.gel;

		const obj = { string: 'test', number: 123 };
		const { string: testString, number: testNumber } = obj;

		await db.insert(jsonTestTable).values({
			id1: 1,
			json: sql`${obj}`,
		});

		const result = await db
			.select({
				jsonStringField: sql<string>`${jsonTestTable.json}->'string'`,
				jsonNumberField: sql<number>`${jsonTestTable.json}->'number'`,
			})
			.from(jsonTestTable);

		expect(result).toStrictEqual([
			{
				jsonStringField: testString,
				jsonNumberField: testNumber,
			},
		]);
	});

	test('cross join', async (ctx) => {
		const { db } = ctx.gel;

		await db
			.insert(usersTable)
			.values([
				{ id1: 1, name: 'John' },
				{ id1: 2, name: 'Jane' },
			]);

		await db
			.insert(citiesTable)
			.values([
				{ id1: 1, name: 'Seattle' },
				{ id1: 2, name: 'New York City' },
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

	test('left join (lateral)', async (ctx) => {
		const { db } = ctx.gel;

		await db
			.insert(citiesTable)
			.values([{ id1: 1, name: 'Paris' }, { id1: 2, name: 'London' }])
			.returning({ id: citiesTable.id1 });

		await db.insert(users2Table).values([{ id1: 1, name: 'John', cityId: 1 }, { id1: 2, name: 'Jane' }]);

		const sq = db
			.select({
				userId: users2Table.id1,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(eq(users2Table.cityId, citiesTable.id1))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id1,
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

	test('inner join (lateral)', async (ctx) => {
		const { db } = ctx.gel;

		await db
			.insert(citiesTable)
			.values([{ id1: 1, name: 'Paris' }, { id1: 2, name: 'London' }])
			.returning({ id: citiesTable.id1 });

		await db.insert(users2Table).values([{ id1: 1, name: 'John', cityId: 1 }, { id1: 2, name: 'Jane' }]);

		const sq = db
			.select({
				userId: users2Table.id1,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(eq(users2Table.cityId, citiesTable.id1))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id1,
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

	test('cross join (lateral)', async (ctx) => {
		const { db } = ctx.gel;

		await db
			.insert(citiesTable)
			.values([{ id1: 1, name: 'Paris' }, { id1: 2, name: 'London' }, { id1: 3, name: 'Berlin' }]);

		await db.insert(users2Table).values([{ id1: 1, name: 'John', cityId: 1 }, { id1: 2, name: 'Jane' }, {
			id1: 3,
			name: 'Patrick',
			cityId: 2,
		}]);

		const sq = db
			.select({
				userId: users2Table.id1,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(not(like(citiesTable.name, 'L%')))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id1,
				cityName: citiesTable.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(citiesTable)
			.crossJoinLateral(sq)
			.orderBy(citiesTable.id1, sq.userId);

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

	// TODO not supported yet
	test.todo('update ... from', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(cities2Table).values([
			{ id1: 1, name: 'New York City' },
			{ id1: 2, name: 'Seattle' },
		]);
		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId: 1 },
			{ id1: 2, name: 'Jane', cityId: 2 },
		]);
		const result = await db
			.update(users2Table)
			.set({
				cityId: cities2Table.id1,
			})
			.from(cities2Table)
			.where(and(eq(cities2Table.name, 'Seattle'), eq(users2Table.name, 'John')))
			.returning();

		expect(result).toStrictEqual([
			{
				id1: 1,
				name: 'John',
				cityId: 2,
				cities: {
					id1: 2,
					name: 'Seattle',
				},
			},
		]);
	});

	// TODO not supported yet
	test.todo('update ... from with alias', async (ctx) => {
		const { db } = ctx.gel;

		await db.insert(cities2Table).values([
			{ id1: 1, name: 'New York City' },
			{ id1: 2, name: 'Seattle' },
		]);
		await db.insert(users2Table).values([
			{ id1: 1, name: 'John', cityId: 1 },
			{ id1: 2, name: 'Jane', cityId: 2 },
		]);

		const users = alias(users2Table, 'u');
		const cities = alias(cities2Table, 'c');
		const result = await db
			.update(users)
			.set({
				cityId: cities.id1,
			})
			.from(cities)
			.where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
			.returning();

		expect(result).toStrictEqual([
			{
				id1: 1,
				name: 'John',
				cityId: 2,
				c: {
					id1: 2,
					name: 'Seattle',
				},
			},
		]);
	});

	// TODO not supported yet
	// test.todo('update ... from with join', async (ctx) => {
	// 	const { db } = ctx.gel;

	// 	const states = gelTable('states', {
	// 		id1: integer('id1').primaryKey(),
	// 		name: text('name').notNull(),
	// 	});
	// 	const cities = gelTable('cities', {
	// 		id1: integer('id1').primaryKey(),
	// 		name: text('name').notNull(),
	// 		stateId: integer('state_id').references(() => states.id1),
	// 	});
	// 	const users = gelTable('users', {
	// 		id1: integer('id1').primaryKey(),
	// 		name: text('name').notNull(),
	// 		cityId: integer('city_id')
	// 			.notNull()
	// 			.references(() => cities.id1),
	// 	});

	// 	await db.execute(sql`drop table if exists "states" cascade`);
	// 	await db.execute(sql`drop table if exists "cities" cascade`);
	// 	await db.execute(sql`drop table if exists "users" cascade`);
	// 	await db.execute(sql`
	//             create table "states" (
	//                 "id" serial primary key,
	//                 "name" text not null
	//             )
	//         `);
	// 	await db.execute(sql`
	//             create table "cities" (
	//                 "id" serial primary key,
	//                 "name" text not null,
	//                 "state_id" integer references "states"("id")
	//             )
	//         `);
	// 	await db.execute(sql`
	//             create table "users" (
	//                 "id" serial primary key,
	//                 "name" text not null,
	//                 "city_id" integer not null references "cities"("id")
	//             )
	//         `);

	// 	await db.insert(states).values([{ id1: 1, name: 'New York' }, { id1: 2, name: 'Washington' }]);
	// 	await db.insert(cities).values([
	// 		{ id1: 1, name: 'New York City', stateId: 1 },
	// 		{ id1: 2, name: 'Seattle', stateId: 2 },
	// 		{
	// 			id1: 2,
	// 			name: 'London',
	// 		},
	// 	]);
	// 	await db.insert(users).values([
	// 		{ id1: 1, name: 'John', cityId: 1 },
	// 		{ id1: 2, name: 'Jane', cityId: 2 },
	// 		{ id1: 3, name: 'Jack', cityId: 3 },
	// 	]);

	// 	const result1 = await db
	// 		.update(users)
	// 		.set({
	// 			cityId: cities.id1,
	// 		})
	// 		.from(cities)
	// 		.leftJoin(states, eq(cities.stateId, states.id1))
	// 		.where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
	// 		.returning();
	// 	const result2 = await db
	// 		.update(users)
	// 		.set({
	// 			cityId: cities.id1,
	// 		})
	// 		.from(cities)
	// 		.leftJoin(states, eq(cities.stateId, states.id1))
	// 		.where(and(eq(cities.name, 'London'), eq(users.name, 'Jack')))
	// 		.returning();

	// 	expect(result1).toStrictEqual([
	// 		{
	// 			id: 1,
	// 			name: 'John',
	// 			cityId: 2,
	// 			cities: {
	// 				id: 2,
	// 				name: 'Seattle',
	// 				stateId: 2,
	// 			},
	// 			states: {
	// 				id: 2,
	// 				name: 'Washington',
	// 			},
	// 		},
	// 	]);
	// 	expect(result2).toStrictEqual([
	// 		{
	// 			id: 3,
	// 			name: 'Jack',
	// 			cityId: 3,
	// 			cities: {
	// 				id: 3,
	// 				name: 'London',
	// 				stateId: null,
	// 			},
	// 			states: null,
	// 		},
	// 	]);
	// });

	test('insert into ... select', async (ctx) => {
		const { db } = ctx.gel;

		const notifications = gelTable('notifications', {
			id1: integer('id1').notNull(),
			sentAt: timestamp('sentAt').notNull().defaultNow(),
			message: text('message').notNull(),
		});
		const users = gelTable('users_insert_select', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});
		const userNotications = gelTable('user_notifications', {
			userId: integer('userId').notNull(),
			notificationId: integer('notificationId').notNull(),
		});

		const newNotification = await db
			.insert(notifications)
			.values({ id1: 1, message: 'You are one of the 3 lucky winners!' })
			.returning({ id1: notifications.id1 })
			.then((result) => result[0]);
		await db.insert(users).values([
			{ id1: 1, name: 'Alice' },
			{ id1: 2, name: 'Bob' },
			{ id1: 3, name: 'Charlie' },
			{
				id1: 4,
				name: 'David',
			},
			{
				id1: 5,
				name: 'Eve',
			},
		]);

		const sentNotifications = await db
			.insert(userNotications)
			.select(
				db
					.select({
						userId: users.id1,
						notificationId: sql`${newNotification!.id1}`.as('notification_id'),
					})
					.from(users)
					.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
					.orderBy(asc(users.id1)),
			)
			.returning();

		expect(sentNotifications).toStrictEqual([
			{ userId: 1, notificationId: newNotification!.id1 },
			{ userId: 3, notificationId: newNotification!.id1 },
			{ userId: 5, notificationId: newNotification!.id1 },
		]);
	});

	test('insert into ... select with keys in different order', async (ctx) => {
		const { db } = ctx.gel;

		const users1 = gelTable('users1', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});
		const users2 = gelTable('users2', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		expect(() =>
			db.insert(users1).select(
				db
					.select({
						name: users2.name,
						id1: users2.id1,
					})
					.from(users2),
			)
		).toThrowError();
	});

	test('policy', () => {
		{
			const policy = gelPolicy('test policy');

			expect(is(policy, GelPolicy)).toBe(true);
			expect(policy.name).toBe('test policy');
		}

		{
			const policy = gelPolicy('test policy', {
				as: 'permissive',
				for: 'all',
				to: 'public',
				using: sql`1=1`,
				withCheck: sql`1=1`,
			});

			expect(is(policy, GelPolicy)).toBe(true);
			expect(policy.name).toBe('test policy');
			expect(policy.as).toBe('permissive');
			expect(policy.for).toBe('all');
			expect(policy.to).toBe('public');
			const dialect = new GelDialect();
			expect(is(policy.using, SQL)).toBe(true);
			expect(dialect.sqlToQuery(policy.using!).sql).toBe('1=1');
			expect(is(policy.withCheck, SQL)).toBe(true);
			expect(dialect.sqlToQuery(policy.withCheck!).sql).toBe('1=1');
		}

		{
			const policy = gelPolicy('test policy', {
				to: 'custom value',
			});

			expect(policy.to).toBe('custom value');
		}

		{
			const p1 = gelPolicy('test policy');
			const p2 = gelPolicy('test policy 2', {
				as: 'permissive',
				for: 'all',
				to: 'public',
				using: sql`1=1`,
				withCheck: sql`1=1`,
			});
			const table = gelTable(
				'table_with_policy',
				{
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				},
				() => [
					p1,
					p2,
				],
			);
			const config = getTableConfig(table);
			expect(config.policies).toHaveLength(2);
			expect(config.policies[0]).toBe(p1);
			expect(config.policies[1]).toBe(p2);
		}
	});

	test('Enable RLS function', () => {
		const usersWithRLS = gelTable('users', {
			id: integer(),
		}).enableRLS();

		const config1 = getTableConfig(usersWithRLS);

		const usersNoRLS = gelTable('users', {
			id: integer(),
		});

		const config2 = getTableConfig(usersNoRLS);

		expect(config1.enableRLS).toBeTruthy();
		expect(config2.enableRLS).toBeFalsy();
	});

	test('test $onUpdateFn and $onUpdate works with sql value', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_on_update_sql', {
			id: integer('id1').notNull(),
			name: text('name').notNull(),
			updatedAt: timestamptz('updated_at').notNull().$onUpdate(() => sql`now()`),
		});

		const insertResp = await db.insert(users).values({
			id: 1,
			name: 'John',
		}).returning({
			updatedAt: users.updatedAt,
		});
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const now = Date.now();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const updateResp = await db.update(users).set({
			name: 'John',
		}).returning({
			updatedAt: users.updatedAt,
		});

		expect(new Date(insertResp[0]?.updatedAt.toISOString() ?? 0).getTime()).lessThan(now);
		expect(new Date(updateResp[0]?.updatedAt.toISOString() ?? 0).getTime()).greaterThan(now);
	});

	test('$count separate', async (ctx) => {
		const { db } = ctx.gel;

		const countTestTable = gelTable('count_test', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		await db.insert(countTestTable).values([
			{ id1: 1, name: 'First' },
			{ id1: 2, name: 'Second' },
			{ id1: 3, name: 'Third' },
			{ id1: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable);

		expect(count).toStrictEqual(4);
	});

	test('$count embedded', async (ctx) => {
		const { db } = ctx.gel;

		const countTestTable = gelTable('count_test', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		await db.insert(countTestTable).values([
			{ id1: 1, name: 'First' },
			{ id1: 2, name: 'Second' },
			{ id1: 3, name: 'Third' },
			{ id1: 4, name: 'Fourth' },
		]);

		const count = await db
			.select({
				count: db.$count(countTestTable),
			})
			.from(countTestTable);

		expect(count).toStrictEqual([{ count: 4 }, { count: 4 }, { count: 4 }, { count: 4 }]);
	});

	test('$count separate reuse', async (ctx) => {
		const { db } = ctx.gel;

		const countTestTable = gelTable('count_test', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		await db.insert(countTestTable).values([
			{ id1: 1, name: 'First' },
			{ id1: 2, name: 'Second' },
			{ id1: 3, name: 'Third' },
			{ id1: 4, name: 'Fourth' },
		]);

		const count = db.$count(countTestTable);

		const count1 = await count;

		await db.insert(countTestTable).values({ id1: 5, name: 'fifth' });

		const count2 = await count;

		await db.insert(countTestTable).values({ id1: 6, name: 'sixth' });

		const count3 = await count;

		expect(count1).toStrictEqual(4);
		expect(count2).toStrictEqual(5);
		expect(count3).toStrictEqual(6);
	});

	test('$count embedded reuse', async (ctx) => {
		const { db } = ctx.gel;

		const countTestTable = gelTable('count_test', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		await db.insert(countTestTable).values([
			{ id1: 1, name: 'First' },
			{ id1: 2, name: 'Second' },
			{ id1: 3, name: 'Third' },
			{ id1: 4, name: 'Fourth' },
		]);

		const count = db
			.select({
				count: db.$count(countTestTable),
			})
			.from(countTestTable);

		const count1 = await count;

		await db.insert(countTestTable).values({ id1: 5, name: 'fifth' });

		const count2 = await count;

		await db.insert(countTestTable).values({ id1: 6, name: 'sixth' });

		const count3 = await count;

		expect(count1).toStrictEqual([{ count: 4 }, { count: 4 }, { count: 4 }, { count: 4 }]);
		expect(count2).toStrictEqual([{ count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }]);
		expect(count3).toStrictEqual([
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{
				count: 6,
			},
		]);
	});

	test('$count separate with filters', async (ctx) => {
		const { db } = ctx.gel;

		const countTestTable = gelTable('count_test', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		await db.insert(countTestTable).values([
			{ id1: 1, name: 'First' },
			{ id1: 2, name: 'Second' },
			{ id1: 3, name: 'Third' },
			{ id1: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable, gt(countTestTable.id1, 1));

		expect(count).toStrictEqual(3);
	});

	test('$count embedded with filters', async (ctx) => {
		const { db } = ctx.gel;

		const countTestTable = gelTable('count_test', {
			id1: integer('id1').notNull(),
			name: text('name').notNull(),
		});

		await db.insert(countTestTable).values([
			{ id1: 1, name: 'First' },
			{ id1: 2, name: 'Second' },
			{ id1: 3, name: 'Third' },
			{ id1: 4, name: 'Fourth' },
		]);

		const count = await db
			.select({
				count: db.$count(countTestTable, gt(countTestTable.id1, 1)),
			})
			.from(countTestTable);

		expect(count).toStrictEqual([{ count: 3 }, { count: 3 }, { count: 3 }, { count: 3 }]);
	});

	// TODO
	test.todo('insert multiple rows into table with generated identity column', async (ctx) => {
		const { db } = ctx.gel;

		const identityColumnsTable = gelTable('identity_columns_table', {
			id: integer('id').generatedAlwaysAsIdentity(),
			id1: integer('id1').generatedByDefaultAsIdentity(),
			name: text('name').notNull(),
		});

		// not passing identity columns
		await db.execute(sql`drop table if exists ${identityColumnsTable}`);
		await db.execute(
			sql`create table ${identityColumnsTable} ("id" integer generated always as identity, "id1" integer generated by default as identity, "name" text)`,
		);

		let result = await db
			.insert(identityColumnsTable)
			.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
			.returning();

		expect(result).toEqual([
			{ id: 1, id1: 1, name: 'John' },
			{ id: 2, id1: 2, name: 'Jane' },
			{ id: 3, id1: 3, name: 'Bob' },
		]);

		// passing generated by default as identity column
		await db.execute(sql`drop table if exists ${identityColumnsTable}`);
		await db.execute(
			sql`create table ${identityColumnsTable} ("id" integer generated always as identity, "id1" integer generated by default as identity, "name" text)`,
		);

		result = await db
			.insert(identityColumnsTable)
			.values([
				{ name: 'John', id1: 3 },
				{ name: 'Jane', id1: 5 },
				{ name: 'Bob', id1: 5 },
			])
			.returning();

		expect(result).toEqual([
			{ id: 1, id1: 3, name: 'John' },
			{ id: 2, id1: 5, name: 'Jane' },
			{ id: 3, id1: 5, name: 'Bob' },
		]);

		// passing all identity columns
		await db.execute(sql`drop table if exists ${identityColumnsTable}`);
		await db.execute(
			sql`create table ${identityColumnsTable} ("id" integer generated always as identity, "id1" integer generated by default as identity, "name" text)`,
		);

		result = await db
			.insert(identityColumnsTable)
			.overridingSystemValue()
			.values([
				{ name: 'John', id: 2, id1: 3 },
				{ name: 'Jane', id: 4, id1: 5 },
				{ name: 'Bob', id: 4, id1: 5 },
			])
			.returning();

		expect(result).toEqual([
			{ id: 2, id1: 3, name: 'John' },
			{ id: 4, id1: 5, name: 'Jane' },
			{ id: 4, id1: 5, name: 'Bob' },
		]);
	});

	test('insert via db.execute + select via db.execute', async (ctx) => {
		const { db } = ctx.gel;
		await db.execute(
			sql`insert into ${usersTable} (${sql.identifier(usersTable.id1.name)},${
				sql.identifier(usersTable.name.name)
			}) values (1, ${'John'})`,
		);

		const result = await db.execute<{ id1: number; name: string }>(
			sql`select id1, name from "users"`,
		);
		expect(result).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async (ctx) => {
		const { db } = ctx.gel;
		const inserted = await db.execute<{ id1: number; name: string }>(
			sql`insert into ${usersTable} (${
				sql.identifier(
					usersTable.id1.name,
				)
			}, ${
				sql.identifier(
					usersTable.name.name,
				)
			}) values (1, ${'John'}) returning ${usersTable.id1}, ${usersTable.name}`,
		);
		expect(inserted).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async (ctx) => {
		const { db } = ctx.gel;
		const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id1' | 'name'>>(
			db
				.insert(usersTable)
				.values({ id1: 1, name: 'John' })
				.returning({ id1: usersTable.id1, name: usersTable.name }),
		);
		expect(inserted).toEqual([{ id1: 1, name: 'John' }]);
	});

	test('RQB v2 simple find first - no rows', async (ctx) => {
		const { db } = ctx.gel;

		const result = await db.query.rqbUser.findFirst();

		expect(result).toStrictEqual(undefined);
	});

	test('RQB v2 simple find first - multiple rows', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const result = await db.query.rqbUser.findFirst({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual({
			_id: expect.stringMatching(/(.*)/),
			id: 2,
			createdAt: date,
			name: 'Second',
		});
	});

	test('RQB v2 simple find first - with relation', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

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
			_id: expect.stringMatching(/(.*)/),
			id: 1,
			createdAt: date,
			name: 'First',
			posts: [{
				_id: expect.stringMatching(/(.*)/),
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				_id: expect.stringMatching(/(.*)/),
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}],
		});
	});

	test('RQB v2 simple find first - placeholders', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const query = db.query.rqbUser.findFirst({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare('rqb_v2_find_first_placeholders');

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual({
			_id: expect.stringMatching(/(.*)/),
			id: 2,
			createdAt: date,
			name: 'Second',
		});
	});

	test('RQB v2 simple find many - no rows', async (ctx) => {
		const { db } = ctx.gel;

		const result = await db.query.rqbUser.findMany();

		expect(result).toStrictEqual([]);
	});

	test('RQB v2 simple find many - multiple rows', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const result = await db.query.rqbUser.findMany({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual([{
			_id: expect.stringMatching(/(.*)/),
			id: 2,
			createdAt: date,
			name: 'Second',
		}, {
			_id: expect.stringMatching(/(.*)/),
			id: 1,
			createdAt: date,
			name: 'First',
		}]);
	});

	test('RQB v2 simple find many - with relation', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

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

		const result = await db.query.rqbPost.findMany({
			with: {
				author: true,
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual([{
			_id: expect.stringMatching(/(.*)/),
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
			author: {
				_id: expect.stringMatching(/(.*)/),
				id: 1,
				createdAt: date,
				name: 'First',
			},
		}, {
			_id: expect.stringMatching(/(.*)/),
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
			author: {
				_id: expect.stringMatching(/(.*)/),
				id: 1,
				createdAt: date,
				name: 'First',
			},
		}]);
	});

	test('RQB v2 simple find many - placeholders', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const query = db.query.rqbUser.findMany({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare('rqb_v2_find_many_placeholders');

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual([{
			_id: expect.stringMatching(/(.*)/),
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);
	});

	test('RQB v2 transaction find first - no rows', async (ctx) => {
		const { db } = ctx.gel;

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst();

			expect(result).toStrictEqual(undefined);
		});
	});

	test('RQB v2 transaction find first - multiple rows', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual({
				_id: expect.stringMatching(/(.*)/),
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});
	});

	test('RQB v2 transaction find first - with relation', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

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
				_id: expect.stringMatching(/(.*)/),
				id: 1,
				createdAt: date,
				name: 'First',
				posts: [{
					_id: expect.stringMatching(/(.*)/),
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					_id: expect.stringMatching(/(.*)/),
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}],
			});
		});
	});

	test('RQB v2 transaction find first - placeholders', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

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
			}).prepare('rqb_v2_find_first_tx_placeholders');

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual({
				_id: expect.stringMatching(/(.*)/),
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});
	});

	test('RQB v2 transaction find many - no rows', async (ctx) => {
		const { db } = ctx.gel;

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findMany();

			expect(result).toStrictEqual([]);
		});
	});

	test('RQB v2 transaction find many - multiple rows', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findMany({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual([{
				_id: expect.stringMatching(/(.*)/),
				id: 2,
				createdAt: date,
				name: 'Second',
			}, {
				_id: expect.stringMatching(/(.*)/),
				id: 1,
				createdAt: date,
				name: 'First',
			}]);
		});
	});

	test('RQB v2 transaction find many - with relation', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

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
				_id: expect.stringMatching(/(.*)/),
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
				author: {
					_id: expect.stringMatching(/(.*)/),
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}, {
				_id: expect.stringMatching(/(.*)/),
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
				author: {
					_id: expect.stringMatching(/(.*)/),
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}]);
		});
	});

	test('RQB v2 transaction find many - placeholders', async (ctx) => {
		const { db } = ctx.gel;

		const date = new Date(12000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

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
			}).prepare('rqb_v2_find_many_placeholders');

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual([{
				_id: expect.stringMatching(/(.*)/),
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		});
	});

	test('test force invalidate', async (ctx) => {
		const { db } = ctx.cachedGel;

		using spyInvalidate = vi.spyOn(db.$cache, 'invalidate');
		await db.$cache?.invalidate({ tables: 'users' });
		expect(spyInvalidate).toHaveBeenCalledTimes(1);
	});

	test('default global config - no cache should be hit', async (ctx) => {
		const { db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable);

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('default global config + enable cache on select: get, put', async (ctx) => {
		const { db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache();

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('default global config + enable cache on select + write: get, put, onMutate', async (ctx) => {
		const { db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache({ config: { ex: 1 } });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		spyPut.mockClear();
		spyGet.mockClear();
		spyInvalidate.mockClear();

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(1);
	});

	test('default global config + enable cache on select + disable invalidate: get, put', async (ctx) => {
		const { db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false, config: { ex: 1 } });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		// invalidate force
		await db.$cache?.invalidate({ tags: ['custom'] });
	});

	test('global: true + disable cache', async (ctx) => {
		const { dbGlobalCached: db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache(false);

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('global: true - cache should be hit', async (ctx) => {
		const { dbGlobalCached: db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable);

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('global: true - cache: false on select - no cache hit', async (ctx) => {
		const { dbGlobalCached: db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache(false);

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('global: true - disable invalidate - cache hit + no invalidate', async (ctx) => {
		const { dbGlobalCached: db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache({ autoInvalidate: false });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		spyPut.mockClear();
		spyGet.mockClear();
		spyInvalidate.mockClear();

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(1);
	});

	test('global: true - with custom tag', async (ctx) => {
		const { dbGlobalCached: db } = ctx.cachedGel;

		// @ts-expect-error
		using spyPut = vi.spyOn(db.$cache, 'put');
		// @ts-expect-error
		using spyGet = vi.spyOn(db.$cache, 'get');
		// @ts-expect-error
		using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

		await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		await db.insert(usersTable).values({ id1: 1, name: 'John' });

		// invalidate force
		await db.$cache?.invalidate({ tags: ['custom'] });
	});

	// check select used tables
	test('check simple select used tables', (ctx) => {
		const { db } = ctx.cachedGel;

		// @ts-expect-error
		expect(db.select().from(usersTable).getUsedTables()).toStrictEqual(['users']);
		// @ts-expect-error
		expect(db.select().from(sql`${usersTable}`).getUsedTables()).toStrictEqual(['users']);
	});
	// check select+join used tables
	test('select+join', (ctx) => {
		const { db } = ctx.cachedGel;

		// @ts-expect-error
		expect(db.select().from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables())
			.toStrictEqual(['users', 'posts']);
		expect(
			// @ts-expect-error
			db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables(),
		).toStrictEqual(['users', 'posts']);
	});
	// check select+2join used tables
	test('select+2joins', (ctx) => {
		const { db } = ctx.cachedGel;

		expect(
			db.select().from(usersTable).leftJoin(
				postsTable,
				eq(usersTable.id1, postsTable.userId),
			).leftJoin(
				alias(postsTable, 'post2'),
				eq(usersTable.id1, postsTable.userId),
			)
				// @ts-expect-error
				.getUsedTables(),
		)
			.toStrictEqual(['users', 'posts']);
		expect(
			db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id1, postsTable.userId)).leftJoin(
				alias(postsTable, 'post2'),
				eq(usersTable.id1, postsTable.userId),
				// @ts-expect-error
			).getUsedTables(),
		).toStrictEqual(['users', 'posts']);
	});
	// select subquery used tables
	test('select+join', (ctx) => {
		const { db } = ctx.cachedGel;

		const sq = db.select().from(usersTable).where(eq(usersTable.id1, 42)).as('sq');

		// @ts-expect-error
		expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users']);
	});

	test('column.as', async (ctx) => {
		const { db } = ctx.gel;

		const users = gelTable('users_with_cities', {
			id: integer('id1').primaryKey(),
			name: text('name').notNull(),
			cityId: integer('cityId').references(() => cities.id),
		});

		const cities = gelTable('cities', {
			id: integer('id1').primaryKey(),
			name: text('name').notNull(),
		});

		await db.delete(users);
		await db.delete(cities);

		const citiesInsRet = await db.insert(cities).values([{
			id: 1,
			name: 'Firstistan',
		}, {
			id: 2,
			name: 'Secondaria',
		}]).returning({
			cityId: cities.id.as('city_id'),
			cityName: cities.name.as('city_name'),
		});

		expect(citiesInsRet).toStrictEqual(expect.arrayContaining([{
			cityId: 1,
			cityName: 'Firstistan',
		}, {
			cityId: 2,
			cityName: 'Secondaria',
		}]));

		const usersInsRet = await db.insert(users).values([{ id: 1, name: 'First', cityId: 1 }, {
			id: 2,
			name: 'Second',
			cityId: 2,
		}, {
			id: 3,
			name: 'Third',
		}]).returning({
			userId: users.id.as('user_id'),
			userName: users.name.as('users_name'),
			userCityId: users.cityId,
		});

		expect(usersInsRet).toStrictEqual(expect.arrayContaining([{ userId: 1, userName: 'First', userCityId: 1 }, {
			userId: 2,
			userName: 'Second',
			userCityId: 2,
		}, {
			userId: 3,
			userName: 'Third',
			userCityId: null,
		}]));

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

		await db.delete(users);
		await db.delete(cities);
	});
});
