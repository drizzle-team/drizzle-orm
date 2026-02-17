import {
	and,
	asc,
	avg,
	count,
	countDistinct,
	desc,
	eq,
	gt,
	gte,
	inArray,
	lt,
	lte,
	max,
	min,
	ne,
	not,
	or,
	sql,
	sum,
} from 'drizzle-orm';
import type { BigQueryDatabase } from 'drizzle-orm/bigquery-core';
import { bigqueryTable, bool, float64, int64, string, timestamp } from 'drizzle-orm/bigquery-core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

declare module 'vitest' {
	interface TestContext {
		bigquery: {
			db: BigQueryDatabase<any>;
		};
	}
}

// Test table schemas - these will be created in the test dataset
export const usersTable = bigqueryTable('drizzle_test.users', {
	id: string('id').notNull(),
	name: string('name').notNull(),
	email: string('email'),
	verified: bool('verified').default(false),
	createdAt: timestamp('created_at'),
});

export const ordersTable = bigqueryTable('drizzle_test.orders', {
	id: string('id').notNull(),
	userId: string('user_id').notNull(),
	product: string('product').notNull(),
	quantity: int64('quantity').notNull(),
	price: float64('price').notNull(),
	createdAt: timestamp('created_at'),
});

export const aggregateTable = bigqueryTable('drizzle_test.aggregate_table', {
	id: int64('id').notNull(),
	name: string('name').notNull(),
	a: int64('a'),
	b: int64('b'),
	c: int64('c'),
	nullOnly: int64('null_only'),
});

