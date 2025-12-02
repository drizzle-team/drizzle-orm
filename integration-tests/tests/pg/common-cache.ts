import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { describe, expect, vi } from 'vitest';
import type { Test } from './instrumentation';
import { postsTable, usersTable } from './schema';

export function tests(test: Test) {
	describe('caches', () => {
		test.beforeEach(async ({ caches }) => {
			const { all, explicit } = caches;

			await explicit.execute(sql`drop schema if exists public cascade`);
			await explicit.$cache?.invalidate({ tables: 'users' });
			await all.$cache?.invalidate({ tables: 'users' });
			await explicit.execute(sql`create schema public`);
			// public users
			await explicit.execute(
				sql`
					create table users (
						id serial primary key,
						name text not null,
						verified boolean not null default false,
						jsonb jsonb,
						created_at timestamptz not null default now()
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
			const { explicit: db } = caches;

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

		test('global: true - with custom tag + with autoinvalidate', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ tag: 'custom' });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);

			await db.insert(usersTable).values({ name: 'John' });

			expect(spyInvalidate).toHaveBeenCalledTimes(1);

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
			db.select().from(sq);

			// @ts-expect-error
			expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users']);
		});
	});
}
