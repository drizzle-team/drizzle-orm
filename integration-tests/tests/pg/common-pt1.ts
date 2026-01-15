// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { and, asc, eq, exists, gt, inArray, lt, notInArray, sql } from 'drizzle-orm';
import {
	alias,
	boolean,
	char,
	cidr,
	inet,
	integer,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	pgTable,
	pgTableCreator,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';

export function tests(test: Test) {
	describe('common', () => {
		test.concurrent('select all fields', async ({ db, push }) => {
			const users = pgTable('users_1', {
				id: serial('id' as string).primaryKey(),
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
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test.concurrent('select sql', async ({ db, push }) => {
			const users = pgTable('users_2', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const res = await db.select({ name: sql`upper(${users.name})` }).from(users);

			expect(res).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('select typed sql', async ({ db, push }) => {
			const users = pgTable('users_3', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });

			const usersResult = await db.select({
				name: sql<string>`upper(${users.name})`,
			}).from(users);

			expect(usersResult).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('select with empty array in inArray', async ({ db, push }) => {
			const users = pgTable('users_4', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${users.name})`,
				})
				.from(users)
				.where(inArray(users.id, []));

			expect(result).toEqual([]);
		});

		test.concurrent('select with empty array in notInArray', async ({ db, push }) => {
			const users = pgTable('users_5', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			const result = await db
				.select({
					name: sql`upper(${users.name})`,
				})
				.from(users)
				.where(notInArray(users.id, []));

			expect(result).toEqual([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
		});

		test.concurrent('$default function', async ({ db, push }) => {
			const orders = pgTable('orders_1', {
				id: serial('id').primaryKey(),
				region: text('region').notNull(),
				product: text('product').notNull().$default(() => 'random_string'),
				amount: integer('amount').notNull(),
				quantity: integer('quantity').notNull(),
			});

			await push({ orders });

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

		test.concurrent('select distinct', async ({ db, push }) => {
			const usersDistinctTable = pgTable('users_distinct_101', {
				id: integer('id').notNull(),
				name: text('name').notNull(),
				age: integer('age').notNull(),
			});

			await push({ usersDistinctTable });

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

		test.concurrent('insert returning sql', async ({ db, push }) => {
			const users = pgTable('users_6', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			const usersResult = await db
				.insert(users)
				.values({ name: 'John' })
				.returning({
					name: sql`upper(${users.name})`,
				});

			expect(usersResult).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('delete returning sql', async ({ db, push }) => {
			const users = pgTable('users_7', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db
				.delete(users)
				.where(eq(users.name, 'John'))
				.returning({
					name: sql`upper(${users.name})`,
				});

			expect(usersResult).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('update returning sql', async ({ db, push }) => {
			const users = pgTable('users_8', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db
				.update(users)
				.set({ name: 'Jane' })
				.where(eq(users.name, 'John'))
				.returning({
					name: sql`upper(${users.name})`,
				});

			expect(usersResult).toEqual([{ name: 'JANE' }]);
		});

		test.concurrent('update with returning all fields', async ({ db, push }) => {
			const users = pgTable('users_9', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			const now = Date.now();

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db
				.update(users)
				.set({ name: 'Jane' })
				.where(eq(users.name, 'John'))
				.returning();

			expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(usersResult[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(usersResult).toEqual([
				{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
			]);
		});

		test.concurrent('update with returning partial', async ({ db, push }) => {
			const users = pgTable('users_10', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db
				.update(users)
				.set({ name: 'Jane' })
				.where(eq(users.name, 'John'))
				.returning({
					id: users.id,
					name: users.name,
				});

			expect(usersResult).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test.concurrent('delete with returning all fields', async ({ db, push }) => {
			const users = pgTable('users_11', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			const now = Date.now();

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db.delete(users).where(eq(users.name, 'John')).returning();

			expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(usersResult[0]!.createdAt.getTime() - now)).toBeLessThan(300);
			expect(usersResult).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
			]);
		});

		test.concurrent('delete with returning partial', async ({ db, push }) => {
			const users = pgTable('users_12', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const usersResult = await db.delete(users).where(eq(users.name, 'John')).returning({
				id: users.id,
				name: users.name,
			});

			expect(usersResult).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('insert + select', async ({ db, push }) => {
			const users = pgTable('users_13', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const result = await db.select().from(users);
			expect(result).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt },
			]);

			await db.insert(users).values({ name: 'Jane' });
			const result2 = await db.select().from(users);
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test.concurrent('json insert', async ({ db, push }) => {
			const users = pgTable('users_14', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				jsonb: jsonb('jsonb').$type<string[]>(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John', jsonb: ['foo', 'bar'] });
			const result = await db
				.select({
					id: users.id,
					name: users.name,
					jsonb: users.jsonb,
				})
				.from(users);

			expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
		});

		test.concurrent('char insert', async ({ db, push }) => {
			const cities = pgTable('cities_15', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: char('state', { length: 2 }),
			});

			await push({ cities });

			await db.insert(cities).values({ name: 'Austin', state: 'TX' });
			const result = await db
				.select({ id: cities.id, name: cities.name, state: cities.state })
				.from(cities);

			expect(result).toEqual([{ id: 1, name: 'Austin', state: 'TX' }]);
		});

		test.concurrent('char update', async ({ db, push }) => {
			const cities = pgTable('cities_16', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: char('state', { length: 2 }),
			});

			await push({ cities });

			await db.insert(cities).values({ name: 'Austin', state: 'TX' });
			await db.update(cities).set({ name: 'Atlanta', state: 'GA' }).where(eq(cities.id, 1));
			const result = await db
				.select({ id: cities.id, name: cities.name, state: cities.state })
				.from(cities);

			expect(result).toEqual([{ id: 1, name: 'Atlanta', state: 'GA' }]);
		});

		test.concurrent('char delete', async ({ db, push }) => {
			const cities = pgTable('cities_17', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: char('state', { length: 2 }),
			});

			await push({ cities });

			await db.insert(cities).values({ name: 'Austin', state: 'TX' });
			await db.delete(cities).where(eq(cities.state, 'TX'));
			const result = await db
				.select({ id: cities.id, name: cities.name, state: cities.state })
				.from(cities);

			expect(result).toEqual([]);
		});

		test.concurrent('insert with overridden default values', async ({ db, push }) => {
			const users = pgTable('users_18', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John', verified: true });
			const result = await db.select().from(users);

			expect(result).toEqual([
				{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt },
			]);
		});

		test.concurrent('insert many', async ({ db, push }) => {
			const users = pgTable('users_19', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
			});

			await push({ users });

			await db
				.insert(users)
				.values([
					{ name: 'John' },
					{ name: 'Bruce', jsonb: ['foo', 'bar'] },
					{ name: 'Jane' },
					{ name: 'Austin', verified: true },
				]);
			const result = await db
				.select({
					id: users.id,
					name: users.name,
					jsonb: users.jsonb,
					verified: users.verified,
				})
				.from(users);

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test.concurrent('insert many with returning', async ({ db, push }) => {
			const users = pgTable('users_20', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
			});

			await push({ users });

			const result = await db
				.insert(users)
				.values([
					{ name: 'John' },
					{ name: 'Bruce', jsonb: ['foo', 'bar'] },
					{ name: 'Jane' },
					{ name: 'Austin', verified: true },
				])
				.returning({
					id: users.id,
					name: users.name,
					jsonb: users.jsonb,
					verified: users.verified,
				});

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test.concurrent('select with group by as field', async ({ db, push }) => {
			const users = pgTable('users_121', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: users.name })
				.from(users)
				.groupBy(users.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('select with exists', async ({ db, push }) => {
			const users = pgTable('users_122', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const user = alias(users, 'user');
			const result = await db.select({ name: users.name }).from(users).where(
				exists(
					db.select({ one: sql`1` }).from(user).where(and(eq(users.name, 'John'), eq(user.id, users.id))),
				),
			);

			expect(result).toEqual([{ name: 'John' }]);
		});

		test.concurrent('select with group by as sql', async ({ db, push }) => {
			const users = pgTable('users_23', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: users.name })
				.from(users)
				.groupBy(sql`${users.name}`);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('select with group by as sql + column', async ({ db, push }) => {
			const users = pgTable('users_24', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: users.name })
				.from(users)
				.groupBy(sql`${users.name}`, users.id)
				.orderBy(users.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('select with group by as column + sql', async ({ db, push }) => {
			const users = pgTable('users_25', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: users.name })
				.from(users)
				.groupBy(users.id, sql`${users.name}`)
				.orderBy(users.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('select with group by complex query', async ({ db, push }) => {
			const users = pgTable('users_26', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db
				.select({ name: users.name })
				.from(users)
				.groupBy(users.id, sql`${users.name}`)
				.orderBy(asc(users.name))
				.limit(1);

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test.concurrent('build query', async ({ db, push }) => {
			const users = pgTable('users_27', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			const query = db
				.select({ id: users.id, name: users.name })
				.from(users)
				.groupBy(users.id, users.name)
				.toSQL();

			expect(query).toEqual({
				sql: 'select "id", "name" from "users_27" group by "users_27"."id", "users_27"."name"',
				params: [],
			});
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4209
		// postpone
		// casing bug
		test.skipIf(Date.now() < +new Date('2026-01-20')).concurrent('2 consecutive use of .toSQL', async ({ db }) => {
			const t1 = pgTable('table', (t) => ({
				id: t.text().primaryKey(),
			}));
			const query1 = db.insert(t1).values({ id: '1' }).toSQL();
			expect(query1).toStrictEqual({ sql: 'insert into "table" ("id") values ($1)', params: ['1'] });

			const t2 = pgTable('table', (t) => ({
				id: t.text().primaryKey(),
				name: t.text(),
			}));
			const query2 = db.insert(t2).values({ id: '1', name: 'test' }).toSQL();
			expect(query2).toStrictEqual({
				sql: 'insert into "table" ("id", "name") values ($1, $2)',
				params: ['1', 'test'],
			});
		});

		test.concurrent('insert sql', async ({ db, push }) => {
			const users = pgTable('users_128', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: sql`${'John'}` });
			const result = await db.select({ id: users.id, name: users.name }).from(users);
			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('partial join with alias', async ({ db, push }) => {
			const users = pgTable('users_29', {
				id: serial('id' as string).primaryKey(),
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
				})
				.from(users)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([
				{
					user: { id: 10, name: 'Ivan' },
					customer: { id: 11, name: 'Hans' },
				},
			]);
		});

		test.concurrent('full join with alias', async ({ db, push }) => {
			const pgTable = pgTableCreator((name) => `prefixed_${name}`);

			const users = pgTable('users_30', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select()
				.from(users)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([{
				users_30: {
					id: 10,
					name: 'Ivan',
				},
				customer: {
					id: 11,
					name: 'Hans',
				},
			}]);
		});

		test.concurrent('select from alias', async ({ db, push }) => {
			const pgTable = pgTableCreator((name) => `prefixed_${name}`);

			const users = pgTable('users_31', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users });

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
		});

		test.concurrent('insert with spaces', async ({ db, push }) => {
			const usersTable = pgTable('users_32', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test.concurrent('prepared statement', async ({ db, push }) => {
			const usersTable = pgTable('users_33', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		test.concurrent('insert: placeholders on columns with encoder', async ({ db, push }) => {
			const usersTable = pgTable('users_34', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				jsonb: jsonb('jsonb').$type<string[]>(),
			});

			await push({ usersTable });

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

		test.concurrent('prepared statement reuse', async ({ db, push }) => {
			const usersTable = pgTable('users_35', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await push({ usersTable });

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

		test.concurrent('prepared statement with placeholder in .where', async ({ db, push }) => {
			const usersTable = pgTable('users_36', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		test.concurrent('prepared statement with placeholder in .limit', async ({ db, push }) => {
			const usersTable = pgTable('users_37', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		test.concurrent('prepared statement with placeholder in .offset', async ({ db, push }) => {
			const usersTable = pgTable('users_38', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		test.concurrent('prepared statement built using $dynamic', async ({ db, push }) => {
			const usersTable = pgTable('users_39', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		// https://github.com/drizzle-team/drizzle-orm/issues/4468
		test.concurrent('prepared statement with placeholder in .where', async ({ db, push }) => {
			const usersTable = pgTable('users_391', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
			});

			await push({ usersTable });
			await db.insert(usersTable).values({ name: 'John' });
			const stmt = db
				.select()
				.from(usersTable)
				.where(lt(usersTable.createdAt, sql`now() - ${sql.placeholder('timeWindow')}::interval`))
				.prepare('get_old_users');

			const result = await stmt.execute({ timeWindow: '40 days' });

			expect(result).toEqual([]);
		});

		test.concurrent('Insert all defaults in 1 row', async ({ db, push }) => {
			const users = pgTable('users_42', {
				id: serial('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await push({ users });

			await db.insert(users).values({});

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
		});

		test.concurrent('Insert all defaults in multiple rows', async ({ db, push }) => {
			const users = pgTable('users_43', {
				id: serial('id').primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await push({ users });

			await db.insert(users).values([{}, {}]);

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
		});

		test.concurrent('insert with onConflict do update', async ({ db, push }) => {
			const usersTable = pgTable('users_48', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		test.concurrent('insert with onConflict do nothing', async ({ db, push }) => {
			const usersTable = pgTable('users_49', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			await db.insert(usersTable).values({ name: 'John' });

			await db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing();

			const res = await db
				.select({ id: usersTable.id, name: usersTable.name })
				.from(usersTable)
				.where(eq(usersTable.id, 1));

			expect(res).toEqual([{ id: 1, name: 'John' }]);
		});

		test.concurrent('insert with onConflict do nothing + target', async ({ db, push }) => {
			const usersTable = pgTable('users_50', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

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

		test.concurrent('left join (flat object fields)', async ({ db, push }) => {
			const citiesTable = pgTable('cities_51', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const users2Table = pgTable('users2_51', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
			});

			await push({ citiesTable, users2Table });

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

		test.concurrent('left join (grouped fields)', async ({ db, push }) => {
			const citiesTable = pgTable('cities_52', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const users2Table = pgTable('users2_52', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
			});

			await push({ citiesTable, users2Table });

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

		test.concurrent('left join (all fields)', async ({ db, push }) => {
			const citiesTable = pgTable('cities_53', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			});

			const users2Table = pgTable('users2_53', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').references(() => citiesTable.id),
			});

			await push({ citiesTable, users2Table });

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
					users2_53: {
						id: 1,
						name: 'John',
						cityId,
					},
					cities_53: {
						id: cityId,
						name: 'Paris',
						state: null,
					},
				},
				{
					users2_53: {
						id: 2,
						name: 'Jane',
						cityId: null,
					},
					cities_53: null,
				},
			]);
		});

		test.concurrent('join subquery', async ({ db, push }) => {
			const courseCategoriesTable = pgTable('course_categories_54', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const coursesTable = pgTable('courses_54', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				categoryId: integer('category_id').references(() => courseCategoriesTable.id),
			});

			await push({ courseCategoriesTable, coursesTable });

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

		test.concurrent('with ... select', async ({ db, push }) => {
			const orders = pgTable('orders_55', {
				region: text('region').notNull(),
				product: text('product').notNull(),
				amount: integer('amount').notNull(),
				quantity: integer('quantity').notNull(),
			});

			await push({ orders });

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
							totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
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

		test.concurrent('with ... update', async ({ db, push }) => {
			const products = pgTable('products_56', {
				id: serial('id').primaryKey(),
				price: numeric('price').notNull(),
				cheap: boolean('cheap').notNull().default(false),
			});

			await push({ products });

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

		test.concurrent('with ... insert', async ({ db, push }) => {
			const users = pgTable('users_57', {
				username: text('username').notNull(),
				admin: boolean('admin').notNull().default(false),
			});

			await push({ users });

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

		test.concurrent('with ... delete', async ({ db, push }) => {
			const orders = pgTable('orders_58', {
				id: serial('id').primaryKey(),
				region: text('region').notNull(),
				product: text('product').notNull(),
				amount: integer('amount').notNull(),
				quantity: integer('quantity').notNull(),
			});

			await push({ orders });

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

		test.concurrent('select from subquery sql', async ({ db, push }) => {
			const users2Table = pgTable('users2_59', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ users2Table });

			await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

			const sq = db
				.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
				.from(users2Table)
				.as('sq');

			const res = await db.select({ name: sq.name }).from(sq);

			expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
		});

		test.concurrent('select count()', async ({ db, push }) => {
			const usersTable = pgTable('users_62', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const res = await db.select({ count: sql`count(*)::int` }).from(usersTable);

			expect(res).toEqual([{ count: 2 }]);
		});

		test.concurrent('select count w/ custom mapper', async ({ db, push }) => {
			const usersTable = pgTable('users_63', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			await push({ usersTable });

			function count(value: any): any;
			function count(value: any, alias: string): any;
			function count(value: any, alias?: string): any {
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

		test.concurrent('network types', async ({ db, push }) => {
			const network = pgTable('network_64', {
				inet: inet('inet').notNull(),
				cidr: cidr('cidr').notNull(),
				macaddr: macaddr('macaddr').notNull(),
				macaddr8: macaddr8('macaddr8').notNull(),
			});

			await push({ network });

			const value = {
				inet: '127.0.0.1',
				cidr: '192.168.100.128/25',
				macaddr: '08:00:2b:01:02:03',
				macaddr8: '08:00:2b:01:02:03:04:05',
			};

			await db.insert(network).values(value);

			const res = await db.select().from(network);

			expect(res).toEqual([value]);
		});

		test.concurrent('array types', async ({ db, push }) => {
			const salEmp = pgTable('sal_emp_65', {
				name: text('name').notNull(),
				payByQuarter: integer('pay_by_quarter').array().notNull(),
				schedule: text('schedule').array('[][]').notNull(),
			});

			await push({ salEmp });

			const values = [
				{
					name: 'John',
					payByQuarter: [10000, 10000, 10000, 10000],
					schedule: [['meeting', 'lunch'], ['training', 'presentation']],
				},
				{
					name: 'Carol',
					payByQuarter: [20000, 25000, 25000, 25000],
					schedule: [['breakfast', 'consulting'], ['meeting', 'lunch']],
				},
			];

			await db.insert(salEmp).values(values);

			const res = await db.select().from(salEmp);

			expect(res).toEqual(values);
		});

		test.concurrent('having', async ({ db, push }) => {
			const citiesTable = pgTable('cities_85', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
			});

			const users2Table = pgTable('users2_85', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: integer('city_id').notNull(),
			});

			await push({ citiesTable, users2Table });

			await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

			await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
				name: 'Jack',
				cityId: 2,
			}]);

			const result = await db
				.select({
					id: citiesTable.id,
					name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
					usersCount: sql<number>`count(${users2Table.id})::int`.as('users_count'),
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
	});
}
