/// <reference types="@cloudflare/workers-types" />

import { expect } from 'chai';
import { DurableObject } from 'cloudflare:workers';
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
} from 'drizzle-orm';
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import {
	alias,
	type BaseSQLiteDatabase,
	blob,
	except,
	getViewConfig,
	int,
	integer,
	intersect,
	numeric,
	primaryKey,
	sqliteTable,
	sqliteTableCreator,
	sqliteView,
	text,
	union,
	unionAll,
} from 'drizzle-orm/sqlite-core';
import { type Equal, Expect } from '~/utils';
import migrations from './drizzle/migrations';

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

export const coursesTable = sqliteTable('courses', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: integer('category_id').references(() => courseCategoriesTable.id),
});

export const courseCategoriesTable = sqliteTable('course_categories', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

export const orders = sqliteTable('orders', {
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

export const pkExampleTable = sqliteTable('pk_example', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => ({
	compositePk: primaryKey({ columns: [table.id, table.name] }),
}));

export const bigIntExample = sqliteTable('big_int_example', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	bigInt: blob('big_int', { mode: 'bigint' }).notNull(),
});

// To test aggregate functions
export const aggregateTable = sqliteTable('aggregate_table', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('null_only'),
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

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class MyDurableObject extends DurableObject {
	storage: DurableObjectStorage;
	db: DrizzleSqliteDODatabase;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.storage = ctx.storage;
		this.db = drizzle(this.storage, { logger: false });
	}

	async migrate1(): Promise<void> {
		try {
			this.db.run(sql`drop table if exists another_users`);
			this.db.run(sql`drop table if exists users12`);
			this.db.run(sql`drop table if exists __drizzle_migrations`);

			migrate(this.db, migrations);

			this.db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
			const result = this.db.select().from(usersMigratorTable).all();

			this.db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
			const result2 = this.db.select().from(anotherUsersMigratorTable).all();

			expect(result).deep.equal([{ id: 1, name: 'John', email: 'email' }]);
			expect(result2).deep.equal([{ id: 1, name: 'John', email: 'email' }]);

			this.db.run(sql`drop table another_users`);
			this.db.run(sql`drop table users12`);
			this.db.run(sql`drop table __drizzle_migrations`);
		} catch {
			throw new Error('migrate1 has broken');
		}
	}

	async beforeEach(): Promise<void> {
		this.db.run(sql`drop table if exists ${usersTable}`);
		this.db.run(sql`drop table if exists ${users2Table}`);
		this.db.run(sql`drop table if exists ${citiesTable}`);
		this.db.run(sql`drop table if exists ${coursesTable}`);
		this.db.run(sql`drop table if exists ${courseCategoriesTable}`);
		this.db.run(sql`drop table if exists ${orders}`);
		this.db.run(sql`drop table if exists ${bigIntExample}`);
		this.db.run(sql`drop table if exists ${pkExampleTable}`);
		this.db.run(sql`drop table if exists user_notifications_insert_into`);
		this.db.run(sql`drop table if exists users_insert_into`);
		this.db.run(sql`drop table if exists notifications_insert_into`);

		this.db.run(sql`
			create table ${usersTable} (
				id integer primary key,
				name text not null,
				verified integer not null default 0,
				json blob,
				created_at integer not null default (strftime('%s', 'now'))
			)
		`);

		this.db.run(sql`
			create table ${citiesTable} (
				id integer primary key,
				name text not null
			)
		`);
		this.db.run(sql`
			create table ${courseCategoriesTable} (
				id integer primary key,
				name text not null
			)
		`);

		this.db.run(sql`
			create table ${users2Table} (
				id integer primary key,
				name text not null,
				city_id integer references ${citiesTable}(${sql.identifier(citiesTable.id.name)})
			)
		`);
		this.db.run(sql`
			create table ${coursesTable} (
				id integer primary key,
				name text not null,
				category_id integer references ${courseCategoriesTable}(${sql.identifier(courseCategoriesTable.id.name)})
			)
		`);
		this.db.run(sql`
			create table ${orders} (
				id integer primary key,
				region text not null,
				product text not null,
				amount integer not null,
				quantity integer not null
			)
		`);
		this.db.run(sql`
			create table ${pkExampleTable} (
				id integer not null,
				name text not null,
				email text not null,
				primary key (id, name)
			)
		`);
		this.db.run(sql`
			create table ${bigIntExample} (
			  id integer primary key,
			  name text not null,
			  big_int blob not null
			)
		`);
	}

	async insertBigIntValues(): Promise<void> {
		try {
			await this.beforeEach();

			this.db
				.insert(bigIntExample)
				.values({ name: 'one', bigInt: BigInt('0') })
				.run();
			this.db
				.insert(bigIntExample)
				.values({ name: 'two', bigInt: BigInt('127') })
				.run();
			this.db
				.insert(bigIntExample)
				.values({ name: 'three', bigInt: BigInt('32767') })
				.run();
			this.db
				.insert(bigIntExample)
				.values({ name: 'four', bigInt: BigInt('1234567890') })
				.run();
			this.db
				.insert(bigIntExample)
				.values({ name: 'five', bigInt: BigInt('12345678900987654321') })
				.run();

			const result = this.db.select().from(bigIntExample).all();
			expect(result).deep.equal([
				{ id: 1, name: 'one', bigInt: BigInt('0') },
				{ id: 2, name: 'two', bigInt: BigInt('127') },
				{ id: 3, name: 'three', bigInt: BigInt('32767') },
				{ id: 4, name: 'four', bigInt: BigInt('1234567890') },
				{ id: 5, name: 'five', bigInt: BigInt('12345678900987654321') },
			]);
		} catch (error: any) {
			console.log(error);
			throw new Error('insertBigIntValues has broken');
		}
	}
	async selectAllFields(): Promise<void> {
		try {
			await this.beforeEach();
			const now = Date.now();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const result = this.db.select().from(usersTable).all();
			expect(result[0]!.createdAt).instanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).lessThan(5000);
			expect(result).deep.equal([{
				id: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			}]);
		} catch {
			throw new Error('selectAllFields has broken');
		}
	}

	async selectPartial(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const result = this.db.select({ name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([{ name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectPartial error`);
		}
	}

	async selectSql(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		} catch {
			throw new Error('selectSql has broken');
		}
	}

	async selectTypedSql(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db
				.select({
					name: sql<string>`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		} catch {
			throw new Error('selectTypedSql has broken');
		}
	}

	async selectWithEmptyArrayInInArray(): Promise<void> {
		try {
			await this.beforeEach();

			await this.db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await this.db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(inArray(usersTable.id, []));

			expect(result).deep.equal([]);
		} catch (error: any) {
			console.error(error);
			throw new Error('selectWithEmptyArrayInInArray has broken');
		}
	}

	async selectWithEmptyArrayInNotInArray(): Promise<void> {
		try {
			await this.beforeEach();

			await this.db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await this.db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(notInArray(usersTable.id, []));

			expect(result).deep.equal([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('selectWithEmptyArrayInNotInArray has broken');
		}
	}

	async selectDistinct(): Promise<void> {
		try {
			await this.beforeEach();

			const usersDistinctTable = sqliteTable('users_distinct', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${usersDistinctTable}`);
			this.db.run(sql`create table ${usersDistinctTable} (id integer, name text)`);

			this.db
				.insert(usersDistinctTable)
				.values([
					{ id: 1, name: 'John' },
					{ id: 1, name: 'John' },
					{ id: 2, name: 'John' },
					{ id: 1, name: 'Jane' },
				])
				.run();
			const users = this.db.selectDistinct().from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
				usersDistinctTable.name,
			).all();

			this.db.run(sql`drop table ${usersDistinctTable}`);

			expect(users).deep.equal([
				{ id: 1, name: 'Jane' },
				{ id: 1, name: 'John' },
				{ id: 2, name: 'John' },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error('selectDistinct has broken');
		}
	}

	async returingSql(): Promise<void> {
		try {
			await this.beforeEach();

			const users = this.db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({
					name: sql`upper(${usersTable.name})`,
				})
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('returingSql has broken');
		}
	}

	async $defaultFunction(): Promise<void> {
		try {
			await this.beforeEach();

			await this.db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
			const selectedOrder = await this.db.select().from(orders);

			expect(selectedOrder).deep.equal([
				{
					id: 1,
					amount: 1,
					quantity: 1,
					region: 'Ukraine',
					product: 'random_string',
				},
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error('defaultFunction has broken');
		}
	}

	async deleteReturningSql(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db
				.delete(usersTable)
				.where(eq(usersTable.name, 'John'))
				.returning({
					name: sql`upper(${usersTable.name})`,
				})
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('deleteReturningSql has broken');
		}
	}

	async queryCheckInsertSingleEmptyRow(): Promise<void> {
		try {
			await this.beforeEach();

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = this.db.insert(users).values({}).toSQL();

			expect(query).deep.equal({
				sql: 'insert into "users" ("id", "name", "state") values (null, ?, null)',
				params: ['Dan'],
			});
		} catch (error: any) {
			console.error(error);
			throw new Error('queryCheckInsertSingleEmptyRow has broken');
		}
	}

	async queryCheckInsertMultipleEmptyRow(): Promise<void> {
		try {
			await this.beforeEach();

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = this.db.insert(users).values([{}, {}]).toSQL();

			expect(query).deep.equal({
				sql: 'insert into "users" ("id", "name", "state") values (null, ?, null), (null, ?, null)',
				params: ['Dan', 'Dan'],
			});
		} catch (error: any) {
			console.error(error);
			throw new Error('queryCheckInsertMultipleEmptyRow has broken');
		}
	}

	async insertAllDefaultsIn1Row(): Promise<void> {
		try {
			await this.beforeEach();

			const users = sqliteTable('empty_insert_single', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`);

			this.db.insert(users).values({}).run();

			const res = this.db.select().from(users).all();

			expect(res).deep.equal([{ id: 1, name: 'Dan', state: null }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('insertAllDefaultsIn1Row has broken');
		}
	}

	async insertAllDefaultsInMultipleRows(): Promise<void> {
		try {
			await this.beforeEach();

			const users = sqliteTable('empty_insert_multiple', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`);

			this.db.insert(users).values([{}, {}]).run();

			const res = this.db.select().from(users).all();

			expect(res).deep.equal([
				{ id: 1, name: 'Dan', state: null },
				{ id: 2, name: 'Dan', state: null },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error('insertAllDefaultsInMultipleRows has broken');
		}
	}

	async updateReturningSql(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db
				.update(usersTable)
				.set({ name: 'Jane' })
				.where(eq(usersTable.name, 'John'))
				.returning({
					name: sql`upper(${usersTable.name})`,
				})
				.all();

			expect(users).deep.equal([{ name: 'JANE' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('updateReturningSql has broken');
		}
	}

	async insertWithAutoIncrement(): Promise<void> {
		try {
			await this.beforeEach();

			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'George' }, { name: 'Austin' }])
				.run();
			const result = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Jane' },
				{ id: 3, name: 'George' },
				{ id: 4, name: 'Austin' },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error('insertWithAutoIncrement has broken');
		}
	}

	async insertDataWithDefaultValues(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const result = this.db.select().from(usersTable).all();

			expect(result).deep.equal([{
				id: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			}]);
		} catch (error: any) {
			console.error(error);
			throw new Error('insertDataWithDefaultValues has broken');
		}
	}

	async insertDataWithOverridenDefaultValues(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John', verified: true }).run();
			const result = this.db.select().from(usersTable).all();

			expect(result).deep.equal([{ id: 1, name: 'John', verified: true, json: null, createdAt: result[0]!.createdAt }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('insertDataWithOverridenDefaultValues has broken');
		}
	}

	async updateWithReturningFields(): Promise<void> {
		try {
			await this.beforeEach();
			const now = Date.now();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning()
				.all();

			expect(users[0]!.createdAt).instanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).lessThan(5000);
			expect(users).deep.equal([{ id: 1, name: 'Jane', verified: false, json: null, createdAt: users[0]!.createdAt }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('updateWithReturningFields has broken');
		}
	}

	async updateWithReturningPartial(): Promise<void> {
		try {
			await this.beforeEach();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db
				.update(usersTable)
				.set({ name: 'Jane' })
				.where(eq(usersTable.name, 'John'))
				.returning({
					id: usersTable.id,
					name: usersTable.name,
				})
				.all();

			expect(users).deep.equal([{ id: 1, name: 'Jane' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('updateWithReturningFields has broken');
		}
	}

	async updateWithReturningAllFields(): Promise<void> {
		try {
			await this.beforeEach();

			const now = Date.now();

			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

			expect(users[0]!.createdAt).instanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).lessThan(5000);
			expect(users).deep.equal([{ id: 1, name: 'John', verified: false, json: null, createdAt: users[0]!.createdAt }]);
		} catch (error: any) {
			console.error(error);
			throw new Error('updateWithReturningFields has broken');
		}
	}

	async deleteWithReturningPartial(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ name: 'John' }).run();
			const users = this.db
				.delete(usersTable)
				.where(eq(usersTable.name, 'John'))
				.returning({
					id: usersTable.id,
					name: usersTable.name,
				})
				.all();

			expect(users).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`deleteWithReturningPartial error`);
		}
	}

	async insertAndSelect(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ name: 'John' }).run();
			const result = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);

			this.db.insert(usersTable).values({ name: 'Jane' }).run();
			const result2 = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result2).deep.equal([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Jane' },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertAndSelect error`);
		}
	}

	async jsonInsert(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values({ name: 'John', json: ['foo', 'bar'] })
				.run();
			const result = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
					json: usersTable.json,
				})
				.from(usersTable)
				.all();

			expect(result).deep.equal([{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`jsonInsert error`);
		}
	}

	async insertMany(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Bruce', json: ['foo', 'bar'] }, { name: 'Jane' }, {
					name: 'Austin',
					verified: true,
				}])
				.run();
			const result = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
					json: usersTable.json,
					verified: usersTable.verified,
				})
				.from(usersTable)
				.all();

			expect(result).deep.equal([
				{ id: 1, name: 'John', json: null, verified: false },
				{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', json: null, verified: false },
				{ id: 4, name: 'Austin', json: null, verified: true },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertMany error`);
		}
	}

	async insertManyWithReturning(): Promise<void> {
		try {
			await this.beforeEach();
			const result = this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Bruce', json: ['foo', 'bar'] }, { name: 'Jane' }, {
					name: 'Austin',
					verified: true,
				}])
				.returning({
					id: usersTable.id,
					name: usersTable.name,
					json: usersTable.json,
					verified: usersTable.verified,
				})
				.all();

			expect(result).deep.equal([
				{ id: 1, name: 'John', json: null, verified: false },
				{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', json: null, verified: false },
				{ id: 4, name: 'Austin', json: null, verified: true },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertManyWithReturning error`);
		}
	}

	async partialJoinWithAlias(): Promise<void> {
		try {
			await this.beforeEach();
			const customerAlias = alias(usersTable, 'customer');

			await this.db.insert(usersTable).values([
				{ id: 10, name: 'Ivan' },
				{ id: 11, name: 'Hans' },
			]);

			const result = await this.db
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

			expect(result).deep.equal([
				{
					user: { id: 10, name: 'Ivan' },
					customer: { id: 11, name: 'Hans' },
				},
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`partialJoinWithAlias error`);
		}
	}

	async fullJoinWithAlias(): Promise<void> {
		try {
			await this.beforeEach();
			const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${users}`);
			this.db.run(sql`create table ${users} (id integer primary key, name text not null)`);

			const customers = alias(users, 'customer');

			this.db
				.insert(users)
				.values([
					{ id: 10, name: 'Ivan' },
					{ id: 11, name: 'Hans' },
				])
				.run();
			const result = this.db.select().from(users).leftJoin(customers, eq(customers.id, 11)).where(eq(users.id, 10))
				.all();

			expect(result).deep.equal([
				{
					users: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				},
			]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`fullJoinWithAlias error`);
		}
	}

	async selectFromAlias(): Promise<void> {
		try {
			await this.beforeEach();
			const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${users}`);
			this.db.run(sql`create table ${users} (id integer primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			this.db
				.insert(users)
				.values([
					{ id: 10, name: 'Ivan' },
					{ id: 11, name: 'Hans' },
				])
				.run();
			const result = this.db.select().from(user).leftJoin(customers, eq(customers.id, 11)).where(eq(user.id, 10)).all();

			expect(result).deep.equal([
				{
					user: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				},
			]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectFromAlias error`);
		}
	}

	async insertWithSpaces(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values({ name: sql`'Jo   h     n'` })
				.run();
			const result = await this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([{ id: 1, name: 'Jo   h     n' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithSpaces error`);
		}
	}

	async preparedStatement(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ name: 'John' }).run();
			const statement = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).prepare();
			const result = statement.all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`preparedStatement error`);
		}
	}

	async preparedStatementReuse(): Promise<void> {
		try {
			await this.beforeEach();
			const stmt = this.db
				.insert(usersTable)
				.values({ name: sql.placeholder('name') })
				.prepare();

			for (let i = 0; i < 10; i++) {
				stmt.run({ name: `John ${i}` });
			}

			const result = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.all();

			expect(result).deep.equal([
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
		} catch (error: any) {
			console.error(error);
			throw new Error(`preparedStatementReuse error`);
		}
	}

	async insertPlaceholdersOnColumnsWithEncoder(): Promise<void> {
		try {
			await this.beforeEach();
			const stmt = this.db
				.insert(usersTable)
				.values({
					name: 'John',
					verified: sql.placeholder('verified'),
				})
				.prepare();

			stmt.run({ verified: true });
			stmt.run({ verified: false });

			const result = this.db
				.select({
					id: usersTable.id,
					verified: usersTable.verified,
				})
				.from(usersTable)
				.all();

			expect(result).deep.equal([
				{ id: 1, verified: true },
				{ id: 2, verified: false },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertPlaceholdersOnColumnsWithEncoder error`);
		}
	}

	async preparedStatementWithPlaceholderInWhere(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ name: 'John' }).run();
			const stmt = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.prepare();
			const result = stmt.all({ id: 1 });

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`preparedStatementWithPlaceholderInWhere error`);
		}
	}

	async preparedStatementWithPlaceholderInLimit(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ name: 'John' }).run();
			const stmt = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.limit(sql.placeholder('limit'))
				.prepare();

			const result = await stmt.all({ id: 1, limit: 1 });

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
			expect(result).length(1);
		} catch (error: any) {
			console.error(error);
			throw new Error(`preparedStatementWithPlaceholderInLimit error`);
		}
	}

	async preparedStatementWithPlaceholderInOffset(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'John1' }])
				.run();
			const stmt = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.limit(sql.placeholder('limit'))
				.offset(sql.placeholder('offset'))
				.prepare();

			const result = stmt.all({ limit: 1, offset: 1 });

			expect(result).deep.equal([{ id: 2, name: 'John1' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`preparedStatementWithPlaceholderInOffset error`);
		}
	}

	async preparedStatementBuiltUsing$dynamic(): Promise<void> {
		try {
			await this.beforeEach();
			function withLimitOffset(qb: any) {
				return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
			}

			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'John1' }])
				.run();
			const stmt = this.db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.$dynamic();
			withLimitOffset(stmt).prepare('stmt_limit');

			const result = await stmt.all({ limit: 1, offset: 1 });

			expect(result).deep.equal([{ id: 2, name: 'John1' }]);
			expect(result).length(1);
		} catch (error: any) {
			console.error(error);
			throw new Error(`preparedStatementBuiltUsing error`);
		}
	}

	async selectWithGroupByAsField(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = this.db.select({ name: usersTable.name }).from(usersTable).groupBy(usersTable.name).all();

			expect(result).deep.equal([{ name: 'Jane' }, { name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectWithGroupByAsField error`);
		}
	}

	async selectWithExists(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const user = alias(usersTable, 'user');
			const result = this.db
				.select({ name: usersTable.name })
				.from(usersTable)
				.where(
					exists(
						this.db
							.select({ one: sql`1` })
							.from(user)
							.where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id))),
					),
				)
				.all();

			expect(result).deep.equal([{ name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectWithExists error`);
		}
	}

	async selectWithGroupByAsSql(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = this.db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(sql`${usersTable.name}`)
				.all();

			expect(result).deep.equal([{ name: 'Jane' }, { name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectWithGroupByAsSql error`);
		}
	}

	async selectWithGroupByAsSqlPlusColumn(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = this.db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(sql`${usersTable.name}`, usersTable.id)
				.all();

			expect(result).deep.equal([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectWithGroupByAsSqlPlusColumn error`);
		}
	}

	async selectWithGroupByAsColumnPlusSql(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = this.db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.all();

			expect(result).deep.equal([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectWithGroupByAsColumnPlusSql error`);
		}
	}

	async selectWithGroupByComplexQuery(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = this.db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.limit(1)
				.all();

			expect(result).deep.equal([{ name: 'Jane' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectWithGroupByComplexQuery error`);
		}
	}

	async buildQuery(): Promise<void> {
		try {
			await this.beforeEach();
			const query = this.db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).deep.equal({
				sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
				params: [],
			});
		} catch (error: any) {
			console.error(error);
			throw new Error(`buildQuery error`);
		}
	}

	async insertViaDbRunPlusSelectViaDbAll(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = this.db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertViaDbRunPlusSelectViaDbAll error`);
		}
	}

	async insertViaDbGet(): Promise<void> {
		try {
			await this.beforeEach();
			const inserted = this.db.get<{ id: number; name: string }>(
				sql`insert into ${usersTable} (${new Name(
					usersTable.name.name,
				)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
			);
			expect(inserted).deep.equal({ id: 1, name: 'John' });
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertViaDbGet error`);
		}
	}

	async insertViaDbRunPlusSelectViaDbGet(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = this.db.get<{ id: number; name: string }>(
				sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
			);
			expect(result).deep.equal({ id: 1, name: 'John' });
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertViaDbRunPlusSelectViaDbGet error`);
		}
	}

	async insertViaDbGetQueryBuilder(): Promise<void> {
		try {
			await this.beforeEach();
			const inserted = this.db.get<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
				this.db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
			);
			expect(inserted).deep.equal({ id: 1, name: 'John' });
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertViaDbGetQueryBuilder error`);
		}
	}

	async joinSubquery(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(courseCategoriesTable)
				.values([{ name: 'Category 1' }, { name: 'Category 2' }, { name: 'Category 3' }, { name: 'Category 4' }])
				.run();

			this.db
				.insert(coursesTable)
				.values([
					{ name: 'Development', categoryId: 2 },
					{ name: 'IT & Software', categoryId: 3 },
					{ name: 'Marketing', categoryId: 4 },
					{ name: 'Design', categoryId: 1 },
				])
				.run();

			const sq2 = this.db
				.select({
					categoryId: courseCategoriesTable.id,
					category: courseCategoriesTable.name,
					total: sql<number>`count(${courseCategoriesTable.id})`,
				})
				.from(courseCategoriesTable)
				.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
				.as('sq2');

			const res = await this.db
				.select({
					courseName: coursesTable.name,
					categoryId: sq2.categoryId,
				})
				.from(coursesTable)
				.leftJoin(sq2, eq(coursesTable.categoryId, sq2.categoryId))
				.orderBy(coursesTable.name)
				.all();

			expect(res).deep.equal([
				{ courseName: 'Design', categoryId: 1 },
				{ courseName: 'Development', categoryId: 2 },
				{ courseName: 'IT & Software', categoryId: 3 },
				{ courseName: 'Marketing', categoryId: 4 },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`joinSubquery error`);
		}
	}

	async withSelect(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(orders)
				.values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				])
				.run();

			const regionalSales = this.db.$with('regional_sales').as(
				this.db
					.select({
						region: orders.region,
						totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
					})
					.from(orders)
					.groupBy(orders.region),
			);

			const topRegions = this.db.$with('top_regions').as(
				this.db
					.select({
						region: regionalSales.region,
					})
					.from(regionalSales)
					.where(
						gt(
							regionalSales.totalSales,
							this.db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
						),
					),
			);

			const result = this.db
				.with(regionalSales, topRegions)
				.select({
					region: orders.region,
					product: orders.product,
					productUnits: sql<number>`cast(sum(${orders.quantity}) as int)`,
					productSales: sql<number>`cast(sum(${orders.amount}) as int)`,
				})
				.from(orders)
				.where(inArray(orders.region, this.db.select({ region: topRegions.region }).from(topRegions)))
				.groupBy(orders.region, orders.product)
				.orderBy(orders.region, orders.product)
				.all();

			expect(result).deep.equal([
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
		} catch (error: any) {
			console.error(error);
			throw new Error(`withSelect error`);
		}
	}

	async withUpdate(): Promise<void> {
		try {
			await this.beforeEach();
			const products = sqliteTable('products', {
				id: integer('id').primaryKey(),
				price: numeric('price').notNull(),
				cheap: integer('cheap', { mode: 'boolean' }).notNull().default(false),
			});

			this.db.run(sql`drop table if exists ${products}`);
			this.db.run(sql`
				create table ${products} (
					id integer primary key,
					price numeric not null,
					cheap integer not null default 0
				)
			`);

			await this.db
				.insert(products)
				.values([{ price: '10.99' }, { price: '25.85' }, { price: '32.99' }, { price: '2.50' }, { price: '4.59' }]);

			const averagePrice = this.db.$with('average_price').as(
				this.db
					.select({
						value: sql`avg(${products.price})`.as('value'),
					})
					.from(products),
			);

			const result = await this.db
				.with(averagePrice)
				.update(products)
				.set({
					cheap: true,
				})
				.where(lt(products.price, sql`(select * from ${averagePrice})`))
				.returning({
					id: products.id,
				});

			expect(result).deep.equal([{ id: 1 }, { id: 4 }, { id: 5 }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`withUpdate error`);
		}
	}

	async withInsert(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users', {
				username: text('username').notNull(),
				admin: integer('admin', { mode: 'boolean' }).notNull(),
			});

			this.db.run(sql`drop table if exists ${users}`);
			this.db.run(sql`create table ${users} (username text not null, admin integer not null default 0)`);

			const userCount = this.db.$with('user_count').as(
				this.db
					.select({
						value: sql`count(*)`.as('value'),
					})
					.from(users),
			);

			const result = await this.db
				.with(userCount)
				.insert(users)
				.values([{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` }])
				.returning({
					admin: users.admin,
				});

			expect(result).deep.equal([{ admin: true }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`withInsert error`);
		}
	}

	async withDelete(): Promise<void> {
		try {
			await this.beforeEach();
			await this.db.insert(orders).values([
				{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
				{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
				{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
				{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
				{ region: 'US', product: 'A', amount: 30, quantity: 3 },
				{ region: 'US', product: 'A', amount: 40, quantity: 4 },
				{ region: 'US', product: 'B', amount: 40, quantity: 4 },
				{ region: 'US', product: 'B', amount: 50, quantity: 5 },
			]);

			const averageAmount = this.db.$with('average_amount').as(
				this.db
					.select({
						value: sql`avg(${orders.amount})`.as('value'),
					})
					.from(orders),
			);

			const result = this.db
				.with(averageAmount)
				.delete(orders)
				.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
				.returning({
					id: orders.id,
				})
				.all();

			expect(result).deep.equal([{ id: 6 }, { id: 7 }, { id: 8 }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`withDelete error`);
		}
	}

	async selectFromSubquerySql(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(users2Table)
				.values([{ name: 'John' }, { name: 'Jane' }])
				.run();

			const sq = this.db
				.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
				.from(users2Table)
				.as('sq');

			const res = this.db.select({ name: sq.name }).from(sq).all();

			expect(res).deep.equal([{ name: 'John modified' }, { name: 'Jane modified' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectFromSubquerySql error`);
		}
	}

	async selectAFieldWithoutJoiningItsTable(): Promise<void> {
		try {
			await this.beforeEach();
			expect(() => this.db.select({ name: users2Table.name }).from(usersTable).prepare()).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectAFieldWithoutJoiningItsTable error`);
		}
	}

	async selectAllFieldsFromSubqueryWithoutAlias(): Promise<void> {
		try {
			const sq = this.db.$with('sq').as(
				this.db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table),
			);

			expect(() => this.db.select().from(sq).prepare()).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectAllFieldsFromSubqueryWithoutAlias error`);
		}
	}

	async selectCount(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }])
				.run();

			const res = this.db
				.select({ count: sql`count(*)` })
				.from(usersTable)
				.all();

			expect(res).deep.equal([{ count: 2 }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectCount error`);
		}
	}

	async having(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(citiesTable)
				.values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }])
				.run();

			this.db
				.insert(users2Table)
				.values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				])
				.run();

			const result = this.db
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

			expect(result).deep.equal([
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
		} catch (error: any) {
			console.error(error);
			throw new Error(`having error`);
		}
	}

	async view(): Promise<void> {
		try {
			await this.beforeEach();
			const newYorkers1 = sqliteView('new_yorkers').as((qb) =>
				qb.select().from(users2Table).where(eq(users2Table.cityId, 1))
			);

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

			this.db.run(sql`create view if not exists new_yorkers as ${getViewConfig(newYorkers1).query}`);

			this.db
				.insert(citiesTable)
				.values([{ name: 'New York' }, { name: 'Paris' }])
				.run();

			this.db
				.insert(users2Table)
				.values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				])
				.run();

			{
				const result = this.db.select().from(newYorkers1).all();
				expect(result).deep.equal([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = this.db.select().from(newYorkers2).all();
				expect(result).deep.equal([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = this.db.select().from(newYorkers3).all();
				expect(result).deep.equal([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = this.db.select({ name: newYorkers1.name }).from(newYorkers1).all();
				expect(result).deep.equal([{ name: 'John' }, { name: 'Jane' }]);
			}

			this.db.run(sql`drop view ${newYorkers1}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`view error`);
		}
	}

	async insertNullTimestamp(): Promise<void> {
		try {
			await this.beforeEach();
			const test = sqliteTable('test', {
				t: integer('t', { mode: 'timestamp' }),
			});

			this.db.run(sql`create table ${test} (t timestamp)`);

			this.db.insert(test).values({ t: null }).run();
			const res = await this.db.select().from(test).all();
			expect(res).deep.equal([{ t: null }]);

			this.db.run(sql`drop table ${test}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertNullTimestamp error`);
		}
	}

	async selectFromRawSql(): Promise<void> {
		try {
			const result = this.db
				.select({
					id: sql<number>`id`,
					name: sql<string>`name`,
				})
				.from(sql`(select 1 as id, 'John' as name) as users`)
				.all();

			Expect<Equal<{ id: number; name: string }[], typeof result>>;

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectFromRawSql error`);
		}
	}

	async selectFromRawSqlWithJoins(): Promise<void> {
		try {
			await this.beforeEach();
			const result = this.db
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

			expect(result).deep.equal([{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectFromRawSqlWithJoins error`);
		}
	}

	async joinOnAliasedSqlFromSelect(): Promise<void> {
		try {
			await this.beforeEach();
			const result = this.db
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

			expect(result).deep.equal([{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`joinOnAliasedSqlFromSelect error`);
		}
	}

	async joinOnAliasedSqlFromWithClause(): Promise<void> {
		try {
			await this.beforeEach();
			const users = this.db.$with('users').as(
				this.db
					.select({
						id: sql<number>`id`.as('userId'),
						name: sql<string>`name`.as('userName'),
						city: sql<string>`city`.as('city'),
					})
					.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`),
			);

			const cities = this.db.$with('cities').as(
				this.db
					.select({
						id: sql<number>`id`.as('cityId'),
						name: sql<string>`name`.as('cityName'),
					})
					.from(sql`(select 1 as id, 'Paris' as name) as cities`),
			);

			const result = this.db
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

			expect(result).deep.equal([{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`joinOnAliasedSqlFromWithClause error`);
		}
	}

	async prefixedTable(): Promise<void> {
		try {
			await this.beforeEach();
			const sqliteTable = sqliteTableCreator((name) => `myprefix_${name}`);

			const users = sqliteTable('test_prefixed_table_with_unique_name', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(
				sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
			);

			this.db.insert(users).values({ id: 1, name: 'John' }).run();

			const result = this.db.select().from(users).all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`prefixedTable error`);
		}
	}

	async orderByWithAliasedColumn(): Promise<void> {
		try {
			await this.beforeEach();
			const query = this.db
				.select({
					test: sql`something`.as('test'),
				})
				.from(users2Table)
				.orderBy((fields) => fields.test)
				.toSQL();

			expect(query.sql).equal('select something as "test" from "users2" order by "test"');
		} catch (error: any) {
			console.error(error);
			throw new Error(`orderByWithAliasedColumn error`);
		}
	}

	async transaction(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users_transactions', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});
			const products = sqliteTable('products_transactions', {
				id: integer('id').primaryKey(),
				price: integer('price').notNull(),
				stock: integer('stock').notNull(),
			});

			this.db.run(sql`drop table if exists ${users}`);
			this.db.run(sql`drop table if exists ${products}`);

			this.db.run(sql`create table users_transactions (id integer not null primary key, balance integer not null)`);
			this.db.run(
				sql`create table products_transactions (id integer not null primary key, price integer not null, stock integer not null)`,
			);

			const user = this.db.insert(users).values({ balance: 100 }).returning().get();
			const product = this.db.insert(products).values({ price: 10, stock: 10 }).returning().get();

			this.db.transaction(async (tx) => {
				tx.update(users)
					.set({ balance: user.balance - product.price })
					.where(eq(users.id, user.id))
					.run();
				tx.update(products)
					.set({ stock: product.stock - 1 })
					.where(eq(products.id, product.id))
					.run();
			});

			const result = this.db.select().from(users).all();

			expect(result).deep.equal([{ id: 1, balance: 90 }]);

			this.db.run(sql`drop table ${users}`);
			this.db.run(sql`drop table ${products}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`transaction error`);
		}
	}

	// async transactionRollback(): Promise<void>{
	// 	const users = sqliteTable('users_transactions_rollback', {
	// 		id: integer('id').primaryKey(),
	// 		balance: integer('balance').notNull(),
	// 	});

	// 	this.db.run(sql`drop table if exists ${users}`);

	// 	this.db.run(
	// 		sql`create table users_transactions_rollback (id integer not null primary key, balance integer not null)`,
	// 	);
	// 	await expect(async () => {
	// 		this.db.transaction(async (tx) => {
	// 			tx.insert(users).values({ balance: 100 }).run();
	// 			tx.rollback();
	// 		});
	// 	}).re(TransactionRollbackError);

	// 	const result = await db.select().from(users).all();

	// 	expect(result).toEqual([]);

	// 	await db.run(sql`drop table ${users}`);
	// };

	async nestedTransaction(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users_nested_transactions', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(
				sql`create table users_nested_transactions (id integer not null primary key, balance integer not null)`,
			);

			this.db.transaction((tx) => {
				tx.insert(users).values({ balance: 100 }).run();

				tx.transaction((tx) => {
					tx.update(users).set({ balance: 200 }).run();
				});
			});

			const result = this.db.select().from(users).all();

			expect(result).deep.equal([{ id: 1, balance: 200 }]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`nestedTransaction error`);
		}
	}

	// async nestedTransactionRollback(): Promise<void>{
	// 	const users = sqliteTable('users_nested_transactions_rollback', {
	// 		id: integer('id').primaryKey(),
	// 		balance: integer('balance').notNull(),
	// 	});

	// 	this.db.run(sql`drop table if exists ${users}`);

	// 	this.db.run(
	// 		sql`create table users_nested_transactions_rollback (id integer not null primary key, balance integer not null)`,
	// 	);

	// 	this.db.transaction((tx) => {
	// 		this.tx.insert(users).values({ balance: 100 }).run();

	// 		expect(async () => {
	// 			await tx.transaction(async (tx) => {
	// 				await tx.update(users).set({ balance: 200 }).run();
	// 				tx.rollback();
	// 			});
	// 		}).rejects.toThrowError(TransactionRollbackError);
	// 	});

	// 	const result = await db.select().from(users).all();

	// 	expect(result).toEqual([{ id: 1, balance: 100 }]);

	// 	await db.run(sql`drop table ${users}`);
	// };

	async joinSubqueryWithJoin(): Promise<void> {
		try {
			await this.beforeEach();
			const internalStaff = sqliteTable('internal_staff', {
				userId: integer('user_id').notNull(),
			});

			const customUser = sqliteTable('custom_user', {
				id: integer('id').notNull(),
			});

			const ticket = sqliteTable('ticket', {
				staffId: integer('staff_id').notNull(),
			});

			this.db.run(sql`drop table if exists ${internalStaff}`);
			this.db.run(sql`drop table if exists ${customUser}`);
			this.db.run(sql`drop table if exists ${ticket}`);

			this.db.run(sql`create table internal_staff (user_id integer not null)`);
			this.db.run(sql`create table custom_user (id integer not null)`);
			this.db.run(sql`create table ticket (staff_id integer not null)`);

			this.db.insert(internalStaff).values({ userId: 1 }).run();
			this.db.insert(customUser).values({ id: 1 }).run();
			this.db.insert(ticket).values({ staffId: 1 }).run();

			const subq = this.db.select().from(internalStaff).leftJoin(customUser, eq(internalStaff.userId, customUser.id))
				.as('internal_staff');

			const mainQuery = this.db.select().from(ticket).leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId))
				.all();

			expect(mainQuery).deep.equal([
				{
					ticket: { staffId: 1 },
					internal_staff: {
						internal_staff: { userId: 1 },
						custom_user: { id: 1 },
					},
				},
			]);

			this.db.run(sql`drop table ${internalStaff}`);
			this.db.run(sql`drop table ${customUser}`);
			this.db.run(sql`drop table ${ticket}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`joinSubqueryWithJoin error`);
		}
	}

	async joinViewAsSubquery(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users_join_view', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			const newYorkers = sqliteView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			this.db.run(sql`drop table if exists ${users}`);
			this.db.run(sql`drop view if exists ${newYorkers}`);

			this.db.run(
				sql`create table ${users} (id integer not null primary key, name text not null, city_id integer not null)`,
			);
			this.db.run(sql`create view if not exists ${newYorkers} as ${getViewConfig(newYorkers).query}`);

			this.db
				.insert(users)
				.values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 2 },
					{ name: 'Jack', cityId: 1 },
					{ name: 'Jill', cityId: 2 },
				])
				.run();

			const sq = this.db.select().from(newYorkers).as('new_yorkers_sq');

			const result = await this.db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).all();

			expect(result).deep.equal([
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

			this.db.run(sql`drop view ${newYorkers}`);
			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`joinViewAsSubquery error`);
		}
	}

	async insertWithOnConflictDoNothing(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			this.db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing().run();

			const res = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			).all();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoNothing error`);
		}
	}

	async insertWithOnConflictDoNothinUsingCompositePk(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			this.db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john1@example.com' }).onConflictDoNothing()
				.run();

			const res = await this.db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John', email: 'john@example.com' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoNothinUsingCompositePk error`);
		}
	}

	async insertWithOnConflictDoNothingUsingTarget(): Promise<void> {
		try {
			this.db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			this.db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing({ target: usersTable.id }).run();

			const res = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			).all();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoNothingUsingTarget error`);
		}
	}

	async insertWithOnConflictDoNothingUsingCompositePkAsTarget(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			this.db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john1@example.com' })
				.onConflictDoNothing({ target: [pkExampleTable.id, pkExampleTable.name] })
				.run();

			const res = this.db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John', email: 'john@example.com' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoNothingUsingCompositePkAsTarget error`);
		}
	}

	async insertWithOnConflictDoUpdate(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			this.db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
				.run();

			const res = this.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			).all();

			expect(res).deep.equal([{ id: 1, name: 'John1' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoUpdate error`);
		}
	}

	async insertWithOnConflictDoUpdateWhere(): Promise<void> {
		try {
			await this.beforeEach();
			this.db
				.insert(usersTable)
				.values([{ id: 1, name: 'John', verified: false }])
				.run();

			this.db
				.insert(usersTable)
				.values({ id: 1, name: 'John1', verified: true })
				.onConflictDoUpdate({
					target: usersTable.id,
					set: { name: 'John1', verified: true },
					where: eq(usersTable.verified, false),
				})
				.run();

			const res = this.db
				.select({ id: usersTable.id, name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.where(eq(usersTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John1', verified: true }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoUpdateWhere error`);
		}
	}

	async insertWithOnConflictDoUpdateUsingCompositePk(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			this.db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john@example.com' })
				.onConflictDoUpdate({ target: [pkExampleTable.id, pkExampleTable.name], set: { email: 'john1@example.com' } })
				.run();

			const res = this.db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John', email: 'john1@example.com' }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`insertWithOnConflictDoUpdateUsingCompositePk error`);
		}
	}

	async insertUndefined(): Promise<void> {
		const users = sqliteTable('users', {
			id: integer('id').primaryKey(),
			name: text('name'),
		});

		this.db.run(sql`drop table if exists ${users}`);

		this.db.run(
			sql`create table ${users} (id integer primary key, name text)`,
		);

		expect((() => {
			this.db.insert(users).values({ name: undefined }).run();
		})()).not.throw();

		this.db.run(sql`drop table ${users}`);
	}

	async updateUndefined(): Promise<void> {
		const users = sqliteTable('users', {
			id: integer('id').primaryKey(),
			name: text('name'),
		});

		this.db.run(sql`drop table if exists ${users}`);

		this.db.run(
			sql`create table ${users} (id integer primary key, name text)`,
		);

		expect((() => {
			this.db.update(users).set({ name: undefined }).run();
		})()).throw();
		expect((() => {
			this.db.update(users).set({ id: 1, name: undefined }).run();
		})()).not.throw();

		this.db.run(sql`drop table ${users}`);
	}

	async apiCRUD(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(sql`create table ${users} (id integer primary key, name text)`);

			this.db.insert(users).values({ id: 1, name: 'John' }).run();

			const res = this.db.select().from(users).all();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);

			this.db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).all();

			const res1 = this.db.select().from(users).all();

			expect(res1).deep.equal([{ id: 1, name: 'John1' }]);

			this.db.delete(users).where(eq(users.id, 1)).run();

			const res2 = this.db.select().from(users).all();

			expect(res2).deep.equal([]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`apiCRUD error`);
		}
	}

	async apiInsertPlusSelectPreparePlusAsyncExecute(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(sql`create table ${users} (id integer primary key, name text)`);

			const insertStmt = this.db.insert(users).values({ id: 1, name: 'John' }).prepare();
			insertStmt.execute().sync();

			const selectStmt = this.db.select().from(users).prepare();
			const res = selectStmt.execute().sync();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);

			const updateStmt = this.db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
			updateStmt.execute().sync();

			const res1 = selectStmt.execute().sync();

			expect(res1).deep.equal([{ id: 1, name: 'John1' }]);

			const deleteStmt = this.db.delete(users).where(eq(users.id, 1)).prepare();
			deleteStmt.execute().sync();

			const res2 = selectStmt.execute().sync();

			expect(res2).deep.equal([]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`apiInsertPlusSelectPreparePlusAsyncExecute error`);
		}
	}

	async apiInsertSelectPreparePlusSyncExecute(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(sql`create table ${users} (id integer primary key, name text)`);

			const insertStmt = this.db.insert(users).values({ id: 1, name: 'John' }).prepare();
			insertStmt.execute().sync();

			const selectStmt = this.db.select().from(users).prepare();
			const res = selectStmt.execute().sync();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);

			const updateStmt = this.db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
			updateStmt.execute().sync();

			const res1 = selectStmt.execute().sync();

			expect(res1).deep.equal([{ id: 1, name: 'John1' }]);

			const deleteStmt = this.db.delete(users).where(eq(users.id, 1)).prepare();
			deleteStmt.execute().sync();

			const res2 = selectStmt.execute().sync();

			expect(res2).deep.equal([]);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`apiInsertSelectPreparePlusSyncExecute error`);
		}
	}

	async selectPlusGetForEmptyResult(): Promise<void> {
		try {
			await this.beforeEach();
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			this.db.run(sql`drop table if exists ${users}`);

			this.db.run(sql`create table ${users} (id integer primary key, name text)`);

			const res = this.db.select().from(users).where(eq(users.id, 1)).get();

			expect(res).eq(undefined);

			this.db.run(sql`drop table ${users}`);
		} catch (error: any) {
			console.error(error);
			throw new Error(`selectPlusGetForEmptyResult error`);
		}
	}

	async setOperationsUnionFromQueryBuilderWithSubquery(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const sq = this.db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable)
				.union(this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table))
				.orderBy(asc(sql`name`))
				.as('sq');

			const result = await this.db.select().from(sq).limit(5).offset(5);

			expect(result).length(5);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 7, name: 'Mary' },
				{ id: 1, name: 'New York' },
				{ id: 4, name: 'Peter' },
				{ id: 8, name: 'Sally' },
			]);

			expect(() => {
				this.db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).union(
						this.db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table),
					).orderBy(asc(sql`name`)).all();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsUnionFromQueryBuilderWithSubquery error`);
		}
	}

	async setOperationsUnionAsFunction(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = union(
				this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).orderBy(asc(sql`name`)).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'New York' },
			]);

			expect(() => {
				union(
					this.db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
					this.db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
					this.db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).orderBy(asc(sql`name`)).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsUnionAsFunction error`);
		}
	}

	async setOperationsUnionAllFromQueryBuilder(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = this.db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable)
				.unionAll(this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable))
				.orderBy(asc(citiesTable.id))
				.limit(5)
				.offset(1).all();

			expect(result).length(5);

			expect(result).deep.equal([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 3, name: 'Tampa' },
			]);

			expect(() => {
				this.db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).unionAll(
						this.db
							.select({ name: citiesTable.name, id: citiesTable.id })
							.from(citiesTable),
					).orderBy(asc(citiesTable.id)).limit(5).offset(1).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsUnionAllFromQueryBuilder error`);
		}
	}

	async setOperationsUnionAllAsFunction(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = unionAll(
				this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).all();

			expect(result).length(3);

			expect(result).deep.equal([
				{ id: 1, name: 'New York' },
				{ id: 1, name: 'John' },
				{ id: 1, name: 'John' },
			]);

			expect(() => {
				unionAll(
					this.db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
					this.db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					this.db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsUnionAllAsFunction error`);
		}
	}

	async setOperationsIntersectFromQueryBuilder(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = this.db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable)
				.intersect(
					this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(gt(citiesTable.id, 1)),
				)
				.orderBy(asc(sql`name`)).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			expect(() => {
				this.db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).intersect(
						this.db
							.select({ id: citiesTable.id, name: citiesTable.name })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
					).orderBy(asc(sql`name`)).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsIntersectFromQueryBuilder error`);
		}
	}

	async setOperationsIntersectAsFunction(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = intersect(
				this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).all();

			expect(result).length(0);

			expect(result).deep.equal([]);

			expect(() => {
				intersect(
					this.db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
					this.db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 1)),
					this.db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsIntersectAsFunction error`);
		}
	}

	async setOperationsExceptFromQueryBuilder(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = this.db
				.select()
				.from(citiesTable)
				.except(this.db.select().from(citiesTable).where(gt(citiesTable.id, 1))).all();

			expect(result).length(1);

			expect(result).deep.equal([{ id: 1, name: 'New York' }]);

			expect(() => {
				this.db
					.select()
					.from(citiesTable).except(
						this.db
							.select({ name: users2Table.name, id: users2Table.id })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
					);
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsExceptFromQueryBuilder error`);
		}
	}

	async setOperationsExceptAsFunction(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = except(
				this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable),
				this.db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).orderBy(asc(sql`id`)).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);
			expect(() => {
				except(
					this.db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable),
					this.db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
					this.db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
				).orderBy(asc(sql`id`)).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsExceptAsFunction error`);
		}
	}

	async setOperationsMixedFromQueryBuilder(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const result = this.db
				.select()
				.from(citiesTable)
				.except(({ unionAll }) =>
					unionAll(
						this.db.select().from(citiesTable).where(gt(citiesTable.id, 1)),
						this.db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
					)
				).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
			]);

			expect(() => {
				this.db
					.select()
					.from(citiesTable).except(
						({ unionAll }) =>
							unionAll(
								this.db
									.select()
									.from(citiesTable).where(gt(citiesTable.id, 1)),
								this.db.select({ name: citiesTable.name, id: citiesTable.id })
									.from(citiesTable).where(eq(citiesTable.id, 2)),
							),
					).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsMixedFromQueryBuilder error`);
		}
	}

	async setOperationsMixedAllAsFunctionWithSubquery(): Promise<void> {
		try {
			await this.beforeEach();
			await setupSetOperationTest(this.db);

			const sq = union(
				this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				except(
					this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(
						gte(users2Table.id, 5),
					),
					this.db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 7)),
				),
				this.db.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			)
				.orderBy(asc(sql`id`))
				.as('sq');

			const result = await this.db.select().from(sq).limit(4).offset(1);

			expect(result).length(4);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 5, name: 'Ben' },
				{ id: 6, name: 'Jill' },
			]);

			expect(() => {
				union(
					this.db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					except(
						this.db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(gte(users2Table.id, 5)),
						this.db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 7)),
					),
					this.db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				).orderBy(asc(sql`id`)).run();
			}).throw();
		} catch (error: any) {
			console.error(error);
			throw new Error(`setOperationsMixedAllAsFunctionWithSubquery error`);
		}
	}

	async aggregateFunctionCount(): Promise<void> {
		try {
			await this.beforeEach();
			const table = aggregateTable;
			await setupAggregateFunctionsTest(this.db);

			const result1 = await this.db.select({ value: count() }).from(table);
			const result2 = await this.db.select({ value: count(table.a) }).from(table);
			const result3 = await this.db.select({ value: countDistinct(table.name) }).from(table);

			expect(result1[0]?.value).eq(7);
			expect(result2[0]?.value).eq(5);
			expect(result3[0]?.value).eq(6);
		} catch (error: any) {
			console.error(error);
			throw new Error(`aggregateFunctionCount error`);
		}
	}

	async aggregatFunctionAvg(): Promise<void> {
		try {
			await this.beforeEach();
			const table = aggregateTable;
			await setupAggregateFunctionsTest(this.db);

			const result1 = await this.db.select({ value: avg(table.a) }).from(table);
			const result2 = await this.db.select({ value: avg(table.nullOnly) }).from(table);
			const result3 = await this.db.select({ value: avgDistinct(table.b) }).from(table);

			expect(result1[0]?.value).eq('24');
			expect(result2[0]?.value).eq(null);
			expect(result3[0]?.value).eq('42.5');
		} catch (error: any) {
			console.error(error);
			throw new Error(`aggregatFunctionAvg error`);
		}
	}

	async aggregateFunctionSum(): Promise<void> {
		try {
			await this.beforeEach();
			const table = aggregateTable;
			await setupAggregateFunctionsTest(this.db);

			const result1 = await this.db.select({ value: sum(table.b) }).from(table);
			const result2 = await this.db.select({ value: sum(table.nullOnly) }).from(table);
			const result3 = await this.db.select({ value: sumDistinct(table.b) }).from(table);

			expect(result1[0]?.value).eq('200');
			expect(result2[0]?.value).eq(null);
			expect(result3[0]?.value).eq('170');
		} catch (error: any) {
			console.error(error);
			throw new Error(`aggregateFunctionSum error`);
		}
	}

	async aggregateFunctionMax(): Promise<void> {
		try {
			await this.beforeEach();
			const table = aggregateTable;
			await setupAggregateFunctionsTest(this.db);

			const result1 = await this.db.select({ value: max(table.b) }).from(table);
			const result2 = await this.db.select({ value: max(table.nullOnly) }).from(table);

			expect(result1[0]?.value).eq(90);
			expect(result2[0]?.value).eq(null);
		} catch (error: any) {
			console.error(error);
			throw new Error(`aggregateFunctionMax error`);
		}
	}

	async aggregateFunctionMin(): Promise<void> {
		try {
			await this.beforeEach();
			const table = aggregateTable;
			await setupAggregateFunctionsTest(this.db);

			const result1 = await this.db.select({ value: min(table.b) }).from(table);
			const result2 = await this.db.select({ value: min(table.nullOnly) }).from(table);

			expect(result1[0]?.value).eq(10);
			expect(result2[0]?.value).eq(null);
		} catch (error: any) {
			console.error(error);
			throw new Error(`aggregateFunctionMin error`);
		}
	}

	async test$onUpdateFnAnd$onUpdateWorksAs$default(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.run(sql`drop table if exists ${usersOnUpdate}`);

			this.db.run(
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

			this.db
				.insert(usersOnUpdate)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jack' }, { name: 'Jill' }])
				.run();
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			const justDates = await this.db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			const response = await this.db
				.select({ ...rest })
				.from(usersOnUpdate)
				.orderBy(asc(usersOnUpdate.id));

			expect(response).deep.equal([
				{ name: 'John', id: 1, updateCounter: 1, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 250;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).greaterThan(Date.now() - msDelay);
			}
		} catch (error: any) {
			console.error(error);
			throw new Error(`test$onUpdateFnAnd$onUpdateWorksAs$default error`);
		}
	}

	async test$onUpdateFnAnd$onUpdateWorksUpdating(): Promise<void> {
		try {
			await this.beforeEach();
			this.db.run(sql`drop table if exists ${usersOnUpdate}`);

			this.db.run(
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

			await this.db
				.insert(usersOnUpdate)
				.values([{ name: 'John', alwaysNull: 'this will be null after updating' }, { name: 'Jane' }, { name: 'Jack' }, {
					name: 'Jill',
				}]);
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			await this.db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));
			await this.db.update(usersOnUpdate).set({ updateCounter: null }).where(eq(usersOnUpdate.id, 2));

			const justDates = await this.db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			const response = await this.db
				.select({ ...rest })
				.from(usersOnUpdate)
				.orderBy(asc(usersOnUpdate.id));

			expect(response).deep.equal([
				{ name: 'Angel', id: 1, updateCounter: 2, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: null, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 250;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).greaterThan(Date.now() - msDelay);
			}
		} catch (error: any) {
			console.error(error);
			throw new Error(`test$onUpdateFnAnd$onUpdateWorksUpdating error`);
		}
	}

	async $countSeparate(): Promise<void> {
		try {
			await this.beforeEach();
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${countTestTable}`);
			this.db.run(sql`create table ${countTestTable} (id int, name text)`);

			await this.db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await this.db.$count(countTestTable);

			this.db.run(sql`drop table ${countTestTable}`);

			expect(count).eq(4);
		} catch (error: any) {
			console.error(error);
			throw new Error(`$countSeparate error`);
		}
	}

	async $countEmbedded(): Promise<void> {
		try {
			await this.beforeEach();
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${countTestTable}`);
			this.db.run(sql`create table ${countTestTable} (id int, name text)`);

			await this.db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await this.db
				.select({
					count: this.db.$count(countTestTable),
				})
				.from(countTestTable);

			this.db.run(sql`drop table ${countTestTable}`);

			expect(count).deep.equal([{ count: 4 }, { count: 4 }, { count: 4 }, { count: 4 }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`$countEmbedded error`);
		}
	}

	async $countSeparateReuse(): Promise<void> {
		try {
			await this.beforeEach();
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${countTestTable}`);
			this.db.run(sql`create table ${countTestTable} (id int, name text)`);

			await this.db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = this.db.$count(countTestTable);

			const count1 = await count;

			await this.db.insert(countTestTable).values({ id: 5, name: 'fifth' });

			const count2 = await count;

			await this.db.insert(countTestTable).values({ id: 6, name: 'sixth' });

			const count3 = await count;

			this.db.run(sql`drop table ${countTestTable}`);

			expect(count1).eq(4);
			expect(count2).eq(5);
			expect(count3).eq(6);
		} catch (error: any) {
			console.error(error);
			throw new Error(`$countSeparateReuse error`);
		}
	}

	async $countEmbeddedReuse(): Promise<void> {
		try {
			await this.beforeEach();
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${countTestTable}`);
			this.db.run(sql`create table ${countTestTable} (id int, name text)`);

			await this.db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = this.db
				.select({
					count: this.db.$count(countTestTable),
				})
				.from(countTestTable);

			const count1 = await count;

			await this.db.insert(countTestTable).values({ id: 5, name: 'fifth' });

			const count2 = await count;

			await this.db.insert(countTestTable).values({ id: 6, name: 'sixth' });

			const count3 = await count;

			this.db.run(sql`drop table ${countTestTable}`);

			expect(count1).deep.equal([{ count: 4 }, { count: 4 }, { count: 4 }, { count: 4 }]);
			expect(count2).deep.equal([{ count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }]);
			expect(count3).deep.equal([{ count: 6 }, { count: 6 }, { count: 6 }, { count: 6 }, { count: 6 }, { count: 6 }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`$countEmbeddedReuse error`);
		}
	}

	async $countSeparateWithFilters(): Promise<void> {
		try {
			await this.beforeEach();
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${countTestTable}`);
			this.db.run(sql`create table ${countTestTable} (id int, name text)`);

			await this.db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await this.db.$count(countTestTable, gt(countTestTable.id, 1));

			this.db.run(sql`drop table ${countTestTable}`);

			expect(count).deep.equal(3);
		} catch (error: any) {
			console.error(error);
			throw new Error(`$countSeparateWithFilters error`);
		}
	}

	async $countEmbeddedWithFilters(): Promise<void> {
		try {
			await this.beforeEach();
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			this.db.run(sql`drop table if exists ${countTestTable}`);
			this.db.run(sql`create table ${countTestTable} (id int, name text)`);

			await this.db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await this.db
				.select({
					count: this.db.$count(countTestTable, gt(countTestTable.id, 1)),
				})
				.from(countTestTable);

			await this.db.run(sql`drop table ${countTestTable}`);

			expect(count).deep.equal([{ count: 3 }, { count: 3 }, { count: 3 }, { count: 3 }]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`$countEmbeddedWithFilters error`);
		}
	}

	async updateWithLimitAndOrderBy(): Promise<void> {
		try {
			await this.beforeEach();
			await this.db.insert(usersTable).values([
				{ name: 'Barry', verified: false },
				{ name: 'Alan', verified: false },
				{ name: 'Carl', verified: false },
			]);

			await this.db.update(usersTable).set({ verified: true }).limit(2).orderBy(asc(usersTable.name));

			const result = await this.db
				.select({ name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.orderBy(asc(usersTable.name));

			expect(result).deep.equal([
				{ name: 'Alan', verified: true },
				{ name: 'Barry', verified: true },
				{ name: 'Carl', verified: false },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`updateWithLimitAndOrderBy error`);
		}
	}

	async deleteWithLimitAndOrderBy(): Promise<void> {
		try {
			await this.beforeEach();
			await this.db.insert(usersTable).values([
				{ name: 'Barry', verified: false },
				{ name: 'Alan', verified: false },
				{ name: 'Carl', verified: false },
			]);

			await this.db.delete(usersTable).where(eq(usersTable.verified, false)).limit(1).orderBy(asc(usersTable.name));

			const result = await this.db
				.select({ name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.orderBy(asc(usersTable.name));
			expect(result).deep.equal([
				{ name: 'Barry', verified: false },
				{ name: 'Carl', verified: false },
			]);
		} catch (error: any) {
			console.error(error);
			throw new Error(`deleteWithLimitAndOrderBy error`);
		}
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env): Promise<Response> {
		try {
			const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName('durable-object');
			const stub = env.MY_DURABLE_OBJECT.get(id);

			await stub.migrate1();

			await stub.insertBigIntValues();

			await stub.selectAllFields();
			await stub.selectPartial();
			await stub.selectSql();
			await stub.selectTypedSql();
			await stub.selectWithEmptyArrayInInArray();
			await stub.selectWithEmptyArrayInNotInArray();
			await stub.selectDistinct();
			await stub.returingSql();
			await stub.$defaultFunction();
			await stub.deleteReturningSql();
			await stub.queryCheckInsertSingleEmptyRow();
			await stub.queryCheckInsertMultipleEmptyRow();
			await stub.insertAllDefaultsIn1Row();
			await stub.insertAllDefaultsInMultipleRows();
			await stub.updateReturningSql();
			await stub.insertWithAutoIncrement();
			await stub.insertDataWithDefaultValues();
			await stub.insertDataWithOverridenDefaultValues();
			await stub.updateWithReturningFields();
			await stub.updateWithReturningPartial();
			await stub.updateWithReturningAllFields();
			await stub.deleteWithReturningPartial();
			await stub.insertAndSelect();

			await stub.jsonInsert();
			await stub.insertMany();
			await stub.insertManyWithReturning();

			await stub.partialJoinWithAlias();
			await stub.fullJoinWithAlias();
			await stub.selectFromAlias();
			await stub.insertWithSpaces();
			await stub.preparedStatement();
			await stub.preparedStatementReuse();
			await stub.insertPlaceholdersOnColumnsWithEncoder();
			await stub.preparedStatementWithPlaceholderInWhere();
			await stub.preparedStatementWithPlaceholderInLimit();
			await stub.preparedStatementWithPlaceholderInOffset();
			await stub.preparedStatementBuiltUsing$dynamic();

			await stub.selectWithGroupByAsField();
			await stub.selectWithExists();
			await stub.selectWithGroupByAsSql();
			await stub.selectWithGroupByAsSqlPlusColumn();
			await stub.selectWithGroupByAsColumnPlusSql();
			await stub.selectWithGroupByComplexQuery();
			await stub.buildQuery();
			await stub.insertViaDbRunPlusSelectViaDbAll();
			await stub.insertViaDbGet();
			await stub.insertViaDbRunPlusSelectViaDbGet();
			await stub.insertViaDbGetQueryBuilder();
			await stub.joinSubquery();
			await stub.withSelect();
			await stub.withUpdate();
			await stub.withInsert();

			await stub.withDelete();
			await stub.selectFromSubquerySql();
			await stub.selectAFieldWithoutJoiningItsTable();
			await stub.selectCount();
			await stub.having();
			await stub.insertNullTimestamp();
			await stub.selectFromRawSql();
			await stub.selectFromRawSqlWithJoins();
			await stub.joinOnAliasedSqlFromSelect();
			await stub.joinOnAliasedSqlFromWithClause();
			await stub.prefixedTable();
			await stub.orderByWithAliasedColumn();
			await stub.transaction();
			await stub.nestedTransaction();
			await stub.joinSubqueryWithJoin();
			await stub.joinViewAsSubquery();
			await stub.insertWithOnConflictDoNothing();
			await stub.insertWithOnConflictDoNothinUsingCompositePk();
			await stub.insertWithOnConflictDoNothingUsingTarget();
			await stub.insertWithOnConflictDoNothingUsingCompositePkAsTarget();
			await stub.insertWithOnConflictDoUpdate();
			await stub.insertWithOnConflictDoUpdateWhere();
			await stub.insertWithOnConflictDoUpdateUsingCompositePk();
			await stub.apiCRUD();
			await stub.apiInsertPlusSelectPreparePlusAsyncExecute();
			await stub.apiInsertSelectPreparePlusSyncExecute();
			await stub.selectPlusGetForEmptyResult();
			await stub.setOperationsUnionFromQueryBuilderWithSubquery();
			await stub.setOperationsUnionAsFunction();
			await stub.setOperationsUnionAllFromQueryBuilder();
			await stub.setOperationsUnionAllAsFunction();
			await stub.setOperationsIntersectFromQueryBuilder();
			await stub.setOperationsIntersectAsFunction();
			await stub.setOperationsExceptFromQueryBuilder();
			await stub.setOperationsExceptAsFunction();
			await stub.setOperationsMixedFromQueryBuilder();
			await stub.setOperationsMixedAllAsFunctionWithSubquery();
			await stub.aggregateFunctionCount();
			await stub.aggregatFunctionAvg();
			await stub.aggregateFunctionSum();
			await stub.aggregateFunctionMax();
			await stub.aggregateFunctionMin();
			await stub.test$onUpdateFnAnd$onUpdateWorksAs$default();
			await stub.test$onUpdateFnAnd$onUpdateWorksUpdating();
			await stub.$countSeparate();
			await stub.$countEmbedded();
			await stub.$countEmbeddedReuse();
			await stub.$countSeparateWithFilters();
			await stub.$countEmbeddedWithFilters();
			await stub.updateWithLimitAndOrderBy();
			await stub.deleteWithLimitAndOrderBy();
			await stub.updateUndefined();
			await stub.insertUndefined();

			return new Response();
		} catch (error: any) {
			return new Response(error.message);
		}
	},
} satisfies ExportedHandler<Env>;
