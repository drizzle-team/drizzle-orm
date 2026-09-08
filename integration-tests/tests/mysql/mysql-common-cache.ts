import { eq, sql } from 'drizzle-orm';
import { alias, boolean, int, json, mysqlTable, serial, text, timestamp } from 'drizzle-orm/mysql-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';

const usersTable = mysqlTable('users_for_cache', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

const postsTable = mysqlTable('posts_for_cache', {
	id: serial().primaryKey(),
	description: text().notNull(),
	userId: int('city_id').references(() => usersTable.id),
});

export function runTests(vendor: 'mysql' | 'planetscale', test: Test) {
	describe('cache:', () => {
		test.beforeEach(async ({ client }) => {
			await client.batch([
				`drop table if exists users_for_cache, posts_for_cache`,
			]);
			await client.batch([
				`create table users_for_cache (
						id serial primary key,
						name text not null,
						verified boolean not null default false,
						jsonb json,
						created_at timestamp not null default now()
					)`,
				`create table posts_for_cache (
						id serial primary key,
						description text not null,
						user_id int
					)`,
			]);
		});

		test('test force invalidate', async ({ drizzle }) => {
			const { db, invalidate } = drizzle.withCacheExplicit;

			await db.$cache?.invalidate({ tables: 'users_for_cache' });
			expect(invalidate).toHaveBeenCalledTimes(1);
		});

		test('default global config - no cache should be hit', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheExplicit;

			await db.select().from(usersTable);

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(invalidate).toHaveBeenCalledTimes(0);
		});

		test('default global config + enable cache on select: get, put', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheExplicit;

			await db.select().from(usersTable).$withCache();

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(0);
		});

		test('default global config + enable cache on select + write: get, put, onMutate', async ({ drizzle }) => {
			const { db, put, get, onMutate: invalidate } = drizzle.withCacheExplicit;

			await db.select().from(usersTable).$withCache({ config: { ex: 1 } });

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(0);

			put.mockClear();
			get.mockClear();
			invalidate.mockClear();

			await db.insert(usersTable).values({ name: 'John' });

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(invalidate).toHaveBeenCalledTimes(1);
		});

		test('default global config + enable cache on select + disable invalidate: get, put', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheExplicit;

			await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false, config: { ex: 1 } });

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(0);

			await db.insert(usersTable).values({ name: 'John' });

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
			// TODO: check?
		});

		test('global: true + disable cache', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheAll;

			await db.select().from(usersTable).$withCache(false);

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(invalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - cache should be hit', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheAll;

			await db.select().from(usersTable);

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - cache: false on select - no cache hit', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheAll;

			await db.select().from(usersTable).$withCache(false);

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(invalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - disable invalidate - cache hit + no invalidate', async ({ drizzle }) => {
			const { db, put, get, onMutate: invalidate } = drizzle.withCacheAll;

			await db.select().from(usersTable).$withCache({ autoInvalidate: false });

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(0);

			put.mockClear();
			get.mockClear();
			invalidate.mockClear();

			await db.insert(usersTable).values({ name: 'John' });

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(invalidate).toHaveBeenCalledTimes(1);
		});

		test('global: true - with custom tag', async ({ drizzle }) => {
			const { db, put, get, invalidate } = drizzle.withCacheAll;

			await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false });

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(0);

			await db.insert(usersTable).values({ name: 'John' });

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
			// TODO: check?
		});

		// check select used tables
		test('check simple select used tables', ({ drizzle }) => {
			const { db } = drizzle.withCacheExplicit;

			// @ts-expect-error
			expect(db.select().from(usersTable).getUsedTables()).toStrictEqual(['users_for_cache']);
			// @ts-expect-error
			expect(db.select().from(sql`${usersTable}`).getUsedTables()).toStrictEqual(['users_for_cache']);
		});

		// check select+join used tables
		test('select+join', ({ drizzle }) => {
			const { db } = drizzle.withCacheExplicit;

			// @ts-expect-error
			expect(db.select().from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables())
				.toStrictEqual(['users_for_cache', 'posts_for_cache']);
			expect(
				// @ts-expect-error
				db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables(),
			).toStrictEqual(['users_for_cache', 'posts_for_cache']);
		});

		// check select+2join used tables
		test('select+2joins', ({ drizzle }) => {
			const { db } = drizzle.withCacheExplicit;

			expect(
				db.select().from(usersTable).leftJoin(
					postsTable,
					eq(usersTable.id, postsTable.userId),
				).leftJoin(
					alias(postsTable, 'post2'),
					eq(usersTable.id, postsTable.userId),
				)
					// @ts-expect-error
					.getUsedTables(),
			)
				.toStrictEqual(['users_for_cache', 'posts_for_cache']);
			expect(
				db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).leftJoin(
					alias(postsTable, 'post2'),
					eq(usersTable.id, postsTable.userId),
					// @ts-expect-error
				).getUsedTables(),
			).toStrictEqual(['users_for_cache', 'posts_for_cache']);
		});
		// select subquery used tables
		test('select+join', ({ drizzle }) => {
			const { db } = drizzle.withCacheExplicit;

			const sq = db.select().from(usersTable).where(eq(usersTable.id, 42)).as('sq');
			db.select().from(sq);

			// @ts-expect-error
			expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users_for_cache']);
		});
	});
}
