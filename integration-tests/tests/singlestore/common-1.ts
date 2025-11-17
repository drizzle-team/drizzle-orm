/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { and, asc, eq, exists, inArray, Name, notInArray, placeholder, sql } from 'drizzle-orm';
import type { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';
import {
	alias,
	bigint,
	boolean,
	date,
	datetime,
	getTableConfig,
	int,
	json,
	mediumint,
	primaryKey,
	serial,
	singlestoreEnum,
	singlestoreTable,
	singlestoreTableCreator,
	/* singlestoreView, */
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	unique,
	uniqueIndex,
	vector,
	year,
} from 'drizzle-orm/singlestore-core';
import { migrate } from 'drizzle-orm/singlestore/migrator';
import { describe, expect } from 'vitest';
import { toLocalDate } from '../utils';
import type { Test } from './instrumentation';

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

const datesTable = singlestoreTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time'),
	datetime: datetime('datetime'),
	datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
	timestamp: timestamp('timestamp'),
	timestampAsString: timestamp('timestamp_as_string', { mode: 'string' }),
	year: year('year'),
});

const coursesTable = singlestoreTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: int('category_id'),
});

const courseCategoriesTable = singlestoreTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = singlestoreTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

const usersMigratorTable = singlestoreTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => [
	uniqueIndex('').on(table.name).using('btree'),
]);

