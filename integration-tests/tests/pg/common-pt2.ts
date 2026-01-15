import {
	and,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	desc,
	eq,
	getColumns,
	getTableColumns,
	gt,
	gte,
	ilike,
	inArray,
	isNull,
	like,
	lt,
	max,
	min,
	not,
	or,
	sql,
	sum,
	sumDistinct,
} from 'drizzle-orm';
import {
	alias,
	bigint,
	bigserial,
	boolean,
	bytea,
	char,
	cidr,
	date,
	doublePrecision,
	except,
	getMaterializedViewConfig,
	getViewConfig,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
	pgView,
	point,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	union,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf } from 'vitest';
import type { Test } from './instrumentation';

const msDelay = 15000;

export function tests(test: Test) {
	describe('common', () => {
		test.concurrent('set operations (mixed) from query builder with subquery', async ({ db, push }) => {
			const cities2Table = pgTable('cities_1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const users2Table = pgTable('users2_1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => cities2Table.id),
			});

			await push({ cities2Table, users2Table });

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

			const sq = db
				.select()
				.from(cities2Table).where(gt(cities2Table.id, 1)).as('sq');

			const result = await db
				.select()
				.from(cities2Table).except(
					({ unionAll }) =>
						unionAll(
							db.select().from(sq),
							db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
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
									.from(cities2Table).where(gt(cities2Table.id, 1)),
								db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
							),
					);
			})()).rejects.toThrowError();
		});

		test.concurrent('set operations (mixed all) as function', async ({ db, push }) => {
			const cities2Table = pgTable('cities_2', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const users2Table = pgTable('users2_2', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => cities2Table.id),
			});

			await push({ cities2Table, users2Table });

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
					.select().from(cities2Table).where(gt(cities2Table.id, 1)),
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
						.select().from(cities2Table).where(gt(cities2Table.id, 1)),
				).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test.concurrent('aggregate function: count', async ({ db, push }) => {
			const aggregateTable = pgTable('aggregate_table_3', {
				id: serial('id').notNull(),
				name: text('name').notNull(),
				value: integer('value'),
				nullOnly: integer('null_only'),
			});

			await push({ aggregateTable });

			await db.insert(aggregateTable).values([
				{ name: 'value 1', value: 10 },
				{ name: 'value 1', value: 20 },
				{ name: 'value 2', value: 50 },
				{ name: 'value 3', value: 20 },
				{ name: 'value 4', value: 90 },
				{ name: 'value 5', value: 10 },
				{ name: 'value 6', nullOnly: null },
			]);

			const result1 = await db.select({ value: count() }).from(aggregateTable);
			const result2 = await db.select({ value: count(aggregateTable.value) }).from(aggregateTable);
			const result3 = await db.select({ value: countDistinct(aggregateTable.name) }).from(aggregateTable);

			expect(result1[0]?.value).toBe(7);
			expect(result2[0]?.value).toBe(6);
			expect(result3[0]?.value).toBe(6);
		});

		test.concurrent('aggregate function: avg', async ({ db, push }) => {
			const aggregateTable = pgTable('aggregate_table_4', {
				id: serial('id').notNull(),
				name: text('name').notNull(),
				value: integer('value'),
				nullOnly: integer('null_only'),
			});

			await push({ aggregateTable });

			await db.insert(aggregateTable).values([
				{ name: 'value 1', value: 10 },
				{ name: 'value 1', value: 20 },
				{ name: 'value 2', value: 50 },
				{ name: 'value 3', value: 20 },
				{ name: 'value 4', value: 90 },
				{ name: 'value 5', value: 10 },
				{ name: 'value 6', nullOnly: null },
			]);

			const result1 = await db.select({ value: avg(aggregateTable.value) }).from(aggregateTable);
			const result2 = await db.select({ value: avg(aggregateTable.nullOnly) }).from(aggregateTable);
			const result3 = await db.select({ value: avgDistinct(aggregateTable.value) }).from(aggregateTable);

			expect(result1[0]?.value).toBe('33.3333333333333333');
			expect(result2[0]?.value).toBeNull();
			expect(result3[0]?.value).toBe('42.5000000000000000');
		});

		test.concurrent('aggregate function: sum', async ({ db, push }) => {
			const aggregateTable = pgTable('aggregate_table_5', {
				id: serial('id').notNull(),
				name: text('name').notNull(),
				value: integer('value'),
				nullOnly: integer('null_only'),
			});

			await push({ aggregateTable });

			await db.insert(aggregateTable).values([
				{ name: 'value 1', value: 10 },
				{ name: 'value 1', value: 20 },
				{ name: 'value 2', value: 50 },
				{ name: 'value 3', value: 20 },
				{ name: 'value 4', value: 90 },
				{ name: 'value 5', value: 10 },
				{ name: 'value 6', nullOnly: null },
			]);

			const result1 = await db.select({ value: sum(aggregateTable.value) }).from(aggregateTable);
			const result2 = await db.select({ value: sum(aggregateTable.nullOnly) }).from(aggregateTable);
			const result3 = await db.select({ value: sumDistinct(aggregateTable.value) }).from(aggregateTable);

			expect(result1[0]?.value).toBe('200');
			expect(result2[0]?.value).toBeNull();
			expect(result3[0]?.value).toBe('170');
		});

		test.concurrent('aggregate function: max', async ({ db, push }) => {
			const aggregateTable = pgTable('aggregate_table_6', {
				id: serial('id').notNull(),
				name: text('name').notNull(),
				value: integer('value'),
				nullOnly: integer('null_only'),
			});

			await push({ aggregateTable });

			await db.insert(aggregateTable).values([
				{ name: 'value 1', value: 10 },
				{ name: 'value 1', value: 20 },
				{ name: 'value 2', value: 50 },
				{ name: 'value 3', value: 20 },
				{ name: 'value 4', value: 90 },
				{ name: 'value 5', value: 10 },
				{ name: 'value 6', nullOnly: null },
			]);

			const result1 = await db.select({ value: max(aggregateTable.value) }).from(aggregateTable);
			const result2 = await db.select({ value: max(aggregateTable.nullOnly) }).from(aggregateTable);

			expect(result1[0]?.value).toBe(90);
			expect(result2[0]?.value).toBeNull();
		});

		test.concurrent('aggregate function: min', async ({ db, push }) => {
			const aggregateTable = pgTable('aggregate_table_7', {
				id: serial('id').notNull(),
				name: text('name').notNull(),
				value: integer('value'),
				nullOnly: integer('null_only'),
			});

			await push({ aggregateTable });

			await db.insert(aggregateTable).values([
				{ name: 'value 1', value: 10 },
				{ name: 'value 1', value: 20 },
				{ name: 'value 2', value: 50 },
				{ name: 'value 3', value: 20 },
				{ name: 'value 4', value: 90 },
				{ name: 'value 5', value: 10 },
				{ name: 'value 6', nullOnly: null },
			]);

			const result1 = await db.select({ value: min(aggregateTable.value) }).from(aggregateTable);
			const result2 = await db.select({ value: min(aggregateTable.nullOnly) }).from(aggregateTable);

			expect(result1[0]?.value).toBe(10);
			expect(result2[0]?.value).toBeNull();
		});

		test.concurrent('array mapping and parsing', async ({ db, push }) => {
			const arrays = pgTable('arrays_tests_7', {
				id: serial('id').primaryKey(),
				tags: text('tags').array(),
				nested: text('nested').array('[][]'),
				numbers: integer('numbers').notNull().array(),
			});

			await push({ arrays });

			await db.insert(arrays).values({
				tags: ['', 'b', 'c'],
				nested: [['1', ''], ['3', '\\a']],
				numbers: [1, 2, 3],
			});

			const result = await db.select().from(arrays);

			expect(result).toEqual([{
				id: 1,
				tags: ['', 'b', 'c'],
				nested: [['1', ''], ['3', '\\a']],
				numbers: [1, 2, 3],
			}]);
		});

		test.concurrent('test $onUpdateFn and $onUpdate works as $default', async ({ db, push }) => {
			const usersOnUpdate = pgTable('users_on_update_8', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				updateCounter: integer('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
				updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 }).$onUpdate(() => new Date()),
				alwaysNull: text('always_null').$type<string | null>().$onUpdate(() => null),
			});

			await push({ usersOnUpdate });

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

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test.concurrent('test $onUpdateFn and $onUpdate works updating', async ({ db, push }) => {
			const usersOnUpdate = pgTable('users_on_update_9', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				updateCounter: integer('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
				updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 }).$onUpdate(() => new Date()),
				alwaysNull: text('always_null').$type<string | null>().$onUpdate(() => null),
			});

			await push({ usersOnUpdate });

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

			// expect(initial[0]?.updatedAt?.valueOf()).not.toBe(justDates[0]?.updatedAt?.valueOf());

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test.concurrent('test if method with sql operators', async ({ db, push }) => {
			const users = pgTable('users_106', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				age: integer('age').notNull(),
				city: text('city').notNull(),
			});

			await push({ users });

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
		});

		// MySchema tests
		test.concurrent('mySchema :: select all fields', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			const now = Date.now();

			await db.insert(users).values({ name: 'John' });
			const result = await db.select().from(users);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('mySchema :: select sql', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_10', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db.select({
				name: sql`upper(${users.name})`,
			}).from(users);

			expect(usersResult).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('mySchema :: select typed sql', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_111', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db.select({
				name: sql<string>`upper(${users.name})`,
			}).from(users);

			expect(usersResult).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('mySchema :: select distinct', async ({ db, push }) => {
			const usersDistinctTable = pgTable('users_distinct_1', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ usersDistinctTable });

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

			expect(users1).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);

			expect(users2).toHaveLength(2);
			expect(users2[0]?.id).toBe(1);
			expect(users2[1]?.id).toBe(2);

			expect(users3).toHaveLength(2);
			expect(users3[0]?.name).toBe('Jane');
			expect(users3[1]?.name).toBe('John');
		});

		test.concurrent('mySchema :: insert returning sql', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_2', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			const result = await db.insert(users).values({ name: 'John' }).returning({
				name: sql`upper(${users.name})`,
			});

			expect(result).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('mySchema :: delete returning sql', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_3', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const result = await db.delete(users).where(eq(users.name, 'John')).returning({
				name: sql`upper(${users.name})`,
			});

			expect(result).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('mySchema :: update with returning partial', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_4', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const result = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John'))
				.returning({
					id: users.id,
					name: users.name,
				});

			expect(result).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test.concurrent('mySchema :: delete with returning all fields', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_5', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			const now = Date.now();

			await db.insert(users).values({ name: 'John' });
			const result = await db.delete(users).where(eq(users.name, 'John')).returning();

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('mySchema :: insert + select', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_6', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const result = await db.select().from(users);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

			await db.insert(users).values({ name: 'Jane' });
			const result2 = await db.select().from(users);
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test.concurrent('mySchema :: insert with overridden default values', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_7', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John', verified: true });
			const result = await db.select().from(users);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('mySchema :: insert many', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_8', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			await db.insert(users).values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);
			const result = await db.select({
				id: users.id,
				name: users.name,
				jsonb: users.jsonb,
				verified: users.verified,
			}).from(users);

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test.concurrent('mySchema :: select with group by as field', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_9', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: users.name }).from(users)
				.groupBy(users.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('mySchema :: select with group by as column + sql', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_101', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: users.name }).from(users)
				.groupBy(users.id, sql`${users.name}`)
				.orderBy(users.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('mySchema :: build query', async ({ db }) => {
			const mySchema = pgSchema('mySchema_11');
			const users = mySchema.table('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const query = db.select({ id: users.id, name: users.name }).from(users)
				.groupBy(users.id, users.name)
				.toSQL();

			expect(query).toEqual({
				sql:
					'select "id", "name" from "mySchema_11"."users" group by "mySchema_11"."users"."id", "mySchema_11"."users"."name"',
				params: [],
			});
		});

		test.concurrent('mySchema :: partial join with alias', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_105', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			const customerAlias = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select({
					user: {
						id: users.id,
						name: users.name,
					},
					customer: {
						id: customerAlias.id,
						name: customerAlias.name,
					},
				}).from(users)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([{
				user: { id: 10, name: 'Ivan' },
				customer: { id: 11, name: 'Hans' },
			}]);
		});

		test.concurrent('mySchema :: insert with spaces', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_104', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: users.id, name: users.name }).from(
				users,
			);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test.concurrent('mySchema :: prepared statement with placeholder in .limit', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_103', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const stmt = db
				.select({
					id: users.id,
					name: users.name,
				})
				.from(users)
				.where(eq(users.id, sql.placeholder('id')))
				.limit(sql.placeholder('limit'))
				.prepare('mySchema_stmt_limit');

			const result = await stmt.execute({ id: 1, limit: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
			expect(result).toHaveLength(1);
		});

		test
			.concurrent(
				'mySchema :: build query insert with onConflict do update / multiple columns',
				async ({ db }) => {
					const mySchema = pgSchema('mySchema_15');
					const users = mySchema.table('users', {
						id: serial('id').primaryKey(),
						name: text('name').notNull(),
						verified: boolean('verified').notNull().default(false),
						jsonb: jsonb('jsonb').$type<string[]>(),
						createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
					});

					const query = db.insert(users)
						.values({ name: 'John', jsonb: ['foo', 'bar'] })
						.onConflictDoUpdate({ target: [users.id, users.name], set: { name: 'John1' } })
						.toSQL();

					expect(query).toEqual({
						sql:
							'insert into "mySchema_15"."users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
						params: ['John', '["foo","bar"]', 'John1'],
					});
				},
			);

		test.concurrent('mySchema :: build query insert with onConflict do nothing + target', async ({ db }) => {
			const mySchema = pgSchema('mySchema_16');
			const users = mySchema.table('users', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			const query = db.insert(users)
				.values({ name: 'John', jsonb: ['foo', 'bar'] })
				.onConflictDoNothing({ target: users.id })
				.toSQL();

			expect(query).toEqual({
				sql:
					'insert into "mySchema_16"."users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
				params: ['John', '["foo","bar"]'],
			});
		});

		test.concurrent('mySchema :: select from tables with same name from different schema using alias', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');
			const users = mySchema.table('users_99', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			const usersDefault = pgTable('users_17', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users, usersDefault });

			await db.insert(users).values({ id: 10, name: 'Ivan' });
			await db.insert(usersDefault).values({ id: 11, name: 'Hans' });

			const customerAlias = alias(usersDefault, 'customer');

			const result = await db
				.select().from(users)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(customerAlias.id, 11));

			expect(result).toEqual([{
				users_99: {
					id: 10,
					name: 'Ivan',
					verified: false,
					jsonb: null,
					createdAt: result[0]!.users_99.createdAt,
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

		test.concurrent('mySchema :: view', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');

			const users = mySchema.table('users_102', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			const cities = mySchema.table('cities_101', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users, cities });

			const newYorkers1 = mySchema.view('new_yorkers')
				.as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			const newYorkers2 = mySchema.view('new_yorkers', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

			const newYorkers3 = mySchema.view('new_yorkers', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			}).existing();

			await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

			await db.insert(cities).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users).values([
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

		test.concurrent('mySchema :: materialized view', async ({ db, push }) => {
			const mySchema = pgSchema('mySchema');

			const users = mySchema.table('users_100', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			const cities = mySchema.table('cities_100', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users, cities });

			const newYorkers1 = mySchema.materializedView('new_yorkers')
				.as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			const newYorkers2 = mySchema.materializedView('new_yorkers', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

			const newYorkers3 = mySchema.materializedView('new_yorkers', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			}).existing();

			await db.execute(sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`);

			await db.insert(cities).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users).values([
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

		test.concurrent('limit 0', async ({ db, push }) => {
			const users = pgTable('users_120', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const result = await db
				.select()
				.from(users)
				.limit(0);

			expect(result).toEqual([]);
		});

		test.concurrent('limit -1', async ({ db, push }) => {
			const users = pgTable('users_21', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const result = await db
				.select()
				.from(users)
				.limit(-1);

			expect(result.length).toBeGreaterThan(0);
		});

		test.concurrent('Object keys as column names', async ({ db, push }) => {
			// Tests the following:
			// Column with required config
			// Column with optional config without providing a value
			// Column with optional config providing a value
			// Column without config
			const users = pgTable('users_22', {
				id: bigserial({ mode: 'number' }).primaryKey(),
				firstName: varchar(),
				lastName: varchar({ length: 50 }),
				admin: boolean(),
			});

			await push({ users });

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
		});

		test.concurrent('proper json and jsonb handling', async ({ db, push }) => {
			const jsonTable = pgTable('json_table_23', {
				json: json('json').$type<{ name: string; age: number }>(),
				jsonb: jsonb('jsonb').$type<{ name: string; age: number }>(),
			});

			await push({ jsonTable });

			await db.insert(jsonTable).values({ json: { name: 'Tom', age: 75 }, jsonb: { name: 'Pete', age: 23 } });

			const result = await db.select().from(jsonTable);

			const justNames = await db.select({
				name1: sql<string>`${jsonTable.json}->>'name'`.as('name1'),
				name2: sql<string>`${jsonTable.jsonb}->>'name'`.as('name2'),
			}).from(jsonTable);

			expect(result).toStrictEqual([
				{
					json: { name: 'Tom', age: 75 },
					jsonb: { name: 'Pete', age: 23 },
				},
			]);

			expect(justNames).toStrictEqual([
				{
					name1: 'Tom',
					name2: 'Pete',
				},
			]);
		});

		test
			.concurrent(
				'set json/jsonb fields with objects and retrieve with the ->> operator',
				async ({ db, push }) => {
					const jsonTestTable_13 = pgTable('json_test_24', {
						id: serial('id').primaryKey(),
						json: json('json').notNull(),
						jsonb: jsonb('jsonb').notNull(),
					});

					await push({ jsonTestTable_13 });

					const obj = { string: 'test', number: 123 };
					const { string: testString, number: testNumber } = obj;

					await db.insert(jsonTestTable_13).values({
						json: obj,
						jsonb: obj,
					});

					const result = await db.select({
						jsonStringField: sql<string>`${jsonTestTable_13.json}->>'string'`,
						jsonNumberField: sql<string>`${jsonTestTable_13.json}->>'number'`,
						jsonbStringField: sql<string>`${jsonTestTable_13.jsonb}->>'string'`,
						jsonbNumberField: sql<string>`${jsonTestTable_13.jsonb}->>'number'`,
					}).from(jsonTestTable_13);

					expect(result).toStrictEqual([{
						jsonStringField: testString,
						jsonNumberField: String(testNumber),
						jsonbStringField: testString,
						jsonbNumberField: String(testNumber),
					}]);
				},
			);

		test
			.concurrent(
				'set json/jsonb fields with strings and retrieve with the ->> operator',
				async ({ db, push }) => {
					const jsonTestTable = pgTable('json_test_25', {
						id: serial('id').primaryKey(),
						json: json('json').notNull(),
						jsonb: jsonb('jsonb').notNull(),
					});

					await push({ jsonTestTable });

					const obj = { string: 'test', number: 123 };
					const { string: testString, number: testNumber } = obj;

					await db.insert(jsonTestTable).values({
						json: sql`${JSON.stringify(obj)}`,
						jsonb: sql`${JSON.stringify(obj)}`,
					});

					const result = await db.select({
						jsonStringField: sql<string>`${jsonTestTable.json}->>'string'`,
						jsonNumberField: sql<string>`${jsonTestTable.json}->>'number'`,
						jsonbStringField: sql<string>`${jsonTestTable.jsonb}->>'string'`,
						jsonbNumberField: sql<string>`${jsonTestTable.jsonb}->>'number'`,
					}).from(jsonTestTable);

					expect(result).toStrictEqual([{
						jsonStringField: testString,
						jsonNumberField: String(testNumber),
						jsonbStringField: testString,
						jsonbNumberField: String(testNumber),
					}]);
				},
			);

		test
			.concurrent('set json/jsonb fields with objects and retrieve with the -> operator', async ({ db, push }) => {
				const jsonTestTable = pgTable('json_test_26', {
					id: serial('id').primaryKey(),
					json: json('json').notNull(),
					jsonb: jsonb('jsonb').notNull(),
				});

				await push({ jsonTestTable });

				const obj = { string: 'test', number: 123 };
				const { string: testString, number: testNumber } = obj;

				await db.insert(jsonTestTable).values({
					json: obj,
					jsonb: obj,
				});

				const result = await db.select({
					jsonStringField: sql<string>`${jsonTestTable.json}->'string'`,
					jsonNumberField: sql<number>`${jsonTestTable.json}->'number'`,
					jsonbStringField: sql<string>`${jsonTestTable.jsonb}->'string'`,
					jsonbNumberField: sql<number>`${jsonTestTable.jsonb}->'number'`,
				}).from(jsonTestTable);

				expect(result).toStrictEqual([{
					jsonStringField: testString,
					jsonNumberField: testNumber,
					jsonbStringField: testString,
					jsonbNumberField: testNumber,
				}]);
			});

		test
			.concurrent('set json/jsonb fields with strings and retrieve with the -> operator', async ({ db, push }) => {
				const jsonTestTable = pgTable('json_test_27', {
					id: serial('id').primaryKey(),
					json: json('json').notNull(),
					jsonb: jsonb('jsonb').notNull(),
				});

				await push({ jsonTestTable });

				const obj = { string: 'test', number: 123 };
				const { string: testString, number: testNumber } = obj;

				await db.insert(jsonTestTable).values({
					json: sql`${JSON.stringify(obj)}`,
					jsonb: sql`${JSON.stringify(obj)}`,
				});

				const result = await db.select({
					jsonStringField: sql<string>`${jsonTestTable.json}->'string'`,
					jsonNumberField: sql<number>`${jsonTestTable.json}->'number'`,
					jsonbStringField: sql<string>`${jsonTestTable.jsonb}->'string'`,
					jsonbNumberField: sql<number>`${jsonTestTable.jsonb}->'number'`,
				}).from(jsonTestTable);

				expect(result).toStrictEqual([{
					jsonStringField: testString,
					jsonNumberField: testNumber,
					jsonbStringField: testString,
					jsonbNumberField: testNumber,
				}]);
			});

		test.concurrent('update ... from', async ({ db, push }) => {
			const cities2Table = pgTable('cities_28', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2Table = pgTable('users_28', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			await push({ cities2Table, users2Table });

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
				cities_28: {
					id: 2,
					name: 'Seattle',
				},
			}]);
		});

		test.concurrent('update ... from with alias', async ({ db, push }) => {
			const cities2Table = pgTable('cities_29', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2Table = pgTable('users_108', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			await push({ cities2Table, users2Table });

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

		test.concurrent('update ... from with join', async ({ db, push }) => {
			const states = pgTable('states_30', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const cities = pgTable('cities_30', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				stateId: integer('state_id').references(() => states.id),
			});
			const users = pgTable('users_30', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull().references(() => cities.id),
			});

			await push({ states, cities, users });

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
				cities_30: {
					id: 2,
					name: 'Seattle',
					stateId: 2,
				},
				states_30: {
					id: 2,
					name: 'Washington',
				},
			}]);
			expect(result2).toStrictEqual([{
				id: 3,
				name: 'Jack',
				cityId: 3,
				cities_30: {
					id: 3,
					name: 'London',
					stateId: null,
				},
				states_30: null,
			}]);
		});

		test.concurrent('insert into ... select', async ({ db, push }) => {
			const notifications = pgTable('notifications_31', {
				id: serial('id').primaryKey(),
				sentAt: timestamp('sent_at').notNull().defaultNow(),
				message: text('message').notNull(),
			});
			const users = pgTable('users_31', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const userNotications = pgTable('user_notifications_31', {
				userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
				notificationId: integer('notification_id').notNull().references(() => notifications.id, {
					onDelete: 'cascade',
				}),
			}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

			await push({ notifications, users, userNotications });

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

		test.concurrent('insert into ... select with keys in different order', async ({ db, push }) => {
			const users1 = pgTable('users1_32', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2 = pgTable('users2_32', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users1, users2 });

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

		test.concurrent('$count separate', async ({ db, push }) => {
			const countTestTable = pgTable('count_test_33', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ countTestTable });

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.$count(countTestTable);

			expect(count).toStrictEqual(4);
		});

		test.concurrent('$count embedded', async ({ db, push }) => {
			const countTestTable = pgTable('count_test_34', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ countTestTable });

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.select({
				count: db.$count(countTestTable),
			}).from(countTestTable);

			expect(count).toStrictEqual([
				{ count: 4 },
				{ count: 4 },
				{ count: 4 },
				{ count: 4 },
			]);
		});

		test.concurrent('$count separate reuse', async ({ db, push }) => {
			const countTestTable = pgTable('count_test_35', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ countTestTable });

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

			expect(count1).toStrictEqual(4);
			expect(count2).toStrictEqual(5);
			expect(count3).toStrictEqual(6);
		});

		test.concurrent('$count embedded reuse', async ({ db, push }) => {
			const countTestTable = pgTable('count_test_36', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ countTestTable });

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

		test.concurrent('$count separate with filters', async ({ db, push }) => {
			const countTestTable = pgTable('count_test_37', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ countTestTable });

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.$count(countTestTable, gt(countTestTable.id, 1));
			expect(count).toStrictEqual(3);
		});

		test.concurrent('$count embedded with filters', async ({ db, push }) => {
			const countTestTable = pgTable('count_test_38', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
			});

			await push({ countTestTable });

			await db.insert(countTestTable).values([
				{ id: 1, name: 'First' },
				{ id: 2, name: 'Second' },
				{ id: 3, name: 'Third' },
				{ id: 4, name: 'Fourth' },
			]);

			const count = await db.select({
				count: db.$count(countTestTable, gt(countTestTable.id, 1)),
			}).from(countTestTable);

			expect(count).toStrictEqual([
				{ count: 3 },
				{ count: 3 },
				{ count: 3 },
				{ count: 3 },
			]);
		});

		test.concurrent('insert multiple rows into table with generated identity column', async ({ db, push }) => {
			const identityColumnsTable = pgTable('identity_columns_table_39', {
				id: integer('id').generatedAlwaysAsIdentity(),
				id1: integer('id1').generatedByDefaultAsIdentity(),
				name: text('name').notNull(),
			});

			// not passing identity columns
			await db.execute(sql`drop table if exists ${identityColumnsTable}`);
			await push({ identityColumnsTable });

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
			await push({ identityColumnsTable });

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

			// passing all identity columns
			await db.execute(sql`drop table if exists ${identityColumnsTable}`);
			await push({ identityColumnsTable });

			result = await db.insert(identityColumnsTable).overridingSystemValue().values([
				{ name: 'John', id: 2, id1: 3 },
				{ name: 'Jane', id: 4, id1: 5 },
				{ name: 'Bob', id: 4, id1: 5 },
			]).returning();

			expect(result).toEqual([
				{ id: 2, id1: 3, name: 'John' },
				{ id: 4, id1: 5, name: 'Jane' },
				{ id: 4, id1: 5, name: 'Bob' },
			]);
		});

		test.concurrent('insert as cte', async ({ db, push }) => {
			const users = pgTable('users_40', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

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

		test.concurrent('update as cte', async ({ db, push }) => {
			const users = pgTable('users_41', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				age: integer('age').notNull(),
			});

			await push({ users });

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

		test.concurrent('delete as cte', async ({ db, push }) => {
			const users = pgTable('users_107', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

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

		// https://github.com/drizzle-team/drizzle-orm/issues/4160
		test.concurrent('delete; composition of `not` and `or`/`and`', async ({ db, push }) => {
			const users = pgTable('users_1070', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const sessions = pgTable('sessions_0', {
				id: serial('id').primaryKey(),
				userId: integer('userId').references(() => users.id, { onDelete: 'cascade' }).notNull(),
				name: text('name').notNull().default(''),
			});

			await push({ users, sessions });

			const DEFAULT_SESSION_NAME = 'Default Session';
			const BASE_SESSION_NAME = 'Base Scramble';
			const sessionId = 1;
			const userId = 1;

			await db.insert(users).values([
				{ id: userId, name: 'John' },
			]);

			await db.insert(sessions).values([
				{ id: sessionId, userId: 1, name: 'some session' },
			]);

			const query = db.delete(sessions).where(
				and(
					eq(sessions.id, sessionId),
					eq(sessions.userId, userId),
					not(
						// @ts-expect-error
						// TODO @skylotus
						or(
							eq(sessions.name, DEFAULT_SESSION_NAME),
							eq(sessions.name, BASE_SESSION_NAME),
						),
					),
				),
			);

			await query;
			const result = await db.select().from(sessions);
			expect(result).toStrictEqual([]);
		});

		test.concurrent('sql operator as cte', async ({ db, push }) => {
			const users = pgTable('users_109', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });
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

		test.concurrent('cross join', async ({ db, push }) => {
			const usersTable = pgTable('users_44', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const citiesTable = pgTable('cities_44', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable, citiesTable });

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

		test.concurrent('left join (lateral)', async ({ db, push }) => {
			const citiesTable = pgTable('cities_45', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2Table = pgTable('users2_45', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id'),
			});

			await push({ citiesTable, users2Table });

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

		test.concurrent('inner join (lateral)', async ({ db, push }) => {
			const citiesTable = pgTable('cities_46', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2Table = pgTable('users2_46', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
			});

			await push({ citiesTable, users2Table });

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

		test.concurrent('cross join (lateral)', async ({ db, push }) => {
			const citiesTable = pgTable('cities_47', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});
			const users2Table = pgTable('users2_47', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
			});

			await push({ citiesTable, users2Table });

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

		test.concurrent('column.as', async ({ db, push }) => {
			const users = pgTable('users_column_as', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => cities.id),
			});

			const cities = pgTable('cities_column_as', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const ucView = pgView('cities_users_column_as_view').as((qb) =>
				qb.select({
					userId: users.id.as('user_id'),
					cityId: cities.id.as('city_id'),
					userName: users.name.as('user_name'),
					cityName: cities.name.as('city_name'),
				}).from(users).leftJoin(cities, eq(cities.id, users.cityId))
			);

			await push({ users, cities, ucView });

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

		// https://github.com/drizzle-team/drizzle-orm/issues/5112
		// looks like casing issue
		test.skipIf(Date.now() < +new Date('2026-01-20')).concurrent('view #1', async ({ push, createDB }) => {
			const animal = pgTable('animal', (t) => ({
				id: t.text().primaryKey(),
				name: t.text().notNull(),
				caretakerId: t.text().notNull(),
			}));
			const caretaker = pgTable('caretaker', (t) => ({
				id: t.text().primaryKey(),
				caretakerName: t.text().notNull(),
			}));
			const animalWithCaretakerView = pgView('animal_with_caretaker_view').as(
				(qb) =>
					qb
						.select({
							id: animal.id,
							animalName: animal.name,
							caretakerName: caretaker.caretakerName,
						})
						.from(animal)
						.innerJoin(caretaker, eq(animal.caretakerId, caretaker.id)),
			);

			const schema = { animal, caretaker, animalWithCaretakerView };
			const db = createDB(schema);

			const sql = db.select().from(animalWithCaretakerView).toSQL().sql;
			expect(sql).toEqual('select "id", "name", "caretakerName" from "animal_with_caretaker_view";');
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4875
		test.skipIf(Date.now() < +new Date('2026-01-20'))('view #2', async ({ db }) => {
			const productionJobTable = pgTable('production_job', {
				id: text('id').primaryKey(),
				name: text('name'),
			});

			const rfidTagTable = pgTable(
				'rfid_tag',
				{
					createdAt: timestamp('created_at')
						.notNull()
						.default(sql`now()`),
					epc: text('epc').notNull(),
					locationId: text('location_id')
						.notNull(),
					id: text('id').notNull().unique().$default(() => 'abc'),
				},
			);

			const productionJobWithLocationView = pgView(
				'production_job_with_location',
			).as((qb) => {
				const productionColumns = getColumns(productionJobTable);
				const sub = qb
					.selectDistinctOn([rfidTagTable.epc])
					.from(rfidTagTable)
					.as('r');
				return qb
					.select({
						...productionColumns,
						locationId: sub.locationId,
						tagId: sub.id.as('tag_id'),
						tagCreatedAt: sub.createdAt.as('tag_created_at'),
					})
					.from(productionJobTable)
					.leftJoin(
						sub,
						and(
							eq(productionJobTable.id, sql`LTRIM(${sub.epc}, '0')`),
							sql`${sub.epc} ~ '^0?[0-9]+'`,
						),
					);
			});

			const sub = alias(productionJobWithLocationView, 'p'); // if select from "productionJobWithLocationView" (not from alias), it works as expected

			const query = db.select().from(sub);
			expect(query.toSQL().sql).toEqual(
				'select "id", "name", "location_id", "tag_id", "tag_created_at" from "production_job_with_location" as p;',
			);

			const res = await query;
			expect(res).toStrictEqual([]);
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/5049
		test('view #3', async ({ db }) => {
			const table1 = pgTable('table1', {
				id: integer(),
				name: text(),
			});

			const view1 = pgView('view1').as((qb) => qb.select().from(table1));

			const query = db.select({
				id: view1.id,
				name: view1.name,
			}).from(view1)
				.innerJoin(table1, eq(view1.id, table1.id));
			expect(query.toSQL().sql).toEqual(
				'select "view1"."id", "view1"."name" from "view1" inner join "table1" on "view1"."id" = "table1"."id"',
			);
		});

		test.concurrent('select from a many subquery', async ({ db, push }) => {
			const citiesTable = pgTable('cities_many_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: char('state', { length: 2 }),
			});

			const users2Table = pgTable('users2_many_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
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

		test.concurrent('select from a one subquery', async ({ db, push }) => {
			const citiesTable = pgTable('cities_one_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: char('state', { length: 2 }),
			});

			const users2Table = pgTable('users2_one_subquery', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
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

		// https://github.com/drizzle-team/drizzle-orm/issues/4878
		test.concurrent('.where with isNull in it', async ({ db, push }) => {
			const table = pgTable('table_where_is_null', {
				col1: boolean(),
				col2: text(),
			});

			await push({ table });
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

		test.concurrent('test $onUpdateFn and $onUpdate works with sql value', async ({ db, push }) => {
			const users = pgTable('users_on_update', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$onUpdate(() => sql`now()`),
			});

			await push({ users });

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

		test.concurrent('placeholder + sql dates', async ({ db }) => {
			const dateTable = pgTable('dates_placeholder_test', (t) => ({
				id: t.integer('id').primaryKey().notNull(),
				date: t.date('date', { mode: 'date' }).notNull(),
				dateStr: t.date('date_str', { mode: 'string' }).notNull(),
				timestamp: t.timestamp('timestamp', { mode: 'date' }).notNull(),
				timestampStr: t.timestamp('timestamp_str', { mode: 'string' }).notNull(),
			}));

			await db.execute(sql`DROP TABLE IF EXISTS ${dateTable};`);
			await db.execute(sql`CREATE TABLE ${dateTable} (
			${sql.identifier('id')} INTEGER PRIMARY KEY NOT NULL,
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

		test.concurrent('all types', async ({ db, push }) => {
			const en = pgEnum('en_48', ['enVal1', 'enVal2']);
			const allTypesTable = pgTable('all_types_48', {
				serial: serial('serial'),
				bigserial53: bigserial('bigserial53', {
					mode: 'number',
				}),
				bigserial64: bigserial('bigserial64', {
					mode: 'bigint',
				}),
				int: integer('int'),
				bigint53: bigint('bigint53', {
					mode: 'number',
				}),
				bigint64: bigint('bigint64', {
					mode: 'bigint',
				}),
				bigintString: bigint('bigint_string', {
					mode: 'string',
				}),
				bool: boolean('bool'),
				bytea: bytea('bytea'),
				char: char('char'),
				cidr: cidr('cidr'),
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
				json: json('json'),
				jsonb: jsonb('jsonb'),
				line: line('line', {
					mode: 'abc',
				}),
				lineTuple: line('line_tuple', {
					mode: 'tuple',
				}),
				macaddr: macaddr('macaddr'),
				macaddr8: macaddr8('macaddr8'),
				numeric: numeric('numeric'),
				numericNum: numeric('numeric_num', {
					mode: 'number',
				}),
				numericBig: numeric('numeric_big', {
					mode: 'bigint',
				}),
				point: point('point', {
					mode: 'xy',
				}),
				pointTuple: point('point_tuple', {
					mode: 'tuple',
				}),
				real: real('real'),
				smallint: smallint('smallint'),
				smallserial: smallserial('smallserial'),
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
				arrint: integer('arrint').array(),
				arrbigint53: bigint('arrbigint53', {
					mode: 'number',
				}).array(),
				arrbigint64: bigint('arrbigint64', {
					mode: 'bigint',
				}).array(),
				arrbigintString: bigint('arrbigint_string', {
					mode: 'string',
				}).array(),
				arrbool: boolean('arrbool').array(),
				arrbytea: bytea('arrbytea').array(),
				arrchar: char('arrchar').array(),
				arrcidr: cidr('arrcidr').array(),
				arrdate: date('arrdate', {
					mode: 'date',
				}).array(),
				arrdateStr: date('arrdate_str', {
					mode: 'string',
				}).array(),
				arrdouble: doublePrecision('arrdouble').array(),
				arrenum: en('arrenum').array(),
				arrinet: inet('arrinet').array(),
				arrinterval: interval('arrinterval').array(),
				arrjson: json('arrjson').array(),
				arrjsonb: jsonb('arrjsonb').array(),
				arrline: line('arrline', {
					mode: 'abc',
				}).array(),
				arrlineTuple: line('arrline_tuple', {
					mode: 'tuple',
				}).array(),
				arrmacaddr: macaddr('arrmacaddr').array(),
				arrmacaddr8: macaddr8('arrmacaddr8').array(),
				arrnumeric: numeric('arrnumeric').array(),
				arrnumericNum: numeric('arrnumeric_num', {
					mode: 'number',
				}).array(),
				arrnumericBig: numeric('arrnumeric_big', {
					mode: 'bigint',
				}).array(),
				arrpoint: point('arrpoint', {
					mode: 'xy',
				}).array(),
				arrpointTuple: point('arrpoint_tuple', {
					mode: 'tuple',
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
			});

			await push({ en, allTypesTable });

			await db.insert(allTypesTable).values({
				serial: 1,
				smallserial: 15,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				bigintString: '5044565289845416380',
				bigserial53: 9007199254740991,
				bigserial64: 5044565289845416380n,
				bool: true,
				bytea: Buffer.from('BYTES'),
				char: 'c',
				cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
				inet: '192.168.0.1/24',
				macaddr: '08:00:2b:01:02:03',
				macaddr8: '08:00:2b:01:02:03:04:05',
				date: new Date(1741743161623),
				dateStr: new Date(1741743161623).toISOString(),
				double: 15.35325689124218,
				enum: 'enVal1',
				int: 621,
				interval: '2 months ago',
				json: {
					str: 'strval',
					arr: ['str', 10],
				},
				jsonb: {
					str: 'strvalb',
					arr: ['strb', 11],
				},
				line: {
					a: 1,
					b: 2,
					c: 3,
				},
				lineTuple: [1, 2, 3],
				numeric: '475452353476',
				numericNum: 9007199254740991,
				numericBig: 5044565289845416380n,
				point: {
					x: 24.5,
					y: 49.6,
				},
				pointTuple: [57.2, 94.3],
				real: 1.048596,
				smallint: 10,
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
				arrbigintString: ['5044565289845416380'],
				arrbool: [true],
				arrbytea: [Buffer.from('BYTES')],
				arrchar: ['c'],
				arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
				arrinet: ['192.168.0.1/24'],
				arrmacaddr: ['08:00:2b:01:02:03'],
				arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
				arrdate: [new Date(1741743161623)],
				arrdateStr: [new Date(1741743161623).toISOString()],
				arrdouble: [15.35325689124218],
				arrenum: ['enVal1'],
				arrint: [621],
				arrinterval: ['2 months ago'],
				arrjson: [{
					str: 'strval',
					arr: ['str', 10],
				}],
				arrjsonb: [{
					str: 'strvalb',
					arr: ['strb', 11],
				}],
				arrline: [{
					a: 1,
					b: 2,
					c: 3,
				}],
				arrlineTuple: [[1, 2, 3]],
				arrnumeric: ['475452353476'],
				arrnumericNum: [9007199254740991],
				arrnumericBig: [5044565289845416380n],
				arrpoint: [{
					x: 24.5,
					y: 49.6,
				}],
				arrpointTuple: [[57.2, 94.3]],
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
			});

			const rawRes = await db.select().from(allTypesTable);

			type ExpectedType = {
				serial: number;
				bigserial53: number;
				bigserial64: bigint;
				int: number | null;
				bigint53: number | null;
				bigint64: bigint | null;
				bigintString: string | null;
				bool: boolean | null;
				bytea: Buffer | null;
				char: string | null;
				cidr: string | null;
				date: Date | null;
				dateStr: string | null;
				double: number | null;
				enum: 'enVal1' | 'enVal2' | null;
				inet: string | null;
				interval: string | null;
				json: unknown;
				jsonb: unknown;
				line: {
					a: number;
					b: number;
					c: number;
				} | null;
				lineTuple: [number, number, number] | null;
				macaddr: string | null;
				macaddr8: string | null;
				numeric: string | null;
				numericNum: number | null;
				numericBig: bigint | null;
				point: {
					x: number;
					y: number;
				} | null;
				pointTuple: [number, number] | null;
				real: number | null;
				smallint: number | null;
				smallserial: number;
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
				arrbigintString: string[] | null;
				arrbool: boolean[] | null;
				arrbytea: Buffer[] | null;
				arrchar: string[] | null;
				arrcidr: string[] | null;
				arrdate: Date[] | null;
				arrdateStr: string[] | null;
				arrdouble: number[] | null;
				arrenum: ('enVal1' | 'enVal2')[] | null;
				arrinet: string[] | null;
				arrinterval: string[] | null;
				arrjson: unknown[] | null;
				arrjsonb: unknown[] | null;
				arrline: {
					a: number;
					b: number;
					c: number;
				}[] | null;
				arrlineTuple: [number, number, number][] | null;
				arrmacaddr: string[] | null;
				arrmacaddr8: string[] | null;
				arrnumeric: string[] | null;
				arrnumericNum: number[] | null;
				arrnumericBig: bigint[] | null;
				arrpoint: { x: number; y: number }[] | null;
				arrpointTuple: [number, number][] | null;
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
			}[];

			const expectedRes: ExpectedType = [
				{
					serial: 1,
					bigserial53: 9007199254740991,
					bigserial64: 5044565289845416380n,
					int: 621,
					bigint53: 9007199254740991,
					bigint64: 5044565289845416380n,
					bigintString: '5044565289845416380',
					bool: true,
					bytea: Buffer.from('BYTES'),
					char: 'c',
					cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
					date: new Date('2025-03-12T00:00:00.000Z'),
					dateStr: '2025-03-12',
					double: 15.35325689124218,
					enum: 'enVal1',
					inet: '192.168.0.1/24',
					interval: '-2 mons',
					json: { str: 'strval', arr: ['str', 10] },
					jsonb: { arr: ['strb', 11], str: 'strvalb' },
					line: { a: 1, b: 2, c: 3 },
					lineTuple: [1, 2, 3],
					macaddr: '08:00:2b:01:02:03',
					macaddr8: '08:00:2b:01:02:03:04:05',
					numeric: '475452353476',
					numericNum: 9007199254740991,
					numericBig: 5044565289845416380n,
					point: { x: 24.5, y: 49.6 },
					pointTuple: [57.2, 94.3],
					real: 1.048596,
					smallint: 10,
					smallserial: 15,
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
					arrbigintString: ['5044565289845416380'],
					arrbool: [true],
					arrbytea: [Buffer.from('BYTES')],
					arrchar: ['c'],
					arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
					arrdate: [new Date('2025-03-12T00:00:00.000Z')],
					arrdateStr: ['2025-03-12'],
					arrdouble: [15.35325689124218],
					arrenum: ['enVal1'],
					arrinet: ['192.168.0.1/24'],
					arrinterval: ['-2 mons'],
					arrjson: [{ str: 'strval', arr: ['str', 10] }],
					arrjsonb: [{ arr: ['strb', 11], str: 'strvalb' }],
					arrline: [{ a: 1, b: 2, c: 3 }],
					arrlineTuple: [[1, 2, 3]],
					arrmacaddr: ['08:00:2b:01:02:03'],
					arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
					arrnumeric: ['475452353476'],
					arrnumericNum: [9007199254740991],
					arrnumericBig: [5044565289845416380n],
					arrpoint: [{ x: 24.5, y: 49.6 }],
					arrpointTuple: [[57.2, 94.3]],
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
				},
			];

			expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
			expect(rawRes).toStrictEqual(expectedRes);
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/3018
		test.skipIf(Date.now() < +new Date('2026-01-16')).concurrent(
			'select string from jsonb/json column',
			async ({ db, push }) => {
				const table = pgTable('table_jsonb', { col1: jsonb(), col2: json() });
				await push({ table });

				await db.insert(table).values({ col1: '10.5', col2: '10.6' });
				const res = await db.select().from(table);
				expect(res).toStrictEqual([{ col1: '10.5', col2: '10.6' }]);
			},
		);

		// https://github.com/drizzle-team/drizzle-orm/issues/5227
		test.concurrent(
			'select with bigint array in inArray',
			async ({ db, push }) => {
				const users = pgTable('users_112', {
					id: bigint('id', { mode: 'bigint' }).primaryKey(),
					name: text('name').notNull(),
				});

				await push({ users });

				await db.insert(users).values([{ id: 1n, name: 'John' }, { id: 2n, name: 'Jane' }, {
					id: 9223372036854775807n,
					name: 'Jane',
				}]);
				const result = await db
					.select({ name: users.name })
					.from(users)
					.where(inArray(users.id, [9223372036854775807n, 2n]));

				expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }]);
			},
		);
	});
}
