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
}
