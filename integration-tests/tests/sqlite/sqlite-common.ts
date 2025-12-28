import {
	and,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	eq,
	exists,
	getTableColumns,
	gt,
	gte,
	inArray,
	lt,
	max,
	min,
	Name,
	notInArray,
	sql,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import {
	alias,
	type BaseSQLiteDatabase,
	blob,
	except,
	foreignKey,
	getTableConfig,
	getViewConfig,
	index,
	int,
	integer,
	intersect,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	sqliteTableCreator,
	sqliteView,
	text,
	union,
	unionAll,
	unique,
	uniqueKeyName,
} from 'drizzle-orm/sqlite-core';
import { beforeEach, describe, expect, expectTypeOf, test } from 'vitest';
import type { Equal } from '~/utils';
import { Expect } from '~/utils';

declare module 'vitest' {
	interface TestContext {
		sqlite: {
			db: BaseSQLiteDatabase<'async' | 'sync', any, Record<string, never>>;
		};
	}
}

const allTypesTable = sqliteTable('all_types', {
	int: integer('int', {
		mode: 'number',
	}),
	bool: integer('bool', {
		mode: 'boolean',
	}),
	time: integer('time', {
		mode: 'timestamp',
	}),
	timeMs: integer('time_ms', {
		mode: 'timestamp_ms',
	}),
	bigint: blob('bigint', {
		mode: 'bigint',
	}),
	buffer: blob('buffer', {
		mode: 'buffer',
	}),
	json: blob('json', {
		mode: 'json',
	}),
	numeric: numeric('numeric'),
	numericNum: numeric('numeric_num', {
		mode: 'number',
	}),
	numericBig: numeric('numeric_big', {
		mode: 'bigint',
	}),
	real: real('real'),
	text: text('text', {
		mode: 'text',
	}),
	jsonText: text('json_text', {
		mode: 'json',
	}),
});

export const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
	json: blob('json', { mode: 'json' }).$type<string[]>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`strftime('%s', 'now')`),
});

export const usersOnUpdate = sqliteTable('users_on_update', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	updateCounter: integer('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$onUpdate(() => new Date()),
	alwaysNull: text('always_null').$type<string | null>().$onUpdate(() => null),
	// uppercaseName: text('uppercase_name').$onUpdateFn(() =>
	// 	sql`upper(s.name)`
	// ),  This doesn't seem to be supported in sqlite
});

export const users2Table = sqliteTable('users2', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => citiesTable.id),
});

