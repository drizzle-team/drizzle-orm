import { asc, eq, gt, sql, TransactionRollbackError } from 'drizzle-orm';
import {
	alias,
	boolean,
	check,
	dsqlSchema,
	dsqlTable,
	dsqlView,
	getTableConfig,
	getViewConfig,
	index,
	integer,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/dsql-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';
import { uniqueTableName as uniqueName } from './instrumentation';

// Migrator table for migration tests (exported for use in dsql.test.ts)
export const usersMigratorTable = dsqlTable('users12', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

// Exported for dsql.test.ts compatibility
export const usersTable = dsqlTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export function tests(test: Test) {
	describe('common', () => {
		// Basic CRUD operations
		test.concurrent('select all fields', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false,
					created_at timestamptz not null default now()
				)
			`);

			try {
				const now = Date.now();
				await db.insert(users).values({ name: 'John' });
				const result = await db.select().from(users);

				expect(result[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
				expect(result).toEqual([{
					id: result[0]!.id,
					name: 'John',
					verified: false,
					createdAt: result[0]!.createdAt,
				}]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('select sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.select({
					name: sql`upper(${users.name})`,
				}).from(users);

				expect(result).toEqual([{ name: 'JOHN' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('select typed sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.select({
					name: sql<string>`upper(${users.name})`,
				}).from(users);

				expect(result).toEqual([{ name: 'JOHN' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert returning sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				const result = await db.insert(users).values({ name: 'John' }).returning({
					name: sql`upper(${users.name})`,
				});

				expect(result).toEqual([{ name: 'JOHN' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('delete returning sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.delete(users).where(eq(users.name, 'John')).returning({
					name: sql`upper(${users.name})`,
				});

				expect(result).toEqual([{ name: 'JOHN' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('update returning sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John')).returning({
					name: sql`upper(${users.name})`,
				});

				expect(result).toEqual([{ name: 'JANE' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('update with returning all fields', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false,
					created_at timestamptz not null default now()
				)
			`);

			try {
				const now = Date.now();
				await db.insert(users).values({ name: 'John' });
				const result = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John')).returning();

				expect(result[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
				expect(result).toEqual([{
					id: result[0]!.id,
					name: 'Jane',
					verified: false,
					createdAt: result[0]!.createdAt,
				}]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('update with returning partial', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.update(users).set({ name: 'Jane' }).where(eq(users.name, 'John')).returning({
					name: users.name,
				});

				expect(result).toEqual([{ name: 'Jane' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('delete with returning all fields', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false,
					created_at timestamptz not null default now()
				)
			`);

			try {
				const now = Date.now();
				await db.insert(users).values({ name: 'John' });
				const result = await db.delete(users).where(eq(users.name, 'John')).returning();

				expect(result[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
				expect(result).toEqual([{
					id: result[0]!.id,
					name: 'John',
					verified: false,
					createdAt: result[0]!.createdAt,
				}]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('delete with returning partial', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.delete(users).where(eq(users.name, 'John')).returning({
					name: users.name,
				});

				expect(result).toEqual([{ name: 'John' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert + select', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false,
					created_at timestamptz not null default now()
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.select().from(users);
				expect(result).toEqual([{
					id: result[0]!.id,
					name: 'John',
					verified: false,
					createdAt: result[0]!.createdAt,
				}]);

				await db.insert(users).values({ name: 'Jane' });
				const result2 = await db.select().from(users);
				expect(result2).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert with overridden default values', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false,
					created_at timestamptz not null default now()
				)
			`);

			try {
				const customId = '550e8400-e29b-41d4-a716-446655440000';
				await db.insert(users).values({ id: customId, name: 'John', verified: true });
				const result = await db.select().from(users);

				expect(result).toEqual([{
					id: customId,
					name: 'John',
					verified: true,
					createdAt: result[0]!.createdAt,
				}]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert many', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false
				)
			`);

			try {
				await db.insert(users).values([
					{ name: 'John' },
					{ name: 'Bruce' },
					{ name: 'Jane' },
					{ name: 'Austin', verified: true },
				]);
				const result = await db.select({
					name: users.name,
					verified: users.verified,
				}).from(users).orderBy(users.name);

				expect(result).toEqual([
					{ name: 'Austin', verified: true },
					{ name: 'Bruce', verified: false },
					{ name: 'Jane', verified: false },
					{ name: 'John', verified: false },
				]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert many with returning', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false
				)
			`);

			try {
				const result = await db.insert(users).values([
					{ name: 'John' },
					{ name: 'Bruce' },
					{ name: 'Jane' },
					{ name: 'Austin', verified: true },
				]).returning();

				expect(result).toHaveLength(4);
				expect(result[0]).toHaveProperty('id');
				expect(result[0]).toHaveProperty('name');
				expect(result[0]).toHaveProperty('verified');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('select with group by as field', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
				const result = await db.select({ name: users.name }).from(users).groupBy(users.name);
				expect(result).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('select with group by as sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
				const result = await db.select({ name: users.name }).from(users).groupBy(sql`${users.name}`);
				expect(result).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('select with group by complex query', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
				const result = await db.select({ name: users.name }).from(users).groupBy(users.name).orderBy(asc(users.name));
				expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('build query', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select({ name: users.name }).from(users).groupBy(users.name).toSQL();
			expect(query).toHaveProperty('sql');
			expect(query).toHaveProperty('params');
		});

		test.concurrent('insert sql', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.insert(users).values({ name: 'John' }).toSQL();
			expect(query).toHaveProperty('sql');
		});

		test.concurrent('$default function', async ({ db }) => {
			const tableName = uniqueName('orders');
			const orders = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				region: text('region').notNull(),
				product: text('product').notNull().$default(() => 'random_string'),
				amount: integer('amount').notNull(),
				quantity: integer('quantity').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					region text not null,
					product text not null,
					amount integer not null,
					quantity integer not null
				)
			`);

			try {
				await db.insert(orders).values({ region: 'US', amount: 100, quantity: 1 });
				const result = await db.select().from(orders);
				expect(result[0]?.product).toBe('random_string');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert with onConflict do nothing', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null unique
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				await db.insert(users).values({ name: 'John' }).onConflictDoNothing();
				const result = await db.select().from(users);
				expect(result).toHaveLength(1);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('insert with onConflict do update', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null unique
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				await db.insert(users).values({ name: 'John' }).onConflictDoUpdate({
					target: users.name,
					set: { name: 'Jane' },
				});
				const result = await db.select().from(users);
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('Jane');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('prepared statement', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const prepared = db.select().from(users).where(eq(users.name, sql.placeholder('name'))).prepare(
					'test_prepared',
				);
				const result = await prepared.execute({ name: 'John' });
				expect(result).toHaveLength(1);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('prepared statement reuse', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				const prepared = db.select().from(users).where(eq(users.name, sql.placeholder('name'))).prepare(
					'test_prepared_reuse',
				);
				const result1 = await prepared.execute({ name: 'John' }) as { id: string; name: string }[];
				const result2 = await prepared.execute({ name: 'Jane' }) as { id: string; name: string }[];
				expect(result1).toHaveLength(1);
				expect(result2).toHaveLength(1);
				expect(result1[0]?.name).toBe('John');
				expect(result2[0]?.name).toBe('Jane');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Alias tests
		test.concurrent('select from alias', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				const userAlias = alias(users, 'u');
				await db.insert(users).values({ name: 'John' });
				const result = await db.select().from(userAlias);
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('John');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('partial join with alias', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				const customerAlias = alias(users, 'customer');
				await db.insert(users).values([{ name: 'Ivan' }, { name: 'Hans' }]);
				const result = await db.select({
					user: { id: users.id, name: users.name },
					customer: { id: customerAlias.id, name: customerAlias.name },
				}).from(users)
					.leftJoin(customerAlias, sql`true`)
					.limit(1);
				expect(result[0]).toHaveProperty('user');
				expect(result[0]).toHaveProperty('customer');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('self-join using alias', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				parentId: uuid('parent_id'),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					parent_id uuid
				)
			`);

			try {
				const parent = alias(users, 'parent');
				const parentId = '550e8400-e29b-41d4-a716-446655440000';
				await db.insert(users).values({ id: parentId, name: 'Parent' });
				await db.insert(users).values({ name: 'Child', parentId });

				const result = await db.select({
					childName: users.name,
					parentName: parent.name,
				}).from(users)
					.leftJoin(parent, eq(users.parentId, parent.id))
					.where(eq(users.name, 'Child'));

				expect(result).toHaveLength(1);
				expect(result[0]?.childName).toBe('Child');
				expect(result[0]?.parentName).toBe('Parent');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Check constraint tests
		test.concurrent('table config: check constraint', () => {
			const tableWithCheck = dsqlTable('with_check', {
				id: uuid('id').primaryKey().defaultRandom(),
				age: integer('age'),
			}, (t) => [check('age_check', sql`${t.age} >= 0`)]);

			const config = getTableConfig(tableWithCheck);
			expect(config.checks).toHaveLength(1);
			expect(config.checks[0]?.name).toBe('age_check');
		});

		test.concurrent('check constraint enforcement', async ({ db }) => {
			const tableName = uniqueName('check_test');

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					age integer check (age >= 0)
				)
			`);

			try {
				await db.execute(sql`insert into ${sql.identifier(tableName)} (age) values (25)`);
				await expect(
					db.execute(sql`insert into ${sql.identifier(tableName)} (age) values (-1)`),
				).rejects.toThrow();
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Primary key tests
		test.concurrent('primary key enforcement', async ({ db }) => {
			const tableName = uniqueName('pk_test');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				const fixedId = '550e8400-e29b-41d4-a716-446655440001';
				await db.insert(users).values({ id: fixedId, name: 'John' });
				await expect(
					db.insert(users).values({ id: fixedId, name: 'Jane' }),
				).rejects.toThrow();
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Unique constraint tests
		test.concurrent('column-level unique constraint enforcement', async ({ db }) => {
			const tableName = uniqueName('unique_test');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull().unique(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					email text not null unique
				)
			`);

			try {
				await db.insert(users).values({ email: 'test@example.com' });
				await expect(
					db.insert(users).values({ email: 'test@example.com' }),
				).rejects.toThrow();
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('table-level unique constraint', async ({ db }) => {
			const tableName = uniqueName('unique_multi');

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					email text not null,
					username text not null,
					constraint email_username_unique unique (email, username)
				)
			`);

			try {
				await db.execute(sql`insert into ${sql.identifier(tableName)} (email, username) values ('a@b.com', 'user1')`);
				await db.execute(sql`insert into ${sql.identifier(tableName)} (email, username) values ('a@b.com', 'user2')`);
				await expect(
					db.execute(sql`insert into ${sql.identifier(tableName)} (email, username) values ('a@b.com', 'user1')`),
				).rejects.toThrow();
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('table config: unique constraint', () => {
			const tableWithUnique = dsqlTable('with_unique', {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull(),
				username: text('username').notNull(),
			}, (t) => [unique('email_username_unique').on(t.email, t.username)]);

			const config = getTableConfig(tableWithUnique);
			expect(config.uniqueConstraints).toHaveLength(1);
			expect(config.uniqueConstraints[0]?.name).toBe('email_username_unique');
		});

		// Index tests
		test.concurrent('table config: btree index', () => {
			const tableWithIndex = dsqlTable('with_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}, (t) => [index('name_idx').on(t.name)]);

			const config = getTableConfig(tableWithIndex);
			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.name).toBe('name_idx');
		});

		test.concurrent('table config: hash index', () => {
			const tableWithIndex = dsqlTable('with_hash_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}, (t) => [index('name_hash_idx').using('hash', t.name)]);

			const config = getTableConfig(tableWithIndex);
			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.method).toBe('hash');
		});

		test.concurrent('table config: unique index', () => {
			const tableWithIndex = dsqlTable('with_unique_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}, (t) => [uniqueIndex('email_unique_idx').on(t.email)]);

			const config = getTableConfig(tableWithIndex);
			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.unique).toBe(true);
		});

		test.concurrent('table config: partial index with where clause', () => {
			const tableWithIndex = dsqlTable('with_partial_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
				active: boolean('active'),
			}, (t) => [index('active_name_idx').on(t.name).where(sql`${t.active} = true`)]);

			const config = getTableConfig(tableWithIndex);
			expect(config.indexes).toHaveLength(1);
		});

		test.concurrent('table config: multi-column index', () => {
			const tableWithIndex = dsqlTable('with_multi_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				firstName: text('first_name'),
				lastName: text('last_name'),
			}, (t) => [index('name_composite_idx').on(t.firstName, t.lastName)]);

			const config = getTableConfig(tableWithIndex);
			expect(config.indexes).toHaveLength(1);
		});

		// View tests
		test.concurrent('view definition with query builder', () => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			const verifiedUsers = dsqlView('verified_users').as((qb: any) =>
				qb.select().from(users).where(eq(users.verified, true))
			);

			expect(verifiedUsers).toBeDefined();
		});

		test.concurrent('view definition with raw SQL', () => {
			const verifiedUsers = dsqlView('verified_users', {
				id: uuid('id'),
				name: text('name'),
			}).as(sql`SELECT id, name FROM users WHERE verified = true`);

			expect(verifiedUsers).toBeDefined();
		});

		test.concurrent('view with existing()', async ({ db }) => {
			const tableName = uniqueName('users');
			const viewName = uniqueName('verified_users_view');

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false
				)
			`);

			await db.execute(sql`
				create view ${sql.identifier(viewName)} as
				select id, name from ${sql.identifier(tableName)} where verified = true
			`);

			try {
				const existingView = dsqlView(viewName, {
					id: uuid('id'),
					name: text('name'),
				}).existing();

				const config = getViewConfig(existingView);
				expect(config.name).toBe(viewName);
				expect(config.isExisting).toBe(true);
			} finally {
				await db.execute(sql`drop view if exists ${sql.identifier(viewName)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('select from view', async ({ db }) => {
			const tableName = uniqueName('users');
			const viewName = uniqueName('verified_users_view');

			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
			});

			const verifiedView = dsqlView(viewName, {
				id: uuid('id'),
				name: text('name'),
			}).existing();

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					verified boolean not null default false
				)
			`);

			await db.execute(sql`
				create view ${sql.identifier(viewName)} as
				select id, name from ${sql.identifier(tableName)} where verified = true
			`);

			try {
				await db.insert(users).values([
					{ name: 'John', verified: true },
					{ name: 'Jane', verified: false },
				]);

				const result = await db.select().from(verifiedView);
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('John');
			} finally {
				await db.execute(sql`drop view if exists ${sql.identifier(viewName)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('view with schema', () => {
			const mySchema = dsqlSchema('my_schema');
			const schemaView = mySchema.view('my_view', {
				id: uuid('id'),
				name: text('name'),
			}).existing();

			const config = getViewConfig(schemaView);
			expect(config.schema).toBe('my_schema');
			expect(config.name).toBe('my_view');
		});

		// Schema tests
		test.concurrent('schema definition', () => {
			const testSchema = dsqlSchema('test_schema');
			expect(testSchema).toBeDefined();
		});

		test.concurrent('table within schema', async ({ db }) => {
			const schemaName = uniqueName('test_schema');
			const tableName = 'schema_users';

			await db.execute(sql`create schema if not exists ${sql.identifier(schemaName)}`);
			await db.execute(sql`
				create table ${sql.identifier(schemaName)}.${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				const testSchema = dsqlSchema(schemaName);
				const schemaUsers = testSchema.table(tableName, {
					id: uuid('id').primaryKey().defaultRandom(),
					name: text('name').notNull(),
				});

				await db.insert(schemaUsers).values({ name: 'SchemaUser' });
				const result = await db.select().from(schemaUsers);
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('SchemaUser');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(schemaName)}.${sql.identifier(tableName)} cascade`);
				await db.execute(sql`drop schema if exists ${sql.identifier(schemaName)} cascade`);
			}
		});

		test.concurrent('table config includes schema', () => {
			const testSchema = dsqlSchema('test_schema');
			const schemaUsers = testSchema.table('schema_users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const config = getTableConfig(schemaUsers);
			expect(config.schema).toBe('test_schema');
			expect(config.name).toBe('schema_users');
		});

		test.concurrent('cross-schema query', async ({ db }) => {
			const schema1Name = uniqueName('schema1');
			const schema2Name = uniqueName('schema2');

			await db.execute(sql`create schema if not exists ${sql.identifier(schema1Name)}`);
			await db.execute(sql`create schema if not exists ${sql.identifier(schema2Name)}`);
			await db.execute(sql`
				create table ${sql.identifier(schema1Name)}.users (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);
			await db.execute(sql`
				create table ${sql.identifier(schema2Name)}.orders (
					id uuid primary key default gen_random_uuid(),
					user_id uuid not null,
					product text not null
				)
			`);

			try {
				const schema1 = dsqlSchema(schema1Name);
				const schema2 = dsqlSchema(schema2Name);
				const schema1Users = schema1.table('users', {
					id: uuid('id').primaryKey().defaultRandom(),
					name: text('name').notNull(),
				});
				const schema2Orders = schema2.table('orders', {
					id: uuid('id').primaryKey().defaultRandom(),
					userId: uuid('user_id').notNull(),
					product: text('product').notNull(),
				});

				const userId = '550e8400-e29b-41d4-a716-446655440002';
				await db.insert(schema1Users).values({ id: userId, name: 'CrossSchemaUser' });
				await db.insert(schema2Orders).values({ userId, product: 'Widget' });

				const result = await db.select({
					userName: schema1Users.name,
					product: schema2Orders.product,
				}).from(schema1Users)
					.innerJoin(schema2Orders, eq(schema1Users.id, schema2Orders.userId));

				expect(result).toHaveLength(1);
				expect(result[0]?.userName).toBe('CrossSchemaUser');
				expect(result[0]?.product).toBe('Widget');
			} finally {
				await db.execute(sql`drop schema if exists ${sql.identifier(schema1Name)} cascade`);
				await db.execute(sql`drop schema if exists ${sql.identifier(schema2Name)} cascade`);
			}
		});

		// Subquery tests
		test.concurrent('select from subquery', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);

				const sq = db.select({
					name: sql<string>`upper(${users.name})`.as('name'),
				}).from(users).as('sq');

				const result = await db.select({ name: sq['name'] }).from(sq);
				expect(result).toContainEqual({ name: 'JOHN' });
				expect(result).toContainEqual({ name: 'JANE' });
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('subquery in where clause', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				age: integer('age'),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					age integer
				)
			`);

			try {
				await db.insert(users).values([
					{ name: 'John', age: 30 },
					{ name: 'Jane', age: 25 },
					{ name: 'Bob', age: 35 },
				]);

				const avgAge = db.select({ avg: sql<number>`avg(${users.age})` }).from(users);
				const result = await db.select().from(users).where(gt(users.age, avgAge));
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('Bob');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('join with subquery', async ({ db }) => {
			const usersTableName = uniqueName('users');
			const ordersTableName = uniqueName('orders');

			const users = dsqlTable(usersTableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const orders = dsqlTable(ordersTableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				userId: uuid('user_id').notNull(),
				total: integer('total').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(usersTableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);
			await db.execute(sql`
				create table ${sql.identifier(ordersTableName)} (
					id uuid primary key default gen_random_uuid(),
					user_id uuid not null,
					total integer not null
				)
			`);

			try {
				const userId = '550e8400-e29b-41d4-a716-446655440003';
				await db.insert(users).values({ id: userId, name: 'John' });
				await db.insert(orders).values([
					{ userId, total: 100 },
					{ userId, total: 200 },
				]);

				const orderTotals = db.select({
					userId: orders.userId,
					totalSum: sql<number>`sum(${orders.total})`.as('total_sum'),
				}).from(orders).groupBy(orders.userId).as('order_totals');

				const result = await db.select({
					name: users.name,
					totalSum: orderTotals['totalSum'],
				}).from(users)
					.innerJoin(orderTotals, eq(users.id, orderTotals['userId']));

				expect(result).toHaveLength(1);
				expect(result[0]?.totalSum).toBe(300);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(ordersTableName)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(usersTableName)} cascade`);
			}
		});

		test.concurrent('CTE with $with', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);

				const usersCte = db.$with('users_cte').as(
					db.select({ name: users.name }).from(users),
				);

				const result = await db.with(usersCte).select().from(usersCte);
				expect(result).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('multiple CTEs', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				age: integer('age'),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					age integer
				)
			`);

			try {
				await db.insert(users).values([
					{ name: 'John', age: 30 },
					{ name: 'Jane', age: 25 },
					{ name: 'Bob', age: 35 },
				]);

				const youngUsers = db.$with('young_users').as(
					db.select().from(users).where(sql`${users.age} < 30`),
				);
				const oldUsers = db.$with('old_users').as(
					db.select().from(users).where(sql`${users.age} >= 30`),
				);

				const result = await db.with(youngUsers, oldUsers)
					.select({ name: youngUsers['name'] })
					.from(youngUsers);
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('Jane');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Set operations tests
		test.concurrent('union', async ({ db }) => {
			const tableName1 = uniqueName('users');
			const tableName2 = uniqueName('admins');

			const users = dsqlTable(tableName1, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const admins = dsqlTable(tableName2, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(
				sql`create table ${
					sql.identifier(tableName1)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);
			await db.execute(
				sql`create table ${
					sql.identifier(tableName2)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				await db.insert(admins).values([{ name: 'Jane' }, { name: 'Admin' }]);

				const result = await db.select({ name: users.name }).from(users)
					.union(db.select({ name: admins.name }).from(admins));

				expect(result).toHaveLength(3); // John, Jane, Admin (Jane deduplicated)
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
			}
		});

		test.concurrent('union all', async ({ db }) => {
			const tableName1 = uniqueName('users');
			const tableName2 = uniqueName('admins');

			const users = dsqlTable(tableName1, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const admins = dsqlTable(tableName2, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(
				sql`create table ${
					sql.identifier(tableName1)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);
			await db.execute(
				sql`create table ${
					sql.identifier(tableName2)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				await db.insert(admins).values([{ name: 'Jane' }, { name: 'Admin' }]);

				const result = await db.select({ name: users.name }).from(users)
					.unionAll(db.select({ name: admins.name }).from(admins));

				expect(result).toHaveLength(4); // All rows including duplicates
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
			}
		});

		test.concurrent('intersect', async ({ db }) => {
			const tableName1 = uniqueName('users');
			const tableName2 = uniqueName('admins');

			const users = dsqlTable(tableName1, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const admins = dsqlTable(tableName2, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(
				sql`create table ${
					sql.identifier(tableName1)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);
			await db.execute(
				sql`create table ${
					sql.identifier(tableName2)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				await db.insert(admins).values([{ name: 'Jane' }, { name: 'Admin' }]);

				const result = await db.select({ name: users.name }).from(users)
					.intersect(db.select({ name: admins.name }).from(admins));

				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('Jane');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
			}
		});

		test.concurrent('intersect all', async ({ db }) => {
			const tableName1 = uniqueName('users');
			const tableName2 = uniqueName('admins');

			const users = dsqlTable(tableName1, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const admins = dsqlTable(tableName2, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(
				sql`create table ${
					sql.identifier(tableName1)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);
			await db.execute(
				sql`create table ${
					sql.identifier(tableName2)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);

			try {
				await db.insert(users).values([{ name: 'Jane' }, { name: 'Jane' }]);
				await db.insert(admins).values([{ name: 'Jane' }, { name: 'Admin' }]);

				const result = await db.select({ name: users.name }).from(users)
					.intersectAll(db.select({ name: admins.name }).from(admins));

				expect(result).toHaveLength(1); // One Jane match
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
			}
		});

		test.concurrent('except', async ({ db }) => {
			const tableName1 = uniqueName('users');
			const tableName2 = uniqueName('admins');

			const users = dsqlTable(tableName1, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const admins = dsqlTable(tableName2, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(
				sql`create table ${
					sql.identifier(tableName1)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);
			await db.execute(
				sql`create table ${
					sql.identifier(tableName2)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				await db.insert(admins).values([{ name: 'Jane' }]);

				const result = await db.select({ name: users.name }).from(users)
					.except(db.select({ name: admins.name }).from(admins));

				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('John');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
			}
		});

		test.concurrent('except all', async ({ db }) => {
			const tableName1 = uniqueName('users');
			const tableName2 = uniqueName('admins');

			const users = dsqlTable(tableName1, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});
			const admins = dsqlTable(tableName2, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(
				sql`create table ${
					sql.identifier(tableName1)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);
			await db.execute(
				sql`create table ${
					sql.identifier(tableName2)
				} (id uuid primary key default gen_random_uuid(), name text not null)`,
			);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'John' }, { name: 'Jane' }]);
				await db.insert(admins).values([{ name: 'John' }]);

				const result = await db.select({ name: users.name }).from(users)
					.exceptAll(db.select({ name: admins.name }).from(admins));

				expect(result).toHaveLength(2); // One John removed, one John and Jane remain
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
			}
		});

		test.concurrent('mixed set operations', async ({ db }) => {
			const tableName1 = uniqueName('t1');
			const tableName2 = uniqueName('t2');
			const tableName3 = uniqueName('t3');

			const t1 = dsqlTable(tableName1, { name: text('name').notNull() });
			const t2 = dsqlTable(tableName2, { name: text('name').notNull() });
			const t3 = dsqlTable(tableName3, { name: text('name').notNull() });

			await db.execute(sql`create table ${sql.identifier(tableName1)} (name text not null)`);
			await db.execute(sql`create table ${sql.identifier(tableName2)} (name text not null)`);
			await db.execute(sql`create table ${sql.identifier(tableName3)} (name text not null)`);

			try {
				await db.insert(t1).values([{ name: 'A' }, { name: 'B' }]);
				await db.insert(t2).values([{ name: 'B' }, { name: 'C' }]);
				await db.insert(t3).values([{ name: 'C' }, { name: 'D' }]);

				const result = await db.select({ name: t1.name }).from(t1)
					.union(db.select({ name: t2.name }).from(t2))
					.except(db.select({ name: t3.name }).from(t3));

				expect(result).toContainEqual({ name: 'A' });
				expect(result).toContainEqual({ name: 'B' });
				expect(result).not.toContainEqual({ name: 'C' });
				expect(result).not.toContainEqual({ name: 'D' });
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName1)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName2)} cascade`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName3)} cascade`);
			}
		});

		// Locking tests
		test.concurrent('select for update', ({ db }) => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select().from(users).for('update').toSQL();
			expect(query.sql).toMatch(/for update$/i);
		});

		test.concurrent('select for share', ({ db }) => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select().from(users).for('share').toSQL();
			expect(query.sql).toMatch(/for share$/i);
		});

		test.concurrent('select for no key update', ({ db }) => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select().from(users).for('no key update').toSQL();
			expect(query.sql).toMatch(/for no key update$/i);
		});

		test.concurrent('select for key share', ({ db }) => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select().from(users).for('key share').toSQL();
			expect(query.sql).toMatch(/for key share$/i);
		});

		test.concurrent('select for update nowait', ({ db }) => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select().from(users).for('update', { noWait: true }).toSQL();
			expect(query.sql).toMatch(/for update nowait$/i);
		});

		test.concurrent('select for update skip locked', ({ db }) => {
			const users = dsqlTable('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const query = db.select().from(users).for('update', { skipLocked: true }).toSQL();
			expect(query.sql).toMatch(/for update skip locked$/i);
		});

		test.concurrent('for update execution', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'John' });
				const result = await db.select().from(users).for('update');
				expect(result).toHaveLength(1);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Transaction tests
		test.concurrent('transaction', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ name: 'TxUser' });
					const result = await tx.select().from(users);
					expect(result.some((u: any) => u.name === 'TxUser')).toBe(true);
				});

				const result = await db.select().from(users);
				expect(result.some((u) => u.name === 'TxUser')).toBe(true);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('transaction rollback', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await expect(db.transaction(async (tx) => {
					await tx.insert(users).values({ name: 'RollbackUser' });
					tx.rollback();
				})).rejects.toThrow(TransactionRollbackError);

				const result = await db.select().from(users).where(eq(users.name, 'RollbackUser'));
				expect(result).toHaveLength(0);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('nested transaction (savepoints)', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ name: 'Outer' });
					await tx.transaction(async (tx2) => {
						await tx2.insert(users).values({ name: 'Inner' });
					});
				});

				const result = await db.select().from(users);
				expect(result).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('nested transaction rollback', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ name: 'Outer' });
					await expect(tx.transaction(async (tx2) => {
						await tx2.insert(users).values({ name: 'Inner' });
						tx2.rollback();
					})).rejects.toThrow(TransactionRollbackError);
				});

				const result = await db.select().from(users);
				expect(result).toHaveLength(1);
				expect(result[0]?.name).toBe('Outer');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('transaction with isolation level', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ name: 'IsolationTest' });
				}, { isolationLevel: 'repeatable read' });

				const result = await db.select().from(users);
				expect(result).toHaveLength(1);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('transaction with access mode', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values({ name: 'ExistingUser' });

				await db.transaction(async (tx) => {
					const result = await tx.select().from(users);
					expect(result).toHaveLength(1);
				}, { accessMode: 'read only' });
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// RQB tests - skipped until db.query is implemented
		test.skip('rqb: findFirst', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				// @ts-expect-error db.query not implemented yet
				const result = await db.query[tableName as keyof typeof db.query]?.findFirst();
				expect(result).toBeDefined();
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.skip('rqb: findMany', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				// @ts-expect-error db.query not implemented yet
				const result = await db.query[tableName as keyof typeof db.query]?.findMany();
				expect(result).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.skip('rqb: findFirst with where', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				// @ts-expect-error db.query not implemented yet
				const result = await db.query[tableName as keyof typeof db.query]?.findFirst({
					where: eq(users.name, 'Jane'),
				});
				expect(result?.name).toBe('Jane');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.skip('rqb: findMany with orderBy', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Alice' }]);
				// @ts-expect-error db.query not implemented yet
				const result = await db.query[tableName as keyof typeof db.query]?.findMany({
					orderBy: asc(users.name),
				});
				expect(result?.[0]?.name).toBe('Alice');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.skip('rqb: findMany with limit', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Alice' }]);
				// @ts-expect-error db.query not implemented yet
				const result = await db.query[tableName as keyof typeof db.query]?.findMany({
					limit: 2,
				});
				expect(result).toHaveLength(2);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.skip('rqb: findFirst with columns selection', async ({ db }) => {
			const tableName = uniqueName('users');
			const users = dsqlTable(tableName, {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
				email: text('email'),
			});

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null,
					email text
				)
			`);

			try {
				await db.insert(users).values({ name: 'John', email: 'john@example.com' });
				// @ts-expect-error db.query not implemented yet
				const result = await db.query[tableName as keyof typeof db.query]?.findFirst({
					columns: { name: true },
				});
				expect(result).toHaveProperty('name');
				expect(result).not.toHaveProperty('email');
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		// Migration tests
		test.concurrent('migrate function exists', async ({ db }) => {
			expect(db.dialect.migrate).toBeDefined();
		});

		test.concurrent('migrate creates migration table', async ({ db }) => {
			const migrationsTable = uniqueName('drizzle_migrations');

			try {
				await db.dialect.migrate([], db.session, {
					migrationsFolder: './drizzle2/dsql',
					migrationsTable,
				});

				const result = await db.execute(sql`
					select table_name from information_schema.tables
					where table_name = ${migrationsTable}
				`);
				expect((result as any).rows.length).toBeGreaterThanOrEqual(0);
			} finally {
				await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade`);
			}
		});

		// User management tests
		test.concurrent('create role', async ({ db }) => {
			const roleName = `test_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);
				const result = await db.execute(sql`
					SELECT rolname FROM pg_roles WHERE rolname = ${roleName}
				`);
				expect((result as any).rows).toHaveLength(1);
			} finally {
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(roleName)}`);
			}
		});

		test.concurrent('grant select permission to role', async ({ db }) => {
			const roleName = `test_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const tableName = uniqueName('grant_test');

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);
				await db.execute(sql`GRANT SELECT ON ${sql.identifier(tableName)} TO ${sql.identifier(roleName)}`);

				const result = await db.execute(sql`
					SELECT privilege_type FROM information_schema.table_privileges
					WHERE grantee = ${roleName} AND table_name = ${tableName}
				`);
				expect((result as any).rows).toContainEqual(
					expect.objectContaining({ privilege_type: 'SELECT' }),
				);
			} finally {
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(roleName)}`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('grant multiple permissions to role', async ({ db }) => {
			const roleName = `test_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const tableName = uniqueName('grant_multi_test');

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);
				await db.execute(
					sql`GRANT SELECT, INSERT, UPDATE ON ${sql.identifier(tableName)} TO ${sql.identifier(roleName)}`,
				);

				const result = await db.execute(sql`
					SELECT privilege_type FROM information_schema.table_privileges
					WHERE grantee = ${roleName} AND table_name = ${tableName}
				`);
				const privileges = (result as any).rows.map((r: any) => r.privilege_type);
				expect(privileges).toContain('SELECT');
				expect(privileges).toContain('INSERT');
				expect(privileges).toContain('UPDATE');
			} finally {
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(roleName)}`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('revoke permission from role', async ({ db }) => {
			const roleName = `test_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const tableName = uniqueName('revoke_test');

			await db.execute(sql`
				create table ${sql.identifier(tableName)} (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);
				await db.execute(sql`GRANT SELECT, INSERT ON ${sql.identifier(tableName)} TO ${sql.identifier(roleName)}`);
				await db.execute(sql`REVOKE INSERT ON ${sql.identifier(tableName)} FROM ${sql.identifier(roleName)}`);

				const result = await db.execute(sql`
					SELECT privilege_type FROM information_schema.table_privileges
					WHERE grantee = ${roleName} AND table_name = ${tableName}
				`);
				const privileges = (result as any).rows.map((r: any) => r.privilege_type);
				expect(privileges).toContain('SELECT');
				expect(privileges).not.toContain('INSERT');
			} finally {
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(roleName)}`);
				await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
			}
		});

		test.concurrent('alter role', async ({ db }) => {
			const roleName = `test_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);
				await db.execute(sql`ALTER ROLE ${sql.identifier(roleName)} WITH CREATEDB`);

				const result = await db.execute(sql`
					SELECT rolcreatedb FROM pg_roles WHERE rolname = ${roleName}
				`);
				expect((result as any).rows[0]?.rolcreatedb).toBe(true);
			} finally {
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(roleName)}`);
			}
		});

		test.concurrent('drop role', async ({ db }) => {
			const roleName = `test_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

			await db.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);
			await db.execute(sql`DROP ROLE ${sql.identifier(roleName)}`);

			const result = await db.execute(sql`
				SELECT rolname FROM pg_roles WHERE rolname = ${roleName}
			`);
			expect((result as any).rows).toHaveLength(0);
		});

		test.concurrent('grant role to another role', async ({ db }) => {
			const role1Name = `test_role1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const role2Name = `test_role2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(role1Name)}`);
				await db.execute(sql`CREATE ROLE ${sql.identifier(role2Name)}`);
				await db.execute(sql`GRANT ${sql.identifier(role1Name)} TO ${sql.identifier(role2Name)}`);

				const result = await db.execute(sql`
					SELECT r.rolname as member, g.rolname as group
					FROM pg_roles r
					JOIN pg_auth_members m ON r.oid = m.member
					JOIN pg_roles g ON g.oid = m.roleid
					WHERE r.rolname = ${role2Name} AND g.rolname = ${role1Name}
				`);
				expect((result as any).rows).toHaveLength(1);
			} finally {
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(role2Name)}`);
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(role1Name)}`);
			}
		});
	});
}
