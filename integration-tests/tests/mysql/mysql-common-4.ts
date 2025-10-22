/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { asc, avg, avgDistinct, count, countDistinct, eq, gt, gte, max, min, sql, sum, sumDistinct } from 'drizzle-orm';
import { except, exceptAll, int, intersect, intersectAll, mysqlTable, text, union } from 'drizzle-orm/mysql-core';
import { expect } from 'vitest';

import { type Test } from './instrumentation';
import {
	aggregateTable,
	citiesTable,
	createAggregateTable,
	createCitiesTable,
	createUsers2Table,
	users2Table,
	usersMySchemaTable,
} from './schema2';

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('set operations (intersect) as function', async ({ db, push }) => {
		const cities = createCitiesTable('cities_43');
		const users2 = createUsers2Table('users2_43', cities);
		await push({ cities, users2 });

		const result = await intersect(
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).where(eq(cities.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
		).limit(1);

		expect(result).toStrictEqual([]);

		await expect((async () => {
			intersect(
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).where(eq(cities.id, 1)),
				db
					.select({ id: users2.id, name: users2.name })
					.from(users2).where(eq(users2.id, 1)),
				db
					.select({ name: users2.name, id: users2.id })
					.from(users2).where(eq(users2.id, 1)),
			).limit(1);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (intersect all) from query builder', async ({ db, push, seed }) => {
		const cities = createCitiesTable('cities_44');
		await push({ cities });

		await seed(
			{ cities },
			(funcs) => ({ cities: { count: 3, columns: { name: funcs.city() } } }),
		);

		const result = await db
			.select({ id: cities.id, name: cities.name })
			.from(cities).limit(2).intersectAll(
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).limit(2),
			).orderBy(asc(sql`id`));

		expect(result).toStrictEqual([
			{ id: 1, name: 'Hoogvliet' },
			{ id: 2, name: 'South Milwaukee' },
		]);

		await expect((async () => {
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).limit(2).intersectAll(
					db
						.select({ name: cities.name, id: cities.id })
						.from(cities).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (intersect all) as function', async ({ db, push, seed }) => {
		const cities = createCitiesTable('cities_45');
		const users2 = createUsers2Table('users2_45', cities);
		await push({ cities, users2 });

		await seed(
			{ cities, users2 },
			(funcs) => ({
				cities: { count: 3, columns: { name: funcs.city() } },
				users2: { count: 8 },
			}),
		);

		const result = await intersectAll(
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
		);

		expect(result).toStrictEqual([
			{ id: 1, name: 'Melina' },
		]);

		await expect((async () => {
			intersectAll(
				db
					.select({ name: users2.name, id: users2.id })
					.from(users2).where(eq(users2.id, 1)),
				db
					.select({ id: users2.id, name: users2.name })
					.from(users2).where(eq(users2.id, 1)),
				db
					.select({ id: users2.id, name: users2.name })
					.from(users2).where(eq(users2.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test.concurrent('set operations (except) from query builder', async ({ db, push, seed }) => {
		const cities = createCitiesTable('cities_46');
		await push({ cities });

		await seed(
			{ cities },
			(funcs) => ({ cities: { count: 3, columns: { name: funcs.city() } } }),
		);

		const result = await db
			.select()
			.from(cities).except(
				db
					.select()
					.from(cities).where(gt(cities.id, 1)),
			);

		expect(result).toStrictEqual([
			{ id: 1, name: 'Hoogvliet' },
		]);
	});

	test.concurrent('set operations (except) as function', async ({ db, push, seed }) => {
		const cities = createCitiesTable('cities_47');
		const users2 = createUsers2Table('users2_47', cities);
		await push({ cities, users2 });

		await seed(
			{ cities, users2 },
			(funcs) => ({
				cities: { count: 3, columns: { name: funcs.city() } },
				users2: { count: 8 },
			}),
		);

		const result = await except(
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities),
			db
				.select({ id: cities.id, name: cities.name })
				.from(cities).where(eq(cities.id, 1)),
			db
				.select({ id: users2.id, name: users2.name })
				.from(users2).where(eq(users2.id, 1)),
		).limit(3);

		expect(result).toStrictEqual([
			{ id: 2, name: 'South Milwaukee' },
			{ id: 3, name: 'Bou Hadjar' },
		]);

		await expect((async () => {
			except(
				db
					.select({ name: cities.name, id: cities.id })
					.from(cities),
				db
					.select({ id: cities.id, name: cities.name })
					.from(cities).where(eq(cities.id, 1)),
				db
					.select({ id: users2.id, name: users2.name })
					.from(users2).where(eq(users2.id, 1)),
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

	test.concurrent('aggregate function: count', async ({ db, push }) => {
		const aggregateTable = createAggregateTable('aggregate_table_1');

		await push({ aggregateTable });
		await db.insert(aggregateTable).values([
			{ name: 'value 1', a: 5, b: 10, c: 20 },
			{ name: 'value 1', a: 5, b: 20, c: 30 },
			{ name: 'value 2', a: 10, b: 50, c: 60 },
			{ name: 'value 3', a: 20, b: 20, c: null },
			{ name: 'value 4', a: null, b: 90, c: 120 },
			{ name: 'value 5', a: 80, b: 10, c: null },
			{ name: 'value 6', a: null, b: null, c: 150 },
		]);

		const result1 = await db.select({ value: count() }).from(aggregateTable);
		const result2 = await db.select({ value: count(aggregateTable.a) }).from(aggregateTable);
		const result3 = await db.select({ value: countDistinct(aggregateTable.name) }).from(aggregateTable);

		expect(result1[0]?.value).toBe(7);
		expect(result2[0]?.value).toBe(5);
		expect(result3[0]?.value).toBe(6);
	});

	test.concurrent('aggregate function: avg', async ({ db, push }) => {
		const aggregateTable = createAggregateTable('aggregate_table_2');

		await push({ aggregateTable });
		await db.insert(aggregateTable).values([
			{ name: 'value 1', a: 5, b: 10, c: 20 },
			{ name: 'value 1', a: 5, b: 20, c: 30 },
			{ name: 'value 2', a: 10, b: 50, c: 60 },
			{ name: 'value 3', a: 20, b: 20, c: null },
			{ name: 'value 4', a: null, b: 90, c: 120 },
			{ name: 'value 5', a: 80, b: 10, c: null },
			{ name: 'value 6', a: null, b: null, c: 150 },
		]);
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
}