export const citiesTable = sqliteTable('cities', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const coursesTable = sqliteTable('courses', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: integer('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = sqliteTable('course_categories', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = sqliteTable('orders', {
	id: integer('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

export const usersMigratorTable = sqliteTable('users12', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const anotherUsersMigratorTable = sqliteTable('another_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

const pkExampleTable = sqliteTable('pk_example', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => ({
	compositePk: primaryKey({ columns: [table.id, table.name] }),
}));

const conflictChainExampleTable = sqliteTable('conflict_chain_example', {
	id: integer('id').notNull().unique(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => ({
	compositePk: primaryKey({ columns: [table.id, table.name] }),
}));

const bigIntExample = sqliteTable('big_int_example', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	bigInt: blob('big_int', { mode: 'bigint' }).notNull(),
});

// To test aggregate functions
const aggregateTable = sqliteTable('aggregate_table', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('null_only'),
});

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db } = ctx.sqlite;

			await db.run(sql`drop table if exists ${usersTable}`);
			await db.run(sql`drop table if exists ${users2Table}`);
			await db.run(sql`drop table if exists ${citiesTable}`);
			await db.run(sql`drop table if exists ${coursesTable}`);
			await db.run(sql`drop table if exists ${courseCategoriesTable}`);
			await db.run(sql`drop table if exists ${orders}`);
			await db.run(sql`drop table if exists ${bigIntExample}`);
			await db.run(sql`drop table if exists ${pkExampleTable}`);
			await db.run(sql`drop table if exists ${conflictChainExampleTable}`);
			await db.run(sql`drop table if exists ${allTypesTable}`);
			await db.run(sql`drop table if exists user_notifications_insert_into`);
			await db.run(sql`drop table if exists users_insert_into`);
			await db.run(sql`drop table if exists notifications_insert_into`);

			await db.run(sql`
				create table ${usersTable} (
					id integer primary key,
					name text not null,
					verified integer not null default 0,
					json blob,
					created_at integer not null default (strftime('%s', 'now'))
				)
			`);

			await db.run(sql`
				create table ${citiesTable} (
					id integer primary key,
					name text not null
				)
			`);
			await db.run(sql`
				create table ${courseCategoriesTable} (
					id integer primary key,
					name text not null
				)
			`);

			await db.run(sql`
				create table ${users2Table} (
					id integer primary key,
					name text not null,
					city_id integer references ${citiesTable}(${sql.identifier(citiesTable.id.name)})
				)
			`);
			await db.run(sql`
				create table ${coursesTable} (
					id integer primary key,
					name text not null,
					category_id integer references ${courseCategoriesTable}(${sql.identifier(courseCategoriesTable.id.name)})
				)
			`);
			await db.run(sql`
				create table ${orders} (
					id integer primary key,
					region text not null,
					product text not null,
					amount integer not null,
					quantity integer not null
				)
			`);
			await db.run(sql`
				create table ${pkExampleTable} (
					id integer not null,
					name text not null,
					email text not null,
					primary key (id, name)
				)
			`);
			await db.run(sql`
				create table ${conflictChainExampleTable} (
					id integer not null unique,
					name text not null,
					email text not null,
					primary key (id, name)
				)
			`);
			await db.run(sql`
				create table ${bigIntExample} (
				  id integer primary key,
				  name text not null,
				  big_int blob not null
				)
			`);
		});

		async function setupSetOperationTest(db: BaseSQLiteDatabase<any, any>) {
			await db.run(sql`drop table if exists users2`);
			await db.run(sql`drop table if exists cities`);
			await db.run(sql`
				create table \`cities\` (
				    id integer primary key,
				    name text not null
				)
			`);

			await db.run(sql`
				create table \`users2\` (
				    id integer primary key,
				    name text not null,
				    city_id integer references ${citiesTable}(${sql.identifier(citiesTable.id.name)})
				)
			`);

			await db.insert(citiesTable).values([
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

		async function setupAggregateFunctionsTest(db: BaseSQLiteDatabase<any, any>) {
			await db.run(sql`drop table if exists "aggregate_table"`);
			await db.run(
				sql`
					create table "aggregate_table" (
					    "id" integer primary key autoincrement not null,
					    "name" text not null,
					    "a" integer,
					    "b" integer,
					    "c" integer,
					    "null_only" integer
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

		test('table config: foreign keys name', async () => {
			const table = sqliteTable('cities', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => ({
				f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
				f1: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk_deprecated' }),
			}));

			const tableConfig = getTableConfig(table);

			expect(tableConfig.foreignKeys).toHaveLength(2);
			expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
			expect(tableConfig.foreignKeys[1]!.getName()).toBe('custom_fk_deprecated');
		});

		test('table config: primary keys name', async () => {
			const table = sqliteTable('cities', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => ({
				f: primaryKey({ columns: [t.id, t.name], name: 'custom_pk' }),
			}));

			const tableConfig = getTableConfig(table);

			expect(tableConfig.primaryKeys).toHaveLength(1);
			expect(tableConfig.primaryKeys[0]!.getName()).toBe('custom_pk');
		});

		test('insert bigint values', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(bigIntExample).values({ name: 'one', bigInt: BigInt('0') }).run();
			await db.insert(bigIntExample).values({ name: 'two', bigInt: BigInt('127') }).run();
			await db.insert(bigIntExample).values({ name: 'three', bigInt: BigInt('32767') }).run();
			await db.insert(bigIntExample).values({ name: 'four', bigInt: BigInt('1234567890') }).run();
			await db.insert(bigIntExample).values({ name: 'five', bigInt: BigInt('12345678900987654321') }).run();

			const result = await db.select().from(bigIntExample).all();
			expect(result).toEqual([
				{ id: 1, name: 'one', bigInt: BigInt('0') },
				{ id: 2, name: 'two', bigInt: BigInt('127') },
				{ id: 3, name: 'three', bigInt: BigInt('32767') },
				{ id: 4, name: 'four', bigInt: BigInt('1234567890') },
				{ id: 5, name: 'five', bigInt: BigInt('12345678900987654321') },
			]);
		});

		test('select all fields', async (ctx) => {
			const { db } = ctx.sqlite;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' }).run();
			const result = await db.select().from(usersTable).all();
			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
		});

		test('select partial', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const result = await db.select({ name: usersTable.name }).from(usersTable).all();

			expect(result).toEqual([{ name: 'John' }]);
		});

		test('select sql', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.select({
				name: sql`upper(${usersTable.name})`,
			}).from(usersTable).all();

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select typed sql', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.select({
				name: sql<string>`upper(${usersTable.name})`,
			}).from(usersTable).all();

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select with empty array in inArray', async (ctx) => {
			const { db } = ctx.sqlite;

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
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(notInArray(usersTable.id, []));

			expect(result).toEqual([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
		});

		test('select distinct', async (ctx) => {
			const { db } = ctx.sqlite;

			const usersDistinctTable = sqliteTable('users_distinct', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${usersDistinctTable}`);
			await db.run(sql`create table ${usersDistinctTable} (id integer, name text)`);

			await db.insert(usersDistinctTable).values([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'John' },
				{ id: 2, name: 'John' },
				{ id: 1, name: 'Jane' },
			]).run();
			const users = await db.selectDistinct().from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
				usersDistinctTable.name,
			).all();

			await db.run(sql`drop table ${usersDistinctTable}`);

			expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
		});

		test('insert returning sql', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = await db.insert(usersTable).values({ name: 'John' }).returning({
				name: sql`upper(${usersTable.name})`,
			}).all();

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('$default function', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
			const selectedOrder = await db.select().from(orders);

			expect(selectedOrder).toEqual([{
				id: 1,
				amount: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			}]);
		});

		test('delete returning sql', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
				name: sql`upper(${usersTable.name})`,
			}).all();

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('query check: insert single empty row', (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = db
				.insert(users)
				.values({})
				.toSQL();

			expect(query).toEqual({
				sql: 'insert into "users" ("id", "name", "state") values (null, ?, null)',
				params: ['Dan'],
			});
		});

		test('query check: insert multiple empty rows', (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = db
				.insert(users)
				.values([{}, {}])
				.toSQL();

			expect(query).toEqual({
				sql: 'insert into "users" ("id", "name", "state") values (null, ?, null), (null, ?, null)',
				params: ['Dan', 'Dan'],
			});
		});

		test('Insert all defaults in 1 row', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('empty_insert_single', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`,
			);

			await db.insert(users).values({}).run();

			const res = await db.select().from(users).all();

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
		});

		test('Insert all defaults in multiple rows', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('empty_insert_multiple', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`,
			);

			await db.insert(users).values([{}, {}]).run();

			const res = await db.select().from(users).all();

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
		});

		test('update returning sql', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
				name: sql`upper(${usersTable.name})`,
			}).all();

			expect(users).toEqual([{ name: 'JANE' }]);
		});

		test('insert with auto increment', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Jane' },
				{ name: 'George' },
				{ name: 'Austin' },
			]).run();
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).toEqual([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Jane' },
				{ id: 3, name: 'George' },
				{ id: 4, name: 'Austin' },
			]);
		});

		test('insert with default values', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const result = await db.select().from(usersTable).all();

			expect(result).toEqual([{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
		});

		test('insert with overridden default values', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John', verified: true }).run();
			const result = await db.select().from(usersTable).all();

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, json: null, createdAt: result[0]!.createdAt }]);
		});

		test('update with returning all fields', async (ctx) => {
			const { db } = ctx.sqlite;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning()
				.all();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
			expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, json: null, createdAt: users[0]!.createdAt }]);
		});

		test('update with returning partial', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
				id: usersTable.id,
				name: usersTable.name,
			}).all();

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test('delete with returning all fields', async (ctx) => {
			const { db } = ctx.sqlite;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
			expect(users).toEqual([{ id: 1, name: 'John', verified: false, json: null, createdAt: users[0]!.createdAt }]);
		});

		test('delete with returning partial', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
				id: usersTable.id,
				name: usersTable.name,
			}).all();

			expect(users).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert + select', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).toEqual([{ id: 1, name: 'John' }]);

			await db.insert(usersTable).values({ name: 'Jane' }).run();
			const result2 = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result2).toEqual([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
		});

		test('json insert', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).run();
			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
				json: usersTable.json,
			}).from(usersTable).all();

			expect(result).toEqual([{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
		});

		test('insert many', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Bruce', json: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]).run();
			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
				json: usersTable.json,
				verified: usersTable.verified,
			}).from(usersTable).all();

			expect(result).toEqual([
				{ id: 1, name: 'John', json: null, verified: false },
				{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', json: null, verified: false },
				{ id: 4, name: 'Austin', json: null, verified: true },
			]);
		});

		test('insert many with returning', async (ctx) => {
			const { db } = ctx.sqlite;

			const result = await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Bruce', json: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			])
				.returning({
					id: usersTable.id,
					name: usersTable.name,
					json: usersTable.json,
					verified: usersTable.verified,
				})
				.all();

			expect(result).toEqual([
				{ id: 1, name: 'John', json: null, verified: false },
				{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', json: null, verified: false },
				{ id: 4, name: 'Austin', json: null, verified: true },
			]);
		});

		test('partial join with alias', async (ctx) => {
			const { db } = ctx.sqlite;
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
				}).from(usersTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(usersTable.id, 10));

			expect(result).toEqual([{
				user: { id: 10, name: 'Ivan' },
				customer: { id: 11, name: 'Hans' },
			}]);
		});

		test('full join with alias', async (ctx) => {
			const { db } = ctx.sqlite;

			const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);
			await db.run(sql`create table ${users} (id integer primary key, name text not null)`);

			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
			const result = await db
				.select().from(users)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(users.id, 10))
				.all();

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

			await db.run(sql`drop table ${users}`);
		});

		test('select from alias', async (ctx) => {
			const { db } = ctx.sqlite;

			const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);
			await db.run(sql`create table ${users} (id integer primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
			const result = await db
				.select()
				.from(user)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(user.id, 10))
				.all();

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

			await db.run(sql`drop table ${users}`);
		});

		test('insert with spaces', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).run();
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test('prepared statement', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const statement = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).prepare();
			const result = await statement.all();

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('prepared statement reuse', async (ctx) => {
			const { db } = ctx.sqlite;

			const stmt = db.insert(usersTable).values({ name: sql.placeholder('name') }).prepare();

			for (let i = 0; i < 10; i++) {
				await stmt.run({ name: `John ${i}` });
			}

			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
			}).from(usersTable).all();

			expect(result).toEqual([
				{ id: 1, name: 'John 0' },
				{ id: 2, name: 'John 1' },
				{ id: 3, name: 'John 2' },
				{ id: 4, name: 'John 3' },
				{ id: 5, name: 'John 4' },
				{ id: 6, name: 'John 5' },
				{ id: 7, name: 'John 6' },
				{ id: 8, name: 'John 7' },
				{ id: 9, name: 'John 8' },
				{ id: 10, name: 'John 9' },
			]);
		});

		test('insert: placeholders on columns with encoder', async (ctx) => {
			const { db } = ctx.sqlite;

			const stmt = db.insert(usersTable).values({
				name: 'John',
				verified: sql.placeholder('verified'),
			}).prepare();

			await stmt.run({ verified: true });
			await stmt.run({ verified: false });

			const result = await db.select({
				id: usersTable.id,
				verified: usersTable.verified,
			}).from(usersTable).all();

			expect(result).toEqual([
				{ id: 1, verified: true },
				{ id: 2, verified: false },
			]);
		});

		test('prepared statement with placeholder in .where', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const stmt = db.select({
				id: usersTable.id,
				name: usersTable.name,
			}).from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.prepare();
			const result = await stmt.all({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('prepared statement with placeholder in .limit', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ name: 'John' }).run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.limit(sql.placeholder('limit'))
				.prepare();

			const result = await stmt.all({ id: 1, limit: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
			expect(result).toHaveLength(1);
		});

		test('prepared statement with placeholder in .offset', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.limit(sql.placeholder('limit'))
				.offset(sql.placeholder('offset'))
				.prepare();

			const result = await stmt.all({ limit: 1, offset: 1 });

			expect(result).toEqual([{ id: 2, name: 'John1' }]);
		});

		test('prepared statement built using $dynamic', async (ctx) => {
			const { db } = ctx.sqlite;

			function withLimitOffset(qb: any) {
				return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
			}

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.$dynamic();
			withLimitOffset(stmt).prepare('stmt_limit');

			const result = await stmt.all({ limit: 1, offset: 1 });

			expect(result).toEqual([{ id: 2, name: 'John1' }]);
			expect(result).toHaveLength(1);
		});

		test('select with group by as field', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.name)
				.all();

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test('select with exists', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

			const user = alias(usersTable, 'user');
			const result = await db.select({ name: usersTable.name }).from(usersTable).where(
				exists(
					db.select({ one: sql`1` }).from(user).where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id))),
				),
			).all();

			expect(result).toEqual([{ name: 'John' }]);
		});

		test('select with group by as sql', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`)
				.all();

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test('select with group by as sql + column', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`, usersTable.id)
				.all();

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('select with group by as column + sql', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.all();

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('select with group by complex query', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.limit(1)
				.all();

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test('build query', async (ctx) => {
			const { db } = ctx.sqlite;

			const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
				params: [],
			});
		});

		test('insert via db.run + select via db.all', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = await db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert via db.get', async (ctx) => {
			const { db } = ctx.sqlite;

			const inserted = await db.get<{ id: number; name: string }>(
				sql`insert into ${usersTable} (${new Name(
					usersTable.name.name,
				)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
			);
			expect(inserted).toEqual({ id: 1, name: 'John' });
		});

		test('insert via db.run + select via db.get', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = await db.get<{ id: number; name: string }>(
				sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
			);
			expect(result).toEqual({ id: 1, name: 'John' });
		});

		test('insert via db.get w/ query builder', async (ctx) => {
			const { db } = ctx.sqlite;

			const inserted = await db.get<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
				db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
			);
			expect(inserted).toEqual({ id: 1, name: 'John' });
		});

		test('select from a many subquery', async (ctx) => {
			const { db } = ctx.sqlite;

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
			const { db } = ctx.sqlite;

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

		test('join subquery', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(courseCategoriesTable).values([
				{ name: 'Category 1' },
				{ name: 'Category 2' },
				{ name: 'Category 3' },
				{ name: 'Category 4' },
			]).run();

			await db.insert(coursesTable).values([
				{ name: 'Development', categoryId: 2 },
				{ name: 'IT & Software', categoryId: 3 },
				{ name: 'Marketing', categoryId: 4 },
				{ name: 'Design', categoryId: 1 },
			]).run();

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
				.orderBy(coursesTable.name)
				.all();

			expect(res).toEqual([
				{ courseName: 'Design', categoryId: 1 },
				{ courseName: 'Development', categoryId: 2 },
				{ courseName: 'IT & Software', categoryId: 3 },
				{ courseName: 'Marketing', categoryId: 4 },
			]);
		});

		test('with ... select', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(orders).values([
				{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
				{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
				{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
				{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
				{ region: 'US', product: 'A', amount: 30, quantity: 3 },
				{ region: 'US', product: 'A', amount: 40, quantity: 4 },
				{ region: 'US', product: 'B', amount: 40, quantity: 4 },
				{ region: 'US', product: 'B', amount: 50, quantity: 5 },
			]).run();

			const regionalSales = await db
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

			const topRegions = await db
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
					productUnits: sql<number>`cast(sum(${orders.quantity}) as int)`,
					productSales: sql<number>`cast(sum(${orders.amount}) as int)`,
				})
				.from(orders)
				.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
				.groupBy(orders.region, orders.product)
				.orderBy(orders.region, orders.product)
				.all();

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

		test('with ... update', async (ctx) => {
			const { db } = ctx.sqlite;

			const products = sqliteTable('products', {
				id: integer('id').primaryKey(),
				price: numeric('price').notNull(),
				cheap: integer('cheap', { mode: 'boolean' }).notNull().default(false),
			});

			await db.run(sql`drop table if exists ${products}`);
			await db.run(sql`
				create table ${products} (
				    id integer primary key,
				    price numeric not null,
				    cheap integer not null default 0
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
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				username: text('username').notNull(),
				admin: integer('admin', { mode: 'boolean' }).notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);
			await db.run(sql`create table ${users} (username text not null, admin integer not null default 0)`);

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
			const { db } = ctx.sqlite;

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
			const { db } = ctx.sqlite;

			await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]).run();

			const sq = db
				.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
				.from(users2Table)
				.as('sq');

			const res = await db.select({ name: sq.name }).from(sq).all();

			expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
		});

		test('select a field without joining its table', (ctx) => {
			const { db } = ctx.sqlite;

			expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).toThrowError();
		});

		test('select all fields from subquery without alias', (ctx) => {
			const { db } = ctx.sqlite;

			const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

			expect(() => db.select().from(sq).prepare()).toThrowError();
		});

		test('select count()', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]).run();

			const res = await db.select({ count: sql`count(*)` }).from(usersTable).all();

			expect(res).toEqual([{ count: 2 }]);
		});

		test('having', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]).run();

			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 1 },
				{ name: 'Jack', cityId: 2 },
			]).run();

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
				.orderBy(({ name }) => name)
				.all();

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
			const { db } = ctx.sqlite;

			const newYorkers1 = sqliteView('new_yorkers')
				.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

			const newYorkers2 = sqliteView('new_yorkers', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

			const newYorkers3 = sqliteView('new_yorkers', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			}).existing();

			await db.run(sql`create view if not exists new_yorkers as ${getViewConfig(newYorkers1).query}`);

			await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]).run();

			await db.insert(users2Table).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 1 },
				{ name: 'Jack', cityId: 2 },
			]).run();

			{
				const result = await db.select().from(newYorkers1).all();
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers2).all();
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers3).all();
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select({ name: newYorkers1.name }).from(newYorkers1).all();
				expect(result).toEqual([
					{ name: 'John' },
					{ name: 'Jane' },
				]);
			}

			await db.run(sql`drop view ${newYorkers1}`);
		});

		test('insert null timestamp', async (ctx) => {
			const { db } = ctx.sqlite;

			const test = sqliteTable('test', {
				t: integer('t', { mode: 'timestamp' }),
			});

			await db.run(sql`create table ${test} (t timestamp)`);

			await db.insert(test).values({ t: null }).run();
			const res = await db.select().from(test).all();
			expect(res).toEqual([{ t: null }]);

			await db.run(sql`drop table ${test}`);
		});

		test('select from raw sql', async (ctx) => {
			const { db } = ctx.sqlite;

			const result = await db.select({
				id: sql<number>`id`,
				name: sql<string>`name`,
			}).from(sql`(select 1 as id, 'John' as name) as users`).all();

			Expect<Equal<{ id: number; name: string }[], typeof result>>;

			expect(result).toEqual([
				{ id: 1, name: 'John' },
			]);
		});

		test('select from raw sql with joins', async (ctx) => {
			const { db } = ctx.sqlite;

			const result = await db
				.select({
					id: sql<number>`users.id`,
					name: sql<string>`users.name`.as('userName'),
					userCity: sql<string>`users.city`,
					cityName: sql<string>`cities.name`.as('cityName'),
				})
				.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
				.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`)
				.all();

			Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

			expect(result).toEqual([
				{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
			]);
		});

		test('join on aliased sql from select', async (ctx) => {
			const { db } = ctx.sqlite;

			const result = await db
				.select({
					userId: sql<number>`users.id`.as('userId'),
					name: sql<string>`users.name`.as('userName'),
					userCity: sql<string>`users.city`,
					cityId: sql<number>`cities.id`.as('cityId'),
					cityName: sql<string>`cities.name`.as('cityName'),
				})
				.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
				.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId))
				.all();

			Expect<
				Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
			>;

			expect(result).toEqual([
				{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
			]);
		});

		test('join on aliased sql from with clause', async (ctx) => {
			const { db } = ctx.sqlite;

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
				.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId))
				.all();

			Expect<
				Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
			>;

			expect(result).toEqual([
				{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
			]);
		});

		test('prefixed table', async (ctx) => {
			const { db } = ctx.sqlite;

			const sqliteTable = sqliteTableCreator((name) => `myprefix_${name}`);

			const users = sqliteTable('test_prefixed_table_with_unique_name', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
			);

			await db.insert(users).values({ id: 1, name: 'John' }).run();

			const result = await db.select().from(users).all();

			expect(result).toEqual([{ id: 1, name: 'John' }]);

			await db.run(sql`drop table ${users}`);
		});

		test('orderBy with aliased column', (ctx) => {
			const { db } = ctx.sqlite;

			const query = db.select({
				test: sql`something`.as('test'),
			}).from(users2Table).orderBy((fields) => fields.test).toSQL();

			expect(query.sql).toBe('select something as "test" from "users2" order by "test"');
		});

		test('transaction', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users_transactions', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});
			const products = sqliteTable('products_transactions', {
				id: integer('id').primaryKey(),
				price: integer('price').notNull(),
				stock: integer('stock').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);
			await db.run(sql`drop table if exists ${products}`);

			await db.run(sql`create table users_transactions (id integer not null primary key, balance integer not null)`);
			await db.run(
				sql`create table products_transactions (id integer not null primary key, price integer not null, stock integer not null)`,
			);

			const user = await db.insert(users).values({ balance: 100 }).returning().get();
			const product = await db.insert(products).values({ price: 10, stock: 10 }).returning().get();

			await db.transaction(async (tx) => {
				await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id)).run();
				await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id)).run();
			});

			const result = await db.select().from(users).all();

			expect(result).toEqual([{ id: 1, balance: 90 }]);

			await db.run(sql`drop table ${users}`);
			await db.run(sql`drop table ${products}`);
		});

		test('transaction rollback', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users_transactions_rollback', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table users_transactions_rollback (id integer not null primary key, balance integer not null)`,
			);
			await expect(async () => {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ balance: 100 }).run();
					tx.rollback();
				});
			}).rejects.toThrowError(TransactionRollbackError);

			const result = await db.select().from(users).all();

			expect(result).toEqual([]);

			await db.run(sql`drop table ${users}`);
		});

		test('nested transaction', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users_nested_transactions', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table users_nested_transactions (id integer not null primary key, balance integer not null)`,
			);

			await db.transaction(async (tx) => {
				await tx.insert(users).values({ balance: 100 }).run();

				await tx.transaction(async (tx) => {
					await tx.update(users).set({ balance: 200 }).run();
				});
			});

			const result = await db.select().from(users).all();

			expect(result).toEqual([{ id: 1, balance: 200 }]);

			await db.run(sql`drop table ${users}`);
		});

		test('nested transaction rollback', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users_nested_transactions_rollback', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table users_nested_transactions_rollback (id integer not null primary key, balance integer not null)`,
			);

			await db.transaction(async (tx) => {
				await tx.insert(users).values({ balance: 100 }).run();

				await expect(async () => {
					await tx.transaction(async (tx) => {
						await tx.update(users).set({ balance: 200 }).run();
						tx.rollback();
					});
				}).rejects.toThrowError(TransactionRollbackError);
			});

			const result = await db.select().from(users).all();

			expect(result).toEqual([{ id: 1, balance: 100 }]);

			await db.run(sql`drop table ${users}`);
		});

		test('join subquery with join', async (ctx) => {
			const { db } = ctx.sqlite;

			const internalStaff = sqliteTable('internal_staff', {
				userId: integer('user_id').notNull(),
			});

			const customUser = sqliteTable('custom_user', {
				id: integer('id').notNull(),
			});

			const ticket = sqliteTable('ticket', {
				staffId: integer('staff_id').notNull(),
			});

			await db.run(sql`drop table if exists ${internalStaff}`);
			await db.run(sql`drop table if exists ${customUser}`);
			await db.run(sql`drop table if exists ${ticket}`);

			await db.run(sql`create table internal_staff (user_id integer not null)`);
			await db.run(sql`create table custom_user (id integer not null)`);
			await db.run(sql`create table ticket (staff_id integer not null)`);

			await db.insert(internalStaff).values({ userId: 1 }).run();
			await db.insert(customUser).values({ id: 1 }).run();
			await db.insert(ticket).values({ staffId: 1 }).run();

			const subq = await db
				.select()
				.from(internalStaff)
				.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
				.as('internal_staff');

			const mainQuery = await db
				.select()
				.from(ticket)
				.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId))
				.all();

			expect(mainQuery).toEqual([{
				ticket: { staffId: 1 },
				internal_staff: {
					internal_staff: { userId: 1 },
					custom_user: { id: 1 },
				},
			}]);

			await db.run(sql`drop table ${internalStaff}`);
			await db.run(sql`drop table ${customUser}`);
			await db.run(sql`drop table ${ticket}`);
		});

		test('join view as subquery', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users_join_view', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			const newYorkers = sqliteView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			await db.run(sql`drop table if exists ${users}`);
			await db.run(sql`drop view if exists ${newYorkers}`);

			await db.run(
				sql`create table ${users} (id integer not null primary key, name text not null, city_id integer not null)`,
			);
			await db.run(sql`create view if not exists ${newYorkers} as ${getViewConfig(newYorkers).query}`);

			db.insert(users).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 2 },
				{ name: 'Jack', cityId: 1 },
				{ name: 'Jill', cityId: 2 },
			]).run();

			const sq = db.select().from(newYorkers).as('new_yorkers_sq');

			const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).all();

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

			await db.run(sql`drop view ${newYorkers}`);
			await db.run(sql`drop table ${users}`);
		});

		test('insert with onConflict do nothing', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			await db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoNothing()
				.run();

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert with onConflict do nothing using composite pk', async (ctx) => {
			const { db } = ctx.sqlite;

			await db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john@example.com' })
				.run();

			await db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john1@example.com' })
				.onConflictDoNothing()
				.run();

			const res = await db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john@example.com' }]);
		});

		test('insert with onConflict do nothing using target', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			await db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoNothing({ target: usersTable.id })
				.run();

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert with onConflict do nothing using composite pk as target', async (ctx) => {
			const { db } = ctx.sqlite;

			await db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john@example.com' })
				.run();

			await db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john1@example.com' })
				.onConflictDoNothing({ target: [pkExampleTable.id, pkExampleTable.name] })
				.run();

			const res = await db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john@example.com' }]);
		});

		test('insert with onConflict do update', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			await db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
				.run();

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John1' }]);
		});

		test('insert with onConflict do update where', async (ctx) => {
			const { db } = ctx.sqlite;

			await db
				.insert(usersTable)
				.values([{ id: 1, name: 'John', verified: false }])
				.run();

			await db
				.insert(usersTable)
				.values({ id: 1, name: 'John1', verified: true })
				.onConflictDoUpdate({
					target: usersTable.id,
					set: { name: 'John1', verified: true },
					where: eq(usersTable.verified, false),
				})
				.run();

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.where(eq(usersTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John1', verified: true }]);
		});

		test('insert with onConflict do update using composite pk', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			await db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john@example.com' })
				.onConflictDoUpdate({ target: [pkExampleTable.id, pkExampleTable.name], set: { email: 'john1@example.com' } })
				.run();

			const res = await db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john1@example.com' }]);
		});

		test('insert with onConflict chained (.update -> .nothing)', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(conflictChainExampleTable).values([{ id: 1, name: 'John', email: 'john@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]).run();

			await db
				.insert(conflictChainExampleTable)
				.values([{ id: 1, name: 'John', email: 'john@example.com' }, {
					id: 2,
					name: 'Anthony',
					email: 'idthief@example.com',
				}])
				.onConflictDoUpdate({
					target: [conflictChainExampleTable.id, conflictChainExampleTable.name],
					set: { email: 'john1@example.com' },
				})
				.onConflictDoNothing({ target: conflictChainExampleTable.id })
				.run();

			const res = await db
				.select({
					id: conflictChainExampleTable.id,
					name: conflictChainExampleTable.name,
					email: conflictChainExampleTable.email,
				})
				.from(conflictChainExampleTable)
				.orderBy(conflictChainExampleTable.id)
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john1@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]);
		});

		test('insert with onConflict chained (.nothing -> .update)', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(conflictChainExampleTable).values([{ id: 1, name: 'John', email: 'john@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]).run();

			await db
				.insert(conflictChainExampleTable)
				.values([{ id: 1, name: 'John', email: 'john@example.com' }, {
					id: 2,
					name: 'Anthony',
					email: 'idthief@example.com',
				}])
				.onConflictDoUpdate({
					target: [conflictChainExampleTable.id, conflictChainExampleTable.name],
					set: { email: 'john1@example.com' },
				})
				.onConflictDoNothing({ target: conflictChainExampleTable.id })
				.run();

			const res = await db
				.select({
					id: conflictChainExampleTable.id,
					name: conflictChainExampleTable.name,
					email: conflictChainExampleTable.email,
				})
				.from(conflictChainExampleTable)
				.orderBy(conflictChainExampleTable.id)
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john1@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]);
		});

		test('insert with onConflict chained (.update -> .update)', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(conflictChainExampleTable).values([{ id: 1, name: 'John', email: 'john@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]).run();

			await db
				.insert(conflictChainExampleTable)
				.values([{ id: 1, name: 'John', email: 'john@example.com' }, {
					id: 2,
					name: 'Anthony',
					email: 'idthief@example.com',
				}])
				.onConflictDoUpdate({
					target: [conflictChainExampleTable.id, conflictChainExampleTable.name],
					set: { email: 'john1@example.com' },
				})
				.onConflictDoUpdate({ target: conflictChainExampleTable.id, set: { email: 'john2@example.com' } })
				.run();

			const res = await db
				.select({
					id: conflictChainExampleTable.id,
					name: conflictChainExampleTable.name,
					email: conflictChainExampleTable.email,
				})
				.from(conflictChainExampleTable)
				.orderBy(conflictChainExampleTable.id)
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john1@example.com' }, {
				id: 2,
				name: 'John Second',
				email: 'john2@example.com',
			}]);
		});

		test('insert with onConflict chained (.nothing -> .nothing)', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(conflictChainExampleTable).values([{ id: 1, name: 'John', email: 'john@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]).run();

			await db
				.insert(conflictChainExampleTable)
				.values([{ id: 1, name: 'John', email: 'john@example.com' }, {
					id: 2,
					name: 'Anthony',
					email: 'idthief@example.com',
				}])
				.onConflictDoNothing({
					target: [conflictChainExampleTable.id, conflictChainExampleTable.name],
				})
				.onConflictDoNothing({ target: conflictChainExampleTable.id })
				.run();

			const res = await db
				.select({
					id: conflictChainExampleTable.id,
					name: conflictChainExampleTable.name,
					email: conflictChainExampleTable.email,
				})
				.from(conflictChainExampleTable)
				.orderBy(conflictChainExampleTable.id)
				.all();

			expect(res).toEqual([{ id: 1, name: 'John', email: 'john@example.com' }, {
				id: 2,
				name: 'John Second',
				email: '2john@example.com',
			}]);
		});

		test('insert undefined', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table ${users} (id integer primary key, name text)`,
			);

			await expect((async () => {
				await db.insert(users).values({ name: undefined }).run();
			})()).resolves.not.toThrowError();

			await db.run(sql`drop table ${users}`);
		});

		test('update undefined', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			await db.run(sql`drop table if exists ${users}`);

			await db.run(
				sql`create table ${users} (id integer primary key, name text)`,
			);

			await expect((async () => {
				await db.update(users).set({ name: undefined }).run();
			})()).rejects.toThrowError();
			await expect((async () => {
				await db.update(users).set({ id: 1, name: undefined }).run();
			})()).resolves.not.toThrowError();

			await db.run(sql`drop table ${users}`);
		});

		test('async api - CRUD', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			db.run(sql`drop table if exists ${users}`);

			db.run(
				sql`create table ${users} (id integer primary key, name text)`,
			);

			await db.insert(users).values({ id: 1, name: 'John' });

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'John' }]);

			await db.update(users).set({ name: 'John1' }).where(eq(users.id, 1));

			const res1 = await db.select().from(users);

			expect(res1).toEqual([{ id: 1, name: 'John1' }]);

			await db.delete(users).where(eq(users.id, 1));

			const res2 = await db.select().from(users);

			expect(res2).toEqual([]);

			await db.run(sql`drop table ${users}`);
		});

		test('async api - insert + select w/ prepare + async execute', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			db.run(sql`drop table if exists ${users}`);

			db.run(
				sql`create table ${users} (id integer primary key, name text)`,
			);

			const insertStmt = db.insert(users).values({ id: 1, name: 'John' }).prepare();
			await insertStmt.execute();

			const selectStmt = db.select().from(users).prepare();
			const res = await selectStmt.execute();

			expect(res).toEqual([{ id: 1, name: 'John' }]);

			const updateStmt = db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
			await updateStmt.execute();

			const res1 = await selectStmt.execute();

			expect(res1).toEqual([{ id: 1, name: 'John1' }]);

			const deleteStmt = db.delete(users).where(eq(users.id, 1)).prepare();
			await deleteStmt.execute();

			const res2 = await selectStmt.execute();

			expect(res2).toEqual([]);

			await db.run(sql`drop table ${users}`);
		});

		test('async api - insert + select w/ prepare + sync execute', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			db.run(sql`drop table if exists ${users}`);

			db.run(
				sql`create table ${users} (id integer primary key, name text)`,
			);

			const insertStmt = db.insert(users).values({ id: 1, name: 'John' }).prepare();
			await insertStmt.execute();

			const selectStmt = db.select().from(users).prepare();
			const res = await selectStmt.execute();

			expect(res).toEqual([{ id: 1, name: 'John' }]);

			const updateStmt = db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
			await updateStmt.execute();

			const res1 = await selectStmt.execute();

			expect(res1).toEqual([{ id: 1, name: 'John1' }]);

			const deleteStmt = db.delete(users).where(eq(users.id, 1)).prepare();
			await deleteStmt.execute();

			const res2 = await selectStmt.execute();

			expect(res2).toEqual([]);

			await db.run(sql`drop table ${users}`);
		});

		test('select + .get() for empty result', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			db.run(sql`drop table if exists ${users}`);

			db.run(
				sql`create table ${users} (id integer primary key, name text)`,
			);

			const res = await db.select().from(users).where(eq(users.id, 1)).get();

			expect(res).toBeUndefined();

			await db.run(sql`drop table ${users}`);
		});

		test('set operations (union) from query builder with subquery', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

			const sq = db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).union(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table),
				).orderBy(asc(sql`name`)).as('sq');

			const result = await db.select().from(sq).limit(5).offset(5);

			expect(result).toHaveLength(5);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 7, name: 'Mary' },
				{ id: 1, name: 'New York' },
				{ id: 4, name: 'Peter' },
				{ id: 8, name: 'Sally' },
			]);

			await expect(async () => {
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).union(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table),
					).orderBy(asc(sql`name`));
			}).rejects.toThrowError();
		});

		test('set operations (union) as function', async (ctx) => {
			const { db } = ctx.sqlite;

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
			).orderBy(asc(sql`name`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'New York' },
			]);

			await expect(async () => {
				union(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).orderBy(asc(sql`name`));
			}).rejects.toThrowError();
		});

		test('set operations (union all) from query builder', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).unionAll(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable),
				).orderBy(asc(citiesTable.id)).limit(5).offset(1);

			expect(result).toHaveLength(5);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect(async () => {
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).unionAll(
						db
							.select({ name: citiesTable.name, id: citiesTable.id })
							.from(citiesTable),
					).orderBy(asc(citiesTable.id)).limit(5).offset(1);
			}).rejects.toThrowError();
		});

		test('set operations (union all) as function', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

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
			);

			expect(result).toHaveLength(3);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
				{ id: 1, name: 'John' },
				{ id: 1, name: 'John' },
			]);

			await expect(async () => {
				unionAll(
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
			}).rejects.toThrowError();
		});

		test('set operations (intersect) from query builder', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).intersect(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				).orderBy(asc(sql`name`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect(async () => {
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).intersect(
						db
							.select({ id: citiesTable.id, name: citiesTable.name })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
					).orderBy(asc(sql`name`));
			}).rejects.toThrowError();
		});

		test('set operations (intersect) as function', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

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
			);

			expect(result).toHaveLength(0);

			expect(result).toEqual([]);

			await expect(async () => {
				intersect(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				);
			}).rejects.toThrowError();
		});

		test('set operations (except) from query builder', async (ctx) => {
			const { db } = ctx.sqlite;

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

			await expect(async () => {
				db
					.select()
					.from(citiesTable).except(
						db
							.select({ name: users2Table.name, id: users2Table.id })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
					);
			}).rejects.toThrowError();
		});

		test('set operations (except) as function', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

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
			).orderBy(asc(sql`id`));

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect(async () => {
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
				).orderBy(asc(sql`id`));
			}).rejects.toThrowError();
		});

		test('set operations (mixed) from query builder', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

			const result = await db
				.select()
				.from(citiesTable).except(
					({ unionAll }) =>
						unionAll(
							db
								.select()
								.from(citiesTable).where(gt(citiesTable.id, 1)),
							db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
						),
				);

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
			]);

			await expect(async () => {
				db
					.select()
					.from(citiesTable).except(
						({ unionAll }) =>
							unionAll(
								db
									.select()
									.from(citiesTable).where(gt(citiesTable.id, 1)),
								db.select({ name: citiesTable.name, id: citiesTable.id })
									.from(citiesTable).where(eq(citiesTable.id, 2)),
							),
					);
			}).rejects.toThrowError();
		});

		test('set operations (mixed all) as function with subquery', async (ctx) => {
			const { db } = ctx.sqlite;

			await setupSetOperationTest(db);

			const sq = union(
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
					.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			).orderBy(asc(sql`id`)).as('sq');

			const result = await db.select().from(sq).limit(4).offset(1);

			expect(result).toHaveLength(4);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 5, name: 'Ben' },
				{ id: 6, name: 'Jill' },
			]);

			await expect(async () => {
				union(
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
						.select({ name: users2Table.name, id: users2Table.id })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				).orderBy(asc(sql`id`));
			}).rejects.toThrowError();
		});

		test('define constraints as array', async (_ctx) => {
			const table = sqliteTable('name', {
				id: int(),
			}, (t) => [
				index('name').on(t.id),
				primaryKey({ columns: [t.id], name: 'custom' }),
			]);

			const { indexes, primaryKeys } = getTableConfig(table);

			expect(indexes.length).toBe(1);
			expect(primaryKeys.length).toBe(1);
		});

		test('define constraints as array inside third param', async (_ctx) => {
			const table = sqliteTable('name', {
				id: int(),
			}, (t) => [
				index('name').on(t.id),
				primaryKey({ columns: [t.id], name: 'custom' }),
			]);

			const { indexes, primaryKeys } = getTableConfig(table);

			expect(indexes.length).toBe(1);
			expect(primaryKeys.length).toBe(1);
		});

		test('aggregate function: count', async (ctx) => {
			const { db } = ctx.sqlite;
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
			const { db } = ctx.sqlite;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: avg(table.a) }).from(table);
			const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
			const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

			expect(result1[0]?.value).toBe('24');
			expect(result2[0]?.value).toBeNull();
			expect(result3[0]?.value).toBe('42.5');
		});

		test('aggregate function: sum', async (ctx) => {
			const { db } = ctx.sqlite;
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
			const { db } = ctx.sqlite;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: max(table.b) }).from(table);
			const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toBe(90);
			expect(result2[0]?.value).toBeNull();
		});

		test('aggregate function: min', async (ctx) => {
			const { db } = ctx.sqlite;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: min(table.b) }).from(table);
			const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toBe(10);
			expect(result2[0]?.value).toBeNull();
		});

		test('test $onUpdateFn and $onUpdate works as $default', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.run(sql`drop table if exists ${usersOnUpdate}`);

			await db.run(
				sql`
					create table ${usersOnUpdate} (
					id integer primary key autoincrement,
					name text not null,
					update_counter integer default 1 not null,
					updated_at integer,
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
			const { db } = ctx.sqlite;

			await db.run(sql`drop table if exists ${usersOnUpdate}`);

			await db.run(
				sql`
					create table ${usersOnUpdate} (
					id integer primary key autoincrement,
					name text not null,
					update_counter integer default 1,
					updated_at integer,
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
			const msDelay = 250;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test('test $onUpdateFn and $onUpdate works with sql value', async (ctx) => {
			const { db } = ctx.sqlite;

			const users = sqliteTable('users', {
				id: integer('id').primaryKey({ autoIncrement: true }),
				name: text('name').notNull(),
				updatedAt: integer('updated_at')
					.notNull()
					.$onUpdate(() =>
						sql`(strftime('%s', 'now') * 1000) + (strftime('%f', 'now') - strftime('%S', 'now')) * 1000`
					),
			});

			await db.run(sql`drop table if exists ${users}`);
			await db.run(
				sql`
					create table ${users} (
						\`id\` integer primary key autoincrement,
						\`name\` text not null,
						\`updated_at\` integer not null
					)
				`,
			);

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

			expect(insertResp[0]?.updatedAt ?? 0).lessThan(now);
			expect(updateResp[0]?.updatedAt ?? 0).greaterThan(now);
		});

		test('$count separate', async (ctx) => {
			const { db } = ctx.sqlite;

			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${countTestTable}`);
			await db.run(sql`create table ${countTestTable} (id int, name text)`);

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.$count(countTestTable);

			await db.run(sql`drop table ${countTestTable}`);

			expect(count).toStrictEqual(4);
		});

		test('$count embedded', async (ctx) => {
			const { db } = ctx.sqlite;

			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${countTestTable}`);
			await db.run(sql`create table ${countTestTable} (id int, name text)`);

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.select({
				count: db.$count(countTestTable),
			}).from(countTestTable);

			await db.run(sql`drop table ${countTestTable}`);

			expect(count).toStrictEqual([
				{ count: 4 },
				{ count: 4 },
				{ count: 4 },
				{ count: 4 },
			]);
		});

		test('$count separate reuse', async (ctx) => {
			const { db } = ctx.sqlite;

			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${countTestTable}`);
			await db.run(sql`create table ${countTestTable} (id int, name text)`);

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

			await db.run(sql`drop table ${countTestTable}`);

			expect(count1).toStrictEqual(4);
			expect(count2).toStrictEqual(5);
			expect(count3).toStrictEqual(6);
		});

		test('$count embedded reuse', async (ctx) => {
			const { db } = ctx.sqlite;

			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${countTestTable}`);
			await db.run(sql`create table ${countTestTable} (id int, name text)`);

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

			await db.run(sql`drop table ${countTestTable}`);

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
			const { db } = ctx.sqlite;

			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${countTestTable}`);
			await db.run(sql`create table ${countTestTable} (id int, name text)`);

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.$count(countTestTable, gt(countTestTable.id, 1));

			await db.run(sql`drop table ${countTestTable}`);

			expect(count).toStrictEqual(3);
		});

		test('$count embedded with filters', async (ctx) => {
			const { db } = ctx.sqlite;

			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.run(sql`drop table if exists ${countTestTable}`);
			await db.run(sql`create table ${countTestTable} (id int, name text)`);

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.select({
				count: db.$count(countTestTable, gt(countTestTable.id, 1)),
			}).from(countTestTable);

			await db.run(sql`drop table ${countTestTable}`);

			expect(count).toStrictEqual([
				{ count: 3 },
				{ count: 3 },
				{ count: 3 },
				{ count: 3 },
			]);
		});

		test('update with limit and order by', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([
				{ name: 'Barry', verified: false },
				{ name: 'Alan', verified: false },
				{ name: 'Carl', verified: false },
			]);

			await db.update(usersTable).set({ verified: true }).limit(2).orderBy(asc(usersTable.name));

			const result = await db.select({ name: usersTable.name, verified: usersTable.verified }).from(usersTable).orderBy(
				asc(usersTable.name),
			);

			expect(result).toStrictEqual([
				{ name: 'Alan', verified: true },
				{ name: 'Barry', verified: true },
				{ name: 'Carl', verified: false },
			]);
		});

		test('delete with limit and order by', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.insert(usersTable).values([
				{ name: 'Barry', verified: false },
				{ name: 'Alan', verified: false },
				{ name: 'Carl', verified: false },
			]);

			await db.delete(usersTable).where(eq(usersTable.verified, false)).limit(1).orderBy(asc(usersTable.name));

			const result = await db.select({ name: usersTable.name, verified: usersTable.verified }).from(usersTable).orderBy(
				asc(usersTable.name),
			);
			expect(result).toStrictEqual([
				{ name: 'Barry', verified: false },
				{ name: 'Carl', verified: false },
			]);
		});

		test('cross join', async (ctx) => {
			const { db } = ctx.sqlite;

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

		test('all types', async (ctx) => {
			const { db } = ctx.sqlite;

			await db.run(sql`
				CREATE TABLE \`all_types\`(
					\`int\` integer,
					\`bool\` integer,
					\`time\` integer,
					\`time_ms\` integer,
					\`bigint\` blob,
					\`buffer\` blob,
					\`json\` blob,
					\`numeric\` numeric,
					\`numeric_num\` numeric,
					\`numeric_big\` numeric,
					\`real\` real,
					\`text\` text,
					\`json_text\` text
					);
			`);

			await db.insert(allTypesTable).values({
				int: 1,
				bool: true,
				bigint: 5044565289845416380n,
				buffer: Buffer.from([
					0x44,
					0x65,
					0x73,
					0x70,
					0x61,
					0x69,
					0x72,
					0x20,
					0x6F,
					0x20,
					0x64,
					0x65,
					0x73,
					0x70,
					0x61,
					0x69,
					0x72,
					0x2E,
					0x2E,
					0x2E,
				]),
				json: {
					str: 'strval',
					arr: ['str', 10],
				},
				jsonText: {
					str: 'strvalb',
					arr: ['strb', 11],
				},
				numeric: '475452353476',
				numericNum: 9007199254740991,
				numericBig: 5044565289845416380n,
				real: 1.048596,
				text: 'TEXT STRING',
				time: new Date(1741743161623),
				timeMs: new Date(1741743161623),
			});

			const rawRes = await db.select().from(allTypesTable);

			expect(typeof rawRes[0]?.numericBig).toStrictEqual('bigint');

			type ExpectedType = {
				int: number | null;
				bool: boolean | null;
				time: Date | null;
				timeMs: Date | null;
				bigint: bigint | null;
				buffer: Buffer | null;
				json: unknown;
				numeric: string | null;
				numericNum: number | null;
				numericBig: bigint | null;
				real: number | null;
				text: string | null;
				jsonText: unknown;
			}[];

			const expectedRes: ExpectedType = [
				{
					int: 1,
					bool: true,
					time: new Date('2025-03-12T01:32:41.000Z'),
					timeMs: new Date('2025-03-12T01:32:41.623Z'),
					bigint: 5044565289845416380n,
					buffer: Buffer.from([
						0x44,
						0x65,
						0x73,
						0x70,
						0x61,
						0x69,
						0x72,
						0x20,
						0x6F,
						0x20,
						0x64,
						0x65,
						0x73,
						0x70,
						0x61,
						0x69,
						0x72,
						0x2E,
						0x2E,
						0x2E,
					]),
					json: { str: 'strval', arr: ['str', 10] },
					numeric: '475452353476',
					numericNum: 9007199254740991,
					numericBig: 5044565289845416380n,
					real: 1.048596,
					text: 'TEXT STRING',
					jsonText: { str: 'strvalb', arr: ['strb', 11] },
				},
			];

			expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
			expect(rawRes).toStrictEqual(expectedRes);
		});
	});

	test('table configs: unique third param', () => {
		const cities1Table = sqliteTable('cities1', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
			state: text('state'),
		}, (t) => ({
			f: unique().on(t.name, t.state),
			f1: unique('custom').on(t.name, t.state),
		}));

		const tableConfig = getTableConfig(cities1Table);

		expect(tableConfig.uniqueConstraints).toHaveLength(2);

		expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
		expect(
			tableConfig.uniqueConstraints[0]?.name,
		).toEqual(
			uniqueKeyName(cities1Table, tableConfig.uniqueConstraints[0]?.columns?.map((column) => column.name) ?? []),
		);

		expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
		expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom');
	});

	test('table configs: unique in column', () => {
		const cities1Table = sqliteTable('cities1', {
			id: int('id').primaryKey(),
			name: text('name').notNull().unique(),
			state: text('state').unique('custom'),
			field: text('field').unique(),
		});

		const tableConfig = getTableConfig(cities1Table);

		const columnName = tableConfig.columns.find((it) => it.name === 'name');
		expect(columnName?.isUnique).toBeTruthy();
		expect(columnName?.uniqueName).toBe(uniqueKeyName(cities1Table, [columnName!.name]));

		const columnState = tableConfig.columns.find((it) => it.name === 'state');
		expect(columnState?.isUnique).toBeTruthy();
		expect(columnState?.uniqueName).toBe('custom');

		const columnField = tableConfig.columns.find((it) => it.name === 'field');
		expect(columnField?.isUnique).toBeTruthy();
		expect(columnField?.uniqueName).toBe(uniqueKeyName(cities1Table, [columnField!.name]));
	});

	test('limit 0', async (ctx) => {
		const { db } = ctx.sqlite;

		await db.insert(usersTable).values({ name: 'John' });
		const users = await db
			.select()
			.from(usersTable)
			.limit(0);

		expect(users).toEqual([]);
	});

	test('limit -1', async (ctx) => {
		const { db } = ctx.sqlite;

		await db.insert(usersTable).values({ name: 'John' });
		const users = await db
			.select()
			.from(usersTable)
			.limit(-1);

		expect(users.length).toBeGreaterThan(0);
	});

	test('update ... from', async (ctx) => {
		const { db } = ctx.sqlite;

		await db.run(sql`drop table if exists \`cities\``);
		await db.run(sql`drop table if exists \`users2\``);
		await db.run(sql`
			create table \`cities\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null
			)
		`);
		await db.run(sql`
			create table \`users2\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null,
				\`city_id\` integer references \`cities\`(\`id\`)
			)
		`);

		await db.insert(citiesTable).values([
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
				cityId: citiesTable.id,
			})
			.from(citiesTable)
			.where(and(eq(citiesTable.name, 'Seattle'), eq(users2Table.name, 'John')))
			.returning();

		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			cityId: 2,
		}]);
	});

	test('update ... from with alias', async (ctx) => {
		const { db } = ctx.sqlite;

		await db.run(sql`drop table if exists \`users2\``);
		await db.run(sql`drop table if exists \`cities\``);
		await db.run(sql`
			create table \`cities\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null
			)
		`);
		await db.run(sql`
			create table \`users2\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null,
				\`city_id\` integer references \`cities\`(\`id\`)
			)
		`);

		await db.insert(citiesTable).values([
			{ name: 'New York City' },
			{ name: 'Seattle' },
		]);
		await db.insert(users2Table).values([
			{ name: 'John', cityId: 1 },
			{ name: 'Jane', cityId: 2 },
		]);

		const cities = alias(citiesTable, 'c');
		const result = await db
			.update(users2Table)
			.set({
				cityId: cities.id,
			})
			.from(cities)
			.where(and(eq(cities.name, 'Seattle'), eq(users2Table.name, 'John')))
			.returning();

		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			cityId: 2,
		}]);

		await db.run(sql`drop table if exists \`users2\``);
	});

	test('update ... from with join', async (ctx) => {
		const { db } = ctx.sqlite;

		const states = sqliteTable('states', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		});
		const cities = sqliteTable('cities', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			stateId: integer('state_id').references(() => states.id),
		});
		const users = sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			cityId: integer('city_id').notNull().references(() => cities.id),
		});

		await db.run(sql`drop table if exists \`states\``);
		await db.run(sql`drop table if exists \`cities\``);
		await db.run(sql`drop table if exists \`users\``);
		await db.run(sql`
			create table \`states\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null
			)
		`);
		await db.run(sql`
			create table \`cities\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null,
				\`state_id\` integer references \`states\`(\`id\`)
			)
		`);
		await db.run(sql`
			create table \`users\` (
				\`id\` integer primary key autoincrement,
				\`name\` text not null,
				\`city_id\` integer not null references \`cities\`(\`id\`)
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
		}]);
		expect(result2).toStrictEqual([{
			id: 3,
			name: 'Jack',
			cityId: 3,
		}]);
	});

	test('insert into ... select', async (ctx) => {
		const { db } = ctx.sqlite;

		const notifications = sqliteTable('notifications_insert_into', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			sentAt: integer('sent_at', { mode: 'timestamp' }).notNull().default(sql`current_timestamp`),
			message: text('message').notNull(),
		});
		const users = sqliteTable('users_insert_into', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		});
		const userNotications = sqliteTable('user_notifications_insert_into', {
			userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
			notificationId: integer('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
		}, (t) => ({
			pk: primaryKey({ columns: [t.userId, t.notificationId] }),
		}));

		await db.run(sql`drop table if exists notifications_insert_into`);
		await db.run(sql`drop table if exists users_insert_into`);
		await db.run(sql`drop table if exists user_notifications_insert_into`);
		await db.run(sql`
			create table notifications_insert_into (
				id integer primary key autoincrement,
				sent_at integer not null default (current_timestamp),
				message text not null
			)
		`);
		await db.run(sql`
			create table users_insert_into (
				id integer primary key autoincrement,
				name text not null
			)
		`);
		await db.run(sql`
			create table user_notifications_insert_into (
				user_id integer references users_insert_into(id) on delete cascade,
				notification_id integer references notifications_insert_into(id) on delete cascade,
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
		const { db } = ctx.sqlite;

		const users1 = sqliteTable('users1', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		});
		const users2 = sqliteTable('users2', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		});

		await db.run(sql`drop table if exists users1`);
		await db.run(sql`drop table if exists users2`);
		await db.run(sql`
			create table users1 (
				id integer primary key autoincrement,
				name text not null
			)
		`);
		await db.run(sql`
			create table users2 (
				id integer primary key autoincrement,
				name text not null
			)
		`);

		await expect(async () => {
			db
				.insert(users1)
				.select(
					db
						.select({
							name: users2.name,
							id: users2.id,
						})
						.from(users2),
				);
		}).rejects.toThrowError();
	});

	test('Object keys as column names', async (ctx) => {
		const { db } = ctx.sqlite;

		// Tests the following:
		// Column with optional config without providing a value
		// Column with optional config providing a value
		// Column without config
		const users = sqliteTable('users', {
			id: integer().primaryKey({ autoIncrement: true }),
			createdAt: integer({ mode: 'timestamp' }),
			name: text(),
		});

		await db.run(sql`drop table if exists users`);
		await db.run(
			sql`
				create table users (
					\`id\` integer primary key autoincrement,
					\`createdAt\` integer,
					\`name\` text
				)
			`,
		);

		await db.insert(users).values([
			{ createdAt: new Date(Date.now() - 2592000000), name: 'John' },
			{ createdAt: new Date(Date.now() - 86400000), name: 'Jane' },
		]);
		const result = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(gt(users.createdAt, new Date(Date.now() - 2592000000)));

		expect(result).toEqual([
			{ id: 2, name: 'Jane' },
		]);

		await db.run(sql`drop table users`);
	});

	test('sql operator as cte', async (ctx) => {
		const { db } = ctx.sqlite;

		const users = sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		});

		await db.run(sql`drop table if exists ${users}`);
		await db.run(sql`create table ${users} (id integer not null primary key autoincrement, name text not null)`);
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
}
