import { eq, sql } from 'drizzle-orm';
import { alias, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, vi } from 'vitest';
import { Test } from './instrumentation';

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
	jsonb: text('jsonb', { mode: 'json' }).$type<string[]>(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
});

const postsTable = sqliteTable('posts', {
	id: integer().primaryKey({ autoIncrement: true }),
	description: text().notNull(),
	userId: integer('user_id').references(() => usersTable.id),
});

export function tests(test: Test, exclude: string[] = []) {
	test.beforeEach(({ task, skip }) => {
		if (exclude.includes(task.name)) skip();
	});
	describe('common_cache', () => {
		test.beforeEach(async ({ caches }) => {
			const { explicit, all } = caches;
			await explicit.run(sql`drop table if exists users`);
			await explicit.run(sql`drop table if exists posts`);
			await explicit.$cache?.invalidate({ tables: 'users' });
			await all.$cache?.invalidate({ tables: 'users' });
			// public users
			await explicit.run(
				sql`
					create table users (
						id integer primary key AUTOINCREMENT,
						name text not null,
						verified integer not null default 0,
						jsonb text,
						created_at integer
					)
				`,
			);
			await explicit.run(
				sql`
					create table posts (
						id integer primary key AUTOINCREMENT,
						description text not null,
						user_id int
					)
				`,
			);
		});

		test('test force invalidate', async ({ caches }) => {
			const { explicit: db } = caches;

			using spyInvalidate = vi.spyOn(db.$cache, 'invalidate');
			await db.$cache?.invalidate({ tables: 'users' });
			expect(spyInvalidate).toHaveBeenCalledTimes(1);
		});

		test('default global config - no cache should be hit', async ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable);

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('default global config + enable cache on select: get, put', async ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache();

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('default global config + enable cache on select + write: get, put, onMutate', async ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ config: { ex: 1 } });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);

			spyPut.mockClear();
			spyGet.mockClear();
			spyInvalidate.mockClear();

			await db.insert(usersTable).values({ name: 'John' });

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(1);
		});

		test('default global config + enable cache on select + disable invalidate: get, put', async ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false, config: { ex: 1 } });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);

			await db.insert(usersTable).values({ name: 'John' });

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
		});

		test('global: true + disable cache', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache(false);

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - cache should be hit', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable);

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - cache: false on select - no cache hit', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache(false);

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - disable invalidate - cache hit + no invalidate', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ autoInvalidate: false });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);

			spyPut.mockClear();
			spyGet.mockClear();
			spyInvalidate.mockClear();

			await db.insert(usersTable).values({ name: 'John' });

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(1);
		});

		test('global: true - with custom tag', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);

			await db.insert(usersTable).values({ name: 'John' });

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
		});

		// check select used tables
		test('check simple select used tables', ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			expect(db.select().from(usersTable).getUsedTables()).toStrictEqual(['users']);
			// @ts-expect-error
			expect(db.select().from(sql`${usersTable}`).getUsedTables()).toStrictEqual(['users']);
		});
		// check select+join used tables
		test('select+join', ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			expect(db.select().from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables())
				.toStrictEqual(['users', 'posts']);
			expect(
				// @ts-expect-error
				db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables(),
			).toStrictEqual(['users', 'posts']);
		});
		// check select+2join used tables
		test('select+2joins', ({ caches }) => {
			const { explicit: db } = caches;

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
				.toStrictEqual(['users', 'posts']);
			expect(
				db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).leftJoin(
					alias(postsTable, 'post2'),
					eq(usersTable.id, postsTable.userId),
					// @ts-expect-error
				).getUsedTables(),
			).toStrictEqual(['users', 'posts']);
		});
		// select subquery used tables
		test('select+join', ({ caches }) => {
			const { explicit: db } = caches;

			const sq = db.select().from(usersTable).where(eq(usersTable.id, 42)).as('sq');

			// @ts-expect-error
			expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users']);
		});
	});
}
