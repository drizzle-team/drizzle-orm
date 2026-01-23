import { asc, eq, gt, sql, TransactionRollbackError } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
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

// For set operations tests
const cities2Table = dsqlTable('cities2', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
});

// For relational queries tests
const postsTable = dsqlTable('posts', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	authorId: uuid('author_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// For schema tests
const testSchema = dsqlSchema('test_schema');
const schemaUsersTable = testSchema.table('schema_users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
});

// Table with check constraint
const tableWithCheck = dsqlTable('with_check', {
	id: uuid('id').primaryKey().defaultRandom(),
	age: integer('age'),
}, (t) => [check('age_check', sql`${t.age} >= 0`)]);

// Table with index
const tableWithIndex = dsqlTable('with_index', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name'),
	email: text('email'),
}, (t) => [
	index('name_idx').on(t.name),
	uniqueIndex('email_idx').on(t.email),
]);

// Table with composite primary key
const tableWithCompositePK = dsqlTable('composite_pk', {
	pk1: uuid('pk1').notNull(),
	pk2: uuid('pk2').notNull(),
	name: text('name'),
}, (t) => [primaryKey({ columns: [t.pk1, t.pk2] })]);

// Table with unique constraint
const tableWithUnique = dsqlTable('with_unique', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull(),
	username: text('username').notNull(),
}, (t) => [unique('email_username_unique').on(t.email, t.username)]);

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

		// ============================================
		// ALIAS TESTS
		// ============================================

		test('select from alias', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });

			const userAlias = alias(usersTable, 'u');
			const result = await db.select().from(userAlias);

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('John');
		});

		test('partial join with alias', async (ctx) => {
			const { db } = ctx.dsql;

			const customerAlias = alias(usersTable, 'customer');

			await db.insert(usersTable).values([{ name: 'Ivan' }, { name: 'Hans' }]);

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
				})
				.from(usersTable)
				.leftJoin(customerAlias, eq(customerAlias.id, usersTable.id))
				.where(eq(usersTable.name, 'Ivan'));

			expect(result[0]).toHaveProperty('user');
			expect(result[0]).toHaveProperty('customer');
			expect(result[0]?.user.name).toBe('Ivan');
		});

		test('self-join using alias', async (ctx) => {
			const { db } = ctx.dsql;

			const u1 = alias(usersTable, 'u1');
			const u2 = alias(usersTable, 'u2');

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const result = await db
				.select({
					name1: u1.name,
					name2: u2.name,
				})
				.from(u1)
				.innerJoin(u2, sql`${u1.id} != ${u2.id}`);

			// Each user paired with the other user (2 combinations)
			expect(result).toHaveLength(2);
		});

		// ============================================
		// CHECK CONSTRAINT TESTS
		// ============================================

		test('table config: check constraint', () => {
			const tableWithCheck = dsqlTable('with_check', {
				id: uuid('id').primaryKey().defaultRandom(),
				age: integer('age'),
			}, (t) => [check('age_check', sql`${t.age} >= 0`)]);

			const config = getTableConfig(tableWithCheck);

			expect(config.checks).toHaveLength(1);
			expect(config.checks[0]?.name).toBe('age_check');
		});

		test('check constraint enforcement', async (ctx) => {
			const { db } = ctx.dsql;

			const tableWithCheck = dsqlTable('check_test', {
				id: uuid('id').primaryKey().defaultRandom(),
				age: integer('age'),
			}, (t) => [check('age_check', sql`${t.age} >= 0`)]);

			await db.execute(sql`drop table if exists check_test cascade`);
			await db.execute(sql`
				create table check_test (
					id uuid primary key default gen_random_uuid(),
					age integer,
					constraint age_check check (age >= 0)
				)
			`);

			// Valid insert should succeed
			await db.insert(tableWithCheck).values({ age: 25 });
			const validResult = await db.select().from(tableWithCheck);
			expect(validResult).toHaveLength(1);

			// Invalid insert should fail due to check constraint
			await expect(
				db.insert(tableWithCheck).values({ age: -1 }),
			).rejects.toThrow();
		});

		// ============================================
		// PRIMARY KEY TESTS
		// ============================================

		test('primary key enforcement', async (ctx) => {
			const { db } = ctx.dsql;

			// usersTable uses id: uuid('id').primaryKey().defaultRandom()
			const id = '550e8400-e29b-41d4-a716-446655440000';

			await db.insert(usersTable).values({ id, name: 'John' });

			// Duplicate primary key should fail
			await expect(
				db.insert(usersTable).values({ id, name: 'Jane' }),
			).rejects.toThrow();

			// Different id should succeed
			const id2 = '550e8400-e29b-41d4-a716-446655440001';
			await db.insert(usersTable).values({ id: id2, name: 'Jane' });

			const result = await db.select().from(usersTable);
			expect(result).toHaveLength(2);
		});

		// ============================================
		// UNIQUE CONSTRAINT TESTS
		// ============================================

		test('column-level unique constraint enforcement', async (ctx) => {
			const { db } = ctx.dsql;

			const usersWithUniqueEmail = dsqlTable('users_unique_email', {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull().unique(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists users_unique_email cascade`);
			await db.execute(sql`
				create table users_unique_email (
					id uuid primary key default gen_random_uuid(),
					email text not null unique,
					name text not null
				)
			`);

			await db.insert(usersWithUniqueEmail).values({ email: 'john@example.com', name: 'John' });

			// Duplicate email should fail
			await expect(
				db.insert(usersWithUniqueEmail).values({ email: 'john@example.com', name: 'Jane' }),
			).rejects.toThrow();

			// Different email should succeed
			await db.insert(usersWithUniqueEmail).values({ email: 'jane@example.com', name: 'Jane' });

			const result = await db.select().from(usersWithUniqueEmail);
			expect(result).toHaveLength(2);
		});

		test('table-level unique constraint', async (ctx) => {
			const { db } = ctx.dsql;

			const usersWithCompositeUnique = dsqlTable('users_composite_unique', {
				id: uuid('id').primaryKey().defaultRandom(),
				firstName: text('first_name').notNull(),
				lastName: text('last_name').notNull(),
			}, (t) => [unique('name_unique').on(t.firstName, t.lastName)]);

			await db.execute(sql`drop table if exists users_composite_unique cascade`);
			await db.execute(sql`
				create table users_composite_unique (
					id uuid primary key default gen_random_uuid(),
					first_name text not null,
					last_name text not null,
					constraint name_unique unique (first_name, last_name)
				)
			`);

			await db.insert(usersWithCompositeUnique).values({ firstName: 'John', lastName: 'Doe' });

			// Same first + last name should fail
			await expect(
				db.insert(usersWithCompositeUnique).values({ firstName: 'John', lastName: 'Doe' }),
			).rejects.toThrow();

			// Same first name, different last name should succeed
			await db.insert(usersWithCompositeUnique).values({ firstName: 'John', lastName: 'Smith' });

			const result = await db.select().from(usersWithCompositeUnique);
			expect(result).toHaveLength(2);
		});

		test('table config: unique constraint', () => {
			const tableWithUnique = dsqlTable('with_unique', {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email').notNull(),
				username: text('username').notNull(),
			}, (t) => [unique('email_username_unique').on(t.email, t.username)]);

			const config = getTableConfig(tableWithUnique);

			expect(config.uniqueConstraints).toHaveLength(1);
			expect(config.uniqueConstraints[0]?.getName()).toBe('email_username_unique');
		});

		// ============================================
		// INDEX TESTS
		// ============================================

		test('table config: btree index', () => {
			const tableWithIndex = dsqlTable('with_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}, (t) => [index('name_idx').on(t.name)]);

			const config = getTableConfig(tableWithIndex);

			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.name).toBe('name_idx');
		});

		test('table config: hash index', () => {
			const tableWithHashIndex = dsqlTable('with_hash_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			}, (t) => [index('name_hash_idx').using('hash').on(t.name)]);

			const config = getTableConfig(tableWithHashIndex);

			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.name).toBe('name_hash_idx');
			expect(config.indexes[0]?.config.using).toBe('hash');
		});

		test('table config: unique index', () => {
			const tableWithUniqueIndex = dsqlTable('with_unique_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				email: text('email'),
			}, (t) => [uniqueIndex('email_unique_idx').on(t.email)]);

			const config = getTableConfig(tableWithUniqueIndex);

			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.name).toBe('email_unique_idx');
			expect(config.indexes[0]?.config.unique).toBe(true);
		});

		test('table config: partial index with where clause', () => {
			const tableWithPartialIndex = dsqlTable('with_partial_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
				active: boolean('active').notNull().default(true),
			}, (t) => [index('active_name_idx').on(t.name).where(sql`${t.active} = true`)]);

			const config = getTableConfig(tableWithPartialIndex);

			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.name).toBe('active_name_idx');
			expect(config.indexes[0]?.config.where).toBeDefined();
		});

		test('table config: multi-column index', () => {
			const tableWithMultiColIndex = dsqlTable('with_multi_col_index', {
				id: uuid('id').primaryKey().defaultRandom(),
				firstName: text('first_name'),
				lastName: text('last_name'),
			}, (t) => [index('full_name_idx').on(t.firstName, t.lastName)]);

			const config = getTableConfig(tableWithMultiColIndex);

			expect(config.indexes).toHaveLength(1);
			expect(config.indexes[0]?.config.name).toBe('full_name_idx');
			expect(config.indexes[0]?.config.columns).toHaveLength(2);
		});

		// ============================================
		// VIEW TESTS
		// ============================================

		test('view definition with query builder', () => {
			const verifiedUsersView = dsqlView('verified_users')
				.as((qb) => qb.select().from(usersTable).where(eq(usersTable.verified, true)));

			const config = getViewConfig(verifiedUsersView);

			expect(config.name).toBe('verified_users');
			expect(config.query).toBeDefined();
		});

		test('view definition with raw SQL', () => {
			const verifiedUsersView = dsqlView('verified_users', {
				id: uuid('id'),
				name: text('name'),
				verified: boolean('verified'),
			}).as(sql`select id, name, verified from users where verified = true`);

			const config = getViewConfig(verifiedUsersView);

			expect(config.name).toBe('verified_users');
			expect(config.query).toBeDefined();
		});

		test('view with existing()', async (ctx) => {
			const { db } = ctx.dsql;

			const existingView = dsqlView('verified_users_existing', {
				id: uuid('id'),
				name: text('name'),
				verified: boolean('verified'),
				createdAt: timestamp('created_at', { withTimezone: true }),
			}).existing();

			await db.execute(sql`drop view if exists verified_users_existing cascade`);
			await db.execute(sql`
				create view verified_users_existing as
				select id, name, verified, created_at from users where verified = true
			`);

			await db.insert(usersTable).values([
				{ name: 'John', verified: true },
				{ name: 'Jane', verified: false },
			]);

			const result = await db.select().from(existingView);

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('John');
		});

		test('select from view', async (ctx) => {
			const { db } = ctx.dsql;

			const verifiedUsersView = dsqlView('verified_users_select')
				.as((qb) => qb.select().from(usersTable).where(eq(usersTable.verified, true)));

			await db.execute(sql`drop view if exists verified_users_select cascade`);
			await db.execute(sql`
				create view verified_users_select as
				select * from users where verified = true
			`);

			await db.insert(usersTable).values([
				{ name: 'John', verified: true },
				{ name: 'Jane', verified: false },
				{ name: 'Jack', verified: true },
			]);

			const result = await db.select().from(verifiedUsersView);

			expect(result).toHaveLength(2);
			expect(result.map((r) => r.name).sort()).toEqual(['Jack', 'John']);
		});

		test('view with schema', () => {
			const testSchema = dsqlSchema('test_schema');

			const schemaView = testSchema.view('schema_verified_users', {
				id: uuid('id'),
				name: text('name'),
			}).as(sql`select id, name from test_schema.users where verified = true`);

			const config = getViewConfig(schemaView);

			expect(config.name).toBe('schema_verified_users');
			expect(config.schema).toBe('test_schema');
		});

		// ============================================
		// SCHEMA TESTS
		// ============================================

		test('schema definition', () => {
			const mySchema = dsqlSchema('my_schema');

			expect(mySchema.schemaName).toBe('my_schema');
		});

		test('table within schema', async (ctx) => {
			const { db } = ctx.dsql;

			const mySchema = dsqlSchema('my_schema');
			const schemaUsers = mySchema.table('schema_users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop schema if exists my_schema cascade`);
			await db.execute(sql`create schema my_schema`);
			await db.execute(sql`
				create table my_schema.schema_users (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);

			await db.insert(schemaUsers).values({ name: 'SchemaUser' });

			const result = await db.select().from(schemaUsers);

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('SchemaUser');
		});

		test('table config includes schema', () => {
			const mySchema = dsqlSchema('my_schema');
			const schemaTable = mySchema.table('schema_table', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name'),
			});

			const config = getTableConfig(schemaTable);

			expect(config.name).toBe('schema_table');
			expect(config.schema).toBe('my_schema');
		});

		test('cross-schema query', async (ctx) => {
			const { db } = ctx.dsql;

			const schema1 = dsqlSchema('schema_one');
			const schema2 = dsqlSchema('schema_two');

			const usersSchema1 = schema1.table('users', {
				id: uuid('id').primaryKey().defaultRandom(),
				name: text('name').notNull(),
			});

			const ordersSchema2 = schema2.table('orders', {
				id: uuid('id').primaryKey().defaultRandom(),
				userId: uuid('user_id').notNull(),
				product: text('product').notNull(),
			});

			await db.execute(sql`drop schema if exists schema_one cascade`);
			await db.execute(sql`drop schema if exists schema_two cascade`);
			await db.execute(sql`create schema schema_one`);
			await db.execute(sql`create schema schema_two`);
			await db.execute(sql`
				create table schema_one.users (
					id uuid primary key default gen_random_uuid(),
					name text not null
				)
			`);
			await db.execute(sql`
				create table schema_two.orders (
					id uuid primary key default gen_random_uuid(),
					user_id uuid not null,
					product text not null
				)
			`);

			const [user] = await db.insert(usersSchema1).values({ name: 'John' }).returning();
			await db.insert(ordersSchema2).values({ userId: user!.id, product: 'Widget' });

			const result = await db
				.select({
					userName: usersSchema1.name,
					product: ordersSchema2.product,
				})
				.from(usersSchema1)
				.innerJoin(ordersSchema2, eq(usersSchema1.id, ordersSchema2.userId));

			expect(result).toHaveLength(1);
			expect(result[0]?.userName).toBe('John');
			expect(result[0]?.product).toBe('Widget');
		});

		// ============================================
		// SUBQUERY TESTS
		// ============================================

		test('select from subquery', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const sq = db
				.select({
					name: sql<string>`upper(${usersTable.name})`.as('name'),
				})
				.from(usersTable)
				.as('sq');

			const result = await db.select({ name: sq.name }).from(sq);

			expect(result).toHaveLength(2);
			expect(result.map((r) => r.name).sort()).toEqual(['JANE', 'JOHN']);
		});

		test('subquery in where clause', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([
				{ name: 'John', verified: true },
				{ name: 'Jane', verified: false },
			]);

			const sq = db
				.select({ id: usersTable.id })
				.from(usersTable)
				.where(eq(usersTable.verified, true));

			const result = await db
				.select()
				.from(usersTable)
				.where(sql`${usersTable.id} in (${sq})`);

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('John');
		});

		test('join with subquery', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);
			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const citySq = db.select().from(citiesTable).as('city_sq');

			const result = await db
				.select({
					userName: usersTable.name,
					cityName: citySq.name,
				})
				.from(usersTable)
				.leftJoin(citySq, sql`true`)
				.limit(2);

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty('userName');
			expect(result[0]).toHaveProperty('cityName');
		});

		test('CTE with $with', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const usersCte = db.$with('users_cte').as(
				db.select({ name: usersTable.name }).from(usersTable),
			);

			const result = await db.with(usersCte).select().from(usersCte);

			expect(result).toHaveLength(2);
			expect(result.map((r) => r.name).sort()).toEqual(['Jane', 'John']);
		});

		test('multiple CTEs', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([
				{ name: 'John', verified: true },
				{ name: 'Jane', verified: false },
			]);

			const verifiedCte = db.$with('verified_cte').as(
				db.select().from(usersTable).where(eq(usersTable.verified, true)),
			);

			const unverifiedCte = db.$with('unverified_cte').as(
				db.select().from(usersTable).where(eq(usersTable.verified, false)),
			);

			const verifiedResult = await db.with(verifiedCte).select().from(verifiedCte);
			const unverifiedResult = await db.with(unverifiedCte).select().from(unverifiedCte);

			expect(verifiedResult).toHaveLength(1);
			expect(verifiedResult[0]?.name).toBe('John');
			expect(unverifiedResult).toHaveLength(1);
			expect(unverifiedResult[0]?.name).toBe('Jane');
		});

		// ============================================
		// SET OPERATIONS TESTS
		// ============================================

		test('union', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.union(db.select({ name: citiesTable.name }).from(citiesTable));

			// Union removes duplicates - 'Jane' appears in both but should only be once
			expect(result).toHaveLength(3);
			expect(result.map((r) => r.name).sort()).toEqual(['Jane', 'John', 'Paris']);
		});

		test('union all', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.unionAll(db.select({ name: citiesTable.name }).from(citiesTable));

			// Union all keeps duplicates
			expect(result).toHaveLength(4);
			expect(result.map((r) => r.name).sort()).toEqual(['Jane', 'Jane', 'John', 'Paris']);
		});

		test('intersect', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.intersect(db.select({ name: citiesTable.name }).from(citiesTable));

			// Only 'Jane' is in both
			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('Jane');
		});

		test('intersect all', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.intersectAll(db.select({ name: citiesTable.name }).from(citiesTable));

			// 'Jane' appears twice in both, so intersect all returns 2
			expect(result).toHaveLength(2);
			expect(result.every((r) => r.name === 'Jane')).toBe(true);
		});

		test('except', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.except(db.select({ name: citiesTable.name }).from(citiesTable));

			// Only 'John' is in users but not in cities
			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('John');
		});

		test('except all', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.exceptAll(db.select({ name: citiesTable.name }).from(citiesTable));

			// 'John' + one 'Jane' (users has 2 Jane, cities has 1)
			expect(result).toHaveLength(2);
			expect(result.map((r) => r.name).sort()).toEqual(['Jane', 'John']);
		});

		test('mixed set operations', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jack' }]);
			await db.insert(citiesTable).values([{ name: 'Jane' }, { name: 'Paris' }]);

			const result = await db
				.select({ name: usersTable.name })
				.from(usersTable)
				.union(db.select({ name: citiesTable.name }).from(citiesTable))
				.except(db.select({ name: sql`'John'` }));

			// Union gives: John, Jane, Jack, Paris. Except 'John' gives: Jane, Jack, Paris
			expect(result).toHaveLength(3);
			expect(result.map((r) => r.name).sort()).toEqual(['Jack', 'Jane', 'Paris']);
		});

		// ============================================
		// LOCKING TESTS
		// ============================================

		test('select for update', (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select().from(usersTable).for('update').toSQL();

			expect(query.sql).toMatch(/for update$/);
		});

		test('select for share', (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select().from(usersTable).for('share').toSQL();

			expect(query.sql).toMatch(/for share$/);
		});

		test('select for no key update', (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select().from(usersTable).for('no key update').toSQL();

			expect(query.sql).toMatch(/for no key update$/);
		});

		test('select for key share', (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select().from(usersTable).for('key share').toSQL();

			expect(query.sql).toMatch(/for key share$/);
		});

		test('select for update nowait', (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select().from(usersTable).for('update', { noWait: true }).toSQL();

			expect(query.sql).toMatch(/for update nowait$/);
		});

		test('select for update skip locked', (ctx) => {
			const { db } = ctx.dsql;

			const query = db.select().from(usersTable).for('update', { skipLocked: true }).toSQL();

			expect(query.sql).toMatch(/for update skip locked$/);
		});

		test('for update execution', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John' });

			// Execute a FOR UPDATE query to ensure it works at runtime
			const result = await db.select().from(usersTable).for('update');

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('John');
		});

		// ============================================
		// TRANSACTION TESTS
		// ============================================

		test('transaction', async (ctx) => {
			const { db } = ctx.dsql;

			await db.transaction(async (tx) => {
				await tx.insert(usersTable).values({ name: 'TxUser' });

				const result = await tx.select().from(usersTable).where(eq(usersTable.name, 'TxUser'));
				expect(result).toHaveLength(1);
			});

			// Verify data persisted after transaction
			const result = await db.select().from(usersTable).where(eq(usersTable.name, 'TxUser'));
			expect(result).toHaveLength(1);
		});

		test('transaction rollback', async (ctx) => {
			const { db } = ctx.dsql;

			await expect(
				db.transaction(async (tx) => {
					await tx.insert(usersTable).values({ name: 'RollbackUser' });

					// Verify insert within transaction
					const withinTx = await tx.select().from(usersTable).where(eq(usersTable.name, 'RollbackUser'));
					expect(withinTx).toHaveLength(1);

					tx.rollback();
				}),
			).rejects.toThrow(TransactionRollbackError);

			// Verify data was rolled back
			const result = await db.select().from(usersTable).where(eq(usersTable.name, 'RollbackUser'));
			expect(result).toHaveLength(0);
		});

		test('nested transaction (savepoints)', async (ctx) => {
			const { db } = ctx.dsql;

			await db.transaction(async (tx) => {
				await tx.insert(usersTable).values({ name: 'OuterTxUser' });

				await tx.transaction(async (tx2) => {
					await tx2.insert(usersTable).values({ name: 'InnerTxUser' });
				});
			});

			// Both inserts should be committed
			const result = await db.select().from(usersTable);
			expect(result).toHaveLength(2);
			expect(result.map((r) => r.name).sort()).toEqual(['InnerTxUser', 'OuterTxUser']);
		});

		test('nested transaction rollback', async (ctx) => {
			const { db } = ctx.dsql;

			await db.transaction(async (tx) => {
				await tx.insert(usersTable).values({ name: 'OuterUser' });

				await expect(
					tx.transaction(async (tx2) => {
						await tx2.insert(usersTable).values({ name: 'InnerUser' });
						tx2.rollback();
					}),
				).rejects.toThrow(TransactionRollbackError);
			});

			// Only outer insert should be committed (inner was rolled back via savepoint)
			const result = await db.select().from(usersTable);
			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe('OuterUser');
		});

		test('transaction with isolation level', async (ctx) => {
			const { db } = ctx.dsql;

			// DSQL only supports repeatable read isolation level
			await db.transaction(
				async (tx) => {
					await tx.insert(usersTable).values({ name: 'IsolationUser' });
				},
				{ isolationLevel: 'repeatable read' },
			);

			const result = await db.select().from(usersTable).where(eq(usersTable.name, 'IsolationUser'));
			expect(result).toHaveLength(1);
		});

		test('transaction with access mode', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'ExistingUser' });

			await db.transaction(
				async (tx) => {
					// Read-only transaction should allow selects
					const result = await tx.select().from(usersTable);
					expect(result).toHaveLength(1);
				},
				{ accessMode: 'read only' },
			);
		});

		// ============================================
		// RELATIONAL QUERIES (RQB) TESTS
		// ============================================

		test('rqb: findFirst', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const result = await db.query.usersTable.findFirst();

			expect(result).toBeDefined();
			expect(result?.name).toBeDefined();
		});

		test('rqb: findMany', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const result = await db.query.usersTable.findMany();

			expect(result).toHaveLength(2);
		});

		test('rqb: findFirst with where', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const result = await db.query.usersTable.findFirst({
				where: eq(usersTable.name, 'Jane'),
			});

			expect(result?.name).toBe('Jane');
		});

		test('rqb: findMany with orderBy', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Alice' }]);

			const result = await db.query.usersTable.findMany({
				orderBy: { name: 'asc' },
			});

			expect(result[0]?.name).toBe('Alice');
			expect(result[1]?.name).toBe('Jane');
			expect(result[2]?.name).toBe('John');
		});

		test('rqb: findMany with limit', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Alice' }]);

			const result = await db.query.usersTable.findMany({
				limit: 2,
			});

			expect(result).toHaveLength(2);
		});

		test('rqb: findFirst with columns selection', async (ctx) => {
			const { db } = ctx.dsql;

			await db.insert(usersTable).values({ name: 'John', verified: true });

			const result = await db.query.usersTable.findFirst({
				columns: {
					name: true,
					verified: true,
				},
			});

			expect(result?.name).toBe('John');
			expect(result?.verified).toBe(true);
			expect(result).not.toHaveProperty('id');
		});

		test('rqb: findMany with relation', async (ctx) => {
			const { db } = ctx.dsql;

			const postsTable = dsqlTable('posts', {
				id: uuid('id').primaryKey().defaultRandom(),
				title: text('title').notNull(),
				authorId: uuid('author_id').notNull(),
			});

			await db.execute(sql`drop table if exists posts cascade`);
			await db.execute(sql`
				create table posts (
					id uuid primary key default gen_random_uuid(),
					title text not null,
					author_id uuid not null
				)
			`);

			const [user] = await db.insert(usersTable).values({ name: 'John' }).returning();
			await db.insert(postsTable).values([
				{ title: 'Post 1', authorId: user!.id },
				{ title: 'Post 2', authorId: user!.id },
			]);

			// This test documents expected behavior for relations
			// Will fail until RQB relations are implemented for DSQL
			const result = await db.query.usersTable.findFirst({
				with: {
					posts: true,
				},
			});

			expect(result?.name).toBe('John');
			expect(result?.posts).toHaveLength(2);
		});

		test('rqb: nested relations', async (ctx) => {
			const { db } = ctx.dsql;

			const postsTable = dsqlTable('posts', {
				id: uuid('id').primaryKey().defaultRandom(),
				title: text('title').notNull(),
				authorId: uuid('author_id').notNull(),
			});

			const commentsTable = dsqlTable('comments', {
				id: uuid('id').primaryKey().defaultRandom(),
				content: text('content').notNull(),
				postId: uuid('post_id').notNull(),
			});

			await db.execute(sql`drop table if exists comments cascade`);
			await db.execute(sql`drop table if exists posts cascade`);
			await db.execute(sql`
				create table posts (
					id uuid primary key default gen_random_uuid(),
					title text not null,
					author_id uuid not null
				)
			`);
			await db.execute(sql`
				create table comments (
					id uuid primary key default gen_random_uuid(),
					content text not null,
					post_id uuid not null
				)
			`);

			const [user] = await db.insert(usersTable).values({ name: 'John' }).returning();
			const [post] = await db.insert(postsTable).values({ title: 'Post 1', authorId: user!.id }).returning();
			await db.insert(commentsTable).values([
				{ content: 'Comment 1', postId: post!.id },
				{ content: 'Comment 2', postId: post!.id },
			]);

			// This test documents expected behavior for nested relations
			const result = await db.query.usersTable.findFirst({
				with: {
					posts: {
						with: {
							comments: true,
						},
					},
				},
			});

			expect(result?.name).toBe('John');
			expect(result?.posts?.[0]?.comments).toHaveLength(2);
		});

		// ============================================
		// MIGRATION TESTS
		// ============================================

		test('migrate function exists', async (ctx) => {
			const { db } = ctx.dsql;

			// Verify migrate function is available on the dialect
			expect(db.dialect.migrate).toBeDefined();
			expect(typeof db.dialect.migrate).toBe('function');
		});

		test('migrate creates migration table', async (ctx) => {
			const { db } = ctx.dsql;

			// Clean up any existing migration table
			await db.execute(sql`drop table if exists __drizzle_migrations cascade`);

			// Run migrate with empty migrations
			await db.dialect.migrate([], db.session, { migrationsFolder: './migrations' });

			// Verify migration table was created
			const result = await db.execute<{ tablename: string }>(
				sql`SELECT tablename FROM pg_tables WHERE tablename = '__drizzle_migrations'`,
			);

			expect(result.rows).toHaveLength(1);
		});

		test('migrate applies migrations', async (ctx) => {
			const { db } = ctx.dsql;

			// Clean up
			await db.execute(sql`drop table if exists __drizzle_migrations cascade`);
			await db.execute(sql`drop table if exists migration_test cascade`);

			const migrations = [
				{
					sql: ['create table migration_test (id uuid primary key default gen_random_uuid(), name text not null)'],
					bps: true,
					folderMillis: Date.now(),
					hash: 'test_hash_1',
				},
			];

			await db.dialect.migrate(migrations, db.session, { migrationsFolder: './migrations' });

			// Verify table was created
			const result = await db.execute<{ tablename: string }>(
				sql`SELECT tablename FROM pg_tables WHERE tablename = 'migration_test'`,
			);

			expect(result.rows).toHaveLength(1);
		});

		test('migrate skips already applied migrations', async (ctx) => {
			const { db } = ctx.dsql;

			// Clean up
			await db.execute(sql`drop table if exists __drizzle_migrations cascade`);
			await db.execute(sql`drop table if exists migration_test cascade`);

			const migrations = [
				{
					sql: ['create table migration_test (id uuid primary key default gen_random_uuid(), name text not null)'],
					bps: true,
					folderMillis: Date.now(),
					hash: 'test_hash_2',
				},
			];

			// Run migrations twice
			await db.dialect.migrate(migrations, db.session, { migrationsFolder: './migrations' });
			await db.dialect.migrate(migrations, db.session, { migrationsFolder: './migrations' });

			// Should not throw and migration should only be applied once
			const result = await db.execute<{ count: string }>(
				sql`SELECT count(*) as count FROM __drizzle_migrations`,
			);

			expect(parseInt(result.rows[0]!.count)).toBe(1);
		});

		test('migrate with migrationsTable option', async (ctx) => {
			const { db } = ctx.dsql;

			const customTableName = 'custom_migrations';

			// Clean up
			await db.execute(sql`drop table if exists ${sql.identifier(customTableName)} cascade`);

			await db.dialect.migrate([], db.session, {
				migrationsFolder: './migrations',
				migrationsTable: customTableName,
			});

			// Verify custom migration table was created
			const result = await db.execute<{ tablename: string }>(
				sql`SELECT tablename FROM pg_tables WHERE tablename = ${customTableName}`,
			);

			expect(result.rows).toHaveLength(1);
		});

		// ============================================
		// USER MANAGEMENT TESTS (DSQL-specific)
		// ============================================

		test('create role', async (ctx) => {
			const { db } = ctx.dsql;

			const testRole = `test_role_${Date.now()}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(testRole)}`);

				// Verify role exists
				const result = await db.execute<{ rolname: string }>(
					sql`SELECT rolname FROM pg_roles WHERE rolname = ${testRole}`,
				);

				expect(result.rows).toHaveLength(1);
				expect(result.rows[0]?.rolname).toBe(testRole);
			} finally {
				// Cleanup
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(testRole)}`);
			}
		});

		test('grant select permission to role', async (ctx) => {
			const { db } = ctx.dsql;

			const testRole = `test_role_grant_${Date.now()}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(testRole)}`);
				await db.execute(sql`GRANT SELECT ON users TO ${sql.identifier(testRole)}`);

				// Verify grant exists
				const result = await db.execute<{ privilege_type: string }>(
					sql`SELECT privilege_type FROM information_schema.role_table_grants
						WHERE table_name = 'users' AND grantee = ${testRole}`,
				);

				expect(result.rows.length).toBeGreaterThan(0);
				expect(result.rows.some((r) => r.privilege_type === 'SELECT')).toBe(true);
			} finally {
				// Cleanup
				await db.execute(sql`REVOKE ALL ON users FROM ${sql.identifier(testRole)}`);
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(testRole)}`);
			}
		});

		test('grant multiple permissions to role', async (ctx) => {
			const { db } = ctx.dsql;

			const testRole = `test_role_multi_${Date.now()}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(testRole)}`);
				await db.execute(sql`GRANT SELECT, INSERT, UPDATE ON users TO ${sql.identifier(testRole)}`);

				// Verify grants exist
				const result = await db.execute<{ privilege_type: string }>(
					sql`SELECT privilege_type FROM information_schema.role_table_grants
						WHERE table_name = 'users' AND grantee = ${testRole}`,
				);

				const privileges = result.rows.map((r) => r.privilege_type);
				expect(privileges).toContain('SELECT');
				expect(privileges).toContain('INSERT');
				expect(privileges).toContain('UPDATE');
			} finally {
				// Cleanup
				await db.execute(sql`REVOKE ALL ON users FROM ${sql.identifier(testRole)}`);
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(testRole)}`);
			}
		});

		test('revoke permission from role', async (ctx) => {
			const { db } = ctx.dsql;

			const testRole = `test_role_revoke_${Date.now()}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(testRole)}`);
				await db.execute(sql`GRANT SELECT, INSERT ON users TO ${sql.identifier(testRole)}`);
				await db.execute(sql`REVOKE INSERT ON users FROM ${sql.identifier(testRole)}`);

				// Verify only SELECT remains
				const result = await db.execute<{ privilege_type: string }>(
					sql`SELECT privilege_type FROM information_schema.role_table_grants
						WHERE table_name = 'users' AND grantee = ${testRole}`,
				);

				const privileges = result.rows.map((r) => r.privilege_type);
				expect(privileges).toContain('SELECT');
				expect(privileges).not.toContain('INSERT');
			} finally {
				// Cleanup
				await db.execute(sql`REVOKE ALL ON users FROM ${sql.identifier(testRole)}`);
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(testRole)}`);
			}
		});

		test('alter role', async (ctx) => {
			const { db } = ctx.dsql;

			const testRole = `test_role_alter_${Date.now()}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(testRole)}`);

				// Alter role to have login capability
				await db.execute(sql`ALTER ROLE ${sql.identifier(testRole)} WITH LOGIN`);

				// Verify role was altered
				const result = await db.execute<{ rolcanlogin: boolean }>(
					sql`SELECT rolcanlogin FROM pg_roles WHERE rolname = ${testRole}`,
				);

				expect(result.rows).toHaveLength(1);
				expect(result.rows[0]?.rolcanlogin).toBe(true);
			} finally {
				// Cleanup
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(testRole)}`);
			}
		});

		test('drop role', async (ctx) => {
			const { db } = ctx.dsql;

			const testRole = `test_role_drop_${Date.now()}`;

			await db.execute(sql`CREATE ROLE ${sql.identifier(testRole)}`);

			// Verify role exists
			const beforeDrop = await db.execute<{ rolname: string }>(
				sql`SELECT rolname FROM pg_roles WHERE rolname = ${testRole}`,
			);
			expect(beforeDrop.rows).toHaveLength(1);

			// Drop role
			await db.execute(sql`DROP ROLE ${sql.identifier(testRole)}`);

			// Verify role no longer exists
			const afterDrop = await db.execute<{ rolname: string }>(
				sql`SELECT rolname FROM pg_roles WHERE rolname = ${testRole}`,
			);
			expect(afterDrop.rows).toHaveLength(0);
		});

		test('grant role to another role', async (ctx) => {
			const { db } = ctx.dsql;

			const parentRole = `parent_role_${Date.now()}`;
			const childRole = `child_role_${Date.now()}`;

			try {
				await db.execute(sql`CREATE ROLE ${sql.identifier(parentRole)}`);
				await db.execute(sql`CREATE ROLE ${sql.identifier(childRole)}`);
				await db.execute(sql`GRANT ${sql.identifier(parentRole)} TO ${sql.identifier(childRole)}`);

				// Verify role membership
				const result = await db.execute<{ member: string }>(
					sql`SELECT pg_get_userbyid(member) as member
						FROM pg_auth_members
						WHERE roleid = (SELECT oid FROM pg_roles WHERE rolname = ${parentRole})`,
				);

				expect(result.rows.some((r) => r.member === childRole)).toBe(true);
			} finally {
				// Cleanup
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(childRole)}`);
				await db.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(parentRole)}`);
			}
		});
	});
}
