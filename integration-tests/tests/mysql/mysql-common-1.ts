/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { and, asc, eq, exists, inArray, notInArray, sql } from 'drizzle-orm';
import {
	alias,
	boolean,
	date,
	datetime,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	serial,
	text,
	time,
	timestamp,
	year,
} from 'drizzle-orm/mysql-core';
import { expect } from 'vitest';
import { toLocalDate } from '~/utils';
import type { Test } from './instrumentation';
import { createUserTable } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test.concurrent('select all fields', async ({ db, push, seed }) => {
		const users = createUserTable('users_1');

		await push({ users });
		await db.insert(users).values({ id: 1, name: 'Agripina', createdAt: new Date() });

		const result = await db.select().from(users);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'Agripina',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
	});

	test.concurrent('select sql', async ({ db, push, seed }) => {
		const users = mysqlTable('users_2', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: json('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { mode: 'date', fsp: 2 }).notNull().defaultNow(),
		});

		await push({ users });
		await seed({ users }, () => ({ users: { count: 1 } }));

		const result = await db.select({
			name: sql`upper(${users.name})`,
		}).from(users);

		expect(result).toStrictEqual([{ name: 'AGRIPINA' }]);
	});

	test.concurrent('select typed sql', async ({ db, push, seed }) => {
		const users = mysqlTable('users_3', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: json('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { mode: 'date', fsp: 2 }).notNull().defaultNow(),
		});

		await push({ users });
		await seed({ users }, () => ({ users: { count: 1 } }));

		const result = await db.select({
			name: sql<string>`upper(${users.name})`,
		}).from(users);

		expect(result).toEqual([{ name: 'AGRIPINA' }]);
	});

	test.concurrent('select with empty array in inArray', async ({ db, push, seed }) => {
		const users = mysqlTable('users_4', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: json('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { mode: 'date', fsp: 2 }).notNull().defaultNow(),
		});

		await push({ users });
		await seed({ users }, () => ({ users: { count: 3 } }));

		const result = await db
			.select({
				name: sql`upper(${users.name})`,
			})
			.from(users)
			.where(inArray(users.id, []));

		expect(result).toEqual([]);
	});

	test.concurrent('select with empty array in notInArray', async ({ db, push, seed }) => {
		const users = createUserTable('users_5');
		await push({ users });
		await seed({ users }, () => ({ users: { count: 3 } }));

		const result = await db
			.select({
				name: sql`upper(${users.name})`,
			})
			.from(users)
			.where(notInArray(users.id, []));

		expect(result).toEqual([{ name: 'AGRIPINA' }, { name: 'CANDY' }, { name: 'ILSE' }]);
	});

	test.concurrent('select distinct', async ({ db, push, seed }) => {
		const users = mysqlTable('users_6', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});
		await push({ users });
		await seed(
			{ users },
			(funcs: any) => ({
				users: { count: 3, columns: { id: funcs.valuesFromArray({ values: [1, 1, 2], isUnique: true }) } },
			}),
		);

		const result = await db.selectDistinct().from(users).orderBy(
			users.id,
			users.name,
		);
		expect(result).toEqual([{ id: 1, name: 'Candy' }, { id: 1, name: 'Ilse' }, { id: 2, name: 'Agripina' }]);
	});

	test.concurrent('select with group by as field', async ({ db, push, seed }) => {
		const users = createUserTable('users_7');
		await push({ users });
		await seed({ users }, (funcs: any) => ({
			users: {
				count: 3,
				columns: { name: funcs.valuesFromArray({ values: ['John', 'John', 'Jane'], isUnique: true }) },
			},
		}));

		const result = await db.select({ name: users.name }).from(users)
			.groupBy(users.name).orderBy(users.name);

		expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
	});

	test.concurrent('select with exists', async ({ db, push, seed }) => {
		const users = createUserTable('users_8');
		const user = alias(users, 'user');

		await push({ users });
		await seed({ users }, () => ({ users: { count: 3 } }));

		const result = await db.select({ name: users.name }).from(users).where(
			exists(
				db.select({ one: sql`1` }).from(user).where(and(eq(users.name, 'Candy'), eq(user.id, users.id))),
			),
		);

		expect(result).toEqual([{ name: 'Candy' }]);
	});

	test.concurrent('select with group by as sql', async ({ db, push, seed }) => {
		const users = createUserTable('users_9');
		await push({ users });
		await seed({ users }, (funcs: any) => ({
			users: {
				columns: { name: funcs.valuesFromArray({ values: ['John', 'John', 'Jane'] }) },
			},
		}));

		const result = await db.select({ name: users.name }).from(users)
			.groupBy(sql`${users.name}`);

		expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
	});

	test.concurrent('select with group by as sql + column', async ({ db, push, seed }) => {
		const users = createUserTable('users_10');
		await push({ users });
		await seed({ users }, () => ({ users: { count: 3 } }));

		const result = await db.select({ name: users.name }).from(users)
			.groupBy(sql`${users.name}`, users.id);

		expect(result).toEqual([{ name: 'Agripina' }, { name: 'Candy' }, { name: 'Ilse' }]);
	});

	test.concurrent('select with group by as column + sql', async ({ db, push, seed }) => {
		const users = createUserTable('users_11');
		await push({ users });
		await seed({ users }, () => ({ users: { count: 3 } }));

		const result = await db.select({ name: users.name }).from(users)
			.groupBy(users.id, sql`${users.name}`);

		expect(result).toEqual([{ name: 'Agripina' }, { name: 'Candy' }, { name: 'Ilse' }]);
	});

	test.concurrent('select with group by complex query', async ({ db, push, seed }) => {
		const users = createUserTable('users_12');
		await push({ users });
		await seed({ users }, (funcs: any) => ({
			users: {
				count: 3,
				columns: { name: funcs.valuesFromArray({ values: ['John', 'Jane', 'Jane'], isUnique: true }) },
			},
		}));

		const result = await db.select({ name: users.name }).from(users)
			.groupBy(users.id, sql`${users.name}`)
			.orderBy(asc(users.name))
			.limit(1);

		expect(result).toEqual([{ name: 'Jane' }]);
	});

	test.concurrent('partial join with alias', async ({ db, push, seed }) => {
		const users = createUserTable('users_13');
		await push({ users });
		await seed({ users }, () => ({ users: { count: 2 } }));

		const customerAlias = alias(users, 'customer');
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
			.leftJoin(customerAlias, eq(customerAlias.id, 2))
			.where(eq(users.id, 1));

		expect(result).toEqual([{
			user: { id: 1, name: 'Agripina' },
			customer: { id: 2, name: 'Candy' },
		}]);
	});

	test.concurrent('prepared statement', async ({ db, push, seed }) => {
		const users = createUserTable('users_14');

		await push({ users });
		await seed({ users }, () => ({ users: { count: 1 } }));

		const statement = db.select({
			id: users.id,
			name: users.name,
		}).from(users)
			.prepare();
		const result = await statement.execute();

		expect(result).toEqual([{ id: 1, name: 'Agripina' }]);
	});

	test.concurrent('prepared statement with placeholder in .where', async ({ db, push, seed }) => {
		const users = createUserTable('users_15');

		await push({ users });
		await seed({ users }, () => ({ users: { count: 1 } }));

		const stmt = db.select({
			id: users.id,
			name: users.name,
		}).from(users)
			.where(eq(users.id, sql.placeholder('id')))
			.prepare();
		const result = await stmt.execute({ id: 1 });

		expect(result).toEqual([{ id: 1, name: 'Agripina' }]);
	});

	test.concurrent('prepared statement with placeholder in .limit', async ({ db, push, seed }) => {
		const users = createUserTable('users_16');

		await push({ users });
		await seed({ users }, (funcs: any) => ({ users: { count: 1 } }));

		const stmt = db
			.select({
				id: users.id,
				name: users.name,
			})
			.from(users)
			.where(eq(users.id, sql.placeholder('id')))
			.limit(sql.placeholder('limit'))
			.prepare();

		const result = await stmt.execute({ id: 1, limit: 1 });

		expect(result).toEqual([{ id: 1, name: 'Agripina' }]);
		expect(result).toHaveLength(1);
	});

	test.concurrent('prepared statement with placeholder in .offset', async ({ db, push, seed }) => {
		const users = createUserTable('users_17');

		await push({ users });
		await seed({ users }, () => ({ users: { count: 3 } }));

		const stmt = db
			.select({
				id: users.id,
				name: users.name,
			})
			.from(users)
			.limit(sql.placeholder('limit'))
			.offset(sql.placeholder('offset'))
			.prepare();

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toEqual([{ id: 2, name: 'Candy' }]);
	});

	test.concurrent('prepared statement built using $dynamic', async ({ db, push, seed }) => {
		const users = createUserTable('users_18');

		await push({ users });
		await seed({ users }, (funcs: any) => ({ users: { count: 3 } }));

		function withLimitOffset(qb: any) {
			return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
		}

		const stmt = db
			.select({
				id: users.id,
				name: users.name,
			})
			.from(users)
			.$dynamic();
		withLimitOffset(stmt).prepare('stmt_limit');

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toEqual([{ id: 2, name: 'Candy' }]);
	});

	test.concurrent('insert + select all possible dates', async ({ db, push }) => {
		const datesTable = mysqlTable('datestable_1', {
			date: date('date'),
			dateAsString: date('date_as_string', { mode: 'string' }),
			time: time('time', { fsp: 1 }),
			datetime: datetime('datetime', { fsp: 2 }),
			datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
			timestamp: timestamp('timestamp', { fsp: 3 }),
			timestampAsString: timestamp('timestamp_as_string', { fsp: 3, mode: 'string' }),
			year: year('year'),
		});

		await push({ datesTable });

		const testDate = new Date('2022-11-11');
		const testDateWithMilliseconds = new Date('2022-11-11 12:12:12.123');

		await db.insert(datesTable).values({
			date: testDate,
			dateAsString: '2022-11-11',
			time: '12:12:12',
			datetime: testDate,
			year: 22,
			datetimeAsString: '2022-11-11 12:12:12',
			timestamp: testDateWithMilliseconds,
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
			time: '12:12:12.0',
			datetime: new Date('2022-11-11'),
			year: 2022,
			datetimeAsString: '2022-11-11 12:12:12.00',
			timestamp: new Date('2022-11-11 12:12:12.123'),
			timestampAsString: '2022-11-11 12:12:12.123',
		}]);
	});

	test.concurrent('Mysql enum as ts enum', async ({ db, push }) => {
		enum Test {
			a = 'a',
			b = 'b',
			c = 'c',
		}

		const tableWithTsEnums = mysqlTable('enums_test_case_1', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', Test).notNull(),
			enum2: mysqlEnum('enum2', Test).default(Test.a),
			enum3: mysqlEnum('enum3', Test).notNull().default(Test.b),
		});

		await push({ tableWithTsEnums });

		await db.insert(tableWithTsEnums).values([
			{ id: 1, enum1: Test.a, enum2: Test.b, enum3: Test.c },
			{ id: 2, enum1: Test.a, enum3: Test.c },
			{ id: 3, enum1: Test.a },
		]);

		const res = await db.select().from(tableWithTsEnums);

		expect(res).toEqual([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
		]);
	});

	test.concurrent('Mysql enum test case #1', async ({ db, push }) => {
		const tableWithEnums = mysqlTable('enums_test_case_2', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
			enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
			enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
		});

		await push({ tableWithEnums });

		await db.insert(tableWithEnums).values([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a' },
		]);

		const res = await db.select().from(tableWithEnums);

		expect(res).toEqual([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
		]);
	});
}