// Helper to generate unique IDs (BigQuery doesn't have auto-increment)
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db } = ctx.bigquery;

			// Clean up tables before each test
			await db.execute(sql`DELETE FROM drizzle_test.users WHERE 1=1`);
			await db.execute(sql`DELETE FROM drizzle_test.orders WHERE 1=1`);
			await db.execute(sql`DELETE FROM drizzle_test.aggregate_table WHERE 1=1`);
		});

		test('select all fields', async (ctx) => {
			const { db } = ctx.bigquery;

			const id = generateId();
			await db.insert(usersTable).values({
				id,
				name: 'John',
				email: 'john@example.com',
				verified: true,
			});

			const result = await db.select().from(usersTable).where(eq(usersTable.id, id));

			expect(result).toHaveLength(1);
			expect(result[0]!.name).toBe('John');
			expect(result[0]!.email).toBe('john@example.com');
			expect(result[0]!.verified).toBe(true);
		});

		test('select specific columns', async (ctx) => {
			const { db } = ctx.bigquery;

			const id = generateId();
			await db.insert(usersTable).values({
				id,
				name: 'Jane',
				email: 'jane@example.com',
			});

			const result = await db
				.select({
					id: usersTable.id,
					name: usersTable.name,
				})
				.from(usersTable)
				.where(eq(usersTable.id, id));

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ id, name: 'Jane' });
		});

		test('select with where eq', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'John' },
				{ id: id2, name: 'Jane' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(eq(usersTable.name, 'John'));

			expect(result).toHaveLength(1);
			expect(result[0]!.name).toBe('John');
		});

		test('select with where ne', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'John' },
				{ id: id2, name: 'Jane' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(ne(usersTable.name, 'John'));

			expect(result).toHaveLength(1);
			expect(result[0]!.name).toBe('Jane');
		});

		test('select with where and', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'John', verified: true },
				{ id: id2, name: 'Jane', verified: false },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(and(eq(usersTable.name, 'John'), eq(usersTable.verified, true)));

			expect(result).toHaveLength(1);
			expect(result[0]!.name).toBe('John');
		});

		test('select with where or', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();
			const id3 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'John' },
				{ id: id2, name: 'Jane' },
				{ id: id3, name: 'Jack' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(or(eq(usersTable.name, 'John'), eq(usersTable.name, 'Jane')));

			expect(result).toHaveLength(2);
		});

		test('select with order by asc', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();
			const id3 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'Charlie' },
				{ id: id2, name: 'Alice' },
				{ id: id3, name: 'Bob' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.orderBy(asc(usersTable.name));

			expect(result).toHaveLength(3);
			expect(result[0]!.name).toBe('Alice');
			expect(result[1]!.name).toBe('Bob');
			expect(result[2]!.name).toBe('Charlie');
		});

		test('select with order by desc', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();
			const id3 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'Charlie' },
				{ id: id2, name: 'Alice' },
				{ id: id3, name: 'Bob' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.orderBy(desc(usersTable.name));

			expect(result).toHaveLength(3);
			expect(result[0]!.name).toBe('Charlie');
			expect(result[1]!.name).toBe('Bob');
			expect(result[2]!.name).toBe('Alice');
		});

		test('select with limit', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(usersTable).values([
				{ id: generateId(), name: 'User1' },
				{ id: generateId(), name: 'User2' },
				{ id: generateId(), name: 'User3' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.limit(2);

			expect(result).toHaveLength(2);
		});

		test('select with limit and offset', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(usersTable).values([
				{ id: generateId(), name: 'User1' },
				{ id: generateId(), name: 'User2' },
				{ id: generateId(), name: 'User3' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.orderBy(asc(usersTable.name))
				.limit(1)
				.offset(1);

			expect(result).toHaveLength(1);
			expect(result[0]!.name).toBe('User2');
		});

		test('select with inArray', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();
			const id3 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'John' },
				{ id: id2, name: 'Jane' },
				{ id: id3, name: 'Jack' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(inArray(usersTable.name, ['John', 'Jane']));

			expect(result).toHaveLength(2);
		});

		test('insert single row', async (ctx) => {
			const { db } = ctx.bigquery;

			const id = generateId();
			await db.insert(usersTable).values({
				id,
				name: 'Test User',
				email: 'test@example.com',
			});

			const result = await db
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, id));

			expect(result).toHaveLength(1);
			expect(result[0]!.name).toBe('Test User');
		});

		test('insert multiple rows', async (ctx) => {
			const { db } = ctx.bigquery;

			const id1 = generateId();
			const id2 = generateId();

			await db.insert(usersTable).values([
				{ id: id1, name: 'User 1' },
				{ id: id2, name: 'User 2' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(inArray(usersTable.id, [id1, id2]));

			expect(result).toHaveLength(2);
		});

		test('update', async (ctx) => {
			const { db } = ctx.bigquery;

			const id = generateId();
			await db.insert(usersTable).values({
				id,
				name: 'Original Name',
			});

			await db
				.update(usersTable)
				.set({ name: 'Updated Name' })
				.where(eq(usersTable.id, id));

			const result = await db
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, id));

			expect(result[0]!.name).toBe('Updated Name');
		});

		test('delete', async (ctx) => {
			const { db } = ctx.bigquery;

			const id = generateId();
			await db.insert(usersTable).values({
				id,
				name: 'To Delete',
			});

			// Verify inserted
			const beforeDelete = await db
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, id));
			expect(beforeDelete).toHaveLength(1);

			await db.delete(usersTable).where(eq(usersTable.id, id));

			const afterDelete = await db
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, id));
			expect(afterDelete).toHaveLength(0);
		});

		test('count aggregate', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(usersTable).values([
				{ id: generateId(), name: 'User1' },
				{ id: generateId(), name: 'User2' },
				{ id: generateId(), name: 'User3' },
			]);

			const result = await db
				.select({
					count: count(),
				})
				.from(usersTable);

			expect(result[0]!.count).toBe(3);
		});

		test('count with group by', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(usersTable).values([
				{ id: generateId(), name: 'John', verified: true },
				{ id: generateId(), name: 'Jane', verified: true },
				{ id: generateId(), name: 'Jack', verified: false },
			]);

			const result = await db
				.select({
					verified: usersTable.verified,
					count: count(),
				})
				.from(usersTable)
				.groupBy(usersTable.verified)
				.orderBy(desc(count()));

			expect(result).toHaveLength(2);
		});

		test('sum aggregate', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(ordersTable).values([
				{ id: generateId(), userId: 'u1', product: 'A', quantity: 2, price: 10.0 },
				{ id: generateId(), userId: 'u1', product: 'B', quantity: 3, price: 20.0 },
			]);

			const result = await db
				.select({
					totalQuantity: sum(ordersTable.quantity),
				})
				.from(ordersTable);

			expect(Number(result[0]!.totalQuantity)).toBe(5);
		});

		test('avg aggregate', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(ordersTable).values([
				{ id: generateId(), userId: 'u1', product: 'A', quantity: 10, price: 10.0 },
				{ id: generateId(), userId: 'u1', product: 'B', quantity: 20, price: 20.0 },
			]);

			const result = await db
				.select({
					avgQuantity: avg(ordersTable.quantity),
				})
				.from(ordersTable);

			expect(Number(result[0]!.avgQuantity)).toBe(15);
		});

		test('min and max aggregate', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(ordersTable).values([
				{ id: generateId(), userId: 'u1', product: 'A', quantity: 5, price: 10.0 },
				{ id: generateId(), userId: 'u1', product: 'B', quantity: 15, price: 20.0 },
				{ id: generateId(), userId: 'u1', product: 'C', quantity: 10, price: 30.0 },
			]);

			const result = await db
				.select({
					minQuantity: min(ordersTable.quantity),
					maxQuantity: max(ordersTable.quantity),
				})
				.from(ordersTable);

			expect(result[0]!.minQuantity).toBe(5);
			expect(result[0]!.maxQuantity).toBe(15);
		});

		test('raw sql in select', async (ctx) => {
			const { db } = ctx.bigquery;

			const id = generateId();
			await db.insert(usersTable).values({
				id,
				name: 'John',
			});

			const result = await db
				.select({
					name: usersTable.name,
					upperName: sql<string>`UPPER(${usersTable.name})`.as('upper_name'),
				})
				.from(usersTable)
				.where(eq(usersTable.id, id));

			expect(result[0]!.upperName).toBe('JOHN');
		});

		test('raw sql in where', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(usersTable).values([
				{ id: generateId(), name: 'John' },
				{ id: generateId(), name: 'JOHN' },
			]);

			const result = await db
				.select()
				.from(usersTable)
				.where(sql`LOWER(${usersTable.name}) = 'john'`);

			expect(result).toHaveLength(2);
		});

		test('execute raw sql', async (ctx) => {
			const { db } = ctx.bigquery;

			const result = await db.execute(sql`SELECT 1 + 1 as result`);

			expect(result[0]).toEqual({ result: 2 });
		});

		test('distinct select', async (ctx) => {
			const { db } = ctx.bigquery;

			await db.insert(usersTable).values([
				{ id: generateId(), name: 'John' },
				{ id: generateId(), name: 'John' },
				{ id: generateId(), name: 'Jane' },
			]);

			const result = await db
				.selectDistinct({
					name: usersTable.name,
				})
				.from(usersTable)
				.orderBy(asc(usersTable.name));

			expect(result).toHaveLength(2);
			expect(result[0]!.name).toBe('Jane');
			expect(result[1]!.name).toBe('John');
		});
	});
}
