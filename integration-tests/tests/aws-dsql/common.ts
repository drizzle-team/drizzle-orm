import 'dotenv/config';

import { and, asc, eq, gt, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';

// DSQL-specific common tests
export function tests(test: Test) {
	describe('common', () => {
		test.concurrent('select all fields', async ({ db, push }) => {
			const users = pgTable('users_1', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await push({ users });

			const now = Date.now();
			await db.insert(users).values({ name: 'John' });
			const result = await db.select().from(users);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
			expect(result).toEqual([
				{
					id: result[0]!.id,
					name: 'John',
					verified: false,
					createdAt: result[0]!.createdAt,
				},
			]);
		});

		test.concurrent('select sql', async ({ db, push }) => {
			const users = pgTable('users_2', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values({ name: 'John' });
			const users2 = await db
				.select({
					name: sql<string>`upper(${users.name})`,
				})
				.from(users);

			expect(users2).toEqual([{ name: 'JOHN' }]);
		});

		test.concurrent('insert many', async ({ db, push }) => {
			const users = pgTable('users_3', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }]);

			const result = await db.select({ name: users.name }).from(users).orderBy(asc(users.name));

			expect(result).toEqual([{ name: 'Bob' }, { name: 'Jane' }, { name: 'John' }]);
		});

		test.concurrent('insert with returning', async ({ db, push }) => {
			const users = pgTable('users_4', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await push({ users });

			const result = await db.insert(users).values({ name: 'John' }).returning();

			expect(result[0]!.id).toBeDefined();
			expect(result[0]!.name).toBe('John');
			expect(result[0]!.verified).toBe(false);
		});

		test.concurrent('update with returning', async ({ db, push }) => {
			const users = pgTable('users_5', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await push({ users });

			const [inserted] = await db.insert(users).values({ name: 'John' }).returning();
			const result = await db
				.update(users)
				.set({ verified: true })
				.where(eq(users.id, inserted!.id))
				.returning();

			expect(result[0]!.verified).toBe(true);
		});

		test.concurrent('delete with returning', async ({ db, push }) => {
			const users = pgTable('users_6', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await push({ users });

			const [inserted] = await db.insert(users).values({ name: 'John' }).returning();
			const result = await db
				.delete(users)
				.where(eq(users.id, inserted!.id))
				.returning();

			expect(result).toEqual([{ id: inserted!.id, name: 'John' }]);

			const remaining = await db.select().from(users);
			expect(remaining).toEqual([]);
		});

		test.concurrent('insert + select with where', async ({ db, push }) => {
			const users = pgTable('users_7', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				age: integer('age').notNull(),
			});

			await push({ users });

			await db.insert(users).values([
				{ name: 'John', age: 25 },
				{ name: 'Jane', age: 30 },
				{ name: 'Bob', age: 20 },
			]);

			const result = await db
				.select()
				.from(users)
				.where(and(gt(users.age, 22), lt(users.age, 28)));

			expect(result.length).toBe(1);
			expect(result[0]!.name).toBe('John');
		});

		test.concurrent('insert + select with inArray', async ({ db, push }) => {
			const users = pgTable('users_8', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }]);

			const result = await db
				.select()
				.from(users)
				.where(inArray(users.name, ['John', 'Bob']));

			expect(result.length).toBe(2);
		});

		test.concurrent('insert + select with notInArray', async ({ db, push }) => {
			const users = pgTable('users_9', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }]);

			const result = await db
				.select()
				.from(users)
				.where(notInArray(users.name, ['John', 'Bob']));

			expect(result.length).toBe(1);
			expect(result[0]!.name).toBe('Jane');
		});

		test.concurrent('update many', async ({ db, push }) => {
			const users = pgTable('users_10', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }]);

			await db.update(users).set({ verified: true });

			const result = await db.select().from(users);

			expect(result.every((u) => u.verified)).toBe(true);
		});

		test.concurrent('delete many', async ({ db, push }) => {
			const users = pgTable('users_11', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await push({ users });

			await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }]);

			await db.delete(users).where(inArray(users.name, ['John', 'Bob']));

			const result = await db.select().from(users);

			expect(result.length).toBe(1);
			expect(result[0]!.name).toBe('Jane');
		});
	});
}