export function tests(test: Test) {
	const connDict: Record<string, any> = {};

	describe('common', () => {
		test.beforeEach(async ({ db, client }) => {
			const connKey = `${client.config.user}:${client.config.password}@${client.config.host}:${client.config.port}`;
			if (connDict[connKey] === undefined) {
				connDict[connKey] = false;

				await Promise.all([
					db.execute(sql`drop table if exists userstest;`),
					db.execute(sql`drop table if exists users2;`),
					db.execute(sql`drop table if exists cities;`),
				]);
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
				]);
			}

			await Promise.all([
				db.execute(sql`truncate table userstest;`),
				db.execute(sql`truncate table users2;`),
				db.execute(sql`truncate table cities;`),
			]);
		});

		test.concurrent('table config: unsigned ints', async () => {
			const unsignedInts = singlestoreTable('cities1', {
				bigint: bigint('bigint', { mode: 'number', unsigned: true }),
				int: int('int', { unsigned: true }),
				smallint: smallint('smallint', { unsigned: true }),
				mediumint: mediumint('mediumint', { unsigned: true }),
				tinyint: tinyint('tinyint', { unsigned: true }),
			});

			const tableConfig = getTableConfig(unsignedInts);

			const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
			const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
			const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
			const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
			const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

			expect(bigintColumn.getSQLType()).toBe('bigint unsigned');
			expect(intColumn.getSQLType()).toBe('int unsigned');
			expect(smallintColumn.getSQLType()).toBe('smallint unsigned');
			expect(mediumintColumn.getSQLType()).toBe('mediumint unsigned');
			expect(tinyintColumn.getSQLType()).toBe('tinyint unsigned');
		});

		test.concurrent('table config: signed ints', async () => {
			const unsignedInts = singlestoreTable('cities1', {
				bigint: bigint('bigint', { mode: 'number' }),
				int: int('int'),
				smallint: smallint('smallint'),
				mediumint: mediumint('mediumint'),
				tinyint: tinyint('tinyint'),
			});

			const tableConfig = getTableConfig(unsignedInts);

			const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
			const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
			const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
			const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
			const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

			expect(bigintColumn.getSQLType()).toBe('bigint');
			expect(intColumn.getSQLType()).toBe('int');
			expect(smallintColumn.getSQLType()).toBe('smallint');
			expect(mediumintColumn.getSQLType()).toBe('mediumint');
			expect(tinyintColumn.getSQLType()).toBe('tinyint');
		});

		test.concurrent('table config: primary keys name', async () => {
			const table = singlestoreTable('cities', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => [primaryKey({ columns: [t.id, t.name], name: 'custom_pk' })]);

			const tableConfig = getTableConfig(table);

			expect(tableConfig.primaryKeys).toHaveLength(1);
			expect(tableConfig.primaryKeys[0]!.getName()).toBe('custom_pk');
		});

		test.concurrent('table configs: unique third param', async () => {
			const cities1Table = singlestoreTable('cities1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => [unique('custom_name').on(t.name, t.state), unique('custom_name1').on(t.name, t.state)]);

			const tableConfig = getTableConfig(cities1Table);

			expect(tableConfig.uniqueConstraints).toHaveLength(2);

			expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
			expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

			expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
			expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
		});

		test.concurrent('table configs: unique in column', async () => {
			const cities1Table = singlestoreTable('cities1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull().unique(),
				state: text('state').unique('custom'),
				field: text('field').unique('custom_field'),
			});

			const tableConfig = getTableConfig(cities1Table);

			const columnName = tableConfig.columns.find((it) => it.name === 'name');
			expect(columnName?.uniqueName).toBe(undefined);
			expect(columnName?.isUnique).toBeTruthy();

			const columnState = tableConfig.columns.find((it) => it.name === 'state');
			expect(columnState?.uniqueName).toBe('custom');
			expect(columnState?.isUnique).toBeTruthy();

			const columnField = tableConfig.columns.find((it) => it.name === 'field');
			expect(columnField?.uniqueName).toBe('custom_field');
			expect(columnField?.isUnique).toBeTruthy();
		});

		test.concurrent('select all fields', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John' });
			const result = await db.select().from(usersTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('select sql', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('select typed sql', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('select with empty array in inArray', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(inArray(usersTable.id, []))
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([]);
		});

		test.concurrent('select with empty array in notInArray', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${usersTable.name})`,
				})
				.from(usersTable)
				.where(notInArray(usersTable.id, []))
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
		});

		test.concurrent('select distinct', async ({ db }) => {
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

		test.concurrent('insert returning sql', async ({ db }) => {
			const [result, _] = await db.insert(usersTable).values({ id: 1, name: 'John' });

			expect(result.insertId).toBe(1);
		});

		test.concurrent('delete returning sql', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

			expect(users[0].affectedRows).toBe(1);
		});

		test.concurrent('update returning sql', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			expect(users[0].changedRows).toBe(1);
		});

		test.concurrent('update with returning all fields', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John' });
			const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

			expect(updatedUsers[0].changedRows).toBe(1);

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
			expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
		});

		test.concurrent('update with returning partial', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John' });
			const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			);

			expect(updatedUsers[0].changedRows).toBe(1);

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test.concurrent('delete with returning all fields', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

			expect(deletedUser[0].affectedRows).toBe(1);
		});

		test.concurrent('delete with returning partial', async ({ db }) => {
			await db.insert(usersTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

			expect(deletedUser[0].affectedRows).toBe(1);
		});

		test.concurrent('insert + select', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John' });
			const result = await db.select().from(usersTable);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

			await db.insert(usersTable).values({ id: 2, name: 'Jane' });
			const result2 = await db.select().from(usersTable).orderBy(asc(usersTable.id));
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test.concurrent('json insert', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John', jsonb: ['foo', 'bar'] });
			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
				jsonb: usersTable.jsonb,
			}).from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
		});

		test.concurrent('insert with overridden default values', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John', verified: true });
			const result = await db.select().from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('insert many', async ({ db }) => {
			await db.insert(usersTable).values([
				{ id: 1, name: 'John' },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ id: 3, name: 'Jane' },
				{ id: 4, name: 'Austin', verified: true },
			]);
			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
				jsonb: usersTable.jsonb,
				verified: usersTable.verified,
			}).from(usersTable)
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test.concurrent('insert many with returning', async ({ db }) => {
			const result = await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);

			expect(result[0].affectedRows).toBe(4);
		});

		test.concurrent('select with group by as field', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.name)
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test.concurrent('select with exists', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);

			const user = alias(usersTable, 'user');
			const result = await db.select({ name: usersTable.name }).from(usersTable).where(
				exists(
					db.select({ one: sql`1` }).from(user).where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id))),
				),
			)
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{ name: 'John' }]);
		});

		test.concurrent('select with group by as sql', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`)
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test.concurrent('$default function', async ({ db }) => {
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

		test.concurrent('$default with empty array', async ({ db }) => {
			await db.execute(sql`drop table if exists \`s_orders\``);
			await db.execute(
				sql`
                    create table \`s_orders\` (
                        \`id\` serial primary key,
                        \`region\` text default 'Ukraine',
                        \`product\` text not null
                    )
                `,
			);

			const users = singlestoreTable('s_orders', {
				id: serial('id').primaryKey(),
				region: text('region').default('Ukraine'),
				product: text('product').$defaultFn(() => 'random_string'),
			});

			await db.insert(users).values({ id: 1 });
			const selectedOrder = await db.select().from(users);

			expect(selectedOrder).toEqual([{
				id: 1,
				region: 'Ukraine',
				product: 'random_string',
			}]);
		});

		test.concurrent('select with group by as sql + column', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`, usersTable.id)
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test.concurrent('select with group by as column + sql', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test.concurrent('select with group by complex query', async ({ db }) => {
			await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }, { id: 3, name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.limit(1);

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test.concurrent('build query', async ({ db }) => {
			const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: `select \`id\`, \`name\` from \`userstest\` group by \`userstest\`.\`id\`, \`userstest\`.\`name\``,
				params: [],
			});
		});

		test.concurrent('Query check: Insert all defaults in 1 row', async ({ db }) => {
			const users = singlestoreTable('users', {
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
			const users = singlestoreTable('users', {
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

		test.concurrent('Insert all defaults in 1 row', async ({ db }) => {
			const users = singlestoreTable('empty_insert_single', {
				id: serial('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id serial primary key, name text default 'Dan', state text)`,
			);

			await db.insert(users).values({ id: 1 });

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
		});

		test.concurrent('Insert all defaults in multiple rows', async ({ db }) => {
			const users = singlestoreTable('empty_insert_multiple', {
				id: serial('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id serial primary key, name text default 'Dan', state text)`,
			);

			await db.insert(users).values([{ id: 1 }, { id: 2 }]);

			const res = await db.select().from(users).orderBy(asc(users.id));

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
		});

		test.concurrent('build query insert with onDuplicate', async ({ db }) => {
			const query = db.insert(usersTable)
				.values({ id: 1, name: 'John', jsonb: ['foo', 'bar'] })
				.onDuplicateKeyUpdate({ set: { id: 1, name: 'John1' } })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into `userstest` (`id`, `name`, `verified`, `jsonb`, `created_at`) values (?, ?, default, ?, default) on duplicate key update `id` = ?, `name` = ?',
				params: [1, 'John', '["foo","bar"]', 1, 'John1'],
			});
		});

		test.concurrent('insert with onDuplicate', async ({ db }) => {
			await db.insert(usersTable)
				.values({ id: 1, name: 'John' });

			await db.insert(usersTable)
				.values({ id: 1, name: 'John' })
				.onDuplicateKeyUpdate({ set: { name: 'John1' } });

			const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			);

			expect(res).toEqual([{ id: 1, name: 'John1' }]);
		});

		test.concurrent('insert conflict', async ({ db }) => {
			await db.insert(usersTable)
				.values({ id: 1, name: 'John' });

			await expect((async () => {
				db.insert(usersTable).values({ id: 1, name: 'John1' });
			})()).resolves.not.toThrowError();
		});

		test.concurrent('insert conflict with ignore', async ({ db }) => {
			await db.insert(usersTable)
				.values({ id: 1, name: 'John' });

			await db.insert(usersTable)
				.ignore()
				.values({ id: 1, name: 'John1' });

			const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			);

			expect(res).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('insert sql', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: sql`${'John'}` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('partial join with alias', async ({ db }) => {
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
				.where(eq(usersTable.id, 10))
				.orderBy(asc(usersTable.id));

			expect(result).toEqual([{
				user: { id: 10, name: 'Ivan' },
				customer: { id: 11, name: 'Hans' },
			}]);
		});

		test.concurrent('full join with alias', async ({ db }) => {
			const singlestoreTable = singlestoreTableCreator((name) => `prefixed_${name}`);

			const users = singlestoreTable('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select().from(users)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(users.id, 10))
				.orderBy(asc(users.id));

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

		test.concurrent('select from alias', async ({ db }) => {
			const singlestoreTable = singlestoreTableCreator((name) => `prefixed_${name}`);

			const users = singlestoreTable('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select()
				.from(user)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(user.id, 10))
				.orderBy(asc(user.id));

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

		test.concurrent('insert with spaces', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test.concurrent('prepared statement', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John' });
			const statement = db.select({
				id: usersTable.id,
				name: usersTable.name,
			}).from(usersTable)
				.prepare();
			const result = await statement.execute();

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('insert: placeholders on columns with encoder', async ({ db }) => {
			const date = new Date('2024-08-07T15:30:00Z');

			const statement = db.insert(usersTable).values({
				id: 1,
				name: 'John',
				createdAt: sql.placeholder('createdAt'),
			}).prepare();

			await statement.execute({ createdAt: date });

			const result = await db
				.select({
					id: usersTable.id,
					createdAt: usersTable.createdAt,
				})
				.from(usersTable);

			expect(result).toEqual([
				{ id: 1, createdAt: date },
			]);
		});

		test.concurrent('prepared statement reuse', async ({ db }) => {
			const stmt = db.insert(usersTable).values({
				verified: true,
				id: placeholder('id'),
				name: placeholder('name'),
			}).prepare();

			for (let i = 0; i < 10; i++) {
				await stmt.execute({ id: i + 1, name: `John ${i}` });
			}

			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
				verified: usersTable.verified,
			}).from(usersTable)
				.orderBy(asc(usersTable.id));

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

		test.concurrent('prepared statement with placeholder in .where', async ({ db }) => {
			await db.insert(usersTable).values({ id: 1, name: 'John' });
			const stmt = db.select({
				id: usersTable.id,
				name: usersTable.name,
			}).from(usersTable)
				.where(eq(usersTable.id, placeholder('id')))
				.prepare();
			const result = await stmt.execute({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('migrator', async ({ db }) => {
			await db.execute(sql`drop table if exists cities_migration`);
			await db.execute(sql`drop table if exists users_migration`);
			await db.execute(sql`drop table if exists users12`);
			await db.execute(sql`drop table if exists __drizzle_migrations`);

			await migrate(db, { migrationsFolder: './drizzle2/singlestore' });

			await db.insert(usersMigratorTable).values({ id: 1, name: 'John', email: 'email' });

			const result = await db.select().from(usersMigratorTable);

			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			await db.execute(sql`drop table cities_migration`);
			await db.execute(sql`drop table users_migration`);
			await db.execute(sql`drop table users12`);
			await db.execute(sql`drop table __drizzle_migrations`);
		});

		test.concurrent('insert via db.execute + select via db.execute', async ({ db }) => {
			await db.execute(
				sql`insert into ${usersTable} (${new Name(usersTable.id.name)},${new Name(
					usersTable.name.name,
				)}) values (1,${'John'})`,
			);

			const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
			expect(result[0]).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('insert via db.execute w/ query builder', async ({ db }) => {
			const inserted = await db.execute(
				db.insert(usersTable).values({ id: 1, name: 'John' }),
			);
			expect(inserted[0].affectedRows).toBe(1);
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
                        \`timestamp\` timestamp(6),
                        \`timestamp_as_string\` timestamp(6),
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
				timestampAsString: '2022-11-11 12:12:12.123000',
			}]);

			await db.execute(sql`drop table if exists \`datestable\``);
		});

		const tableWithEnums = singlestoreTable('enums_test_case', {
			id: serial('id').primaryKey(),
			enum1: singlestoreEnum('enum1', ['a', 'b', 'c']).notNull(),
			enum2: singlestoreEnum('enum2', ['a', 'b', 'c']).default('a'),
			enum3: singlestoreEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
		});

		test.concurrent('SingleStore enum test case #1', async ({ db }) => {
			await db.execute(sql`drop table if exists \`enums_test_case\``);

			await db.execute(sql`
                create table \`enums_test_case\` (
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

			const res = await db.select().from(tableWithEnums).orderBy(asc(tableWithEnums.id));

			await db.execute(sql`drop table \`enums_test_case\``);

			expect(res).toEqual([
				{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
				{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
				{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
			]);
		});

		test.concurrent('left join (flat object fields)', async ({ db }) => {
			await db.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane' }]);

			const res = await db.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: citiesTable.id,
				cityName: citiesTable.name,
			}).from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id))
				.orderBy(users2Table.id);

			expect(res).toEqual([
				{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
				{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
			]);
		});

		test.concurrent('left join (grouped fields)', async ({ db }) => {
			await db.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane' }]);

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
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id))
				.orderBy(asc(users2Table.id));

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

		test.concurrent('left join (all fields)', async ({ db }) => {
			await db.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane' }]);

			const res = await db.select().from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id))
				.orderBy(asc(users2Table.id));

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

		test.concurrent('join subquery', async ({ db }) => {
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
                        \`category_id\` int
                    )
                `,
			);

			await db.insert(courseCategoriesTable).values([
				{ id: 1, name: 'Category 1' },
				{ id: 2, name: 'Category 2' },
				{ id: 3, name: 'Category 3' },
				{ id: 4, name: 'Category 4' },
			]);

			await db.insert(coursesTable).values([
				{ id: 1, name: 'Development', categoryId: 2 },
				{ id: 2, name: 'IT & Software', categoryId: 3 },
				{ id: 3, name: 'Marketing', categoryId: 4 },
				{ id: 4, name: 'Design', categoryId: 1 },
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
	});
}
