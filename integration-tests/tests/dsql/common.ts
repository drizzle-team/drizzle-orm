import { asc, eq, sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import { boolean, dsqlTable, integer, text, timestamp, uuid, varchar } from 'drizzle-orm/dsql-core';
import { beforeEach, describe, expect, test } from 'vitest';

declare module 'vitest' {
	interface TestContext {
		dsql: {
			db: DSQLDatabase<any>;
		};
	}
}

// Table definitions using dsqlTable and DSQL column types
// Note: No serial type - using uuid or generatedByDefaultAsIdentity instead
// Note: No jsonb - not supported by DSQL

export const usersTable = dsqlTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const citiesTable = dsqlTable('cities', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	state: varchar('state', { length: 2 }),
});

const users2Table = dsqlTable('users2', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	cityId: uuid('city_id'),
});

const orders = dsqlTable('orders', {
	id: uuid('id').primaryKey().defaultRandom(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

// Migrator table for migration tests
export const usersMigratorTable = dsqlTable('users12', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

// Aggregate table for aggregate function tests
const aggregateTable = dsqlTable('aggregate_table', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('null_only'),
});

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db } = ctx.dsql;
			// Clean up and recreate tables
			await db.execute(sql`drop table if exists users cascade`);
			await db.execute(sql`drop table if exists cities cascade`);
			await db.execute(sql`drop table if exists users2 cascade`);
			await db.execute(sql`drop table if exists orders cascade`);

			// Create users table
			await db.execute(
				sql`
					create table users (
						id uuid primary key default gen_random_uuid(),
						name text not null,
						verified boolean not null default false,
						created_at timestamptz not null default now()
					)
				`,
			);

			// Create cities table
			await db.execute(
				sql`
					create table cities (
						id uuid primary key default gen_random_uuid(),
						name text not null,
						state varchar(2)
					)
				`,
			);

			// Create users2 table
			await db.execute(
				sql`
					create table users2 (
						id uuid primary key default gen_random_uuid(),
						name text not null,
						city_id uuid
					)
				`,
			);

			// Create orders table
			await db.execute(
				sql`
					create table orders (
						id uuid primary key default gen_random_uuid(),
						region text not null,
						product text not null,
						amount integer not null,
						quantity integer not null
					)
				`,
			);
		});

		test('select all fields', async (ctx) => {
			const { db } = ctx.dsql;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' });
			const result = await db.select().from(usersTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);

			expect(result).toEqual([{
				id: result[0]!.id,
				name: 'John',
				verified: false,
				createdAt: result[0]!.createdAt,
			}]);
		});

		test('select sql', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select typed sql', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('insert returning sql', async (ctx) => {
			const { db } = ctx.dsql;

			const users = await db.insert(usersTable).values({ name: 'John' }).returning({
				name: sql`upper(${usersTable.name})`,
			});

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('delete returning sql', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
				name: sql`upper(${usersTable.name})`,
			});

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('update returning sql', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
				name: sql`upper(${usersTable.name})`,
			});

			expect(users).toEqual([{ name: 'JANE' }]);
		});

		test('update with returning all fields', async (ctx) => {
			const { db } = ctx.dsql;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(5000);

			expect(users).toEqual([{
				id: users[0]!.id,
				name: 'Jane',
				verified: false,
				createdAt: users[0]!.createdAt,
			}]);
		});

		test('update with returning partial', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
				name: usersTable.name,
			});

			expect(users).toEqual([{ name: 'Jane' }]);
		});

		test('delete with returning all fields', async (ctx) => {
			const { db } = ctx.dsql;

			const now = Date.now();

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(5000);

			expect(users).toEqual([{
				id: users[0]!.id,
				name: 'John',
				verified: false,
				createdAt: users[0]!.createdAt,
			}]);
		});

		test('delete with returning partial', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
				name: usersTable.name,
			});

			expect(users).toEqual([{ name: 'John' }]);
		});

		test('insert + select', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const result = await db.select().from(usersTable);
			expect(result).toEqual([{
				id: result[0]!.id,
				name: 'John',
				verified: false,
				createdAt: result[0]!.createdAt,
			}]);

			await db.insert(usersTable).values({ name: 'Jane' });
			const result2 = await db.select().from(usersTable);
			expect(result2).toHaveLength(2);
		});

		test('insert with overridden default values', async (ctx) => {
			const { db } = ctx.dsql;

			const customId = '550e8400-e29b-41d4-a716-446655440000';
			await db.insert(usersTable).values({ id: customId, name: 'John', verified: true });
			const result = await db.select().from(usersTable);

			expect(result).toEqual([{
				id: customId,
				name: 'John',
				verified: true,
				createdAt: result[0]!.createdAt,
			}]);
		});

		test('insert many', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Bruce' },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);
			const result = await db.select({
				name: usersTable.name,
				verified: usersTable.verified,
			}).from(usersTable).orderBy(usersTable.name);

			expect(result).toEqual([
				{ name: 'Austin', verified: true },
				{ name: 'Bruce', verified: false },
				{ name: 'Jane', verified: false },
				{ name: 'John', verified: false },
			]);
		});

		test('insert many with returning', async (ctx) => {
			const { db } = ctx.dsql;

			const result = await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Bruce' },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			])
				.returning({
					name: usersTable.name,
					verified: usersTable.verified,
				});

			expect(result).toEqual([
				{ name: 'John', verified: false },
				{ name: 'Bruce', verified: false },
				{ name: 'Jane', verified: false },
				{ name: 'Austin', verified: true },
			]);
		});

		test('select with group by as field', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.name);

			expect(result).toHaveLength(2);
		});

		test('select with group by as sql', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`);

			expect(result).toHaveLength(2);
		});

		test('select with group by complex query', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.limit(1);

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test('build query', async (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
				params: [],
			});
		});

		test('insert sql', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: sql`${'John'}` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
			expect(result[0]!.name).toBe('John');
		});

		test('$default function', async (ctx) => {
			const { db } = ctx.dsql;

			await db.execute(sql`drop table if exists orders cascade`);
			await db.execute(
				sql`
					create table orders (
						id uuid primary key default gen_random_uuid(),
						region text not null,
						product text not null,
						amount integer not null,
						quantity integer not null
					)
				`,
			);

			await db.insert(orders).values({ region: 'USA', amount: 100, quantity: 10 });
			const result = await db.select().from(orders);

			expect(result[0]!.product).toBe('random_string');
		});

		test('insert with onConflict do nothing', async (ctx) => {
			const { db } = ctx.dsql;

			const id = '550e8400-e29b-41d4-a716-446655440001';
			await db.insert(usersTable).values({ id, name: 'John' });

			await db.insert(usersTable)
				.values({ id, name: 'John Updated' })
				.onConflictDoNothing();

			const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, id),
			);

			expect(res).toEqual([{ id, name: 'John' }]);
		});

		test('insert with onConflict do update', async (ctx) => {
			const { db } = ctx.dsql;

			const id = '550e8400-e29b-41d4-a716-446655440002';
			await db.insert(usersTable).values({ id, name: 'John' });

			await db.insert(usersTable)
				.values({ id, name: 'John' })
				.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John Updated' } });

			const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, id),
			);

			expect(res).toEqual([{ id, name: 'John Updated' }]);
		});

		test('prepared statement', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });
			const statement = db.select({
				name: usersTable.name,
			}).from(usersTable)
				.prepare('statement1');
			const result = await statement.execute();

			expect(result).toEqual([{ name: 'John' }]);
		});

		test('prepared statement reuse', async (ctx) => {
			const { db } = ctx.dsql;

			const stmt = db.insert(usersTable).values({
				verified: true,
				name: sql.placeholder('name'),
			}).prepare('stmt2');

			for (let i = 0; i < 10; i++) {
				await stmt.execute({ name: `John ${i}` });
			}

			const result = await db.select({
				name: usersTable.name,
				verified: usersTable.verified,
			}).from(usersTable);

			expect(result).toHaveLength(10);
			expect(result.every((r) => r.verified === true)).toBe(true);
		});
	});
}
