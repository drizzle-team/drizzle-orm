/// <reference types="@cloudflare/workers-types" />

// Can't use 'vitest' due to it having setTimeout in code, thus breaking workers
import { SqliteClient } from '@effect/sql-sqlite-do';
import { expect } from 'chai';
import { DurableObject } from 'cloudflare:workers';
import {
	and,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	defineRelations,
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
import { EffectCache } from 'drizzle-orm/cache/core/cache-effect';
import * as SQLiteDrizzle from 'drizzle-orm/effect-sqlite-do';
import { migrate } from 'drizzle-orm/effect-sqlite-do/migrator';
import {
	alias,
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
import { Layer } from 'effect';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
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
}, (table) => [primaryKey({ columns: [table.id, table.name] })]);

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

export const rqbUser = sqliteTable('user_rqb_test', {
	id: integer().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: integer('created_at', {
		mode: 'timestamp_ms',
	}).notNull(),
});

export const rqbPost = sqliteTable('post_rqb_test', {
	id: integer().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: integer('created_at', {
		mode: 'timestamp_ms',
	}).notNull(),
});

export const relations = defineRelations({ rqbUser, rqbPost }, (r) => ({
	rqbUser: {
		posts: r.many.rqbPost(),
	},
	rqbPost: {
		author: r.one.rqbUser({
			from: r.rqbPost.userId,
			to: r.rqbUser.id,
		}),
	},
}));

type Db = SQLiteDrizzle.EffectSQLiteDoDatabase<typeof relations>;

const beforeEach = (db: Db) =>
	Effect.gen(function*() {
		yield* db.run(sql`drop table if exists ${usersTable}`);
		yield* db.run(sql`drop table if exists ${users2Table}`);
		yield* db.run(sql`drop table if exists ${citiesTable}`);
		yield* db.run(sql`drop table if exists ${coursesTable}`);
		yield* db.run(sql`drop table if exists ${courseCategoriesTable}`);
		yield* db.run(sql`drop table if exists ${orders}`);
		yield* db.run(sql`drop table if exists ${bigIntExample}`);
		yield* db.run(sql`drop table if exists ${pkExampleTable}`);
		yield* db.run(sql`drop table if exists ${rqbUser}`);
		yield* db.run(sql`drop table if exists ${rqbPost}`);
		yield* db.run(sql`drop table if exists user_notifications_insert_into`);
		yield* db.run(sql`drop table if exists users_insert_into`);
		yield* db.run(sql`drop table if exists notifications_insert_into`);

		yield* db.run(sql`
			create table ${usersTable} (
				id integer primary key,
				name text not null,
				verified integer not null default 0,
				json blob,
				created_at integer not null default (strftime('%s', 'now'))
			)
		`);

		yield* db.run(sql`
			create table ${citiesTable} (
				id integer primary key,
				name text not null
			)
		`);
		yield* db.run(sql`
			create table ${courseCategoriesTable} (
				id integer primary key,
				name text not null
			)
		`);

		yield* db.run(sql`
			create table ${users2Table} (
				id integer primary key,
				name text not null,
				city_id integer references ${citiesTable}(${sql.identifier(citiesTable.id.name)})
			)
		`);
		yield* db.run(sql`
			create table ${coursesTable} (
				id integer primary key,
				name text not null,
				category_id integer references ${courseCategoriesTable}(${sql.identifier(courseCategoriesTable.id.name)})
			)
		`);
		yield* db.run(sql`
			create table ${orders} (
				id integer primary key,
				region text not null,
				product text not null,
				amount integer not null,
				quantity integer not null
			)
		`);
		yield* db.run(sql`
			create table ${pkExampleTable} (
				id integer not null,
				name text not null,
				email text not null,
				primary key (id, name)
			)
		`);
		yield* db.run(sql`
			create table ${bigIntExample} (
			  id integer primary key,
			  name text not null,
			  big_int blob not null
			)
		`);
		yield* db.run(sql`
			CREATE TABLE ${rqbUser} (
			  id INT PRIMARY KEY NOT NULL,
			  name TEXT NOT NULL,
			  created_at INT NOT NULL
			)
		`);
		yield* db.run(sql`
			CREATE TABLE ${rqbPost} ( 
			  id INT PRIMARY KEY NOT NULL,
			  user_id INT NOT NULL,
			  content TEXT,
			  created_at INT NOT NULL
			)
		`);
	});

