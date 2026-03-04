import { eq, sql } from 'drizzle-orm';
import { alias, boolean, int, json, serial, singlestoreTable, text, timestamp } from 'drizzle-orm/singlestore-core';
import { describe, expect, vi } from 'vitest';
import type { Test } from './instrumentation';

const usersTable = singlestoreTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

const postsTable = singlestoreTable('posts', {
	id: serial().primaryKey(),
	description: text().notNull(),
	userId: int('city_id'),
});

export function tests(test: Test) {
	describe('common_cache', () => {
		test.beforeEach(async ({ caches, push }) => {
			const { explicit, all } = caches;
			await Promise.all([
				explicit.execute(sql`drop table if exists users`),
				explicit.execute(sql`drop table if exists posts`),
			]);
			await explicit.$cache?.invalidate({ tables: 'users' });
			await all.$cache?.invalidate({ tables: 'users' });
			// public users
			await Promise.all([
				push({ usersTable }),
				push({ postsTable }),
			]);
		});

		test.concurrent('test force invalidate', async ({ caches }) => {
			const { explicit: db } = caches;

			using spyInvalidate = vi.spyOn(db.$cache, 'invalidate');
			await db.$cache?.invalidate({ tables: 'users' });
			expect(spyInvalidate).toHaveBeenCalledTimes(1);
		});

		test.concurrent('default global config - no cache should be hit', async ({ caches }) => {
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

		test.concurrent('default global config + enable cache on select: get, put', async ({ caches }) => {
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

		test.concurrent('default global config + enable cache on select + write: get, put, onMutate', async ({ caches }) => {
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

		test.concurrent('default global config + enable cache on select + disable invalidate: get, put', async ({ caches }) => {
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

		test.concurrent('global: true + disable cache', async ({ caches }) => {
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

		test.concurrent('global: true - cache should be hit', async ({ caches }) => {
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

		test.concurrent('global: true - cache: false on select - no cache hit', async ({ caches }) => {
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

		test.concurrent('global: true - disable invalidate - cache hit + no invalidate', async ({ caches }) => {
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

		test.concurrent('global: true - with custom tag', async ({ caches }) => {
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
		test.concurrent('check simple select used tables', ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			expect(db.select().from(usersTable).getUsedTables()).toStrictEqual(['users']);
			// @ts-expect-error
			expect(db.select().from(sql`${usersTable}`).getUsedTables()).toStrictEqual(['users']);
		});
		// check select+join used tables
		test.concurrent('select+join', ({ caches }) => {
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
		test.concurrent('select+2joins', ({ caches }) => {
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
		test.concurrent('select+join', ({ caches }) => {
			const { explicit: db } = caches;

			const sq = db.select().from(usersTable).where(eq(usersTable.id, 42)).as('sq');
			db.select().from(sq);

			// @ts-expect-error
			expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users']);
		});
	});
}
