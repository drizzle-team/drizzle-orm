import Docker from 'dockerode';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
	Equal,
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
	SQLWrapper,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import type { CockroachColumn, CockroachDatabase, CockroachQueryResultHKT } from 'drizzle-orm/cockroach-core';
import {
	alias,
	bigint,
	bit,
	bool,
	boolean,
	char,
	CockroachDialect,
	cockroachEnum,
	cockroachMaterializedView,
	CockroachPolicy,
	cockroachPolicy,
	cockroachSchema,
	cockroachTable,
	cockroachTableCreator,
	cockroachView,
	date,
	doublePrecision,
	except,
	exceptAll,
	float,
	foreignKey,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	inet,
	int4,
	intersect,
	intersectAll,
	interval,
	jsonb,
	numeric,
	primaryKey,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	union,
	unionAll,
	unique,
	uuid,
	uuid as cockroachUuid,
	varbit,
	varchar,
} from 'drizzle-orm/cockroach-core';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';
import { afterAll, afterEach, beforeEach, describe, expect, expectTypeOf, test } from 'vitest';
import { Expect } from '~/utils';

declare module 'vitest' {
	interface TestContext {
		cockroach: {
			db: CockroachDatabase<any>;
		};
	}
}

const en = cockroachEnum('en', ['enVal1', 'enVal2']);

const allTypesTable = cockroachTable('all_types', {
	int4: int4('int4'),
	bigint53: bigint('bigint53', {
		mode: 'number',
	}),
	bigint64: bigint('bigint64', {
		mode: 'bigint',
	}),
	bool: bool('bool'),
	boolean: bool('boolean'),
	char: char('char'),
	string: string('string'),
	date: date('date', {
		mode: 'date',
	}),
	dateStr: date('date_str', {
		mode: 'string',
	}),
	double: doublePrecision('double'),
	enum: en('enum'),
	inet: inet('inet'),
	interval: interval('interval'),
	jsonb: jsonb('jsonb'),
	numeric: numeric('numeric'),
	numericNum: numeric('numeric_num', {
		mode: 'number',
	}),
	numericBig: numeric('numeric_big', {
		mode: 'bigint',
	}),
	real: real('real'),
	float: float('float'),
	smallint: smallint('smallint'),
	text: text('text'),
	time: time('time'),
	timestamp: timestamp('timestamp', {
		mode: 'date',
	}),
	timestampTz: timestamp('timestamp_tz', {
		mode: 'date',
		withTimezone: true,
	}),
	timestampStr: timestamp('timestamp_str', {
		mode: 'string',
	}),
	timestampTzStr: timestamp('timestamp_tz_str', {
		mode: 'string',
		withTimezone: true,
	}),
	uuid: uuid('uuid'),
	varchar: varchar('varchar'),
	arrint: int4('arrint').array(),
	arrbigint53: bigint('arrbigint53', {
		mode: 'number',
	}).array(),
	arrbigint64: bigint('arrbigint64', {
		mode: 'bigint',
	}).array(),
	arrbool: bool('arrbool').array(),
	arrboolean: boolean('arrboolean').array(),
	arrchar: char('arrchar').array(),
	arrstring: string('arrstring').array(),
	arrdate: date('arrdate', {
		mode: 'date',
	}).array(),
	arrdateStr: date('arrdate_str', {
		mode: 'string',
	}).array(),
	arrdouble: doublePrecision('arrdouble').array(),
	arrfloat: float('arrfloat').array(),
	arrenum: en('arrenum').array(),
	arrinet: inet('arrinet').array(),
	arrinterval: interval('arrinterval').array(),
	arrnumeric: numeric('arrnumeric').array(),
	arrnumericNum: numeric('arrnumeric_num', {
		mode: 'number',
	}).array(),
	arrnumericBig: numeric('arrnumeric_big', {
		mode: 'bigint',
	}).array(),
	arrreal: real('arrreal').array(),
	arrsmallint: smallint('arrsmallint').array(),
	arrtext: text('arrtext').array(),
	arrtime: time('arrtime').array(),
	arrtimestamp: timestamp('arrtimestamp', {
		mode: 'date',
	}).array(),
	arrtimestampTz: timestamp('arrtimestamp_tz', {
		mode: 'date',
		withTimezone: true,
	}).array(),
	arrtimestampStr: timestamp('arrtimestamp_str', {
		mode: 'string',
	}).array(),
	arrtimestampTzStr: timestamp('arrtimestamp_tz_str', {
		mode: 'string',
		withTimezone: true,
	}).array(),
	arruuid: uuid('arruuid').array(),
	arrvarchar: varchar('arrvarchar').array(),
	bit: bit('bit'),
	varbit: varbit('varbit'),
	arrbit: bit('arrbit').array(),
	arrvarbit: varbit('arrvarbit').array(),
});

export const usersTable = cockroachTable('users', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	verified: bool('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const usersOnUpdate = cockroachTable('users_on_update', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	updateCounter: int4('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 }).$onUpdate(() => new Date()),
	alwaysNull: text('always_null').$type<string | null>().$onUpdate(() => null),
	// uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper("name")`),
});

const citiesTable = cockroachTable('cities', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	state: char('state', { length: 2 }),
});

const cities2Table = cockroachTable('cities', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
});

const users2Table = cockroachTable('users2', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	cityId: int4('city_id').references(() => citiesTable.id),
});

const coursesTable = cockroachTable('courses', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	categoryId: int4('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = cockroachTable('course_categories', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
});

const orders = cockroachTable('orders', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: int4('amount').notNull(),
	quantity: int4('quantity').notNull(),
});

const network = cockroachTable('network_table', {
	inet: inet('inet').notNull(),
});

const salEmp = cockroachTable('sal_emp', {
	name: text('name'),
	payByQuarter: int4('pay_by_quarter').array(),
});

export const usersMigratorTable = cockroachTable('users12', {
	id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

// To test aggregate functions
const aggregateTable = cockroachTable('aggregate_table', {
	id: int4('id').notNull().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	a: int4('a'),
	b: int4('b'),
	c: int4('c'),
	nullOnly: int4('null_only'),
});

// To test another schema and multischema
export const mySchema = cockroachSchema('mySchema');

export const usersMySchemaTable = mySchema.table('users', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	verified: bool('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const citiesMySchemaTable = mySchema.table('cities', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	state: char('state', { length: 2 }),
});

const users2MySchemaTable = mySchema.table('users2', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	cityId: int4('city_id').references(() => citiesTable.id),
});

const jsonTestTable = cockroachTable('jsontest', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	jsonb: jsonb('jsonb').$type<{ string: string; number: number }>(),
});

let cockroachContainer: Docker.Container;