const setupSetOperationTest = (db: Db) =>
	Effect.gen(function*() {
		yield* db.run(sql`drop table if exists users2`);
		yield* db.run(sql`drop table if exists cities`);
		yield* db.run(sql`
		create table \`cities\` (
			id integer primary key,
			name text not null
		)
	`);

		yield* db.run(sql`
		create table \`users2\` (
			id integer primary key,
			name text not null,
			city_id integer references ${citiesTable}(${sql.identifier(citiesTable.id.name)})
		)
	`);

		yield* db.insert(citiesTable).values([
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		yield* db.insert(users2Table).values([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 2 },
			{ id: 3, name: 'Jack', cityId: 3 },
			{ id: 4, name: 'Peter', cityId: 3 },
			{ id: 5, name: 'Ben', cityId: 2 },
			{ id: 6, name: 'Jill', cityId: 1 },
			{ id: 7, name: 'Mary', cityId: 2 },
			{ id: 8, name: 'Sally', cityId: 1 },
		]);
	});

const setupAggregateFunctionsTest = (db: Db) =>
	Effect.gen(function*() {
		yield* db.run(sql`drop table if exists "aggregate_table"`);
		yield* db.run(
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
		yield* db.insert(aggregateTable).values([
			{ name: 'value 1', a: 5, b: 10, c: 20 },
			{ name: 'value 1', a: 5, b: 20, c: 30 },
			{ name: 'value 2', a: 10, b: 50, c: 60 },
			{ name: 'value 3', a: 20, b: 20, c: null },
			{ name: 'value 4', a: null, b: 90, c: 120 },
			{ name: 'value 5', a: 80, b: 10, c: null },
			{ name: 'value 6', a: null, b: null, c: 150 },
		]);
	});

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class MyDurableObject extends DurableObject {
	private db!: Db;
	private runtime!: ManagedRuntime.ManagedRuntime<
		EffectCache | SQLiteDrizzle.EffectLogger | SqliteClient.SqliteClient | SqlClient,
		never
	>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.runtime = ManagedRuntime.make(
			Layer.merge(SQLiteDrizzle.DefaultServices, SqliteClient.layer({ db: ctx.storage.sql })),
		);
		ctx.blockConcurrencyWhile(async () => {
			this.db = await this.runtime.runPromise(SQLiteDrizzle.make({ relations, storage: ctx.storage }));
		});
	}

	private exec<A>(effect: Effect.Effect<A, unknown, any>): Promise<A> {
		return (this.runtime.runPromise as (e: any) => Promise<A>)(
			effect.pipe(Effect.catchCause((cause) => Effect.die(Cause.pretty(cause)))),
		);
	}

	migrate1(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* db.run(sql`drop table if exists another_users`);
			yield* db.run(sql`drop table if exists users12`);
			yield* db.run(sql`drop table if exists __drizzle_migrations`);

			yield* migrate(db, migrations);

			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			const result = yield* db.select().from(usersMigratorTable);

			yield* db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' });
			const result2 = yield* db.select().from(anotherUsersMigratorTable);

			expect(result).deep.equal([{ id: 1, name: 'John', email: 'email' }]);
			expect(result2).deep.equal([{ id: 1, name: 'John', email: 'email' }]);

			yield* db.run(sql`drop table another_users`);
			yield* db.run(sql`drop table users12`);
			yield* db.run(sql`drop table __drizzle_migrations`);
		}));
	}

	insertBigIntValues(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db
				.insert(bigIntExample)
				.values({ name: 'one', bigInt: BigInt('0') })
				.run();
			yield* db
				.insert(bigIntExample)
				.values({ name: 'two', bigInt: BigInt('127') })
				.run();
			yield* db
				.insert(bigIntExample)
				.values({ name: 'three', bigInt: BigInt('32767') })
				.run();
			yield* db
				.insert(bigIntExample)
				.values({ name: 'four', bigInt: BigInt('1234567890') })
				.run();
			yield* db
				.insert(bigIntExample)
				.values({ name: 'five', bigInt: BigInt('12345678900987654321') })
				.run();

			const result = yield* db.select().from(bigIntExample).all();
			expect(result).deep.equal([
				{ id: 1, name: 'one', bigInt: BigInt('0') },
				{ id: 2, name: 'two', bigInt: BigInt('127') },
				{ id: 3, name: 'three', bigInt: BigInt('32767') },
				{ id: 4, name: 'four', bigInt: BigInt('1234567890') },
				{ id: 5, name: 'five', bigInt: BigInt('12345678900987654321') },
			]);
		}));
	}

	selectAllFields(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const now = Date.now();

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const result = yield* db.select().from(usersTable).all();
			expect(result[0]!.createdAt).instanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).lessThan(5000);
			expect(result).deep.equal([{
				id: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			}]);
		}));
	}

	selectPartial(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const result = yield* db.select({ name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([{ name: 'John' }]);
		}));
	}

	selectSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		}));
	}

	selectTypedSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db
				.select({
					name: sql<string>`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		}));
	}

	selectWithEmptyArrayInInArray(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = yield* db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(inArray(usersTable.id, []));

			expect(result).deep.equal([]);
		}));
	}

	selectWithEmptyArrayInNotInArray(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = yield* db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(notInArray(usersTable.id, []));

			expect(result).deep.equal([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
		}));
	}

	selectDistinct(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const usersDistinctTable = sqliteTable('users_distinct', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${usersDistinctTable}`);
			yield* db.run(sql`create table ${usersDistinctTable} (id integer, name text)`);

			yield* db
				.insert(usersDistinctTable)
				.values([
					{ id: 1, name: 'John' },
					{ id: 1, name: 'John' },
					{ id: 2, name: 'John' },
					{ id: 1, name: 'Jane' },
				])
				.run();
			const users = yield* db.selectDistinct().from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
				usersDistinctTable.name,
			).all();

			yield* db.run(sql`drop table ${usersDistinctTable}`);

			expect(users).deep.equal([
				{ id: 1, name: 'Jane' },
				{ id: 1, name: 'John' },
				{ id: 2, name: 'John' },
			]);
		}));
	}

	returingSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const users = yield* db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({
					name: sql`upper(${usersTable.name})`,
				})
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		}));
	}

	$defaultFunction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
			const selectedOrder = yield* db.select().from(orders);

			expect(selectedOrder).deep.equal([
				{
					id: 1,
					amount: 1,
					quantity: 1,
					region: 'Ukraine',
					product: 'random_string',
				},
			]);
		}));
	}

	deleteReturningSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db
				.delete(usersTable)
				.where(eq(usersTable.name, 'John'))
				.returning({
					name: sql`upper(${usersTable.name})`,
				})
				.all();

			expect(users).deep.equal([{ name: 'JOHN' }]);
		}));
	}

	queryCheckInsertSingleEmptyRow(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = db.insert(users).values({}).toSQL();

			expect(query).deep.equal({
				sql: 'insert into "users" ("id", "name", "state") values (null, ?, null)',
				params: ['Dan'],
			});
		}));
	}

	queryCheckInsertMultipleEmptyRow(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = db.insert(users).values([{}, {}]).toSQL();

			expect(query).deep.equal({
				sql: 'insert into "users" ("id", "name", "state") values (null, ?, null), (null, ?, null)',
				params: ['Dan', 'Dan'],
			});
		}));
	}

	insertAllDefaultsIn1Row(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const users = sqliteTable('empty_insert_single', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`);

			yield* db.insert(users).values({}).run();

			const res = yield* db.select().from(users).all();

			expect(res).deep.equal([{ id: 1, name: 'Dan', state: null }]);
		}));
	}

	insertAllDefaultsInMultipleRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const users = sqliteTable('empty_insert_multiple', {
				id: integer('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(sql`create table ${users} (id integer primary key, name text default 'Dan', state text)`);

			yield* db.insert(users).values([{}, {}]).run();

			const res = yield* db.select().from(users).all();

			expect(res).deep.equal([
				{ id: 1, name: 'Dan', state: null },
				{ id: 2, name: 'Dan', state: null },
			]);
		}));
	}

	updateReturningSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db
				.update(usersTable)
				.set({ name: 'Jane' })
				.where(eq(usersTable.name, 'John'))
				.returning({
					name: sql`upper(${usersTable.name})`,
				})
				.all();

			expect(users).deep.equal([{ name: 'JANE' }]);
		}));
	}

	insertWithAutoIncrement(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'George' }, { name: 'Austin' }])
				.run();
			const result = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Jane' },
				{ id: 3, name: 'George' },
				{ id: 4, name: 'Austin' },
			]);
		}));
	}

	insertDataWithDefaultValues(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const result = yield* db.select().from(usersTable).all();

			expect(result).deep.equal([{
				id: 1,
				name: 'John',
				verified: false,
				json: null,
				createdAt: result[0]!.createdAt,
			}]);
		}));
	}

	insertDataWithOverridenDefaultValues(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John', verified: true }).run();
			const result = yield* db.select().from(usersTable).all();

			expect(result).deep.equal([{ id: 1, name: 'John', verified: true, json: null, createdAt: result[0]!.createdAt }]);
		}));
	}

	updateWithReturningFields(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const now = Date.now();

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning()
				.all();

			expect(users[0]!.createdAt).instanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).lessThan(5000);
			expect(users).deep.equal([{ id: 1, name: 'Jane', verified: false, json: null, createdAt: users[0]!.createdAt }]);
		}));
	}

	updateWithReturningPartial(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db
				.update(usersTable)
				.set({ name: 'Jane' })
				.where(eq(usersTable.name, 'John'))
				.returning({
					id: usersTable.id,
					name: usersTable.name,
				})
				.all();

			expect(users).deep.equal([{ id: 1, name: 'Jane' }]);
		}));
	}

	updateWithReturningAllFields(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const now = Date.now();

			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

			expect(users[0]!.createdAt).instanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).lessThan(5000);
			expect(users).deep.equal([{ id: 1, name: 'John', verified: false, json: null, createdAt: users[0]!.createdAt }]);
		}));
	}

	deleteWithReturningPartial(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const users = yield* db
				.delete(usersTable)
				.where(eq(usersTable.name, 'John'))
				.returning({
					id: usersTable.id,
					name: usersTable.name,
				})
				.all();

			expect(users).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	insertAndSelect(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const result = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);

			yield* db.insert(usersTable).values({ name: 'Jane' }).run();
			const result2 = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result2).deep.equal([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Jane' },
			]);
		}));
	}

	jsonInsert(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values({ name: 'John', json: ['foo', 'bar'] })
				.run();
			const result = yield* db
				.select({
					id: usersTable.id,
					name: usersTable.name,
					json: usersTable.json,
				})
				.from(usersTable)
				.all();

			expect(result).deep.equal([{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
		}));
	}

	insertMany(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Bruce', json: ['foo', 'bar'] }, { name: 'Jane' }, {
					name: 'Austin',
					verified: true,
				}])
				.run();
			const result = yield* db
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
		}));
	}

	insertManyWithReturning(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const result = yield* db
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
		}));
	}

	partialJoinWithAlias(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const customerAlias = alias(usersTable, 'customer');

			yield* db.insert(usersTable).values([
				{ id: 10, name: 'Ivan' },
				{ id: 11, name: 'Hans' },
			]);

			const result = yield* db
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
		}));
	}

	fullJoinWithAlias(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${users}`);
			yield* db.run(sql`create table ${users} (id integer primary key, name text not null)`);

			const customers = alias(users, 'customer');

			yield* db
				.insert(users)
				.values([
					{ id: 10, name: 'Ivan' },
					{ id: 11, name: 'Hans' },
				])
				.run();
			const result = yield* db.select().from(users).leftJoin(customers, eq(customers.id, 11)).where(eq(users.id, 10))
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

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	selectFromAlias(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${users}`);
			yield* db.run(sql`create table ${users} (id integer primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			yield* db
				.insert(users)
				.values([
					{ id: 10, name: 'Ivan' },
					{ id: 11, name: 'Hans' },
				])
				.run();
			const result = yield* db.select().from(user).leftJoin(customers, eq(customers.id, 11)).where(eq(user.id, 10))
				.all();

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

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	insertWithSpaces(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values({ name: sql`'Jo   h     n'` })
				.run();
			const result = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

			expect(result).deep.equal([{ id: 1, name: 'Jo   h     n' }]);
		}));
	}

	preparedStatement(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const statement = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).prepare();
			const result = yield* statement.all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	preparedStatementReuse(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const stmt = db
				.insert(usersTable)
				.values({ name: sql.placeholder('name') })
				.prepare();

			for (let i = 0; i < 10; i++) {
				yield* stmt.run({ name: `John ${i}` });
			}

			const result = yield* db
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
		}));
	}

	insertPlaceholdersOnColumnsWithEncoder(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const stmt = db
				.insert(usersTable)
				.values({
					name: 'John',
					verified: sql.placeholder('verified'),
				})
				.prepare();

			yield* stmt.run({ verified: true });
			yield* stmt.run({ verified: false });

			const result = yield* db
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
		}));
	}

	preparedStatementWithPlaceholderInWhere(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.prepare();
			const result = yield* stmt.all({ id: 1 });

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	preparedStatementWithPlaceholderInLimit(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ name: 'John' }).run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.limit(sql.placeholder('limit'))
				.prepare();

			const result = yield* stmt.all({ id: 1, limit: 1 });

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
			expect(result).length(1);
		}));
	}

	preparedStatementWithPlaceholderInOffset(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'John1' }])
				.run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.limit(sql.placeholder('limit'))
				.offset(sql.placeholder('offset'))
				.prepare();

			const result = yield* stmt.all({ limit: 1, offset: 1 });

			expect(result).deep.equal([{ id: 2, name: 'John1' }]);
		}));
	}

	preparedStatementBuiltUsing$dynamic(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			function withLimitOffset(qb: any) {
				return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
			}

			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'John1' }])
				.run();
			const stmt = db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.$dynamic();
			withLimitOffset(stmt).prepare('stmt_limit');

			const result = yield* stmt.all({ limit: 1, offset: 1 });

			expect(result).deep.equal([{ id: 2, name: 'John1' }]);
			expect(result).length(1);
		}));
	}

	selectWithGroupByAsField(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = yield* db.select({ name: usersTable.name }).from(usersTable).groupBy(usersTable.name).all();

			expect(result).deep.equal([{ name: 'Jane' }, { name: 'John' }]);
		}));
	}

	selectWithExists(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const user = alias(usersTable, 'user');
			const result = yield* db
				.select({ name: usersTable.name })
				.from(usersTable)
				.where(
					exists(
						db
							.select({ one: sql`1` })
							.from(user)
							.where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id))),
					),
				)
				.all();

			expect(result).deep.equal([{ name: 'John' }]);
		}));
	}

	selectWithGroupByAsSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = yield* db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(sql`${usersTable.name}`)
				.all();

			expect(result).deep.equal([{ name: 'Jane' }, { name: 'John' }]);
		}));
	}

	selectWithGroupByAsSqlPlusColumn(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = yield* db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(sql`${usersTable.name}`, usersTable.id)
				.all();

			expect(result).deep.equal([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		}));
	}

	selectWithGroupByAsColumnPlusSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = yield* db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.all();

			expect(result).deep.equal([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		}));
	}

	selectWithGroupByComplexQuery(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }])
				.run();

			const result = yield* db
				.select({ name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.limit(1)
				.all();

			expect(result).deep.equal([{ name: 'Jane' }]);
		}));
	}

	buildQuery(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const query = db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).deep.equal({
				sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
				params: [],
			});
		}));
	}

	insertViaDbRunPlusSelectViaDbAll(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = yield* db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	insertViaDbGet(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const inserted = yield* db.get<{ id: number; name: string }>(
				sql`insert into ${usersTable} (${new Name(
					usersTable.name.name,
				)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
			);
			expect(inserted).deep.equal({ id: 1, name: 'John' });
		}));
	}

	insertViaDbRunPlusSelectViaDbGet(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = yield* db.get<{ id: number; name: string }>(
				sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
			);
			expect(result).deep.equal({ id: 1, name: 'John' });
		}));
	}

	insertViaDbGetQueryBuilder(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const inserted = yield* db.get<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
				db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
			);
			expect(inserted).deep.equal({ id: 1, name: 'John' });
		}));
	}

	joinSubquery(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(courseCategoriesTable)
				.values([{ name: 'Category 1' }, { name: 'Category 2' }, { name: 'Category 3' }, { name: 'Category 4' }])
				.run();

			yield* db
				.insert(coursesTable)
				.values([
					{ name: 'Development', categoryId: 2 },
					{ name: 'IT & Software', categoryId: 3 },
					{ name: 'Marketing', categoryId: 4 },
					{ name: 'Design', categoryId: 1 },
				])
				.run();

			const sq2 = db
				.select({
					categoryId: courseCategoriesTable.id,
					category: courseCategoriesTable.name,
					total: sql<number>`count(${courseCategoriesTable.id})`,
				})
				.from(courseCategoriesTable)
				.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
				.as('sq2');

			const res = yield* db
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
		}));
	}

	withSelect(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
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

			const result = yield* db
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
		}));
	}

	withUpdate(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const products = sqliteTable('products', {
				id: integer('id').primaryKey(),
				price: numeric('price').notNull(),
				cheap: integer('cheap', { mode: 'boolean' }).notNull().default(false),
			});

			yield* db.run(sql`drop table if exists ${products}`);
			yield* db.run(sql`
				create table ${products} (
					id integer primary key,
					price numeric not null,
					cheap integer not null default 0
				)
			`);

			yield* db
				.insert(products)
				.values([{ price: '10.99' }, { price: '25.85' }, { price: '32.99' }, { price: '2.50' }, { price: '4.59' }]);

			const averagePrice = db.$with('average_price').as(
				db
					.select({
						value: sql`avg(${products.price})`.as('value'),
					})
					.from(products),
			);

			const result = yield* db
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
		}));
	}

	withInsert(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users', {
				username: text('username').notNull(),
				admin: integer('admin', { mode: 'boolean' }).notNull(),
			});

			yield* db.run(sql`drop table if exists ${users}`);
			yield* db.run(sql`create table ${users} (username text not null, admin integer not null default 0)`);

			const userCount = db.$with('user_count').as(
				db
					.select({
						value: sql`count(*)`.as('value'),
					})
					.from(users),
			);

			const result = yield* db
				.with(userCount)
				.insert(users)
				.values([{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` }])
				.returning({
					admin: users.admin,
				});

			expect(result).deep.equal([{ admin: true }]);
		}));
	}

	withDelete(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(orders).values([
				{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
				{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
				{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
				{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
				{ region: 'US', product: 'A', amount: 30, quantity: 3 },
				{ region: 'US', product: 'A', amount: 40, quantity: 4 },
				{ region: 'US', product: 'B', amount: 40, quantity: 4 },
				{ region: 'US', product: 'B', amount: 50, quantity: 5 },
			]);

			const averageAmount = db.$with('average_amount').as(
				db
					.select({
						value: sql`avg(${orders.amount})`.as('value'),
					})
					.from(orders),
			);

			const result = yield* db
				.with(averageAmount)
				.delete(orders)
				.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
				.returning({
					id: orders.id,
				})
				.all();

			expect(result).deep.equal([{ id: 6 }, { id: 7 }, { id: 8 }]);
		}));
	}

	selectFromSubquerySql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(users2Table)
				.values([{ name: 'John' }, { name: 'Jane' }])
				.run();

			const sq = db
				.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
				.from(users2Table)
				.as('sq');

			const res = yield* db.select({ name: sq.name }).from(sq).all();

			expect(res).deep.equal([{ name: 'John modified' }, { name: 'Jane modified' }]);
		}));
	}

	selectAFieldWithoutJoiningItsTable(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).throw();
		}));
	}

	selectAllFieldsFromSubqueryWithoutAlias(): Promise<void> {
		const { db } = this;
		// oxlint-disable-next-line require-yield
		return this.exec(Effect.gen(function*() {
			const sq = db.$with('sq').as(
				db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table),
			);

			expect(() => db.select().from(sq).prepare()).throw();
		}));
	}

	selectCount(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ name: 'John' }, { name: 'Jane' }])
				.run();

			const res = yield* db
				.select({ count: sql`count(*)` })
				.from(usersTable)
				.all();

			expect(res).deep.equal([{ count: 2 }]);
		}));
	}

	having(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(citiesTable)
				.values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }])
				.run();

			yield* db
				.insert(users2Table)
				.values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				])
				.run();

			const result = yield* db
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
		}));
	}

	view(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
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

			yield* db.run(sql`create view if not exists new_yorkers as ${getViewConfig(newYorkers1).query}`);

			yield* db
				.insert(citiesTable)
				.values([{ name: 'New York' }, { name: 'Paris' }])
				.run();

			yield* db
				.insert(users2Table)
				.values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				])
				.run();

			{
				const result = yield* db.select().from(newYorkers1).all();
				expect(result).deep.equal([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = yield* db.select().from(newYorkers2).all();
				expect(result).deep.equal([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = yield* db.select().from(newYorkers3).all();
				expect(result).deep.equal([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = yield* db.select({ name: newYorkers1.name }).from(newYorkers1).all();
				expect(result).deep.equal([{ name: 'John' }, { name: 'Jane' }]);
			}

			yield* db.run(sql`drop view ${newYorkers1}`);
		}));
	}

	insertNullTimestamp(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const test = sqliteTable('test', {
				t: integer('t', { mode: 'timestamp' }),
			});

			yield* db.run(sql`create table ${test} (t timestamp)`);

			yield* db.insert(test).values({ t: null }).run();
			const res = yield* db.select().from(test).all();
			expect(res).deep.equal([{ t: null }]);

			yield* db.run(sql`drop table ${test}`);
		}));
	}

	selectFromRawSql(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			const result = yield* db
				.select({
					id: sql<number>`id`,
					name: sql<string>`name`,
				})
				.from(sql`(select 1 as id, 'John' as name) as users`)
				.all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	selectFromRawSqlWithJoins(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const result = yield* db
				.select({
					id: sql<number>`users.id`,
					name: sql<string>`users.name`.as('userName'),
					userCity: sql<string>`users.city`,
					cityName: sql<string>`cities.name`.as('cityName'),
				})
				.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
				.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`)
				.all();

			expect(result).deep.equal([{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' }]);
		}));
	}

	joinOnAliasedSqlFromSelect(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const result = yield* db
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

			expect(result).deep.equal([{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' }]);
		}));
	}

	joinOnAliasedSqlFromWithClause(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
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

			const result = yield* db
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

			expect(result).deep.equal([{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' }]);
		}));
	}

	prefixedTable(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const sqliteTable = sqliteTableCreator((name) => `myprefix_${name}`);

			const users = sqliteTable('test_prefixed_table_with_unique_name', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(
				sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
			);

			yield* db.insert(users).values({ id: 1, name: 'John' }).run();

			const result = yield* db.select().from(users).all();

			expect(result).deep.equal([{ id: 1, name: 'John' }]);

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	orderByWithAliasedColumn(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const query = db
				.select({
					test: sql`something`.as('test'),
				})
				.from(users2Table)
				.orderBy((fields) => fields.test)
				.toSQL();

			expect(query.sql).equal('select something as "test" from "users2" order by "test"');
		}));
	}

	joinSubqueryWithJoin(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const internalStaff = sqliteTable('internal_staff', {
				userId: integer('user_id').notNull(),
			});

			const customUser = sqliteTable('custom_user', {
				id: integer('id').notNull(),
			});

			const ticket = sqliteTable('ticket', {
				staffId: integer('staff_id').notNull(),
			});

			yield* db.run(sql`drop table if exists ${internalStaff}`);
			yield* db.run(sql`drop table if exists ${customUser}`);
			yield* db.run(sql`drop table if exists ${ticket}`);

			yield* db.run(sql`create table internal_staff (user_id integer not null)`);
			yield* db.run(sql`create table custom_user (id integer not null)`);
			yield* db.run(sql`create table ticket (staff_id integer not null)`);

			yield* db.insert(internalStaff).values({ userId: 1 }).run();
			yield* db.insert(customUser).values({ id: 1 }).run();
			yield* db.insert(ticket).values({ staffId: 1 }).run();

			const subq = db.select().from(internalStaff).leftJoin(customUser, eq(internalStaff.userId, customUser.id))
				.as('internal_staff');

			const mainQuery = yield* db.select().from(ticket).leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId))
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

			yield* db.run(sql`drop table ${internalStaff}`);
			yield* db.run(sql`drop table ${customUser}`);
			yield* db.run(sql`drop table ${ticket}`);
		}));
	}

	joinViewAsSubquery(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users_join_view', {
				id: integer('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			const newYorkers = sqliteView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			yield* db.run(sql`drop table if exists ${users}`);
			yield* db.run(sql`drop view if exists ${newYorkers}`);

			yield* db.run(
				sql`create table ${users} (id integer not null primary key, name text not null, city_id integer not null)`,
			);
			yield* db.run(sql`create view if not exists ${newYorkers} as ${getViewConfig(newYorkers).query}`);

			yield* db
				.insert(users)
				.values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 2 },
					{ name: 'Jack', cityId: 1 },
					{ name: 'Jill', cityId: 2 },
				])
				.run();

			const sq = db.select().from(newYorkers).as('new_yorkers_sq');

			const result = yield* db.select().from(users).leftJoin(sq, eq(users.id, sq.id)).all();

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

			yield* db.run(sql`drop view ${newYorkers}`);
			yield* db.run(sql`drop table ${users}`);
		}));
	}

	insertWithOnConflictDoNothing(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			yield* db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing().run();

			const res = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			).all();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	insertWithOnConflictDoNothinUsingCompositePk(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			yield* db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john1@example.com' }).onConflictDoNothing()
				.run();

			const res = yield* db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John', email: 'john@example.com' }]);
		}));
	}

	insertWithOnConflictDoNothingUsingTarget(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			yield* db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing({ target: usersTable.id }).run();

			const res = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			).all();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);
		}));
	}

	insertWithOnConflictDoNothingUsingCompositePkAsTarget(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			yield* db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john1@example.com' })
				.onConflictDoNothing({ target: [pkExampleTable.id, pkExampleTable.name] })
				.run();

			const res = yield* db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John', email: 'john@example.com' }]);
		}));
	}

	insertWithOnConflictDoUpdate(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values({ id: 1, name: 'John' }).run();

			yield* db
				.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
				.run();

			const res = yield* db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			).all();

			expect(res).deep.equal([{ id: 1, name: 'John1' }]);
		}));
	}

	insertWithOnConflictDoUpdateWhere(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db
				.insert(usersTable)
				.values([{ id: 1, name: 'John', verified: false }])
				.run();

			yield* db
				.insert(usersTable)
				.values({ id: 1, name: 'John1', verified: true })
				.onConflictDoUpdate({
					target: usersTable.id,
					set: { name: 'John1', verified: true },
					where: eq(usersTable.verified, false),
				})
				.run();

			const res = yield* db
				.select({ id: usersTable.id, name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.where(eq(usersTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John1', verified: true }]);
		}));
	}

	insertWithOnConflictDoUpdateUsingCompositePk(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

			yield* db
				.insert(pkExampleTable)
				.values({ id: 1, name: 'John', email: 'john@example.com' })
				.onConflictDoUpdate({ target: [pkExampleTable.id, pkExampleTable.name], set: { email: 'john1@example.com' } })
				.run();

			const res = yield* db
				.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
				.from(pkExampleTable)
				.where(eq(pkExampleTable.id, 1))
				.all();

			expect(res).deep.equal([{ id: 1, name: 'John', email: 'john1@example.com' }]);
		}));
	}

	apiCRUD(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(sql`create table ${users} (id integer primary key, name text)`);

			yield* db.insert(users).values({ id: 1, name: 'John' }).run();

			const res = yield* db.select().from(users).all();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);

			yield* db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).all();

			const res1 = yield* db.select().from(users).all();

			expect(res1).deep.equal([{ id: 1, name: 'John1' }]);

			yield* db.delete(users).where(eq(users.id, 1)).run();

			const res2 = yield* db.select().from(users).all();

			expect(res2).deep.equal([]);

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	apiInsertPlusSelectPreparePlusAsyncExecute(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(sql`create table ${users} (id integer primary key, name text)`);

			const insertStmt = db.insert(users).values({ id: 1, name: 'John' }).prepare();
			yield* insertStmt.execute();

			const selectStmt = db.select().from(users).prepare();
			const res = yield* selectStmt.execute();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);

			const updateStmt = db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
			yield* updateStmt.execute();

			const res1 = yield* selectStmt.execute();

			expect(res1).deep.equal([{ id: 1, name: 'John1' }]);

			const deleteStmt = db.delete(users).where(eq(users.id, 1)).prepare();
			yield* deleteStmt.execute();

			const res2 = yield* selectStmt.execute();

			expect(res2).deep.equal([]);

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	apiInsertSelectPreparePlusSyncExecute(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(sql`create table ${users} (id integer primary key, name text)`);

			const insertStmt = db.insert(users).values({ id: 1, name: 'John' }).prepare();
			yield* insertStmt.execute();

			const selectStmt = db.select().from(users).prepare();
			const res = yield* selectStmt.execute();

			expect(res).deep.equal([{ id: 1, name: 'John' }]);

			const updateStmt = db.update(users).set({ name: 'John1' }).where(eq(users.id, 1)).prepare();
			yield* updateStmt.execute();

			const res1 = yield* selectStmt.execute();

			expect(res1).deep.equal([{ id: 1, name: 'John1' }]);

			const deleteStmt = db.delete(users).where(eq(users.id, 1)).prepare();
			yield* deleteStmt.execute();

			const res2 = yield* selectStmt.execute();

			expect(res2).deep.equal([]);

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	selectPlusGetForEmptyResult(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users', {
				id: integer('id').primaryKey(),
				name: text('name'),
			});

			yield* db.run(sql`drop table if exists ${users}`);

			yield* db.run(sql`create table ${users} (id integer primary key, name text)`);

			const res = yield* db.select().from(users).where(eq(users.id, 1)).get();

			expect(res).eq(undefined);

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	setOperationsUnionFromQueryBuilderWithSubquery(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const sq = db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable)
				.union(db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table))
				.orderBy(asc(sql`name`))
				.as('sq');

			const result = yield* db.select().from(sq).limit(5).offset(5);

			expect(result).length(5);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 7, name: 'Mary' },
				{ id: 1, name: 'New York' },
				{ id: 4, name: 'Peter' },
				{ id: 8, name: 'Sally' },
			]);

			expect(() => {
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).union(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table),
					).orderBy(asc(sql`name`)).all();
			}).throw();
		}));
	}

	setOperationsUnionAsFunction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* union(
				db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).orderBy(asc(sql`name`)).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'New York' },
			]);

			expect(() => {
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
				).orderBy(asc(sql`name`)).run();
			}).throw();
		}));
	}

	setOperationsUnionAllFromQueryBuilder(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable)
				.unionAll(db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable))
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
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).unionAll(
						db
							.select({ name: citiesTable.name, id: citiesTable.id })
							.from(citiesTable),
					).orderBy(asc(citiesTable.id)).limit(5).offset(1).run();
			}).throw();
		}));
	}

	setOperationsUnionAllAsFunction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* unionAll(
				db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).all();

			expect(result).length(3);

			expect(result).deep.equal([
				{ id: 1, name: 'New York' },
				{ id: 1, name: 'John' },
				{ id: 1, name: 'John' },
			]);

			expect(() => {
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
				).run();
			}).throw();
		}));
	}

	setOperationsIntersectFromQueryBuilder(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable)
				.intersect(
					db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(gt(citiesTable.id, 1)),
				)
				.orderBy(asc(sql`name`)).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);

			expect(() => {
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable).intersect(
						db
							.select({ id: citiesTable.id, name: citiesTable.name })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
					).orderBy(asc(sql`name`)).run();
			}).throw();
		}));
	}

	setOperationsIntersectAsFunction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* intersect(
				db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).all();

			expect(result).length(0);

			expect(result).deep.equal([]);

			expect(() => {
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
				).run();
			}).throw();
		}));
	}

	setOperationsExceptFromQueryBuilder(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* db
				.select()
				.from(citiesTable)
				.except(db.select().from(citiesTable).where(gt(citiesTable.id, 1))).all();

			expect(result).length(1);

			expect(result).deep.equal([{ id: 1, name: 'New York' }]);

			expect(() => {
				db
					.select()
					.from(citiesTable).except(
						db
							.select({ name: users2Table.name, id: users2Table.id })
							.from(citiesTable).where(gt(citiesTable.id, 1)),
					);
			}).throw();
		}));
	}

	setOperationsExceptAsFunction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* except(
				db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable),
				db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, 1)),
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
			).orderBy(asc(sql`id`)).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
			]);
			expect(() => {
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
				).orderBy(asc(sql`id`)).run();
			}).throw();
		}));
	}

	setOperationsMixedFromQueryBuilder(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const result = yield* db
				.select()
				.from(citiesTable)
				.except(({ unionAll }) =>
					unionAll(
						db.select().from(citiesTable).where(gt(citiesTable.id, 1)),
						db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
					)
				).all();

			expect(result).length(2);

			expect(result).deep.equal([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
			]);

			expect(() => {
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
					).run();
			}).throw();
		}));
	}

	setOperationsMixedAllAsFunctionWithSubquery(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* setupSetOperationTest(db);

			const sq = union(
				db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 1)),
				except(
					db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(
						gte(users2Table.id, 5),
					),
					db.select({ id: users2Table.id, name: users2Table.name }).from(users2Table).where(eq(users2Table.id, 7)),
				),
				db.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			)
				.orderBy(asc(sql`id`))
				.as('sq');

			const result = yield* db.select().from(sq).limit(4).offset(1);

			expect(result).length(4);

			expect(result).deep.equal([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 5, name: 'Ben' },
				{ id: 6, name: 'Jill' },
			]);

			expect(() => {
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
				).orderBy(asc(sql`id`)).run();
			}).throw();
		}));
	}

	aggregateFunctionCount(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const table = aggregateTable;
			yield* setupAggregateFunctionsTest(db);

			const result1 = yield* db.select({ value: count() }).from(table);
			const result2 = yield* db.select({ value: count(table.a) }).from(table);
			const result3 = yield* db.select({ value: countDistinct(table.name) }).from(table);

			expect(result1[0]?.value).eq(7);
			expect(result2[0]?.value).eq(5);
			expect(result3[0]?.value).eq(6);
		}));
	}

	aggregatFunctionAvg(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const table = aggregateTable;
			yield* setupAggregateFunctionsTest(db);

			const result1 = yield* db.select({ value: avg(table.a) }).from(table);
			const result2 = yield* db.select({ value: avg(table.nullOnly) }).from(table);
			const result3 = yield* db.select({ value: avgDistinct(table.b) }).from(table);

			expect(result1[0]?.value).eq('24');
			expect(result2[0]?.value).eq(null);
			expect(result3[0]?.value).eq('42.5');
		}));
	}

	aggregateFunctionSum(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const table = aggregateTable;
			yield* setupAggregateFunctionsTest(db);

			const result1 = yield* db.select({ value: sum(table.b) }).from(table);
			const result2 = yield* db.select({ value: sum(table.nullOnly) }).from(table);
			const result3 = yield* db.select({ value: sumDistinct(table.b) }).from(table);

			expect(result1[0]?.value).eq('200');
			expect(result2[0]?.value).eq(null);
			expect(result3[0]?.value).eq('170');
		}));
	}

	aggregateFunctionMax(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const table = aggregateTable;
			yield* setupAggregateFunctionsTest(db);

			const result1 = yield* db.select({ value: max(table.b) }).from(table);
			const result2 = yield* db.select({ value: max(table.nullOnly) }).from(table);

			expect(result1[0]?.value).eq(90);
			expect(result2[0]?.value).eq(null);
		}));
	}

	aggregateFunctionMin(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const table = aggregateTable;
			yield* setupAggregateFunctionsTest(db);

			const result1 = yield* db.select({ value: min(table.b) }).from(table);
			const result2 = yield* db.select({ value: min(table.nullOnly) }).from(table);

			expect(result1[0]?.value).eq(10);
			expect(result2[0]?.value).eq(null);
		}));
	}

	test$onUpdateFnAnd$onUpdateWorksAs$default(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.run(sql`drop table if exists ${usersOnUpdate}`);

			yield* db.run(
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

			yield* db
				.insert(usersOnUpdate)
				.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jack' }, { name: 'Jill' }])
				.run();
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			const justDates = yield* db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			const response = yield* db
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
		}));
	}

	test$onUpdateFnAnd$onUpdateWorksUpdating(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.run(sql`drop table if exists ${usersOnUpdate}`);

			yield* db.run(
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

			yield* db
				.insert(usersOnUpdate)
				.values([{ name: 'John', alwaysNull: 'this will be null after updating' }, { name: 'Jane' }, { name: 'Jack' }, {
					name: 'Jill',
				}]);
			const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

			yield* db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));
			yield* db.update(usersOnUpdate).set({ updateCounter: null }).where(eq(usersOnUpdate.id, 2));

			const justDates = yield* db.select({ updatedAt }).from(usersOnUpdate).orderBy(asc(usersOnUpdate.id));

			const response = yield* db
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
		}));
	}

	$countSeparate(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${countTestTable}`);
			yield* db.run(sql`create table ${countTestTable} (id int, name text)`);

			yield* db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = yield* db.$count(countTestTable);

			yield* db.run(sql`drop table ${countTestTable}`);

			expect(count).eq(4);
		}));
	}

	$countEmbedded(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${countTestTable}`);
			yield* db.run(sql`create table ${countTestTable} (id int, name text)`);

			yield* db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = yield* db
				.select({
					count: db.$count(countTestTable),
				})
				.from(countTestTable);

			yield* db.run(sql`drop table ${countTestTable}`);

			expect(count).deep.equal([{ count: 4 }, { count: 4 }, { count: 4 }, { count: 4 }]);
		}));
	}

	$countSeparateReuse(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${countTestTable}`);
			yield* db.run(sql`create table ${countTestTable} (id int, name text)`);

			yield* db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = db.$count(countTestTable);

			const count1 = yield* count;

			yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

			const count2 = yield* count;

			yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

			const count3 = yield* count;

			yield* db.run(sql`drop table ${countTestTable}`);

			expect(count1).eq(4);
			expect(count2).eq(5);
			expect(count3).eq(6);
		}));
	}

	$countEmbeddedReuse(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${countTestTable}`);
			yield* db.run(sql`create table ${countTestTable} (id int, name text)`);

			yield* db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = db
				.select({
					count: db.$count(countTestTable),
				})
				.from(countTestTable);

			const count1 = yield* count;

			yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

			const count2 = yield* count;

			yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

			const count3 = yield* count;

			yield* db.run(sql`drop table ${countTestTable}`);

			expect(count1).deep.equal([{ count: 4 }, { count: 4 }, { count: 4 }, { count: 4 }]);
			expect(count2).deep.equal([{ count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }]);
			expect(count3).deep.equal([{ count: 6 }, { count: 6 }, { count: 6 }, { count: 6 }, { count: 6 }, { count: 6 }]);
		}));
	}

	$countSeparateWithFilters(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${countTestTable}`);
			yield* db.run(sql`create table ${countTestTable} (id int, name text)`);

			yield* db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = yield* db.$count(countTestTable, gt(countTestTable.id, 1));

			yield* db.run(sql`drop table ${countTestTable}`);

			expect(count).deep.equal(3);
		}));
	}

	$countEmbeddedWithFilters(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const countTestTable = sqliteTable('count_test', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			yield* db.run(sql`drop table if exists ${countTestTable}`);
			yield* db.run(sql`create table ${countTestTable} (id int, name text)`);

			yield* db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = yield* db
				.select({
					count: db.$count(countTestTable, gt(countTestTable.id, 1)),
				})
				.from(countTestTable);

			yield* db.run(sql`drop table ${countTestTable}`);

			expect(count).deep.equal([{ count: 3 }, { count: 3 }, { count: 3 }, { count: 3 }]);
		}));
	}

	updateWithLimitAndOrderBy(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values([
				{ name: 'Barry', verified: false },
				{ name: 'Alan', verified: false },
				{ name: 'Carl', verified: false },
			]);

			yield* db.update(usersTable).set({ verified: true }).limit(2).orderBy(asc(usersTable.name));

			const result = yield* db
				.select({ name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.orderBy(asc(usersTable.name));

			expect(result).deep.equal([
				{ name: 'Alan', verified: true },
				{ name: 'Barry', verified: true },
				{ name: 'Carl', verified: false },
			]);
		}));
	}

	deleteWithLimitAndOrderBy(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.insert(usersTable).values([
				{ name: 'Barry', verified: false },
				{ name: 'Alan', verified: false },
				{ name: 'Carl', verified: false },
			]);

			yield* db.delete(usersTable).where(eq(usersTable.verified, false)).limit(1).orderBy(asc(usersTable.name));

			const result = yield* db
				.select({ name: usersTable.name, verified: usersTable.verified })
				.from(usersTable)
				.orderBy(asc(usersTable.name));
			expect(result).deep.equal([
				{ name: 'Barry', verified: false },
				{ name: 'Carl', verified: false },
			]);
		}));
	}

	testRqbV2SimpleFindFirstNoRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const result = yield* db.query.rqbUser.findFirst();

			expect(result).deep.equal(undefined);
		}));
	}

	testRqbV2SimpleFindFirstMultipleRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const date = new Date(120000);

			yield* db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.query.rqbUser.findFirst({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).deep.equal({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		}));
	}

	testRqbV2SimpleFindFirstWithRelation(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const date = new Date(120000);

			yield* db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			yield* db.insert(rqbPost).values([{
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

			const result = yield* db.query.rqbUser.findFirst({
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

			expect(result).deep.equal({
				id: 1,
				createdAt: date,
				name: 'First',
				posts: [{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}],
			});
		}));
	}

	testRqbV2SimpleFindFirstPlaceholders(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const date = new Date(120000);

			yield* db.insert(rqbUser).values([{
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
			}).prepare();

			const result = yield* query.execute({
				filter: 2,
			});

			expect(result).deep.equal({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		}));
	}

	testRqbV2SimpleFindManyNoRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const result = yield* db.query.rqbUser.findMany();

			expect(result).deep.equal([]);
		}));
	}

	testRqbV2SimpleFindManyMultipleRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const date = new Date(120000);

			yield* db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.query.rqbUser.findMany({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).deep.equal([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}, {
				id: 1,
				createdAt: date,
				name: 'First',
			}]);
		}));
	}

	testRqbV2SimpleFindManyWithRelation(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const date = new Date(120000);

			yield* db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			yield* db.insert(rqbPost).values([{
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

			const result = yield* db.query.rqbPost.findMany({
				with: {
					author: true,
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).deep.equal([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}]);
		}));
	}

	testRqbV2SimpleFindManyPlaceholders(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);

			const date = new Date(120000);

			yield* db.insert(rqbUser).values([{
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
			}).prepare();

			const result = yield* query.execute({
				filter: 2,
			});

			expect(result).deep.equal([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		}));
	}

	transaction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users_transactions', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});
			const products = sqliteTable('products_transactions', {
				id: integer('id').primaryKey(),
				price: integer('price').notNull(),
				stock: integer('stock').notNull(),
			});

			yield* db.run(sql`drop table if exists ${users}`);
			yield* db.run(sql`drop table if exists ${products}`);

			yield* db.run(sql`create table users_transactions (id integer not null primary key, balance integer not null)`);
			yield* db.run(
				sql`create table products_transactions (id integer not null primary key, price integer not null, stock integer not null)`,
			);

			const [user] = yield* db.insert(users).values({ balance: 100 }).returning();
			const [product] = yield* db.insert(products).values({ price: 10, stock: 10 }).returning();

			yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.update(users).set({ balance: user!.balance - product!.price }).where(eq(users.id, user!.id));
					yield* tx.update(products).set({ stock: product!.stock - 1 }).where(eq(products.id, product!.id));
				})
			);

			const result = yield* db.select().from(users);
			expect(result).deep.equal([{ id: 1, balance: 90 }]);

			yield* db.run(sql`drop table ${users}`);
			yield* db.run(sql`drop table ${products}`);
		}));
	}

	nestedTransaction(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const users = sqliteTable('users_nested_transactions', {
				id: integer('id').primaryKey(),
				balance: integer('balance').notNull(),
			});

			yield* db.run(sql`drop table if exists ${users}`);
			yield* db.run(
				sql`create table users_nested_transactions (id integer not null primary key, balance integer not null)`,
			);

			yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ balance: 100 });
					yield* tx.transaction((tx2) =>
						Effect.gen(function*() {
							yield* tx2.update(users).set({ balance: 200 });
						})
					);
				})
			);

			const result = yield* db.select().from(users);
			expect(result).deep.equal([{ id: 1, balance: 200 }]);

			yield* db.run(sql`drop table ${users}`);
		}));
	}

	testRqbV2TransactionFindFirstNoRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findFirst();
					expect(result).deep.equal(undefined);
				})
			);
		}));
	}

	testRqbV2TransactionFindFirstMultipleRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const date = new Date(120000);
			yield* db.insert(rqbUser).values([{ id: 1, createdAt: date, name: 'First' }, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findFirst({ orderBy: { id: 'desc' } });
					expect(result).deep.equal({ id: 2, createdAt: date, name: 'Second' });
				})
			);
		}));
	}

	testRqbV2TransactionFindFirstWithRelation(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const date = new Date(120000);
			yield* db.insert(rqbUser).values([{ id: 1, createdAt: date, name: 'First' }, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
			yield* db.insert(rqbPost).values([{ id: 1, userId: 1, createdAt: date, content: null }, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findFirst({
						with: { posts: { orderBy: { id: 'asc' } } },
						orderBy: { id: 'asc' },
					});
					expect(result).deep.equal({
						id: 1,
						createdAt: date,
						name: 'First',
						posts: [{ id: 1, userId: 1, createdAt: date, content: null }, {
							id: 2,
							userId: 1,
							createdAt: date,
							content: 'Has message this time',
						}],
					});
				})
			);
		}));
	}

	testRqbV2TransactionFindFirstPlaceholders(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const date = new Date(120000);
			yield* db.insert(rqbUser).values([{ id: 1, createdAt: date, name: 'First' }, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const query = db.query.rqbUser.findFirst({
						where: { id: { eq: sql.placeholder('filter') } },
						orderBy: { id: 'asc' },
					}).prepare();
					const result = yield* query.execute({ filter: 2 });
					expect(result).deep.equal({ id: 2, createdAt: date, name: 'Second' });
				})
			);
		}));
	}

	testRqbV2TransactionFindManyNoRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findMany();
					expect(result).deep.equal([]);
				})
			);
		}));
	}

	testRqbV2TransactionFindManyMultipleRows(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const date = new Date(120000);
			yield* db.insert(rqbUser).values([{ id: 1, createdAt: date, name: 'First' }, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findMany({ orderBy: { id: 'desc' } });
					expect(result).deep.equal([{ id: 2, createdAt: date, name: 'Second' }, {
						id: 1,
						createdAt: date,
						name: 'First',
					}]);
				})
			);
		}));
	}

	testRqbV2TransactionFindManyWithRelation(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const date = new Date(120000);
			yield* db.insert(rqbUser).values([{ id: 1, createdAt: date, name: 'First' }, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
			yield* db.insert(rqbPost).values([{ id: 1, userId: 1, createdAt: date, content: null }, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbPost.findMany({ with: { author: true }, orderBy: { id: 'asc' } });
					expect(result).deep.equal([{
						id: 1,
						userId: 1,
						createdAt: date,
						content: null,
						author: { id: 1, createdAt: date, name: 'First' },
					}, {
						id: 2,
						userId: 1,
						createdAt: date,
						content: 'Has message this time',
						author: { id: 1, createdAt: date, name: 'First' },
					}]);
				})
			);
		}));
	}

	testRqbV2TransactionFindManyPlaceholders(): Promise<void> {
		const { db } = this;
		return this.exec(Effect.gen(function*() {
			yield* beforeEach(db);
			const date = new Date(120000);
			yield* db.insert(rqbUser).values([{ id: 1, createdAt: date, name: 'First' }, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
			yield* db.transaction((db) =>
				Effect.gen(function*() {
					const query = db.query.rqbUser.findMany({
						where: { id: { eq: sql.placeholder('filter') } },
						orderBy: { id: 'asc' },
					}).prepare();
					const result = yield* query.execute({ filter: 2 });
					expect(result).deep.equal([{ id: 2, createdAt: date, name: 'Second' }]);
				})
			);
		}));
	}
}

const TESTS = [
	'migrate1',
	'insertBigIntValues',
	'selectAllFields',
	'selectPartial',
	'selectSql',
	'selectTypedSql',
	'selectWithEmptyArrayInInArray',
	'selectWithEmptyArrayInNotInArray',
	'selectDistinct',
	'returingSql',
	'$defaultFunction',
	'deleteReturningSql',
	'queryCheckInsertSingleEmptyRow',
	'queryCheckInsertMultipleEmptyRow',
	'insertAllDefaultsIn1Row',
	'insertAllDefaultsInMultipleRows',
	'updateReturningSql',
	'insertWithAutoIncrement',
	'insertDataWithDefaultValues',
	'insertDataWithOverridenDefaultValues',
	'updateWithReturningFields',
	'updateWithReturningPartial',
	'updateWithReturningAllFields',
	'deleteWithReturningPartial',
	'insertAndSelect',
	'jsonInsert',
	'insertMany',
	'insertManyWithReturning',
	'partialJoinWithAlias',
	'fullJoinWithAlias',
	'selectFromAlias',
	'insertWithSpaces',
	'preparedStatement',
	'preparedStatementReuse',
	'insertPlaceholdersOnColumnsWithEncoder',
	'preparedStatementWithPlaceholderInWhere',
	'preparedStatementWithPlaceholderInLimit',
	'preparedStatementWithPlaceholderInOffset',
	'preparedStatementBuiltUsing$dynamic',
	'selectWithGroupByAsField',
	'selectWithExists',
	'selectWithGroupByAsSql',
	'selectWithGroupByAsSqlPlusColumn',
	'selectWithGroupByAsColumnPlusSql',
	'selectWithGroupByComplexQuery',
	'buildQuery',
	'insertViaDbRunPlusSelectViaDbAll',
	'insertViaDbGet',
	'insertViaDbRunPlusSelectViaDbGet',
	'insertViaDbGetQueryBuilder',
	'joinSubquery',
	'withSelect',
	'withUpdate',
	'withInsert',
	'withDelete',
	'selectFromSubquerySql',
	'selectAFieldWithoutJoiningItsTable',
	'selectAllFieldsFromSubqueryWithoutAlias',
	'selectCount',
	'having',
	'view',
	'insertNullTimestamp',
	'selectFromRawSql',
	'selectFromRawSqlWithJoins',
	'joinOnAliasedSqlFromSelect',
	'joinOnAliasedSqlFromWithClause',
	'prefixedTable',
	'orderByWithAliasedColumn',
	'transaction',
	'nestedTransaction',
	'joinSubqueryWithJoin',
	'joinViewAsSubquery',
	'insertWithOnConflictDoNothing',
	'insertWithOnConflictDoNothinUsingCompositePk',
	'insertWithOnConflictDoNothingUsingTarget',
	'insertWithOnConflictDoNothingUsingCompositePkAsTarget',
	'insertWithOnConflictDoUpdate',
	'insertWithOnConflictDoUpdateWhere',
	'insertWithOnConflictDoUpdateUsingCompositePk',
	'apiCRUD',
	'apiInsertPlusSelectPreparePlusAsyncExecute',
	'apiInsertSelectPreparePlusSyncExecute',
	'selectPlusGetForEmptyResult',
	'setOperationsUnionFromQueryBuilderWithSubquery',
	'setOperationsUnionAsFunction',
	'setOperationsUnionAllFromQueryBuilder',
	'setOperationsUnionAllAsFunction',
	'setOperationsIntersectFromQueryBuilder',
	'setOperationsIntersectAsFunction',
	'setOperationsExceptFromQueryBuilder',
	'setOperationsExceptAsFunction',
	'setOperationsMixedFromQueryBuilder',
	'setOperationsMixedAllAsFunctionWithSubquery',
	'aggregateFunctionCount',
	'aggregatFunctionAvg',
	'aggregateFunctionSum',
	'aggregateFunctionMax',
	'aggregateFunctionMin',
	'test$onUpdateFnAnd$onUpdateWorksAs$default',
	'test$onUpdateFnAnd$onUpdateWorksUpdating',
	'$countSeparate',
	'$countEmbedded',
	'$countSeparateReuse',
	'$countEmbeddedReuse',
	'$countSeparateWithFilters',
	'$countEmbeddedWithFilters',
	'updateWithLimitAndOrderBy',
	'deleteWithLimitAndOrderBy',
	'testRqbV2SimpleFindFirstNoRows',
	'testRqbV2SimpleFindFirstMultipleRows',
	'testRqbV2SimpleFindFirstWithRelation',
	'testRqbV2SimpleFindFirstPlaceholders',
	'testRqbV2SimpleFindManyNoRows',
	'testRqbV2SimpleFindManyMultipleRows',
	'testRqbV2SimpleFindManyWithRelation',
	'testRqbV2SimpleFindManyPlaceholders',
	'testRqbV2TransactionFindFirstNoRows',
	'testRqbV2TransactionFindFirstMultipleRows',
	'testRqbV2TransactionFindFirstWithRelation',
	'testRqbV2TransactionFindFirstPlaceholders',
	'testRqbV2TransactionFindManyNoRows',
	'testRqbV2TransactionFindManyMultipleRows',
	'testRqbV2TransactionFindManyWithRelation',
	'testRqbV2TransactionFindManyPlaceholders',
] as const;

export default {
	async fetch(_request, env): Promise<Response> {
		const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName('durable-object');
		const stub = env.MY_DURABLE_OBJECT.get(id);

		const lines: string[] = [];
		let failed = 0;
		for (const name of TESTS) {
			try {
				await (stub as any)[name]();
				lines.push(`✓ ${name}`);
			} catch (error: any) {
				failed++;
				const msg = String(error?.message ?? error).split('\n')[0];
				lines.push(`✗ ${name}: ${msg}`);
			}
		}

		const body = `${failed === 0 ? 'OK' : `${failed}/${TESTS.length} FAILED`}\n\n${lines.join('\n')}`;
		return new Response(body, { status: failed === 0 ? 200 : 500 });
	},
} satisfies ExportedHandler<Env>;
