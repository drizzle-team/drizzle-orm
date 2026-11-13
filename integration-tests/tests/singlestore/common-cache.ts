import { eq, sql } from 'drizzle-orm';
import { alias, boolean, int, json, serial, singlestoreTable, text, timestamp } from 'drizzle-orm/singlestore-core';
import { describe, expect, vi } from 'vitest';
import type { Test } from './instrumentation';
import { rqbPost, rqbUser } from './schema';

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

		test.concurrent('write: onMutate runs after the write is committed', async ({ caches }) => {
			const { explicit: db } = caches;

			const seen: string[][] = [];
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate').mockImplementation(async () => {
				const rows = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, 5828));
				seen.push(rows.map((r) => r.name));
			});

			await db.insert(usersTable).values({ id: 5828, name: 'John' });

			expect(spyInvalidate).toHaveBeenCalledTimes(1);
			expect(seen).toStrictEqual([['John']]);
		});

		test.concurrent('failed write: no onMutate', async ({ caches }) => {
			const { explicit: db } = caches;

			await db.insert(usersTable).values({ id: 5829, name: 'John' });

			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await expect(db.insert(usersTable).values({ id: 5829, name: 'Jane' })).rejects.toThrow();

			expect(spyInvalidate).toHaveBeenCalledTimes(0);
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

		test('relational: default global config - no cache should be hit', async ({ caches, push }) => {
			const { explicit: db } = caches;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.rqbUser.findMany();

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: default global config + withCache: get, put', async ({ caches, push }) => {
			const { explicit: db } = caches;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.rqbUser.findMany({ withCache: true });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: global: true - cache should be hit', async ({ caches, push }) => {
			const { all: db } = caches;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.rqbUser.findFirst();

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: global: true - withCache: false - no cache hit', async ({ caches, push }) => {
			const { all: db } = caches;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.rqbUser.findMany({ withCache: false });

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: relation tables - cache hit + invalidate', async ({ caches, push }) => {
			const { explicit: db } = caches;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await db.execute(sql`drop table if exists ${rqbPost}`);
			await push({ rqbUser, rqbPost });
			const createdAt = new Date('2024-01-01T00:00:00.000Z');
			await db.insert(rqbUser).values({ id: 1, name: 'John', createdAt });
			await db.insert(rqbPost).values({ id: 1, userId: 1, content: 'First', createdAt });

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');

			const query = () =>
				db.query.rqbUser.findMany({
					columns: { name: true },
					with: { posts: { columns: { content: true }, orderBy: { id: 'asc' } } },
					withCache: true,
				});

			expect(await query()).toStrictEqual([{ name: 'John', posts: [{ content: 'First' }] }]);
			expect(spyPut).toHaveBeenNthCalledWith(
				1,
				expect.any(String),
				expect.anything(),
				['user_rqb_test', 'post_rqb_test'],
				false,
				{},
			);

			// Bypasses cache invalidation, cached result is served
			await db.execute(sql`insert into ${rqbPost} values (2, 1, 'Unseen', now())`);
			expect(await query()).toStrictEqual([{ name: 'John', posts: [{ content: 'First' }] }]);
			expect(spyGet).toHaveBeenCalledTimes(2);
			expect(spyPut).toHaveBeenCalledTimes(1);

			await db.insert(rqbPost).values({ id: 3, userId: 1, content: 'Third', createdAt });
			expect(await query()).toStrictEqual([{
				name: 'John',
				posts: [{ content: 'First' }, { content: 'Unseen' }, { content: 'Third' }],
			}]);
			expect(spyPut).toHaveBeenCalledTimes(2);
		});

		test('relational: raw sql tables - invalidate', async ({ caches, push }) => {
			const { explicit: db } = caches;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });
			await db.insert(rqbUser).values({ id: 1, name: 'John', createdAt: new Date('2024-01-01T00:00:00.000Z') });

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');

			const query = () =>
				db.query.rqbUser.findMany({
					columns: { name: true },
					where: {
						RAW: (t) => sql`exists (select 1 from ${usersTable} where ${usersTable.name} = ${t.name})`,
					},
					withCache: true,
				});

			expect(await query()).toStrictEqual([]);
			expect(spyPut).toHaveBeenNthCalledWith(
				1,
				expect.any(String),
				expect.anything(),
				['user_rqb_test', 'users'],
				false,
				{},
			);

			await db.insert(usersTable).values({ name: 'John' });
			expect(await query()).toStrictEqual([{ name: 'John' }]);
			expect(spyPut).toHaveBeenCalledTimes(2);
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

		test('used tables: ctes & query builders embedded into raw SQL keep their tables', ({ caches }) => {
			const { explicit: db } = caches;
			const usedTablesOf = (query: unknown): string[] => (query as any).getUsedTables();
			const users = singlestoreTable('cache_users', { id: int() });
			const posts = singlestoreTable('cache_posts', { id: int() });
			const audit = singlestoreTable('cache_audit', { id: int() });

			const cte = db.$with('cte').as(db.select().from(audit));
			expect(usedTablesOf(db.with(cte).select().from(users))).toStrictEqual(['cache_audit', 'cache_users']);

			const author = alias(users, 'author');
			const inner = db.select({ id: author.id }).from(author).leftJoin(alias(posts, 'p'), sql`true`);
			expect(usedTablesOf(db.select().from(sql`${audit} where exists (${inner})`))).toStrictEqual([
				'cache_audit',
				'cache_users',
				'cache_posts',
			]);
		});
	});
}