export async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 26257 });
	const image = 'cockroachdb/cockroach:v24.1.0';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	cockroachContainer = await docker.createContainer({
		Image: image,
		Cmd: ['start-single-node', '--insecure'],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'26257/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await cockroachContainer.start();

	return {
		connectionString: `postgresql://root@127.0.0.1:${port}/defaultdb?sslmode=disable`,
		container: cockroachContainer,
	};
}

afterAll(async () => {
	await cockroachContainer?.stop().catch(console.error);
});

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db } = ctx.cockroach;
			await db.execute(sql`drop database defaultdb;`);
			await db.execute(sql`create database defaultdb;`);
			await db.execute(sql`create schema if not exists custom_migrations`);
			await db.execute(sql`create schema ${mySchema}`);
			// public users
			await db.execute(
				sql`
					create table users (
						id int4 primary key generated by default as identity,
						name text not null,
						verified bool not null default false,
						jsonb jsonb,
						created_at timestamptz not null default now()
					)
				`,
			);
			// public cities
			await db.execute(
				sql`
					create table cities (
						id int4 primary key generated by default as identity,
						name text not null,
						state char(2)
					)
				`,
			);
			// public users2
			await db.execute(
				sql`
					create table users2 (
						id int4 primary key generated by default as identity,
						name text not null,
						city_id int4 references cities(id)
					)
				`,
			);
			await db.execute(
				sql`
					create table course_categories (
						id int4 primary key generated by default as identity,
						name text not null
					)
				`,
			);
			await db.execute(
				sql`
					create table courses (
						id int4 primary key generated by default as identity,
						name text not null,
						category_id int4 references course_categories(id)
					)
				`,
			);
			await db.execute(
				sql`
					create table orders (
						id int4 primary key generated by default as identity,
						region text not null,
						product text not null,
						amount int4 not null,
						quantity int4 not null
					)
				`,
			);
			await db.execute(
				sql`
					create table network_table (
						inet inet not null
					)
				`,
			);
			await db.execute(
				sql`
					create table sal_emp (
						name text not null,
						pay_by_quarter int4[] not null
					)
				`,
			);
			// // mySchema users
			await db.execute(
				sql`
					create table ${usersMySchemaTable} (
						id int4 primary key generated by default as identity,
						name text not null,
						verified bool not null default false,
						jsonb jsonb,
						created_at timestamptz not null default now()
					)
				`,
			);
			// mySchema cities
			await db.execute(
				sql`
					create table ${citiesMySchemaTable} (
						id int4 primary key generated by default as identity,
						name text not null,
						state char(2)
					)
				`,
			);
			// mySchema users2
			await db.execute(
				sql`
					create table ${users2MySchemaTable} (
						id int4 primary key generated by default as identity,
						name text not null,
						city_id int4 references "mySchema".cities(id)
					)
				`,
			);

			await db.execute(
				sql`
					create table jsontest (
						id int4 primary key generated by default as identity,
						json json,
						jsonb jsonb
					)
				`,
			);
		});

		afterEach(async (ctx) => {
			const { db } = ctx.cockroach;
			await db.execute(sql`drop schema if exists custom_migrations cascade`);
		});

		async function setupSetOperationTest(db: CockroachDatabase<CockroachQueryResultHKT>) {
			await db.execute(sql`drop table if exists users2`);
			await db.execute(sql`drop table if exists cities`);
			await db.execute(
				sql`
					create table cities (
						id int4 primary key generated by default as identity,
						name text not null
					)
				`,
			);
			await db.execute(
				sql`
					create table users2 (
						id int4 primary key generated by default as identity,
						name text not null,
						city_id int4 references cities(id)
					)
				`,
			);

			await db.insert(cities2Table).values([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			await db.insert(users2Table).values([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 2 },
				{ id: 3, name: 'Jack', cityId: 3 },
				{ id: 4, name: 'Peter', cityId: 3 },
				{ id: 5, name: 'Ben', cityId: 2 },
				{ id: 6, name: 'Jill', cityId: 1 },
				{ id: 7, name: 'Mary', cityId: 2 },
				{ id: 8, name: 'Sally', cityId: 1 },
			]);
		}

		async function setupAggregateFunctionsTest(db: CockroachDatabase<CockroachQueryResultHKT>) {
			await db.execute(sql`drop table if exists "aggregate_table"`);
			await db.execute(
				sql`
					create table "aggregate_table" (
						"id" int4 not null generated by default as identity,
						"name" text not null,
						"a" int4,
						"b" int4,
						"c" int4,
						"null_only" int4
					);
				`,
			);
			await db.insert(aggregateTable).values([
				{ name: 'value 1', a: 5, b: 10, c: 20 },
				{ name: 'value 1', a: 5, b: 20, c: 30 },
				{ name: 'value 2', a: 10, b: 50, c: 60 },
				{ name: 'value 3', a: 20, b: 20, c: null },
				{ name: 'value 4', a: null, b: 90, c: 120 },
				{ name: 'value 5', a: 80, b: 10, c: null },
				{ name: 'value 6', a: null, b: null, c: 150 },
			]);
		}

		test('table configs: unique third param', async () => {
			const cities1Table = cockroachTable(
				'cities1',
				{
					id: int4('id').primaryKey(),
					name: text('name').notNull(),
					state: char('state', { length: 2 }),
				},
				(
					t,
				) => [unique('custom_name').on(t.name, t.state), unique('custom_name1').on(t.name, t.state)],
			);

			const tableConfig = getTableConfig(cities1Table);

			expect(tableConfig.uniqueConstraints).toHaveLength(2);

			expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
			expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

			expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
			expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
		});

		test('table configs: unique in column', async () => {
			const cities1Table = cockroachTable('cities1', {
				id: int4('id').primaryKey(),
				name: text('name').notNull().unique(),
				state: char('state', { length: 2 }).unique('custom'),
				field: char('field', { length: 2 }).unique('custom_field'),
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
			expect(columnField?.uniqueType).toBe(undefined);
		});

		test('table config: foreign keys name', async () => {
			const table = cockroachTable('cities', {
				id: int4('id'),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => [foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' })]);

			const tableConfig = getTableConfig(table);

			expect(tableConfig.foreignKeys).toHaveLength(1);
			expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
		});

		test('table config: primary keys name', async () => {
			const table = cockroachTable('cities', {
				id: int4('id'),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => [primaryKey({ columns: [t.id, t.name], name: 'custom_pk' })]);

			const tableConfig = getTableConfig(table);

			expect(tableConfig.primaryKeys).toHaveLength(1);
			expect(tableConfig.primaryKeys[0]!.getName()).toBe('custom_pk');
		});

		test('select all fields', async (ctx) => {
			const { db } = ctx.cockroach;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' });
			const result = await db.select().from(usersTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('select sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select typed sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });

			const users = await db.select({
				name: sql<string>`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select with empty array in inArray', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(inArray(usersTable.id, []));

			expect(result).toEqual([]);
		});

		test('select with empty array in notInArray', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(notInArray(usersTable.id, []));

			expect(result).toEqual([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4878
		test.concurrent('.where with isNull in it', async (ctx) => {
			const { db } = ctx.cockroach;

			const table = cockroachTable('table_where_is_null', {
				col1: boolean(),
				col2: text(),
			});

			await db.execute(sql`drop table if exists table_where_is_null;`);
			await db.execute(sql`create table table_where_is_null (col1 boolean, col2 text);`);
			await db.insert(table).values([{ col1: true }, { col1: false, col2: 'qwerty' }]);

			const query = db.select().from(table).where(eq(table.col1, isNull(table.col2)));
			expect(query.toSQL()).toStrictEqual({
				sql:
					'select "col1", "col2" from "table_where_is_null" where "table_where_is_null"."col1" = ("table_where_is_null"."col2" is null)',
				params: [],
			});
			const res = await query;
			expect(res).toStrictEqual([{ col1: true, col2: null }, { col1: false, col2: 'qwerty' }]);
		});

		test('$default function', async (ctx) => {
			const { db } = ctx.cockroach;

			const insertedOrder = await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 })
				.returning();
			const selectedOrder = await db.select().from(orders);

			expect(insertedOrder).toEqual([{
				id: 1,
				amount: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			}]);

			expect(selectedOrder).toEqual([{
				id: 1,
				amount: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			}]);
		});

		test('select distinct', async (ctx) => {
			const { db } = ctx.cockroach;

			const usersDistinctTable = cockroachTable('users_distinct', {
				id: int4('id').notNull(),
				name: text('name').notNull(),
				age: int4('age').notNull(),
			});

			await db.execute(sql`drop table if exists ${usersDistinctTable}`);
			await db.execute(sql`create table ${usersDistinctTable} (id int4, name text, age int4)`);

			await db.insert(usersDistinctTable).values([
				{ id: 1, name: 'John', age: 24 },
				{ id: 1, name: 'John', age: 24 },
				{ id: 2, name: 'John', age: 25 },
				{ id: 1, name: 'Jane', age: 24 },
				{ id: 1, name: 'Jane', age: 26 },
			]);
			const users1 = await db.selectDistinct().from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
				usersDistinctTable.name,
			);
			const users2 = await db.selectDistinctOn([usersDistinctTable.id]).from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
			);
			const users3 = await db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
				usersDistinctTable,
			).orderBy(usersDistinctTable.name);
			const users4 = await db.selectDistinctOn([usersDistinctTable.id, usersDistinctTable.age]).from(
				usersDistinctTable,
			).orderBy(usersDistinctTable.id, usersDistinctTable.age);

			await db.execute(sql`drop table ${usersDistinctTable}`);

			expect(users1).toEqual([
				{ id: 1, name: 'Jane', age: 24 },
				{ id: 1, name: 'Jane', age: 26 },
				{ id: 1, name: 'John', age: 24 },
				{ id: 2, name: 'John', age: 25 },
			]);

			expect(users2).toHaveLength(2);
			expect(users2[0]?.id).toBe(1);
			expect(users2[1]?.id).toBe(2);

			expect(users3).toHaveLength(2);
			expect(users3[0]?.name).toBe('Jane');
			expect(users3[1]?.name).toBe('John');

			expect(users4).toEqual([
				{ id: 1, name: 'John', age: 24 },
				{ id: 1, name: 'Jane', age: 26 },
				{ id: 2, name: 'John', age: 25 },
			]);
		});

		test('insert returning sql', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = await db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({
					name: sql`upper(${usersTable.name})`,
				});

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('delete returning sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.delete(usersTable)
				.where(eq(usersTable.name, 'John'))
				.returning({
					name: sql`upper(${usersTable.name})`,
				});

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('update returning sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
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
			const { db } = ctx.cockroach;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.update(usersTable)
				.set({ name: 'Jane' })
				.where(eq(usersTable.name, 'John'))
				.returning();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(users).toEqual([
				{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
			]);
		});

		test('update with returning partial', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.update(usersTable)
				.set({ name: 'Jane' })
				.where(eq(usersTable.name, 'John'))
				.returning({
					id: usersTable.id,
					name: usersTable.name,
				});

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test('delete with returning all fields', async (ctx) => {
			const { db } = ctx.cockroach;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(users).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
			]);
		});

		test('delete with returning partial', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
				id: usersTable.id,
				name: usersTable.name,
			});

			expect(users).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert + select', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const result = await db.select().from(usersTable);
			expect(result).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt },
			]);

			await db.insert(usersTable).values({ name: 'Jane' });
			const result2 = await db.select().from(usersTable);
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test('json insert', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
			const result = await db
				.select({
					id: usersTable.id,
					name: usersTable.name,
					jsonb: usersTable.jsonb,
				})
				.from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
		});

		test('char insert', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
				.from(citiesTable);

			expect(result).toEqual([{ id: 1, name: 'Austin', state: 'TX' }]);
		});

		test('char update', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
			await db.update(citiesTable).set({ name: 'Atlanta', state: 'GA' }).where(eq(citiesTable.id, 1));
			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
				.from(citiesTable);

			expect(result).toEqual([{ id: 1, name: 'Atlanta', state: 'GA' }]);
		});

		test('char delete', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
			await db.delete(citiesTable).where(eq(citiesTable.state, 'TX'));
			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
				.from(citiesTable);

			expect(result).toEqual([]);
		});

		test('insert with overridden default values', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John', verified: true });
			const result = await db.select().from(usersTable);

			expect(result).toEqual([
				{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt },
			]);
		});

		test('insert many', async (ctx) => {
			const { db } = ctx.cockroach;

			await db
				.insert(usersTable)
				.values([
					{ name: 'John' },
					{ name: 'Bruce', jsonb: ['foo', 'bar'] },
					{ name: 'Jane' },
					{ name: 'Austin', verified: true },
				]);
			const result = await db
				.select({
					id: usersTable.id,
					name: usersTable.name,
					jsonb: usersTable.jsonb,
					verified: usersTable.verified,
				})
				.from(usersTable);

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test('insert many with returning', async (ctx) => {
			const { db } = ctx.cockroach;

			const result = await db
				.insert(usersTable)
				.values([
					{ name: 'John' },
					{ name: 'Bruce', jsonb: ['foo', 'bar'] },
					{ name: 'Jane' },
					{ name: 'Austin', verified: true },
				])
				.returning({
					id: usersTable.id,
					name: usersTable.name,
					jsonb: usersTable.jsonb,
					verified: usersTable.verified,
				});

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test('select with group by as field', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.name);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test('select with exists', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const user = alias(usersTable, 'user');
			const result = await db.select({ name: usersTable.name }).from(usersTable).where(
				exists(
					db.select({ one: sql`1` }).from(user).where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id))),
				),
			);

			expect(result).toEqual([{ name: 'John' }]);
		});

		test('select with group by as sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(sql`${usersTable.name}`);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test('select with group by as sql + column', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(sql`${usersTable.name}`, usersTable.id);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('select with group by as column + sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('select with group by complex query', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.limit(1);

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test('build query', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
				params: [],
			});
		});

		test('insert sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: sql`${'John'}` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('partial join with alias', async (ctx) => {
			const { db } = ctx.cockroach;
			const customerAlias = alias(usersTable, 'customer');

			await db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select({
					user: {
						id: usersTable.id,
						name: usersTable.name,
					},
					customer: {
						id: customerAlias.id,
						name: customerAlias.name,
					},
				})
				.from(usersTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(usersTable.id, 10));

			expect(result).toEqual([
				{
					user: { id: 10, name: 'Ivan' },
					customer: { id: 11, name: 'Hans' },
				},
			]);
		});

		test('full join with alias', async (ctx) => {
			const { db } = ctx.cockroach;

			const cockroachTable = cockroachTableCreator((name) => `prefixed_${name}`);

			const users = cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int4 primary key, name text not null)`);

			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select()
				.from(users)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([{
				users: {
					id: 10,
					name: 'Ivan',
				},
				customer: {
					id: 11,
					name: 'Hans',
				},
			}]);

			await db.execute(sql`drop table ${users}`);
		});

		test('select from alias', async (ctx) => {
			const { db } = ctx.cockroach;

			const cockroachTable = cockroachTableCreator((name) => `prefixed_${name}`);

			const users = cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int4 primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select()
				.from(user)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(user.id, 10));

			expect(result).toEqual([{
				user: {
					id: 10,
					name: 'Ivan',
				},
				customer: {
					id: 11,
					name: 'Hans',
				},
			}]);

			await db.execute(sql`drop table ${users}`);
		});

		test('insert with spaces', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test('prepared statement', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const statement = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.prepare('statement1');
			const result = await statement.execute();

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert: placeholders on columns with encoder', async (ctx) => {
			const { db } = ctx.cockroach;

			const statement = db.insert(usersTable).values({
				name: 'John',
				jsonb: sql.placeholder('jsonb'),
			}).prepare('encoder_statement');

			await statement.execute({ jsonb: ['foo', 'bar'] });

			const result = await db
				.select({
					id: usersTable.id,
					jsonb: usersTable.jsonb,
				})
				.from(usersTable);

			expect(result).toEqual([
				{ id: 1, jsonb: ['foo', 'bar'] },
			]);
		});

		test('prepared statement reuse', async (ctx) => {
			const { db } = ctx.cockroach;

			const stmt = db
				.insert(usersTable)
				.values({
					verified: true,
					name: sql.placeholder('name'),
				})
				.prepare('stmt2');

			for (let i = 0; i < 10; i++) {
				await stmt.execute({ name: `John ${i}` });
			}

			const result = await db
				.select({
					id: usersTable.id,
					name: usersTable.name,
					verified: usersTable.verified,
				})
				.from(usersTable);

			expect(result).toEqual([
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

		test('prepared statement with placeholder in .where', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.prepare('stmt3');
			const result = await stmt.execute({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('prepared statement with placeholder in .limit', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.limit(sql.placeholder('limit'))
				.prepare('stmt_limit');

			const result = await stmt.execute({ id: 1, limit: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
			expect(result).toHaveLength(1);
		});

		test('prepared statement with placeholder in .offset', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.offset(sql.placeholder('offset'))
				.prepare('stmt_offset');

			const result = await stmt.execute({ offset: 1 });

			expect(result).toEqual([{ id: 2, name: 'John1' }]);
		});

		test('prepared statement built using $dynamic', async (ctx) => {
			const { db } = ctx.cockroach;

			function withLimitOffset(qb: any) {
				return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
			}

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.$dynamic();
			withLimitOffset(stmt).prepare('stmt_limit');

			const result = await stmt.execute({ limit: 1, offset: 1 });

			expect(result).toEqual([{ id: 2, name: 'John1' }]);
			expect(result).toHaveLength(1);
		});

		test('Query check: Insert all defaults in 1 row', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = db
				.insert(users)
				.values({})
				.toSQL();

			expect(query).toEqual({
				sql: 'insert into "users" ("id", "name", "state") values (default, default, default)',
				params: [],
			});
		});

		test('Query check: Insert all defaults in multiple rows', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').default('Dan'),
				state: text('state').default('UA'),
			});

			const query = db
				.insert(users)
				.values([{}, {}])
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "users" ("id", "name", "state") values (default, default, default), (default, default, default)',
				params: [],
			});
		});

		test('Insert all defaults in 1 row', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('empty_insert_single', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int4 primary key generated by default as identity, name text default 'Dan', state text)`,
			);

			await db.insert(users).values({});

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
		});

		test('Insert all defaults in multiple rows', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('empty_insert_multiple', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int4 primary key generated by default as identity, name text default 'Dan', state text)`,
			);

			await db.insert(users).values([{}, {}]);

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
		});

		test('build query insert with onConflict do update', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db
				.insert(usersTable)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do update set "name" = $3',
				params: ['John', '["foo","bar"]', 'John1'],
			});
		});

		test('build query insert with onConflict do update / multiple columns', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db
				.insert(usersTable)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoUpdate({ target: [usersTable.id, usersTable.name], set: { name: 'John1' } })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
				params: ['John', '["foo","bar"]', 'John1'],
			});
		});

		test('build query insert with onConflict do nothing', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db
				.insert(usersTable)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoNothing()
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict do nothing',
				params: ['John', '["foo","bar"]'],
			});
		});

		test('build query insert with onConflict do nothing + target', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db
				.insert(usersTable)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoNothing({ target: usersTable.id })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
				params: ['John', '["foo","bar"]'],
			});
		});

		test('insert with onConflict do update', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });

			await db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } });

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1));

			expect(res).toEqual([{ id: 1, name: 'John1' }]);
		});

		test('insert with onConflict do nothing', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });

			await db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing();

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1));

			expect(res).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert with onConflict do nothing + target', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });

			await db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoNothing({ target: usersTable.id });

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1));

			expect(res).toEqual([{ id: 1, name: 'John' }]);
		});

		test('left join (flat object fields)', async (ctx) => {
			const { db } = ctx.cockroach;

			const { id: cityId } = await db
				.insert(citiesTable)
				.values([{ name: 'Paris' }, { name: 'London' }])
				.returning({ id: citiesTable.id })
				.then((rows) => rows[0]!);

			await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

			const res = await db
				.select({
					userId: users2Table.id,
					userName: users2Table.name,
					cityId: citiesTable.id,
					cityName: citiesTable.name,
				})
				.from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

			expect(res).toEqual([
				{ userId: 1, userName: 'John', cityId, cityName: 'Paris' },
				{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
			]);
		});

		test('left join (grouped fields)', async (ctx) => {
			const { db } = ctx.cockroach;

			const { id: cityId } = await db
				.insert(citiesTable)
				.values([{ name: 'Paris' }, { name: 'London' }])
				.returning({ id: citiesTable.id })
				.then((rows) => rows[0]!);

			await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

			const res = await db
				.select({
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
				})
				.from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

			expect(res).toEqual([
				{
					id: 1,
					user: { name: 'John', nameUpper: 'JOHN' },
					city: { id: cityId, name: 'Paris', nameUpper: 'PARIS' },
				},
				{
					id: 2,
					user: { name: 'Jane', nameUpper: 'JANE' },
					city: null,
				},
			]);
		});

		test('left join (all fields)', async (ctx) => {
			const { db } = ctx.cockroach;

			const { id: cityId } = await db
				.insert(citiesTable)
				.values([{ name: 'Paris' }, { name: 'London' }])
				.returning({ id: citiesTable.id })
				.then((rows) => rows[0]!);

			await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

			const res = await db
				.select()
				.from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

			expect(res).toEqual([
				{
					users2: {
						id: 1,
						name: 'John',
						cityId,
					},
					cities: {
						id: cityId,
						name: 'Paris',
						state: null,
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

		test('join subquery', async (ctx) => {
			const { db } = ctx.cockroach;

			await db
				.insert(courseCategoriesTable)
				.values([
					{ name: 'Category 1' },
					{ name: 'Category 2' },
					{ name: 'Category 3' },
					{ name: 'Category 4' },
				]);

			await db
				.insert(coursesTable)
				.values([
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
		});

		test('with ... select', async (ctx) => {
			const { db } = ctx.cockroach;

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
							totalSales: sql<string>`sum(${orders.amount})`.as('total_sales'),
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

			const result1 = await db
				.with(regionalSales, topRegions)
				.select({
					region: orders.region,
					product: orders.product,
					productUnits: sql<number>`sum(${orders.quantity})::int4`,
					productSales: sql<number>`sum(${orders.amount})::int4`,
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
					productUnits: sql<number>`sum(${orders.quantity})::int4`,
					productSales: sql<number>`sum(${orders.amount})::int4`,
				})
				.from(orders)
				.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
				.groupBy(orders.region, orders.product)
				.orderBy(orders.region, orders.product);
			const result3 = await db
				.with(regionalSales, topRegions)
				.selectDistinctOn([orders.region], {
					region: orders.region,
					productUnits: sql<string>`sum(${orders.quantity})::int4`,
					productSales: sql<string>`sum(${orders.amount})::int4`.mapWith(Number),
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
			const { db } = ctx.cockroach;

			const products = cockroachTable('products', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				price: numeric('price').notNull(),
				cheap: bool('cheap').notNull().default(false),
			});

			await db.execute(sql`drop table if exists ${products}`);
			await db.execute(sql`
				create table ${products} (
					id int4 primary key generated by default as identity,
					price numeric not null,
					cheap bool not null default false
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

			const result = await db
				.with(averagePrice)
				.update(products)
				.set({
					cheap: true,
				})
				.where(lt(products.price, sql`(select * from ${averagePrice})`))
				.returning({
					id: products.id,
				});

			expect(result).toEqual([
				{ id: 1 },
				{ id: 4 },
				{ id: 5 },
			]);
		});

		test('with ... insert', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				username: text('username').notNull(),
				admin: bool('admin').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (username text not null, admin bool not null default false)`);

			const userCount = db
				.$with('user_count')
				.as(
					db
						.select({
							value: sql`count(*)`.as('value'),
						})
						.from(users),
				);

			const result = await db
				.with(userCount)
				.insert(users)
				.values([
					{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` },
				])
				.returning({
					admin: users.admin,
				});

			expect(result).toEqual([{ admin: true }]);
		});

		test('with ... delete', async (ctx) => {
			const { db } = ctx.cockroach;

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

			const result = await db
				.with(averageAmount)
				.delete(orders)
				.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
				.returning({
					id: orders.id,
				});

			expect(result).toEqual([
				{ id: 6 },
				{ id: 7 },
				{ id: 8 },
			]);
		});

		test('select from subquery sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

			const sq = db
				.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
				.from(users2Table)
				.as('sq');

			const res = await db.select({ name: sq.name }).from(sq);

			expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
		});

		test('select a field without joining its table', (ctx) => {
			const { db } = ctx.cockroach;

			expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare('query')).toThrowError();
		});

		test('select all fields from subquery without alias', (ctx) => {
			const { db } = ctx.cockroach;

			const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

			expect(() => db.select().from(sq).prepare('query')).toThrowError();
		});

		test('select count()', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const res = await db.select({ count: sql`count(*)` }).from(usersTable);

			expect(res).toEqual([{ count: '2' }]);
		});

		test('select count w/ custom mapper', async (ctx) => {
			const { db } = ctx.cockroach;

			function count(value: CockroachColumn | SQLWrapper): SQL<number>;
			function count(value: CockroachColumn | SQLWrapper, alias: string): SQL.Aliased<number>;
			function count(value: CockroachColumn | SQLWrapper, alias?: string): SQL<number> | SQL.Aliased<number> {
				const result = sql`count(${value})`.mapWith(Number);
				if (!alias) {
					return result;
				}
				return result.as(alias);
			}

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const res = await db.select({ count: count(sql`*`) }).from(usersTable);

			expect(res).toEqual([{ count: 2 }]);
		});

		test('network types', async (ctx) => {
			const { db } = ctx.cockroach;

			const value: typeof network.$inferSelect = {
				inet: '127.0.0.1',
			};

			await db.insert(network).values(value);

			const res = await db.select().from(network);

			expect(res).toEqual([value]);
		});

		test('array types', async (ctx) => {
			const { db } = ctx.cockroach;

			const values: typeof salEmp.$inferSelect[] = [
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

			expect(res).toEqual(values);
		});

		test('select for ...', (ctx) => {
			const { db } = ctx.cockroach;

			{
				const query = db
					.select()
					.from(users2Table)
					.for('update')
					.toSQL();

				expect(query.sql).toMatch(/ for update$/);
			}

			{
				const query = db
					.select()
					.from(users2Table)
					.for('update', { of: [users2Table, coursesTable] })
					.toSQL();

				expect(query.sql).toMatch(/ for update of "users2", "courses"$/);
			}

			{
				const query = db
					.select()
					.from(users2Table)
					.for('no key update', { of: users2Table })
					.toSQL();

				expect(query.sql).toMatch(/for no key update of "users2"$/);
			}

			{
				const query = db
					.select()
					.from(users2Table)
					.for('no key update', { of: users2Table, skipLocked: true })
					.toSQL();

				expect(query.sql).toMatch(/ for no key update of "users2" skip locked$/);
			}

			{
				const query = db
					.select()
					.from(users2Table)
					.for('share', { of: users2Table, noWait: true })
					.toSQL();

				expect(query.sql).toMatch(/for share of "users2" nowait$/);
			}
		});

		test('having', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

			await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
				name: 'Jack',
				cityId: 2,
			}]);

			const result = await db
				.select({
					id: citiesTable.id,
					name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
					usersCount: sql<number>`count(${users2Table.id})::int4`.as('users_count'),
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

		test('view', async (ctx) => {
			const { db } = ctx.cockroach;

			const newYorkers1 = cockroachView('new_yorkers')
				.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

			const newYorkers2 = cockroachView('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

			const newYorkers3 = cockroachView('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).existing();

			await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

			await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users2Table).values([
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

		// NEXT
		test('materialized view', async (ctx) => {
			const { db } = ctx.cockroach;

			const newYorkers1 = cockroachMaterializedView('new_yorkers')
				.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

			const newYorkers2 = cockroachMaterializedView('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

			const newYorkers3 = cockroachMaterializedView('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).existing();

			await db.execute(sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`);

			await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 1 },
				{ name: 'Jack', cityId: 2 },
			]);

			{
				const result = await db.select().from(newYorkers1);
				expect(result).toEqual([]);
			}

			await db.refreshMaterializedView(newYorkers1);

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

			await db.execute(sql`drop materialized view ${newYorkers1}`);
		});

		test('select from existing view', async (ctx) => {
			const { db } = ctx.cockroach;

			const schema = cockroachSchema('test_schema');

			const newYorkers = schema.view('new_yorkers', {
				id: int4('id').notNull(),
			}).existing();

			await db.execute(sql`drop schema if exists ${schema} cascade`);
			await db.execute(sql`create schema ${schema}`);
			await db.execute(sql`create view ${newYorkers} as select id from ${usersTable}`);

			await db.insert(usersTable).values({ id: 100, name: 'John' });

			const result = await db.select({
				id: usersTable.id,
			}).from(usersTable).innerJoin(newYorkers, eq(newYorkers.id, usersTable.id));

			expect(result).toEqual([{ id: 100 }]);
		});

		test('select from raw sql', async (ctx) => {
			const { db } = ctx.cockroach;

			const result = await db.select({
				id: sql<string>`id`,
				name: sql<string>`name`,
			}).from(sql`(select 1 as id, 'John' as name) as users`);

			Expect<Equal<{ id: string; name: string }[], typeof result>>;
			expect(result).toEqual([
				{ id: '1', name: 'John' },
			]);
		});

		test('select from raw sql with joins', async (ctx) => {
			const { db } = ctx.cockroach;

			const result = await db
				.select({
					id: sql<string>`users.id`,
					name: sql<string>`users.name`,
					userCity: sql<string>`users.city`,
					cityName: sql<string>`cities.name`,
				})
				.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
				.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

			Expect<Equal<{ id: string; name: string; userCity: string; cityName: string }[], typeof result>>;

			expect(result).toEqual([
				{ id: '1', name: 'John', userCity: 'New York', cityName: 'Paris' },
			]);
		});

		test('join on aliased sql from select', async (ctx) => {
			const { db } = ctx.cockroach;

			const result = await db
				.select({
					userId: sql<string>`users.id`.as('userId'),
					name: sql<string>`users.name`,
					userCity: sql<string>`users.city`,
					cityId: sql<number>`cities.id`.as('cityId'),
					cityName: sql<string>`cities.name`,
				})
				.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
				.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

			Expect<
				Equal<{ userId: string; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
			>;

			expect(result).toEqual([
				{ userId: '1', name: 'John', userCity: 'New York', cityId: '1', cityName: 'Paris' },
			]);
		});

		test('join on aliased sql from with clause', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = db.$with('users').as(
				db.select({
					id: sql<string>`id`.as('userId'),
					name: sql<string>`name`.as('userName'),
					city: sql<string>`city`.as('city'),
				}).from(
					sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
				),
			);

			const cities = db.$with('cities').as(
				db.select({
					id: sql<string>`id`.as('cityId'),
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
				Equal<{ userId: string; name: string; userCity: string; cityId: string; cityName: string }[], typeof result>
			>;

			expect(result).toEqual([
				{ userId: '1', name: 'John', userCity: 'New York', cityId: '1', cityName: 'Paris' },
			]);
		});

		test('prefixed table', async (ctx) => {
			const { db } = ctx.cockroach;

			const cockroachTable = cockroachTableCreator((name) => `myprefix_${name}`);

			const users = cockroachTable('test_prefixed_table_with_unique_name', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table myprefix_test_prefixed_table_with_unique_name (id int4 not null primary key, name text not null)`,
			);

			await db.insert(users).values({ id: 1, name: 'John' });

			const result = await db.select().from(users);

			expect(result).toEqual([{ id: 1, name: 'John' }]);

			await db.execute(sql`drop table ${users}`);
		});

		test('select from enum as ts enum', async (ctx) => {
			const { db } = ctx.cockroach;

			enum Muscle {
				abdominals = 'abdominals',
				hamstrings = 'hamstrings',
				adductors = 'adductors',
				quadriceps = 'quadriceps',
				biceps = 'biceps',
				shoulders = 'shoulders',
				chest = 'chest',
				middle_back = 'middle_back',
				calves = 'calves',
				glutes = 'glutes',
				lower_back = 'lower_back',
				lats = 'lats',
				triceps = 'triceps',
				traps = 'traps',
				forearms = 'forearms',
				neck = 'neck',
				abductors = 'abductors',
			}

			enum Force {
				isometric = 'isometric',
				isotonic = 'isotonic',
				isokinetic = 'isokinetic',
			}

			enum Level {
				beginner = 'beginner',
				intermediate = 'intermediate',
				advanced = 'advanced',
			}

			enum Mechanic {
				compound = 'compound',
				isolation = 'isolation',
			}

			enum Equipment {
				barbell = 'barbell',
				dumbbell = 'dumbbell',
				bodyweight = 'bodyweight',
				machine = 'machine',
				cable = 'cable',
				kettlebell = 'kettlebell',
			}

			enum Category {
				upper_body = 'upper_body',
				lower_body = 'lower_body',
				full_body = 'full_body',
			}

			const muscleEnum = cockroachEnum('muscle', Muscle);

			const forceEnum = cockroachEnum('force', Force);

			const levelEnum = cockroachEnum('level', Level);

			const mechanicEnum = cockroachEnum('mechanic', Mechanic);

			const equipmentEnum = cockroachEnum('equipment', Equipment);

			const categoryEnum = cockroachEnum('category', Category);

			const exercises = cockroachTable('exercises', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: varchar('name').notNull(),
				force: forceEnum('force'),
				level: levelEnum('level'),
				mechanic: mechanicEnum('mechanic'),
				equipment: equipmentEnum('equipment'),
				instructions: text('instructions'),
				category: categoryEnum('category'),
				primaryMuscles: muscleEnum('primary_muscles').array(),
				secondaryMuscles: muscleEnum('secondary_muscles').array(),
				createdAt: timestamp('created_at').notNull().default(sql`now()`),
				updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
			});

			await db.execute(sql`drop table if exists ${exercises}`);
			await db.execute(sql`drop type if exists ${sql.identifier(muscleEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(forceEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(levelEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(mechanicEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(equipmentEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(categoryEnum.enumName)}`);

			await db.execute(
				sql`create type ${
					sql.identifier(muscleEnum.enumName)
				} as enum ('abdominals', 'hamstrings', 'adductors', 'quadriceps', 'biceps', 'shoulders', 'chest', 'middle_back', 'calves', 'glutes', 'lower_back', 'lats', 'triceps', 'traps', 'forearms', 'neck', 'abductors')`,
			);
			await db.execute(
				sql`create type ${sql.identifier(forceEnum.enumName)} as enum ('isometric', 'isotonic', 'isokinetic')`,
			);
			await db.execute(
				sql`create type ${sql.identifier(levelEnum.enumName)} as enum ('beginner', 'intermediate', 'advanced')`,
			);
			await db.execute(sql`create type ${sql.identifier(mechanicEnum.enumName)} as enum ('compound', 'isolation')`);
			await db.execute(
				sql`create type ${
					sql.identifier(equipmentEnum.enumName)
				} as enum ('barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'kettlebell')`,
			);
			await db.execute(
				sql`create type ${sql.identifier(categoryEnum.enumName)} as enum ('upper_body', 'lower_body', 'full_body')`,
			);
			await db.execute(sql`
				create table ${exercises} (
					id int4 primary key generated by default as identity,
					name varchar not null,
					force force,
					level level,
					mechanic mechanic,
					equipment equipment,
					instructions text,
					category category,
					primary_muscles muscle[],
					secondary_muscles muscle[],
					created_at timestamp not null default now(),
					updated_at timestamp not null default now()
				)
			`);

			await db.insert(exercises).values({
				name: 'Bench Press',
				force: Force.isotonic,
				level: Level.beginner,
				mechanic: Mechanic.compound,
				equipment: Equipment.barbell,
				instructions:
					'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
				category: Category.upper_body,
				primaryMuscles: [Muscle.chest, Muscle.triceps],
				secondaryMuscles: [Muscle.shoulders, Muscle.traps],
			});

			const result = await db.select().from(exercises);

			expect(result).toEqual([
				{
					id: 1,
					name: 'Bench Press',
					force: 'isotonic',
					level: 'beginner',
					mechanic: 'compound',
					equipment: 'barbell',
					instructions:
						'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
					category: 'upper_body',
					primaryMuscles: ['chest', 'triceps'],
					secondaryMuscles: ['shoulders', 'traps'],
					createdAt: result[0]!.createdAt,
					updatedAt: result[0]!.updatedAt,
				},
			]);

			await db.execute(sql`drop table ${exercises}`);
			await db.execute(sql`drop type ${sql.identifier(muscleEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(forceEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(levelEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(mechanicEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(equipmentEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(categoryEnum.enumName)}`);
		});

		test('select from enum', async (ctx) => {
			const { db } = ctx.cockroach;

			const muscleEnum = cockroachEnum('muscle', [
				'abdominals',
				'hamstrings',
				'adductors',
				'quadriceps',
				'biceps',
				'shoulders',
				'chest',
				'middle_back',
				'calves',
				'glutes',
				'lower_back',
				'lats',
				'triceps',
				'traps',
				'forearms',
				'neck',
				'abductors',
			]);

			const forceEnum = cockroachEnum('force', ['isometric', 'isotonic', 'isokinetic']);

			const levelEnum = cockroachEnum('level', ['beginner', 'intermediate', 'advanced']);

			const mechanicEnum = cockroachEnum('mechanic', ['compound', 'isolation']);

			const equipmentEnum = cockroachEnum('equipment', [
				'barbell',
				'dumbbell',
				'bodyweight',
				'machine',
				'cable',
				'kettlebell',
			]);

			const categoryEnum = cockroachEnum('category', ['upper_body', 'lower_body', 'full_body']);

			const exercises = cockroachTable('exercises', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: varchar('name').notNull(),
				force: forceEnum('force'),
				level: levelEnum('level'),
				mechanic: mechanicEnum('mechanic'),
				equipment: equipmentEnum('equipment'),
				instructions: text('instructions'),
				category: categoryEnum('category'),
				primaryMuscles: muscleEnum('primary_muscles').array(),
				secondaryMuscles: muscleEnum('secondary_muscles').array(),
				createdAt: timestamp('created_at').notNull().default(sql`now()`),
				updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
			});

			await db.execute(sql`drop table if exists ${exercises}`);
			await db.execute(sql`drop type if exists ${sql.identifier(muscleEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(forceEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(levelEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(mechanicEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(equipmentEnum.enumName)}`);
			await db.execute(sql`drop type if exists ${sql.identifier(categoryEnum.enumName)}`);

			await db.execute(
				sql`create type ${
					sql.identifier(muscleEnum.enumName)
				} as enum ('abdominals', 'hamstrings', 'adductors', 'quadriceps', 'biceps', 'shoulders', 'chest', 'middle_back', 'calves', 'glutes', 'lower_back', 'lats', 'triceps', 'traps', 'forearms', 'neck', 'abductors')`,
			);
			await db.execute(
				sql`create type ${sql.identifier(forceEnum.enumName)} as enum ('isometric', 'isotonic', 'isokinetic')`,
			);
			await db.execute(
				sql`create type ${sql.identifier(levelEnum.enumName)} as enum ('beginner', 'intermediate', 'advanced')`,
			);
			await db.execute(sql`create type ${sql.identifier(mechanicEnum.enumName)} as enum ('compound', 'isolation')`);
			await db.execute(
				sql`create type ${
					sql.identifier(equipmentEnum.enumName)
				} as enum ('barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'kettlebell')`,
			);
			await db.execute(
				sql`create type ${sql.identifier(categoryEnum.enumName)} as enum ('upper_body', 'lower_body', 'full_body')`,
			);
			await db.execute(sql`
				create table ${exercises} (
					id int4 primary key generated by default as identity,
					name varchar not null,
					force force,
					level level,
					mechanic mechanic,
					equipment equipment,
					instructions text,
					category category,
					primary_muscles muscle[],
					secondary_muscles muscle[],
					created_at timestamp not null default now(),
					updated_at timestamp not null default now()
				)
			`);

			await db.insert(exercises).values({
				name: 'Bench Press',
				force: 'isotonic',
				level: 'beginner',
				mechanic: 'compound',
				equipment: 'barbell',
				instructions:
					'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
				category: 'upper_body',
				primaryMuscles: ['chest', 'triceps'],
				secondaryMuscles: ['shoulders', 'traps'],
			});

			const result = await db.select().from(exercises);

			expect(result).toEqual([
				{
					id: 1,
					name: 'Bench Press',
					force: 'isotonic',
					level: 'beginner',
					mechanic: 'compound',
					equipment: 'barbell',
					instructions:
						'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
					category: 'upper_body',
					primaryMuscles: ['chest', 'triceps'],
					secondaryMuscles: ['shoulders', 'traps'],
					createdAt: result[0]!.createdAt,
					updatedAt: result[0]!.updatedAt,
				},
			]);

			await db.execute(sql`drop table ${exercises}`);
			await db.execute(sql`drop type ${sql.identifier(muscleEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(forceEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(levelEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(mechanicEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(equipmentEnum.enumName)}`);
			await db.execute(sql`drop type ${sql.identifier(categoryEnum.enumName)}`);
		});

		test('all date and time columns', async (ctx) => {
			const { db } = ctx.cockroach;

			const table = cockroachTable('all_columns', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				dateString: date('date_string', { mode: 'string' }).notNull(),
				time: time('time', { precision: 3 }).notNull(),
				datetime: timestamp('datetime').notNull(),
				datetimeWTZ: timestamp('datetime_wtz', { withTimezone: true }).notNull(),
				datetimeString: timestamp('datetime_string', { mode: 'string' }).notNull(),
				datetimeFullPrecision: timestamp('datetime_full_precision', { precision: 6, mode: 'string' }).notNull(),
				datetimeWTZString: timestamp('datetime_wtz_string', { withTimezone: true, mode: 'string' }).notNull(),
				interval: interval('interval').notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
				create table ${table} (
							id int4 primary key generated by default as identity,
							date_string date not null,
							time time(3) not null,
							datetime timestamp not null,
							datetime_wtz timestamp with time zone not null,
							datetime_string timestamp not null,
							datetime_full_precision timestamp(6) not null,
							datetime_wtz_string timestamp with time zone not null,
							interval interval not null
					)
			`);

			const someDatetime = new Date('2022-01-01T00:00:00.123Z');
			const fullPrecision = '2022-01-01T00:00:00.123456Z';
			const someTime = '23:23:12.432';

			await db.insert(table).values({
				dateString: '2022-01-01',
				time: someTime,
				datetime: someDatetime,
				datetimeWTZ: someDatetime,
				datetimeString: '2022-01-01T00:00:00.123Z',
				datetimeFullPrecision: fullPrecision,
				datetimeWTZString: '2022-01-01T00:00:00.123Z',
				interval: '1 day',
			});

			const result = await db.select().from(table);

			Expect<
				Equal<{
					id: number;
					dateString: string;
					time: string;
					datetime: Date;
					datetimeWTZ: Date;
					datetimeString: string;
					datetimeFullPrecision: string;
					datetimeWTZString: string;
					interval: string;
				}[], typeof result>
			>;

			Expect<
				Equal<{
					dateString: string;
					time: string;
					datetime: Date;
					datetimeWTZ: Date;
					datetimeString: string;
					datetimeFullPrecision: string;
					datetimeWTZString: string;
					interval: string;
					id?: number | undefined;
				}, typeof table.$inferInsert>
			>;

			expect(result).toEqual([
				{
					id: 1,
					dateString: '2022-01-01',
					time: someTime,
					datetime: someDatetime,
					datetimeWTZ: someDatetime,
					datetimeString: '2022-01-01 00:00:00.123',
					datetimeFullPrecision: fullPrecision.replace('T', ' ').replace('Z', ''),
					datetimeWTZString: '2022-01-01 00:00:00.123+00',
					interval: '1 day',
				},
			]);

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('all date and time columns with timezone second case mode date', async (ctx) => {
			const { db } = ctx.cockroach;

			const table = cockroachTable('all_columns', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
				create table ${table} (
							id int4 primary key generated by default as identity,
							timestamp_string timestamp(3) with time zone not null
					)
			`);

			const insertedDate = new Date();

			// 1. Insert date as new date
			await db.insert(table).values([
				{ timestamp: insertedDate },
			]);

			// 2, Select as date and check that timezones are the same
			// There is no way to check timezone in Date object, as it is always represented internally in UTC
			const result = await db.select().from(table);

			expect(result).toEqual([{ id: 1, timestamp: insertedDate }]);

			// 3. Compare both dates
			expect(insertedDate.getTime()).toBe(result[0]?.timestamp.getTime());

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('all date and time columns with timezone third case mode date', async (ctx) => {
			const { db } = ctx.cockroach;

			const table = cockroachTable('all_columns', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${table}`);

			await db.execute(sql`
				create table ${table} (
							id int4 primary key generated by default as identity,
							timestamp_string timestamp(3) with time zone not null
					)
			`);

			const insertedDate = new Date('2022-01-01 20:00:00.123-04'); // used different time zones, internally is still UTC
			const insertedDate2 = new Date('2022-01-02 04:00:00.123+04'); // They are both the same date in different time zones

			// 1. Insert date as new dates with different time zones
			await db.insert(table).values([
				{ timestamp: insertedDate },
				{ timestamp: insertedDate2 },
			]);

			// 2, Select and compare both dates
			const result = await db.select().from(table);

			expect(result[0]?.timestamp.getTime()).toBe(result[1]?.timestamp.getTime());

			await db.execute(sql`drop table if exists ${table}`);
		});

		test('orderBy with aliased column', (ctx) => {
			const { db } = ctx.cockroach;

			const query = db.select({
				test: sql`something`.as('test'),
			}).from(users2Table).orderBy((fields) => fields.test).toSQL();

			expect(query.sql).toBe('select something as "test" from "users2" order by "test"');
		});

		test('select from sql', async (ctx) => {
			const { db } = ctx.cockroach;

			const metricEntry = cockroachTable('metric_entry', {
				id: cockroachUuid('id').notNull(),
				createdAt: timestamp('created_at').notNull(),
			});

			await db.execute(sql`drop table if exists ${metricEntry}`);
			await db.execute(sql`create table ${metricEntry} (id uuid not null, created_at timestamp not null)`);

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
							eq(metricEntry.id, metricId),
							gte(metricEntry.createdAt, intervals.startTime),
							lt(metricEntry.createdAt, intervals.endTime),
						),
					)
					.groupBy(intervals.startTime, intervals.endTime)
					.orderBy(asc(intervals.startTime));

			await expect((async () => {
				func();
			})()).resolves.not.toThrowError();
		});

		test('timestamp timezone', async (ctx) => {
			const { db } = ctx.cockroach;

			const usersTableWithAndWithoutTimezone = cockroachTable('users_test_with_and_without_timezone', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				name: text('name').notNull(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
				updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
			});

			await db.execute(sql`drop table if exists ${usersTableWithAndWithoutTimezone}`);

			await db.execute(
				sql`
					create table users_test_with_and_without_timezone (
						id int4 not null primary key generated by default as identity,
						name text not null,
						created_at timestamptz not null default now(),
						updated_at timestamp not null default now()
					)
				`,
			);

			const date = new Date(Date.parse('2020-01-01T00:00:00+04:00'));

			await db.insert(usersTableWithAndWithoutTimezone).values({ name: 'With default times' });
			await db.insert(usersTableWithAndWithoutTimezone).values({
				name: 'Without default times',
				createdAt: date,
				updatedAt: date,
			});
			const users = await db.select().from(usersTableWithAndWithoutTimezone);

			// check that the timestamps are set correctly for default times
			expect(Math.abs(users[0]!.updatedAt.getTime() - Date.now())).toBeLessThan(2000);
			expect(Math.abs(users[0]!.createdAt.getTime() - Date.now())).toBeLessThan(2000);

			// check that the timestamps are set correctly for non default times
			expect(Math.abs(users[1]!.updatedAt.getTime() - date.getTime())).toBeLessThan(2000);
			expect(Math.abs(users[1]!.createdAt.getTime() - date.getTime())).toBeLessThan(2000);
		});

		test('transaction', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_transactions', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				balance: int4('balance').notNull(),
			});
			const products = cockroachTable('products_transactions', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				price: int4('price').notNull(),
				stock: int4('stock').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop table if exists ${products}`);

			await db.execute(
				sql`create table users_transactions (id int4 not null primary key generated by default as identity, balance int4 not null)`,
			);
			await db.execute(
				sql`create table products_transactions (id int4 not null primary key generated by default as identity, price int4 not null, stock int4 not null)`,
			);

			const user = await db.insert(users).values({ balance: 100 }).returning().then((rows) => rows[0]!);
			const product = await db.insert(products).values({ price: 10, stock: 10 }).returning().then((rows) => rows[0]!);

			await db.transaction(async (tx) => {
				await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
				await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
			});

			const result = await db.select().from(users);

			expect(result).toEqual([{ id: 1, balance: 90 }]);

			await db.execute(sql`drop table ${users}`);
			await db.execute(sql`drop table ${products}`);
		});

		test('transaction rollback', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_transactions_rollback', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				balance: int4('balance').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table users_transactions_rollback (id int4 not null primary key generated by default as identity, balance int4 not null)`,
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

		test('nested transaction', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_nested_transactions', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				balance: int4('balance').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table users_nested_transactions (id int4 not null primary key generated by default as identity, balance int4 not null)`,
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

		test('nested transaction rollback', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_nested_transactions_rollback', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				balance: int4('balance').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table users_nested_transactions_rollback (id int4 not null primary key generated by default as identity, balance int4 not null)`,
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

		test('join subquery with join', async (ctx) => {
			const { db } = ctx.cockroach;

			const internalStaff = cockroachTable('internal_staff', {
				userId: int4('user_id').notNull(),
			});

			const customUser = cockroachTable('custom_user', {
				id: int4('id').notNull(),
			});

			const ticket = cockroachTable('ticket', {
				staffId: int4('staff_id').notNull(),
			});

			await db.execute(sql`drop table if exists ${internalStaff}`);
			await db.execute(sql`drop table if exists ${customUser}`);
			await db.execute(sql`drop table if exists ${ticket}`);

			await db.execute(sql`create table internal_staff (user_id int4 not null)`);
			await db.execute(sql`create table custom_user (id int4 not null)`);
			await db.execute(sql`create table ticket (staff_id int4 not null)`);

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

		test('subquery with view', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_subquery_view', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			});

			const newYorkers = cockroachView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop view if exists ${newYorkers}`);

			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null, city_id int4 not null)`,
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

		test('join view as subquery', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_join_view', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			});

			const newYorkers = cockroachView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop view if exists ${newYorkers}`);

			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null, city_id int4 not null)`,
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

		test('table selection with single table', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null, city_id int4 not null)`,
			);

			await db.insert(users).values({ name: 'John', cityId: 1 });

			const result = await db.select({ users }).from(users);

			expect(result).toEqual([{ users: { id: 1, name: 'John', cityId: 1 } }]);

			await db.execute(sql`drop table ${users}`);
		});

		test('set null to jsonb field', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				jsonb: jsonb('jsonb'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, jsonb jsonb)`,
			);

			const result = await db.insert(users).values({ jsonb: null }).returning();

			expect(result).toEqual([{ id: 1, jsonb: null }]);

			await db.execute(sql`drop table ${users}`);
		});

		test('insert undefined', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text)`,
			);

			await expect((async () => {
				await db.insert(users).values({ name: undefined });
			})()).resolves.not.toThrowError();

			await db.execute(sql`drop table ${users}`);
		});

		test('update undefined', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text)`,
			);

			await expect((async () => {
				await db.update(users).set({ name: undefined });
			})()).rejects.toThrowError();
			await expect((async () => {
				db.update(users).set({ name: undefined });
			})()).rejects.toThrowError();

			await db.execute(sql`drop table ${users}`);
		});

		test('array operators', async (ctx) => {
			const { db } = ctx.cockroach;

			const posts = cockroachTable('posts', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				tags: text('tags').array(),
			});

			await db.execute(sql`drop table if exists ${posts}`);

			await db.execute(
				sql`create table ${posts} (id int4 primary key generated by default as identity, tags text[])`,
			);

			await db.insert(posts).values([{
				tags: ['ORM'],
			}, {
				tags: ['Typescript'],
			}, {
				tags: ['Typescript', 'ORM'],
			}, {
				tags: ['Typescript', 'Frontend', 'React'],
			}, {
				tags: ['Typescript', 'ORM', 'Database', 'Postgres'],
			}, {
				tags: ['Java', 'Spring', 'OOP'],
			}]);

			const contains = await db.select({ id: posts.id }).from(posts)
				.where(arrayContains(posts.tags, ['Typescript', 'ORM']));
			const contained = await db.select({ id: posts.id }).from(posts)
				.where(arrayContained(posts.tags, ['Typescript', 'ORM']));
			const overlaps = await db.select({ id: posts.id }).from(posts)
				.where(arrayOverlaps(posts.tags, ['Typescript', 'ORM']));
			const withSubQuery = await db.select({ id: posts.id }).from(posts)
				.where(arrayContains(
					posts.tags,
					db.select({ tags: posts.tags }).from(posts).where(eq(posts.id, 1)),
				));

			expect(contains).toEqual([{ id: 3 }, { id: 5 }]);
			expect(contained).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
			expect(overlaps).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
			expect(withSubQuery).toEqual([{ id: 1 }, { id: 3 }, { id: 5 }]);
		});

		test('set operations (union) from query builder with subquery', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const sq = db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).as('sq');

			const result = await db
				.select({ id: cities2Table.id, name: citiesTable.name })
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
					.select({ id: cities2Table.id, name: citiesTable.name, name2: users2Table.name })
					.from(cities2Table).union(
						// @ts-expect-error
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table),
					).orderBy(asc(sql`name`));
			})()).rejects.toThrowError();
		});

		test('set operations (union) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await union(
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).orderBy(asc(sql`name`)).limit(1).offset(1);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
			]);

			await expect((async () => {
				union(
					db
						.select({ name: citiesTable.name, id: cities2Table.id })
						.from(cities2Table).where(eq(citiesTable.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).orderBy(asc(sql`name`));
			})()).rejects.toThrowError();
		});

		test('set operations (union all) from query builder', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).limit(2).unionAll(
					db
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table).limit(2),
				).orderBy(asc(sql`id`));

			expect(result).toHaveLength(4);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
				{ id: 2, name: 'London' },
			]);

			await expect((async () => {
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).limit(2).unionAll(
						db
							.select({ name: citiesTable.name, id: cities2Table.id })
							.from(cities2Table).limit(2),
					).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('set operations (union all) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await unionAll(
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
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
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table).where(eq(citiesTable.id, 1)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				);
			})()).rejects.toThrowError();
		});

		test('set operations (intersect) from query builder', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).intersect(
					db
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table).where(gt(citiesTable.id, 1)),
				).orderBy(asc(sql`name`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect((async () => {
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).intersect(
						// @ts-expect-error
						db
							.select({ id: cities2Table.id, name: citiesTable.name, id2: cities2Table.id })
							.from(cities2Table).where(gt(citiesTable.id, 1)),
					).orderBy(asc(sql`name`));
			})()).rejects.toThrowError();
		});

		test('set operations (intersect) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await intersect(
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			);

			expect(result).toHaveLength(0);

			expect(result).toEqual([]);

			await expect((async () => {
				intersect(
					db
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table).where(eq(citiesTable.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
				);
			})()).rejects.toThrowError();
		});

		test('set operations (intersect all) from query builder', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: cities2Table.id, name: citiesTable.name })
				.from(cities2Table).limit(2).intersectAll(
					db
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table).limit(2),
				).orderBy(asc(sql`id`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
			]);

			await expect((async () => {
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).limit(2).intersectAll(
						db
							.select({ name: users2Table.name, id: users2Table.id })
							.from(cities2Table).limit(2),
					).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('set operations (intersect all) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

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
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				);
			})()).rejects.toThrowError();
		});

		test('set operations (except) from query builder', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await db
				.select()
				.from(cities2Table).except(
					db
						.select()
						.from(cities2Table).where(gt(citiesTable.id, 1)),
				);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
			]);

			await expect((async () => {
				db
					.select()
					.from(cities2Table).except(
						db
							.select({ name: users2Table.name, id: users2Table.id })
							.from(cities2Table).where(gt(citiesTable.id, 1)),
					);
			})()).rejects.toThrowError();
		});

		test('set operations (except) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await except(
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table),
				db
					.select({ id: cities2Table.id, name: citiesTable.name })
					.from(cities2Table).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).orderBy(asc(sql`id`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect((async () => {
				except(
					db
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(cities2Table).where(eq(citiesTable.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('set operations (except all) from query builder', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await db
				.select()
				.from(cities2Table).exceptAll(
					db
						.select({ id: cities2Table.id, name: citiesTable.name })
						.from(cities2Table).where(eq(citiesTable.id, 1)),
				).orderBy(asc(sql`id`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect((async () => {
				db
					.select({ name: cities2Table.name, id: cities2Table.id })
					.from(cities2Table).exceptAll(
						db
							.select({ id: cities2Table.id, name: citiesTable.name })
							.from(cities2Table).where(eq(citiesTable.id, 1)),
					).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('set operations (except all) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

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
			).orderBy(asc(sql`id`)).limit(5).offset(2);

			expect(result).toHaveLength(4);

			expect(result).toEqual([
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
				).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('set operations (mixed) from query builder with subquery', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);
			const sq = db
				.select()
				.from(cities2Table).where(gt(citiesTable.id, 1)).as('sq');

			const result = await db
				.select()
				.from(cities2Table).except(
					({ unionAll }) =>
						unionAll(
							db.select().from(sq),
							db.select().from(cities2Table).where(eq(citiesTable.id, 2)),
						),
				);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
			]);

			await expect((async () => {
				db
					.select()
					.from(cities2Table).except(
						({ unionAll }) =>
							unionAll(
								db
									.select({ name: cities2Table.name, id: cities2Table.id })
									.from(cities2Table).where(gt(citiesTable.id, 1)),
								db.select().from(cities2Table).where(eq(citiesTable.id, 2)),
							),
					);
			})()).rejects.toThrowError();
		});

		test('set operations (mixed all) as function', async (ctx) => {
			const { db } = ctx.cockroach;

			await setupSetOperationTest(db);

			const result = await union(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				except(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(gte(users2Table.id, 5)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 7)),
				),
				db
					.select().from(cities2Table).where(gt(citiesTable.id, 1)),
			).orderBy(asc(sql`id`));

			expect(result).toHaveLength(6);

			expect(result).toEqual([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 5, name: 'Ben' },
				{ id: 6, name: 'Jill' },
				{ id: 8, name: 'Sally' },
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
					),
					db
						.select().from(cities2Table).where(gt(citiesTable.id, 1)),
				).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('aggregate function: count', async (ctx) => {
			const { db } = ctx.cockroach;
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
			const { db } = ctx.cockroach;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: avg(table.b) }).from(table);
			const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
			const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

			expect(result1[0]?.value).toBe('33.333333333333333333');
			expect(result2[0]?.value).toBeNull();
			expect(result3[0]?.value).toBe('42.500000000000000000');
		});

		test('aggregate function: sum', async (ctx) => {
			const { db } = ctx.cockroach;
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
			const { db } = ctx.cockroach;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: max(table.b) }).from(table);
			const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toBe(90);
			expect(result2[0]?.value).toBeNull();
		});

		test('aggregate function: min', async (ctx) => {
			const { db } = ctx.cockroach;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: min(table.b) }).from(table);
			const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toBe(10);
			expect(result2[0]?.value).toBeNull();
		});

		test('array mapping and parsing', async (ctx) => {
			const { db } = ctx.cockroach;

			const arrays = cockroachTable('arrays_tests', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				tags: text('tags').array(),
				numbers: int4('numbers').notNull().array(),
			});

			await db.execute(sql`drop table if exists ${arrays}`);
			await db.execute(sql`
				 create table ${arrays} (
				 id int4 primary key generated by default as identity,
				 tags text[],
				 numbers int4[]
				)
			`);

			await db.insert(arrays).values({
				tags: ['', 'b', 'c'],
				numbers: [1, 2, 3],
			});

			const result = await db.select().from(arrays);

			expect(result).toEqual([{
				id: 1,
				tags: ['', 'b', 'c'],
				numbers: [1, 2, 3],
			}]);

			await db.execute(sql`drop table ${arrays}`);
		});

		test('test $onUpdateFn and $onUpdate works as $default', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.execute(sql`drop table if exists ${usersOnUpdate}`);

			await db.execute(
				sql`
					create table ${usersOnUpdate} (
					id int4 primary key generated by default as identity,
					name text not null,
					update_counter int4 default 1 not null,
					updated_at timestamp(3),
					always_null text
					)
				`,
			);

			await db.insert(usersOnUpdate).values([
				{ name: 'John' },
				{ name: 'Jane' },
				{ name: 'Jack' },
				{ name: 'Jill' },
			]);

			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			expect(response).toEqual([
				{ name: 'John', id: 1, updateCounter: 1, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 250;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test('test $onUpdateFn and $onUpdate works updating', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.execute(sql`drop table if exists ${usersOnUpdate}`);

			await db.execute(
				sql`
					create table ${usersOnUpdate} (
					id int4 primary key generated by default as identity,
					name text not null,
					update_counter int4 default 1,
					updated_at timestamp(3),
					always_null text
					)
				`,
			);

			await db.insert(usersOnUpdate).values([
				{ name: 'John', alwaysNull: 'this will be null after updating' },
				{ name: 'Jane' },
				{ name: 'Jack' },
				{ name: 'Jill' },
			]);

			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
			await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			await db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));
			await db.update(usersOnUpdate).set({ updateCounter: null }).where(eq(usersOnUpdate.id, 2));

			const justDates = await db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			const response = await db.select({ ...rest }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			expect(response).toEqual([
				{ name: 'Angel', id: 1, updateCounter: 2, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: null, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 15000;

			// expect(initial[0]?.updatedAt?.valueOf()).not.toBe(justDates[0]?.updatedAt?.valueOf());

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test('test if method with sql operators', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				age: int4('age').notNull(),
				city: text('city').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(sql`
				create table ${users} (
				id int4 primary key,
				name text not null,
				age int4 not null,
				city text not null
				)
			`);

			await db.insert(users).values([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition1 = true;

			const [result1] = await db.select().from(users).where(eq(users.id, 1).if(condition1));

			expect(result1).toEqual({ id: 1, name: 'John', age: 20, city: 'New York' });

			const condition2 = 1;

			const [result2] = await db.select().from(users).where(sql`${users.id} = 1`.if(condition2));

			expect(result2).toEqual({ id: 1, name: 'John', age: 20, city: 'New York' });

			const condition3 = 'non-empty string';

			const result3 = await db.select().from(users).where(
				or(eq(users.id, 1).if(condition3), eq(users.id, 2).if(condition3)),
			);

			expect(result3).toEqual([{ id: 1, name: 'John', age: 20, city: 'New York' }, {
				id: 2,
				name: 'Alice',
				age: 21,
				city: 'New York',
			}]);

			const condtition4 = false;

			const result4 = await db.select().from(users).where(eq(users.id, 1).if(condtition4));

			expect(result4).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition5 = undefined;

			const result5 = await db.select().from(users).where(sql`${users.id} = 1`.if(condition5));

			expect(result5).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition6 = null;

			const result6 = await db.select().from(users).where(
				or(eq(users.id, 1).if(condition6), eq(users.id, 2).if(condition6)),
			);

			expect(result6).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition7 = {
				term1: 0,
				term2: 1,
			};

			const result7 = await db.select().from(users).where(
				and(gt(users.age, 20).if(condition7.term1), eq(users.city, 'New York').if(condition7.term2)),
			);

			expect(result7).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
			]);

			const condition8 = {
				term1: '',
				term2: 'non-empty string',
			};

			const result8 = await db.select().from(users).where(
				or(lt(users.age, 21).if(condition8.term1), eq(users.city, 'London').if(condition8.term2)),
			);

			expect(result8).toEqual([
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition9 = {
				term1: 1,
				term2: true,
			};

			const result9 = await db.select().from(users).where(
				and(
					inArray(users.city, ['New York', 'London']).if(condition9.term1),
					ilike(users.name, 'a%').if(condition9.term2),
				),
			);

			expect(result9).toEqual([
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
			]);

			const condition10 = {
				term1: 4,
				term2: 19,
			};

			const result10 = await db.select().from(users).where(
				and(
					sql`length(${users.name}) <= ${condition10.term1}`.if(condition10.term1),
					gt(users.age, condition10.term2).if(condition10.term2 > 20),
				),
			);

			expect(result10).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition11 = true;

			const result11 = await db.select().from(users).where(
				or(eq(users.city, 'New York'), gte(users.age, 22))!.if(condition11),
			);

			expect(result11).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition12 = false;

			const result12 = await db.select().from(users).where(
				and(eq(users.city, 'London'), gte(users.age, 23))!.if(condition12),
			);

			expect(result12).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition13 = true;

			const result13 = await db.select().from(users).where(sql`(city = 'New York' or age >= 22)`.if(condition13));

			expect(result13).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			const condition14 = false;

			const result14 = await db.select().from(users).where(sql`(city = 'London' and age >= 23)`.if(condition14));

			expect(result14).toEqual([
				{ id: 1, name: 'John', age: 20, city: 'New York' },
				{ id: 2, name: 'Alice', age: 21, city: 'New York' },
				{ id: 3, name: 'Nick', age: 22, city: 'London' },
				{ id: 4, name: 'Lina', age: 23, city: 'London' },
			]);

			await db.execute(sql`drop table ${users}`);
		});

		// MySchema tests
		test('mySchema :: select all fields', async (ctx) => {
			const { db } = ctx.cockroach;

			const now = Date.now();

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const result = await db.select().from(usersMySchemaTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('mySchema :: select sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersMySchemaTable.name})`,
			}).from(usersMySchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: select typed sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersMySchemaTable.name})`,
			}).from(usersMySchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: select distinct', async (ctx) => {
			const { db } = ctx.cockroach;

			const usersDistinctTable = cockroachTable('users_distinct', {
				id: int4('id').notNull(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${usersDistinctTable}`);
			await db.execute(sql`create table ${usersDistinctTable} (id int4, name text)`);

			await db.insert(usersDistinctTable).values([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'John' },
				{ id: 2, name: 'John' },
				{ id: 1, name: 'Jane' },
			]);
			const users1 = await db.selectDistinct().from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
				usersDistinctTable.name,
			);
			const users2 = await db.selectDistinctOn([usersDistinctTable.id]).from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
			);
			const users3 = await db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
				usersDistinctTable,
			).orderBy(usersDistinctTable.name);

			await db.execute(sql`drop table ${usersDistinctTable}`);

			expect(users1).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);

			expect(users2).toHaveLength(2);
			expect(users2[0]?.id).toBe(1);
			expect(users2[1]?.id).toBe(2);

			expect(users3).toHaveLength(2);
			expect(users3[0]?.name).toBe('Jane');
			expect(users3[1]?.name).toBe('John');
		});

		test('mySchema :: insert returning sql', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = await db.insert(usersMySchemaTable).values({ name: 'John' }).returning({
				name: sql`upper(${usersMySchemaTable.name})`,
			});

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: delete returning sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John')).returning({
				name: sql`upper(${usersMySchemaTable.name})`,
			});

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: update with returning partial', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.update(usersMySchemaTable).set({ name: 'Jane' }).where(eq(usersMySchemaTable.name, 'John'))
				.returning({
					id: usersMySchemaTable.id,
					name: usersMySchemaTable.name,
				});

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test('mySchema :: delete with returning all fields', async (ctx) => {
			const { db } = ctx.cockroach;

			const now = Date.now();

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John')).returning();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(users).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
		});

		test('mySchema :: insert + select', async (ctx) => {
			const { db } = ctx.cockroach;

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

		test('mySchema :: insert with overridden default values', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: 'John', verified: true });
			const result = await db.select().from(usersMySchemaTable);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('mySchema :: insert many', async (ctx) => {
			const { db } = ctx.cockroach;

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

		test('mySchema :: select with group by as field', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.name);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test('mySchema :: select with group by as column + sql', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.id, sql`${usersMySchemaTable.name}`);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('mySchema :: build query', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.id, usersMySchemaTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: 'select "id", "name" from "mySchema"."users" group by "mySchema"."users"."id", "mySchema"."users"."name"',
				params: [],
			});
		});

		test('mySchema :: partial join with alias', async (ctx) => {
			const { db } = ctx.cockroach;
			const customerAlias = alias(usersMySchemaTable, 'customer');

			await db.insert(usersMySchemaTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select({
					user: {
						id: usersMySchemaTable.id,
						name: usersMySchemaTable.name,
					},
					customer: {
						id: customerAlias.id,
						name: customerAlias.name,
					},
				}).from(usersMySchemaTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(usersMySchemaTable.id, 10));

			expect(result).toEqual([{
				user: { id: 10, name: 'Ivan' },
				customer: { id: 11, name: 'Hans' },
			}]);
		});

		test('mySchema :: insert with spaces', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
				usersMySchemaTable,
			);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test('mySchema :: prepared statement with placeholder in .limit', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const stmt = db
				.select({
					id: usersMySchemaTable.id,
					name: usersMySchemaTable.name,
				})
				.from(usersMySchemaTable)
				.where(eq(usersMySchemaTable.id, sql.placeholder('id')))
				.limit(sql.placeholder('limit'))
				.prepare('mySchema_stmt_limit');

			const result = await stmt.execute({ id: 1, limit: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
			expect(result).toHaveLength(1);
		});

		test('mySchema :: build query insert with onConflict do update / multiple columns', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db.insert(usersMySchemaTable)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoUpdate({ target: [usersMySchemaTable.id, usersMySchemaTable.name], set: { name: 'John1' } })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "mySchema"."users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
				params: ['John', '["foo","bar"]', 'John1'],
			});
		});

		test('mySchema :: build query insert with onConflict do nothing + target', async (ctx) => {
			const { db } = ctx.cockroach;

			const query = db.insert(usersMySchemaTable)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoNothing({ target: usersMySchemaTable.id })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "mySchema"."users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
				params: ['John', '["foo","bar"]'],
			});
		});

		test('mySchema :: select from tables with same name from different schema using alias', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersMySchemaTable).values({ id: 10, name: 'Ivan' });
			await db.insert(usersTable).values({ id: 11, name: 'Hans' });

			const customerAlias = alias(usersTable, 'customer');

			const result = await db
				.select().from(usersMySchemaTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(customerAlias.id, 11));

			expect(result).toEqual([{
				users: {
					id: 10,
					name: 'Ivan',
					verified: false,
					jsonb: null,
					createdAt: result[0]!.users.createdAt,
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

		test('mySchema :: view', async (ctx) => {
			const { db } = ctx.cockroach;

			const newYorkers1 = mySchema.view('new_yorkers')
				.as((qb) => qb.select().from(users2MySchemaTable).where(eq(users2MySchemaTable.cityId, 1)));

			const newYorkers2 = mySchema.view('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).as(sql`select * from ${users2MySchemaTable} where ${eq(users2MySchemaTable.cityId, 1)}`);

			const newYorkers3 = mySchema.view('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
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

		test('mySchema :: materialized view', async (ctx) => {
			const { db } = ctx.cockroach;

			const newYorkers1 = mySchema.materializedView('new_yorkers')
				.as((qb) => qb.select().from(users2MySchemaTable).where(eq(users2MySchemaTable.cityId, 1)));

			const newYorkers2 = mySchema.materializedView('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).as(sql`select * from ${users2MySchemaTable} where ${eq(users2MySchemaTable.cityId, 1)}`);

			const newYorkers3 = mySchema.materializedView('new_yorkers', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull(),
			}).existing();

			await db.execute(sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`);

			await db.insert(citiesMySchemaTable).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users2MySchemaTable).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 1 },
				{ name: 'Jack', cityId: 2 },
			]);

			{
				const result = await db.select().from(newYorkers1);
				expect(result).toEqual([]);
			}

			await db.refreshMaterializedView(newYorkers1);

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

			await db.execute(sql`drop materialized view ${newYorkers1}`);
		});

		test('limit 0', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.select()
				.from(usersTable)
				.limit(0);

			expect(users).toEqual([]);
		});

		test('limit -1', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db
				.select()
				.from(usersTable)
				.limit(-1);

			expect(users.length).toBeGreaterThan(0);
		});

		test('Object keys as column names', async (ctx) => {
			const { db } = ctx.cockroach;

			// Tests the following:
			// Column with required config
			// Column with optional config without providing a value
			// Column with optional config providing a value
			// Column without config
			const users = cockroachTable('users', {
				id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
				firstName: varchar(),
				lastName: varchar({ length: 50 }),
				admin: bool(),
			});

			await db.execute(sql`drop table if exists users`);
			await db.execute(
				sql`
					create table users (
						"id" bigint primary key generated by default as identity,
						"firstName" varchar,
						"lastName" varchar(50),
						"admin" bool
					)
				`,
			);

			await db.insert(users).values([
				{ firstName: 'John', lastName: 'Doe', admin: true },
				{ firstName: 'Jane', lastName: 'Smith', admin: false },
			]);
			const result = await db
				.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
				.from(users)
				.where(eq(users.admin, true));

			expect(result).toEqual([
				{ id: 1, firstName: 'John', lastName: 'Doe' },
			]);

			await db.execute(sql`drop table users`);
		});

		test('proper json and jsonb handling', async (ctx) => {
			const { db } = ctx.cockroach;

			const jsonTable = cockroachTable('json_table', {
				jsonb: jsonb('jsonb').$type<{ name: string; age: number }>(),
			});

			await db.execute(sql`drop table if exists ${jsonTable}`);

			await db.execute(sql`create table ${jsonTable} (json json, jsonb jsonb)`);

			await db.insert(jsonTable).values({ jsonb: { name: 'Pete', age: 23 } });

			const result = await db.select().from(jsonTable);

			const justNames = await db.select({
				name2: sql<string>`${jsonTable.jsonb}->>'name'`.as('name2'),
			}).from(jsonTable);

			expect(result).toStrictEqual([
				{
					jsonb: { name: 'Pete', age: 23 },
				},
			]);

			expect(justNames).toStrictEqual([
				{
					name2: 'Pete',
				},
			]);
		});

		test('set json/jsonb fields with objects and retrieve with the ->> operator', async (ctx) => {
			const { db } = ctx.cockroach;

			const obj = { string: 'test', number: 123 };
			const { string: testString, number: testNumber } = obj;

			await db.insert(jsonTestTable).values({
				jsonb: obj,
			});

			const result = await db.select({
				jsonbStringField: sql<string>`${jsonTestTable.jsonb}->>'string'`,
				jsonbNumberField: sql<string>`${jsonTestTable.jsonb}->>'number'`,
			}).from(jsonTestTable);

			expect(result).toStrictEqual([{
				jsonbStringField: testString,
				jsonbNumberField: String(testNumber),
			}]);
		});

		test('set json/jsonb fields with strings and retrieve with the ->> operator', async (ctx) => {
			const { db } = ctx.cockroach;

			const obj = { string: 'test', number: 123 };
			const { string: testString, number: testNumber } = obj;

			await db.insert(jsonTestTable).values({
				jsonb: sql`${JSON.stringify(obj)}`,
			});

			const result = await db.select({
				jsonbStringField: sql<string>`${jsonTestTable.jsonb}->>'string'`,
				jsonbNumberField: sql<string>`${jsonTestTable.jsonb}->>'number'`,
			}).from(jsonTestTable);

			expect(result).toStrictEqual([{
				jsonbStringField: testString,
				jsonbNumberField: String(testNumber),
			}]);
		});

		test('set json/jsonb fields with objects and retrieve with the -> operator', async (ctx) => {
			const { db } = ctx.cockroach;

			const obj = { string: 'test', number: 123 };
			const { string: testString, number: testNumber } = obj;

			await db.insert(jsonTestTable).values({
				jsonb: obj,
			});

			const result = await db.select({
				jsonbStringField: sql<string>`${jsonTestTable.jsonb}->'string'`,
				jsonbNumberField: sql<number>`${jsonTestTable.jsonb}->'number'`,
			}).from(jsonTestTable);

			expect(result).toStrictEqual([{
				jsonbStringField: testString,
				jsonbNumberField: testNumber,
			}]);
		});

		test('set json/jsonb fields with strings and retrieve with the -> operator', async (ctx) => {
			const { db } = ctx.cockroach;

			const obj = { string: 'test', number: 123 };
			const { string: testString, number: testNumber } = obj;

			await db.insert(jsonTestTable).values({
				jsonb: sql`${JSON.stringify(obj)}`,
			});

			const result = await db.select({
				jsonbStringField: sql<string>`${jsonTestTable.jsonb}->'string'`,
				jsonbNumberField: sql<number>`${jsonTestTable.jsonb}->'number'`,
			}).from(jsonTestTable);

			expect(result).toStrictEqual([{
				jsonbStringField: testString,
				jsonbNumberField: testNumber,
			}]);
		});

		test('update ... from', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(cities2Table).values([
				{ name: 'New York City' },
				{ name: 'Seattle' },
			]);
			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 2 },
			]);

			const result = await db
				.update(users2Table)
				.set({
					cityId: cities2Table.id,
				})
				.from(cities2Table)
				.where(and(eq(cities2Table.name, 'Seattle'), eq(users2Table.name, 'John')))
				.returning();

			expect(result).toStrictEqual([{
				id: 1,
				name: 'John',
				cityId: 2,
				cities: {
					id: 2,
					name: 'Seattle',
				},
			}]);
		});

		test('update ... from with alias', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.insert(cities2Table).values([
				{ name: 'New York City' },
				{ name: 'Seattle' },
			]);
			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 2 },
			]);

			const users = alias(users2Table, 'u');
			const cities = alias(cities2Table, 'c');
			const result = await db
				.update(users)
				.set({
					cityId: cities.id,
				})
				.from(cities)
				.where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
				.returning();

			expect(result).toStrictEqual([{
				id: 1,
				name: 'John',
				cityId: 2,
				c: {
					id: 2,
					name: 'Seattle',
				},
			}]);
		});

		test('update ... from with join', async (ctx) => {
			const { db } = ctx.cockroach;

			const states = cockroachTable('states', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
			});
			const cities = cockroachTable('cities', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				stateId: int4('state_id').references(() => states.id),
			});
			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				cityId: int4('city_id').notNull().references(() => cities.id),
			});

			await db.execute(sql`drop table if exists "states" cascade`);
			await db.execute(sql`drop table if exists "cities" cascade`);
			await db.execute(sql`drop table if exists "users" cascade`);
			await db.execute(sql`
				create table "states" (
					"id" int4 primary key generated by default as identity,
					"name" text not null
				)
			`);
			await db.execute(sql`
				create table "cities" (
					"id" int4 primary key generated by default as identity,
					"name" text not null,
					"state_id" int4 references "states"("id")
				)
			`);
			await db.execute(sql`
				create table "users" (
					"id" int4 primary key generated by default as identity,
					"name" text not null,
					"city_id" int4 not null references "cities"("id")
				)
			`);

			await db.insert(states).values([
				{ name: 'New York' },
				{ name: 'Washington' },
			]);
			await db.insert(cities).values([
				{ name: 'New York City', stateId: 1 },
				{ name: 'Seattle', stateId: 2 },
				{ name: 'London' },
			]);
			await db.insert(users).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 2 },
				{ name: 'Jack', cityId: 3 },
			]);

			const result1 = await db
				.update(users)
				.set({
					cityId: cities.id,
				})
				.from(cities)
				.leftJoin(states, eq(cities.stateId, states.id))
				.where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
				.returning();
			const result2 = await db
				.update(users)
				.set({
					cityId: cities.id,
				})
				.from(cities)
				.leftJoin(states, eq(cities.stateId, states.id))
				.where(and(eq(cities.name, 'London'), eq(users.name, 'Jack')))
				.returning();

			expect(result1).toStrictEqual([{
				id: 1,
				name: 'John',
				cityId: 2,
				cities: {
					id: 2,
					name: 'Seattle',
					stateId: 2,
				},
				states: {
					id: 2,
					name: 'Washington',
				},
			}]);
			expect(result2).toStrictEqual([{
				id: 3,
				name: 'Jack',
				cityId: 3,
				cities: {
					id: 3,
					name: 'London',
					stateId: null,
				},
				states: null,
			}]);
		});

		test('insert into ... select', async (ctx) => {
			const { db } = ctx.cockroach;

			const notifications = cockroachTable('notifications', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				sentAt: timestamp('sent_at').notNull().defaultNow(),
				message: text('message').notNull(),
			});
			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
			});
			const userNotications = cockroachTable('user_notifications', {
				userId: int4('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
				notificationId: int4('notification_id').notNull().references(() => notifications.id, {
					onDelete: 'cascade',
				}),
			}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

			await db.execute(sql`drop table if exists notifications`);
			await db.execute(sql`drop table if exists users`);
			await db.execute(sql`drop table if exists user_notifications`);
			await db.execute(sql`
				create table notifications (
					id int4 primary key generated by default as identity,
					sent_at timestamp not null default now(),
					message text not null
				)
			`);
			await db.execute(sql`
				create table users (
					id int4 primary key generated by default as identity,
					name text not null
				)
			`);
			await db.execute(sql`
				create table user_notifications (
					user_id int references users(id) on delete cascade,
					notification_id int references notifications(id) on delete cascade,
					primary key (user_id, notification_id)
				)
			`);

			const newNotification = await db
				.insert(notifications)
				.values({ message: 'You are one of the 3 lucky winners!' })
				.returning({ id: notifications.id })
				.then((result) => result[0]);
			await db.insert(users).values([
				{ name: 'Alice' },
				{ name: 'Bob' },
				{ name: 'Charlie' },
				{ name: 'David' },
				{ name: 'Eve' },
			]);

			const sentNotifications = await db
				.insert(userNotications)
				.select(
					db
						.select({
							userId: users.id,
							notificationId: sql`${newNotification!.id}`.as('notification_id'),
						})
						.from(users)
						.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
						.orderBy(asc(users.id)),
				)
				.returning();

			expect(sentNotifications).toStrictEqual([
				{ userId: 1, notificationId: newNotification!.id },
				{ userId: 3, notificationId: newNotification!.id },
				{ userId: 5, notificationId: newNotification!.id },
			]);
		});

		test('insert into ... select with keys in different order', async (ctx) => {
			const { db } = ctx.cockroach;

			const users1 = cockroachTable('users1', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2 = cockroachTable('users2', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists users1`);
			await db.execute(sql`drop table if exists users2`);
			await db.execute(sql`
				create table users1 (
					id int4 primary key,
					name text not null
				)
			`);
			await db.execute(sql`
				create table users2 (
					id int4 primary key,
					name text not null
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

		test('policy', () => {
			{
				const policy = cockroachPolicy('test policy');

				expect(is(policy, CockroachPolicy)).toBe(true);
				expect(policy.name).toBe('test policy');
			}

			{
				const policy = cockroachPolicy('test policy', {
					as: 'permissive',
					for: 'all',
					to: 'public',
					using: sql`1=1`,
					withCheck: sql`1=1`,
				});

				expect(is(policy, CockroachPolicy)).toBe(true);
				expect(policy.name).toBe('test policy');
				expect(policy.as).toBe('permissive');
				expect(policy.for).toBe('all');
				expect(policy.to).toBe('public');
				const dialect = new CockroachDialect();
				expect(is(policy.using, SQL)).toBe(true);
				expect(dialect.sqlToQuery(policy.using!).sql).toBe('1=1');
				expect(is(policy.withCheck, SQL)).toBe(true);
				expect(dialect.sqlToQuery(policy.withCheck!).sql).toBe('1=1');
			}

			{
				const policy = cockroachPolicy('test policy', {
					to: 'custom value',
				});

				expect(policy.to).toBe('custom value');
			}

			{
				const p1 = cockroachPolicy('test policy');
				const p2 = cockroachPolicy('test policy 2', {
					as: 'permissive',
					for: 'all',
					to: 'public',
					using: sql`1=1`,
					withCheck: sql`1=1`,
				});
				const table = cockroachTable('table_with_policy', {
					id: int4('id').primaryKey(),
					name: text('name').notNull(),
				}, () => [
					p1,
					p2,
				]);
				const config = getTableConfig(table);
				expect(config.policies).toHaveLength(2);
				expect(config.policies[0]).toBe(p1);
				expect(config.policies[1]).toBe(p2);
			}
		});

		test('Enable RLS function', () => {
			const usersWithRLS = cockroachTable('users', {
				id: int4(),
			}).enableRLS();

			const config1 = getTableConfig(usersWithRLS);

			const usersNoRLS = cockroachTable('users', {
				id: int4(),
			});

			const config2 = getTableConfig(usersNoRLS);

			expect(config1.enableRLS).toBeTruthy();
			expect(config2.enableRLS).toBeFalsy();
		});

		test('$count separate', async (ctx) => {
			const { db } = ctx.cockroach;

			const countTestTable = cockroachTable('count_test', {
				id: int4('id').notNull(),
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

		test('$count embedded', async (ctx) => {
			const { db } = ctx.cockroach;

			const countTestTable = cockroachTable('count_test', {
				id: int4('id').notNull(),
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

		test('$count separate reuse', async (ctx) => {
			const { db } = ctx.cockroach;

			const countTestTable = cockroachTable('count_test', {
				id: int4('id').notNull(),
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

		test('$count embedded reuse', async (ctx) => {
			const { db } = ctx.cockroach;

			const countTestTable = cockroachTable('count_test', {
				id: int4('id').notNull(),
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

		test('$count separate with filters', async (ctx) => {
			const { db } = ctx.cockroach;

			const countTestTable = cockroachTable('count_test', {
				id: int4('id').notNull(),
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

			const count = await db.$count(countTestTable, gt(countTestTable.id, 1));

			await db.execute(sql`drop table ${countTestTable}`);

			expect(count).toStrictEqual(3);
		});

		test('$count embedded with filters', async (ctx) => {
			const { db } = ctx.cockroach;

			const countTestTable = cockroachTable('count_test', {
				id: int4('id').notNull(),
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
				count: db.$count(countTestTable, gt(countTestTable.id, 1)),
			}).from(countTestTable);

			await db.execute(sql`drop table ${countTestTable}`);

			expect(count).toStrictEqual([
				{ count: 3 },
				{ count: 3 },
				{ count: 3 },
				{ count: 3 },
			]);
		});

		test('insert multiple rows into table with generated identity column', async (ctx) => {
			const { db } = ctx.cockroach;

			const identityColumnsTable = cockroachTable('identity_columns_table', {
				id: int4('id').generatedAlwaysAsIdentity(),
				id1: int4('id1').generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
			});

			// not passing identity columns
			await db.execute(sql`drop table if exists ${identityColumnsTable}`);
			await db.execute(
				sql`create table ${identityColumnsTable} ("id" int4 generated always as identity, "id1" int4 generated by default as identity, "name" text)`,
			);

			let result = await db.insert(identityColumnsTable).values([
				{ name: 'John' },
				{ name: 'Jane' },
				{ name: 'Bob' },
			]).returning();

			expect(result).toEqual([
				{ id: 1, id1: 1, name: 'John' },
				{ id: 2, id1: 2, name: 'Jane' },
				{ id: 3, id1: 3, name: 'Bob' },
			]);

			// passing generated by default as identity column
			await db.execute(sql`drop table if exists ${identityColumnsTable}`);
			await db.execute(
				sql`create table ${identityColumnsTable} ("id" int4 generated always as identity, "id1" int4 generated by default as identity, "name" text)`,
			);

			result = await db.insert(identityColumnsTable).values([
				{ name: 'John', id1: 3 },
				{ name: 'Jane', id1: 5 },
				{ name: 'Bob', id1: 5 },
			]).returning();

			expect(result).toEqual([
				{ id: 1, id1: 3, name: 'John' },
				{ id: 2, id1: 5, name: 'Jane' },
				{ id: 3, id1: 5, name: 'Bob' },
			]);
		});

		test('insert as cte', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null)`,
			);

			const sq1 = db.$with('sq').as(
				db.insert(users).values({ name: 'John' }).returning(),
			);
			const result1 = await db.with(sq1).select().from(sq1);
			const result2 = await db.with(sq1).select({ id: sq1.id }).from(sq1);

			const sq2 = db.$with('sq').as(
				db.insert(users).values({ name: 'Jane' }).returning({ id: users.id, name: users.name }),
			);
			const result3 = await db.with(sq2).select().from(sq2);
			const result4 = await db.with(sq2).select({ name: sq2.name }).from(sq2);

			expect(result1).toEqual([{ id: 1, name: 'John' }]);
			expect(result2).toEqual([{ id: 2 }]);
			expect(result3).toEqual([{ id: 3, name: 'Jane' }]);
			expect(result4).toEqual([{ name: 'Jane' }]);
		});

		test('update as cte', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				name: text('name').notNull(),
				age: int4('age').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null, age int4 not null)`,
			);

			await db.insert(users).values([
				{ name: 'John', age: 30 },
				{ name: 'Jane', age: 30 },
			]);

			const sq1 = db.$with('sq').as(
				db.update(users).set({ age: 25 }).where(eq(users.name, 'John')).returning(),
			);
			const result1 = await db.with(sq1).select().from(sq1);
			await db.update(users).set({ age: 30 });
			const result2 = await db.with(sq1).select({ age: sq1.age }).from(sq1);

			const sq2 = db.$with('sq').as(
				db.update(users).set({ age: 20 }).where(eq(users.name, 'Jane')).returning({ name: users.name, age: users.age }),
			);
			const result3 = await db.with(sq2).select().from(sq2);
			await db.update(users).set({ age: 30 });
			const result4 = await db.with(sq2).select({ age: sq2.age }).from(sq2);

			expect(result1).toEqual([{ id: 1, name: 'John', age: 25 }]);
			expect(result2).toEqual([{ age: 25 }]);
			expect(result3).toEqual([{ name: 'Jane', age: 20 }]);
			expect(result4).toEqual([{ age: 20 }]);
		});

		test('delete as cte', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null)`,
			);

			await db.insert(users).values([
				{ name: 'John' },
				{ name: 'Jane' },
			]);

			const sq1 = db.$with('sq').as(
				db.delete(users).where(eq(users.name, 'John')).returning(),
			);
			const result1 = await db.with(sq1).select().from(sq1);
			await db.insert(users).values({ name: 'John' });
			const result2 = await db.with(sq1).select({ name: sq1.name }).from(sq1);

			const sq2 = db.$with('sq').as(
				db.delete(users).where(eq(users.name, 'Jane')).returning({ id: users.id, name: users.name }),
			);
			const result3 = await db.with(sq2).select().from(sq2);
			await db.insert(users).values({ name: 'Jane' });
			const result4 = await db.with(sq2).select({ name: sq2.name }).from(sq2);

			expect(result1).toEqual([{ id: 1, name: 'John' }]);
			expect(result2).toEqual([{ name: 'John' }]);
			expect(result3).toEqual([{ id: 2, name: 'Jane' }]);
			expect(result4).toEqual([{ name: 'Jane' }]);
		});

		test('sql operator as cte', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users', {
				id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(
				sql`create table ${users} (id int4 not null primary key generated by default as identity, name text not null)`,
			);
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

		test('cross join', async (ctx) => {
			const { db } = ctx.cockroach;

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

		test('left join (lateral)', async (ctx) => {
			const { db } = ctx.cockroach;

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
				.leftJoinLateral(sq, sql`true`);

			expect(res).toStrictEqual([
				{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
				{ cityId: 2, cityName: 'London', userId: null, userName: null },
			]);
		});

		test('inner join (lateral)', async (ctx) => {
			const { db } = ctx.cockroach;

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

		test('cross join (lateral)', async (ctx) => {
			const { db } = ctx.cockroach;

			await db
				.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }, { id: 3, name: 'Berlin' }]);

			await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }, {
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
				.where(not(like(citiesTable.name, 'L%')))
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
				.orderBy(citiesTable.id, sq.userId);

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

		test('column.as', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_column_as', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				cityId: int4('city_id').references(() => cities.id),
			});

			const cities = cockroachTable('cities_column_as', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
			});

			const ucView = cockroachView('cities_users_column_as_view').as((qb) =>
				qb.select({
					userId: users.id.as('user_id'),
					cityId: cities.id.as('city_id'),
					userName: users.name.as('user_name'),
					cityName: cities.name.as('city_name'),
				}).from(users).leftJoin(cities, eq(cities.id, users.cityId))
			);

			await db.execute(sql`CREATE TABLE ${cities} (
				"id" INT4 PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
				"name" TEXT NOT NULL
			);`);

			await db.execute(sql`CREATE TABLE ${users} (
				"id" INT4 GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
				"name" TEXT NOT NULL,
				"city_id"  INT4 REFERENCES ${cities}("id") 
			);`);

			await db.execute(
				sql`CREATE VIEW ${ucView} AS SELECT ${users.id} as "user_id", ${cities.id} as "city_id", ${users.name} as "user_name", ${cities.name} as "city_name" FROM ${users} LEFT JOIN ${cities} ON ${
					eq(cities.id, users.cityId)
				};`,
			);

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

			const viewSelectReturn = await db.select().from(ucView);

			expect(viewSelectReturn).toStrictEqual(expect.arrayContaining([{
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

			const viewJoinReturn = await db.select({
				userId: ucView.userId.as('user_id_ucv'),
				cityId: cities.id.as('city_id'),
				userName: ucView.userName.as('user_name_ucv'),
				cityName: cities.name.as('city_name'),
			}).from(ucView).leftJoin(cities, eq(cities.id, ucView.cityId));

			expect(viewJoinReturn).toStrictEqual(expect.arrayContaining([{
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
		});

		test('select from a many subquery', async (ctx) => {
			const { db } = ctx.cockroach;

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
			const { db } = ctx.cockroach;

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

		test('test $onUpdateFn and $onUpdate works with sql value', async (ctx) => {
			const { db } = ctx.cockroach;

			const users = cockroachTable('users_on_update', {
				id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
				updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$onUpdate(() => sql`now()`),
			});

			await db.execute(sql`DROP TABLE IF EXISTS ${users}`);
			await db.execute(sql`CREATE TABLE ${users} (
				id INT4 PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
				name TEXT NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL
			);`);

			const insertResp = await db.insert(users).values({
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

			expect(insertResp[0]?.updatedAt.getTime() ?? 0).lessThan(now);
			expect(updateResp[0]?.updatedAt.getTime() ?? 0).greaterThan(now);
		});

		test('placeholder + sql dates', async (ctx) => {
			const { db } = ctx.cockroach;

			const dateTable = cockroachTable('dates_placeholder_test', (t) => ({
				id: t.int4('id').primaryKey().notNull(),
				date: t.date('date', { mode: 'date' }).notNull(),
				dateStr: t.date('date_str', { mode: 'string' }).notNull(),
				timestamp: t.timestamp('timestamp', { mode: 'date' }).notNull(),
				timestampStr: t.timestamp('timestamp_str', { mode: 'string' }).notNull(),
			}));

			await db.execute(sql`DROP TABLE IF EXISTS ${dateTable};`);
			await db.execute(sql`CREATE TABLE ${dateTable} (
			${sql.identifier('id')} INT4 PRIMARY KEY NOT NULL,
			${sql.identifier('date')} DATE NOT NULL,
			${sql.identifier('date_str')} DATE NOT NULL,
			${sql.identifier('timestamp')} TIMESTAMP NOT NULL,
			${sql.identifier('timestamp_str')} TIMESTAMP NOT NULL
		);`);

			const date = new Date('2025-12-10T00:00:00.000Z');
			const timestamp = new Date('2025-12-10T01:01:01.111Z');
			const dateStr = date.toISOString().slice(0, -14);
			const timestampStr = timestamp.toISOString().slice(0, -1).replace('T', ' ');

			const initial = await db.insert(dateTable).values([{
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
			}]).returning().execute({
				dateAsDate: date,
				dateAsString: dateStr,
				dateStrAsDate: date,
				dateStrAsString: dateStr,
				timestampAsDate: timestamp,
				timestampAsString: timestampStr,
				timestampStrAsDate: timestamp,
				timestampStrAsString: timestampStr,
			});

			const updated = await db.update(dateTable).set({
				date: sql`${dateStr}`,
				dateStr: sql`${dateStr}`,
				timestamp: sql`${timestampStr}`,
				timestampStr: sql`${timestampStr}`,
			}).returning();

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

		test('all types', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.execute(sql`CREATE TYPE "public"."en" AS ENUM('enVal1', 'enVal2');`);
			await db.execute(sql`
				CREATE TABLE "all_types" (
					"int4" int4 NOT NULL,
					"bigint53" bigint NOT NULL,
					"bigint64" bigint,
					"bool" bool,
					"boolean" bool,
					"char" char,
					"date" date,
					"date_str" date,
					"string" string,
					"double" double precision,
					"float" float,
					"enum" "en",
					"inet" "inet",
					"interval" interval,
					"jsonb" jsonb,
					"numeric" numeric,
					"numeric_num" numeric,
					"numeric_big" numeric,
					"real" real,
					"smallint" smallint,
					"text" text,
					"time" time,
					"timestamp" timestamp,
					"timestamp_tz" timestamp with time zone,
					"timestamp_str" timestamp,
					"timestamp_tz_str" timestamp with time zone,
					"uuid" uuid,
					"varchar" varchar,
					"arrint" int4[],
					"arrbigint53" bigint[],
					"arrbigint64" bigint[],
					"arrbool" bool[],
					"arrchar" char[],
					"arrdate" date[],
					"arrdate_str" date[],
					"arrdouble" double precision[],
					"arrenum" "en"[],
					"arrinet" "inet"[],
					"arrinterval" interval[],
					"arrnumeric" numeric[],
					"arrnumeric_num" numeric[],
					"arrnumeric_big" numeric[],
					"arrreal" real[],
					"arrsmallint" smallint[],
					"arrtext" text[],
					"arrtime" time[],
					"arrtimestamp" timestamp[],
					"arrtimestamp_tz" timestamp with time zone[],
					"arrtimestamp_str" timestamp[],
					"arrtimestamp_tz_str" timestamp with time zone[],
					"arruuid" uuid[],
					"arrstring" string[],
					"arrfloat" float[],
					"arrvarchar" varchar[],
					"bit" bit,
					"varbit" varbit,
					"arrbit" bit[],
					"arrvarbit" varbit[],
					"arrboolean" bool[]
				);
			`);

			await db.insert(allTypesTable).values({
				int4: 1,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				bool: true,
				char: 'c',
				date: new Date(1741743161623),
				dateStr: new Date(1741743161623).toISOString(),
				double: 15.35325689124218,
				enum: 'enVal1',
				inet: '192.168.0.1/24',
				interval: '-2 months',
				jsonb: {
					str: 'strvalb',
					arr: ['strb', 11],
				},
				numeric: '475452353476',
				numericNum: 9007199254740991,
				numericBig: 5044565289845416380n,
				real: 1.048596,
				smallint: 15,
				text: 'TEXT STRING',
				time: '13:59:28',
				timestamp: new Date(1741743161623),
				timestampTz: new Date(1741743161623),
				timestampStr: new Date(1741743161623).toISOString(),
				timestampTzStr: new Date(1741743161623).toISOString(),
				uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
				varchar: 'C4-',
				arrbigint53: [9007199254740991],
				arrbigint64: [5044565289845416380n],
				arrbool: [true],
				arrchar: ['c'],
				arrinet: ['192.168.0.1/24'],
				arrdate: [new Date(1741743161623)],
				arrdateStr: [new Date(1741743161623).toISOString()],
				arrdouble: [15.35325689124218],
				arrenum: ['enVal1'],
				arrint: [621],
				arrinterval: ['-2 months'],
				arrnumeric: ['475452353476'],
				arrnumericNum: [9007199254740991],
				arrnumericBig: [5044565289845416380n],
				arrreal: [1.048596],
				arrsmallint: [10],
				arrtext: ['TEXT STRING'],
				arrtime: ['13:59:28'],
				arrtimestamp: [new Date(1741743161623)],
				arrtimestampTz: [new Date(1741743161623)],
				arrtimestampStr: [new Date(1741743161623).toISOString()],
				arrtimestampTzStr: [new Date(1741743161623).toISOString()],
				arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
				arrvarchar: ['C4-'],
				string: 'TEXT STRING',
				arrfloat: [1.12, 1.13],
				arrstring: ['TEXT STRING', 'TEXT STRING1'],
				float: 1.12,
				arrbit: ['1'],
				arrvarbit: ['1'],
				arrboolean: [true, false],
				boolean: true,
				varbit: '1',
				bit: '1',
			});

			const rawRes = await db.select().from(allTypesTable);

			type ExpectedType = {
				int4: number | null;
				bigint53: number | null;
				bigint64: bigint | null;
				bool: boolean | null;
				char: string | null;
				date: Date | null;
				dateStr: string | null;
				double: number | null;
				enum: 'enVal1' | 'enVal2' | null;
				inet: string | null;
				interval: string | null;
				jsonb: unknown;
				numeric: string | null;
				numericNum: number | null;
				numericBig: bigint | null;
				real: number | null;
				smallint: number | null;
				text: string | null;
				time: string | null;
				timestamp: Date | null;
				timestampTz: Date | null;
				timestampStr: string | null;
				timestampTzStr: string | null;
				uuid: string | null;
				varchar: string | null;
				arrint: number[] | null;
				arrbigint53: number[] | null;
				arrbigint64: bigint[] | null;
				arrbool: boolean[] | null;
				arrchar: string[] | null;
				arrdate: Date[] | null;
				arrdateStr: string[] | null;
				arrdouble: number[] | null;
				arrenum: ('enVal1' | 'enVal2')[] | null;
				arrinet: string[] | null;
				arrinterval: string[] | null;
				arrnumeric: string[] | null;
				arrnumericNum: number[] | null;
				arrnumericBig: bigint[] | null;
				arrreal: number[] | null;
				arrsmallint: number[] | null;
				arrtext: string[] | null;
				arrtime: string[] | null;
				arrtimestamp: Date[] | null;
				arrtimestampTz: Date[] | null;
				arrtimestampStr: string[] | null;
				arrtimestampTzStr: string[] | null;
				arruuid: string[] | null;
				arrvarchar: string[] | null;
				string: string | null;
				arrfloat: number[] | null;
				arrstring: string[] | null;
				float: number | null;
				arrbit: string[] | null;
				arrvarbit: string[] | null;
				arrboolean: boolean[] | null;
				boolean: boolean | null;
				varbit: string | null;
				bit: string | null;
			}[];

			const expectedRes: ExpectedType = [
				{
					int4: 1,
					bigint53: 9007199254740991,
					bigint64: 5044565289845416380n,
					bool: true,
					char: 'c',
					date: new Date('2025-03-12T00:00:00.000Z'),
					dateStr: '2025-03-12',
					double: 15.35325689124218,
					enum: 'enVal1',
					inet: '192.168.0.1/24',
					interval: '-2 mons',
					jsonb: { arr: ['strb', 11], str: 'strvalb' },
					numeric: '475452353476',
					numericNum: 9007199254740991,
					numericBig: 5044565289845416380n,
					real: 1.048596,
					smallint: 15,
					text: 'TEXT STRING',
					time: '13:59:28',
					timestamp: new Date('2025-03-12T01:32:41.623Z'),
					timestampTz: new Date('2025-03-12T01:32:41.623Z'),
					timestampStr: '2025-03-12 01:32:41.623',
					timestampTzStr: '2025-03-12 01:32:41.623+00',
					uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
					varchar: 'C4-',
					arrint: [621],
					arrbigint53: [9007199254740991],
					arrbigint64: [5044565289845416380n],
					arrbool: [true],
					arrchar: ['c'],
					arrdate: [new Date('2025-03-12T00:00:00.000Z')],
					arrdateStr: ['2025-03-12'],
					arrdouble: [15.35325689124218],
					arrenum: ['enVal1'],
					arrinet: ['192.168.0.1/24'],
					arrinterval: ['-2 mons'],
					arrnumeric: ['475452353476'],
					arrnumericNum: [9007199254740991],
					arrnumericBig: [5044565289845416380n],
					arrreal: [1.048596],
					arrsmallint: [10],
					arrtext: ['TEXT STRING'],
					arrtime: ['13:59:28'],
					arrtimestamp: [new Date('2025-03-12T01:32:41.623Z')],
					arrtimestampTz: [new Date('2025-03-12T01:32:41.623Z')],
					arrtimestampStr: ['2025-03-12 01:32:41.623'],
					arrtimestampTzStr: ['2025-03-12 01:32:41.623+00'],
					arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
					arrvarchar: ['C4-'],
					arrfloat: [1.12, 1.13],
					arrstring: ['TEXT STRING', 'TEXT STRING1'],
					float: 1.12,
					string: 'TEXT STRING',
					arrbit: ['1'],
					arrboolean: [true, false],
					arrvarbit: ['1'],
					bit: '1',
					boolean: true,
					varbit: '1',
				},
			];

			expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
			expect(rawRes).toStrictEqual(expectedRes);
		});

		test('generated always columns', async (ctx) => {
			const { db } = ctx.cockroach;

			await db.execute(sql`
				CREATE TABLE "gen_columns" (
					id int4,
					gen1 int4 generated always as (1) stored
				);
			`);

			const genColumns = cockroachTable('gen_columns', {
				id: int4(),
				gen1: int4().generatedAlwaysAs(1),
			});

			expect(db.insert(genColumns).values({ id: 1 })).resolves;
		});
	});
}
