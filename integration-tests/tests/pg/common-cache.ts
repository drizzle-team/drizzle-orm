import { DrizzleQueryError, eq, exists, getCacheKey, notExists, type SQL, sql } from 'drizzle-orm';
import { alias, integer, pgSchema, pgTable, pgTableCreator, pgView, QueryBuilder, text } from 'drizzle-orm/pg-core';
import { describe, expect, onTestFinished, vi } from 'vitest';
import { type PgTestFixtures, type Test, TestCache } from './instrumentation';
import { postsTable, rqbPost, rqbUser, usersTable } from './schema';

// Tables for used tables collection tests
const cacheUsers = pgTable('cache_users', {
	id: integer().primaryKey(),
	name: text().notNull(),
});
const cachePosts = pgTable('cache_posts', {
	id: integer().primaryKey(),
	authorId: integer('author_id').notNull(),
	title: text().notNull(),
});
const cacheComments = pgTable('cache_comments', {
	id: integer().primaryKey(),
	postId: integer('post_id').notNull(),
});
const cacheGroups = pgTable('cache_groups', {
	id: integer().primaryKey(),
	name: text().notNull(),
});
const cacheUsersToGroups = pgTable('cache_users_to_groups', {
	userId: integer('user_id').notNull(),
	groupId: integer('group_id').notNull(),
});
const cacheAudit = pgTable('cache_audit', {
	id: integer().primaryKey(),
	userId: integer('user_id').notNull(),
});
const cacheSchema = { cacheUsers, cachePosts, cacheComments, cacheGroups, cacheUsersToGroups, cacheAudit };

/** `getUsedTables` is internal - collects cache keys of tables query uses */
const usedTablesOf = (query: unknown): string[] => (query as any).getUsedTables();

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

		test('write: onMutate runs after the write is committed', async ({ caches }) => {
			const { explicit: db } = caches;

			const seen: string[][] = [];
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate').mockImplementation(async () => {
				const rows = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, 1));
				seen.push(rows.map((r) => r.name));
			});

			await db.insert(usersTable).values({ id: 1, name: 'John' });

			expect(spyInvalidate).toHaveBeenCalledTimes(1);
			expect(seen).toStrictEqual([['John']]);
		});

		test('failed write: no onMutate', async ({ caches }) => {
			const { explicit: db } = caches;

			await db.insert(usersTable).values({ id: 1, name: 'John' });

			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await expect(db.insert(usersTable).values({ id: 1, name: 'Jane' })).rejects.toThrow(DrizzleQueryError);

			expect(spyInvalidate).toHaveBeenCalledTimes(0);
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

		test('relational: default global config - no cache should be hit', async ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.usersTable.findMany();

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: default global config + withCache: get, put', async ({ caches }) => {
			const { explicit: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.usersTable.findMany({ withCache: true });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: global: true - cache should be hit', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.usersTable.findFirst();

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: global: true - withCache: false - no cache hit', async ({ caches }) => {
			const { all: db } = caches;

			// @ts-expect-error
			using spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			using spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.query.usersTable.findMany({ withCache: false });

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('relational: relation tables - cache hit + invalidate', async ({ caches, push }) => {
			const { explicit: db } = caches;

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

		// https://github.com/drizzle-team/drizzle-orm/issues/4677
		test('select+join+with', async ({ caches, push }) => {
			const { all: db } = caches;

			const shortLink = pgTable('short-link', {
				id: integer().primaryKey(),
				createdBy: integer().references(() => usersTable.id),
			});

			await push({ shortLink });

			// using spyInvalidate = vi.spyOn(db.$cache, 'invalidate');
			// @ts-expect-error
			using spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			const shortLinkClickCount = db.$with('shortLinkClickCount').as(db.select().from(shortLink));

			const query = db.with(shortLinkClickCount).select().from(shortLinkClickCount).leftJoin(
				usersTable,
				eq(usersTable.id, shortLinkClickCount.createdBy),
			);
			// @ts-expect-error
			const usedTables = query.getUsedTables();
			expect(usedTables).toStrictEqual(['short-link', 'users']);

			await query;
			await db.insert(usersTable).values({ id: 1, name: 'Alex' });
			await db.insert(shortLink).values({ id: 1, createdBy: 1 });

			expect(spyInvalidate).toHaveBeenCalledTimes(2);
		});

		test('Query error wrapping', async ({ db, push }) => {
			const table = pgTable('somethingelse_error_wrap_slowpath', (t) => ({
				id: t.integer().primaryKey(),
				name: t.text().notNull(),
			}));

			await push({ table });
			await expect(db.insert(table).values([{ id: 1, name: 'First' }, { id: 1, name: 'Second' }]))
				.rejects.toBeInstanceOf(DrizzleQueryError);
		});

		describe('used tables', () => {
			/** Cached db over `cacheSchema` with seeded tables, collecting used tables passed to cache */
			const setup = async (
				{ createDB, push }: Pick<PgTestFixtures, 'createDB' | 'push'>,
				strategy: 'explicit' | 'all',
			) => {
				const cache = new TestCache(strategy);
				const db = createDB(
					cacheSchema,
					(r) => ({
						cacheUsers: {
							posts: r.many.cachePosts({ from: r.cacheUsers.id, to: r.cachePosts.authorId }),
							groups: r.many.cacheGroups({
								from: r.cacheUsers.id.through(r.cacheUsersToGroups.userId),
								to: r.cacheGroups.id.through(r.cacheUsersToGroups.groupId),
							}),
						},
						cachePosts: {
							comments: r.many.cacheComments({ from: r.cachePosts.id, to: r.cacheComments.postId }),
						},
					}),
					undefined,
					undefined,
					cache,
				);
				await push(cacheSchema);
				await db.insert(cacheUsers).values({ id: 1, name: 'John' });
				await db.insert(cachePosts).values({ id: 1, authorId: 1, title: 'First' });

				const put = vi.spyOn(cache, 'put');
				const get = vi.spyOn(cache, 'get');
				const puts = () => put.mock.calls.map((call) => [...call[2]].sort());

				return { db, puts, get };
			};

			test('relational: `withCache` is root level only', async ({ caches }) => {
				// @ts-expect-error
				caches.explicit.query.usersTable.findMany({ with: { posts: { withCache: true } } });
			});

			test('relational: subqueries used as relational entities', async ({ createDB, push }) => {
				const cache = new TestCache('explicit');
				const authors = new QueryBuilder().select({ id: cacheUsers.id, name: cacheUsers.name }).from(cacheUsers)
					.leftJoin(cacheAudit, eq(cacheAudit.userId, cacheUsers.id)).as('authors');
				const db = createDB(
					{ cachePosts, authors },
					(r) => ({
						cachePosts: { author: r.one.authors({ from: r.cachePosts.authorId, to: r.authors.id }) },
					}),
					undefined,
					undefined,
					cache,
				);
				await push(cacheSchema);
				using put = vi.spyOn(cache, 'put');

				await db.query.cachePosts.findMany({ with: { author: true }, withCache: true });
				await db.query.authors.findMany({ withCache: true });

				expect(put.mock.calls.map((call) => [...call[2]].sort())).toStrictEqual([
					['cache_audit', 'cache_posts', 'cache_users'],
					['cache_audit', 'cache_users'],
				]);
			});

			for (const strategy of ['explicit', 'all'] as const) {
				test(`relational: ${strategy} strategy`, async ({ createDB, push }) => {
					const { db, puts } = await setup({ createDB, push }, strategy);
					const withCache = strategy === 'explicit' ? true : undefined;

					// Nested relations, through tables
					await db.query.cacheUsers.findMany({
						with: { posts: { with: { comments: true } }, groups: true },
						withCache,
					});
					// Relation filters & relation orders
					await db.query.cacheUsers.findMany({ where: { posts: { comments: true } }, withCache });
					await db.query.cacheUsers.findMany({ orderBy: { groups: { name: 'asc(min)' } }, withCache });
					// Raw SQL & subqueries
					await db.query.cacheUsers.findMany({
						where: {
							RAW: (t) => sql`exists (select 1 from ${cacheAudit} where ${cacheAudit.userId} = ${t.id})`,
						},
						withCache,
					});
					await db.query.cacheUsers.findMany({
						extras: { audits: (t) => db.$count(cacheAudit, sql`${cacheAudit.userId} = ${t.id}`) },
						withCache,
					});
					await db.query.cacheUsers.findMany({
						orderBy: (t) =>
							sql`(select max(${cacheGroups.id}) from ${cacheGroups} where ${cacheGroups.name} = ${t.name})`,
						withCache,
					});
					await db.query.cacheUsers.findMany({
						where: { RAW: (t) => sql`${t.id} in ${db.select({ id: cacheAudit.userId }).from(cacheAudit)}` },
						withCache,
					});

					expect(puts()).toStrictEqual([
						['cache_comments', 'cache_groups', 'cache_posts', 'cache_users', 'cache_users_to_groups'],
						['cache_comments', 'cache_posts', 'cache_users'],
						['cache_groups', 'cache_users', 'cache_users_to_groups'],
						['cache_audit', 'cache_users'],
						['cache_audit', 'cache_users'],
						['cache_groups', 'cache_users'],
						['cache_audit', 'cache_users'],
					]);
				});
			}

			test('tables are only collected once query gets cached', async ({ createDB, push }) => {
				const { db, puts, get } = await setup({ createDB, push }, 'explicit');

				const select = db.select().from(cacheUsers).leftJoin(cachePosts, eq(cachePosts.authorId, cacheUsers.id));
				using selectTables = vi.spyOn(select, 'getUsedTables' as any);
				await select;
				expect(selectTables).not.toHaveBeenCalled();

				const query = db.query.cacheUsers.findMany({ with: { posts: true } });
				using build = vi.spyOn(query, '_getQuery' as any);
				await query;
				expect(build).toHaveBeenCalledTimes(1);
				expect(get).not.toHaveBeenCalled();

				const cached = db.select().from(cacheUsers).leftJoin(cachePosts, eq(cachePosts.authorId, cacheUsers.id))
					.$withCache();
				using cachedTables = vi.spyOn(cached, 'getUsedTables' as any);
				await cached;
				expect(cachedTables).toHaveBeenCalledTimes(1);
				expect(puts()).toStrictEqual([['cache_posts', 'cache_users']]);
			});

			test('joins, subqueries, ctes', async ({ createDB, push }) => {
				const { db, puts } = await setup({ createDB, push }, 'explicit');

				const sq = db.select({ authorId: cachePosts.authorId }).from(cachePosts).leftJoin(
					cacheComments,
					eq(cacheComments.postId, cachePosts.id),
				).as('sq');
				await db.select().from(cacheUsers).innerJoin(sq, eq(sq.authorId, cacheUsers.id)).$withCache();

				const cte = db.$with('cte').as(db.select().from(cacheGroups));
				await db.with(cte).select().from(cte).leftJoin(cacheAudit, sql`true`).$withCache();

				expect(puts()).toStrictEqual([['cache_comments', 'cache_posts', 'cache_users'], [
					'cache_audit',
					'cache_groups',
				]]);
			});

			test('aliased tables collected by their original names', async ({ createDB, push }) => {
				const { db, puts } = await setup({ createDB, push }, 'explicit');

				const author = alias(cacheUsers, 'author');
				const post = alias(cachePosts, 'post');
				const sq = db.select({ id: alias(cacheAudit, 'a').id }).from(alias(cacheAudit, 'a')).as('sq');
				const select = () =>
					db.select({ title: post.title }).from(post).innerJoin(author, eq(author.id, post.authorId)).leftJoin(
						sq,
						sql`true`,
					).$withCache();

				expect(await select()).toStrictEqual([{ title: 'First' }]);
				expect(puts()).toStrictEqual([['cache_audit', 'cache_posts', 'cache_users']]);

				await db.update(cachePosts).set({ title: 'Updated' });
				expect(await select()).toStrictEqual([{ title: 'Updated' }]);

				const schemaPosts = pgSchema('s').table('posts', { id: integer() });
				const query = db.select().from(alias(schemaPosts, 'p1')).leftJoin(alias(schemaPosts, 'p2'), sql`true`);
				expect(usedTablesOf(query)).toStrictEqual(['s.posts']);
				expect(usedTablesOf(db.select().from(sql`${query.as('sq')}`))).toStrictEqual(['s.posts']);
			});

			test('raw SQL: cache keys of nested, aliased & prefixed tables', ({ caches }) => {
				const { explicit: db } = caches;

				const prefixed = pgTableCreator((name) => `app_${name}`)('users', { id: integer() });
				const posts = alias(cachePosts, 'p');
				const query = db.select().from(
					sql`${prefixed} cross join ${posts} where exists (${db.select().from(cacheAudit)})`,
				);

				expect(usedTablesOf(query)).toStrictEqual(['app_users', 'cache_posts', 'cache_audit']);
			});

			test('raw SQL: joined tables of embedded subquery', ({ caches }) => {
				const { explicit: db } = caches;

				const sq = db.select({ id: cacheUsers.id }).from(cacheUsers).leftJoin(cachePosts, sql`true`).as('sq');
				const query = db.select().from(sql`${cacheAudit} where exists (select 1 from ${sq})`);

				expect(usedTablesOf(query)).toStrictEqual(['cache_audit', 'cache_users', 'cache_posts']);
			});

			test('raw SQL: joined and aliased tables of embedded query builder', ({ caches }) => {
				const { explicit: db } = caches;

				const author = alias(cacheUsers, 'author');
				const inner = db.select({ id: author.id }).from(author).leftJoin(cachePosts, sql`true`).innerJoin(
					alias(cacheComments, 'c'),
					sql`true`,
				);
				const query = db.select().from(sql`${cacheAudit} where exists (${inner})`);

				expect(usedTablesOf(query)).toStrictEqual(['cache_audit', 'cache_users', 'cache_posts', 'cache_comments']);
			});

			test('subquery: tables are fixed once it is created', ({ caches }) => {
				const { explicit: db } = caches;

				const query = db.select().from(cacheUsers).$dynamic();
				const sq = query.as('sq');
				query.leftJoin(sq, sql`true`).leftJoin(cachePosts, sql`true`);

				expect(usedTablesOf(db.select().from(sq))).toStrictEqual(['cache_users']);
				expect(usedTablesOf(query)).toStrictEqual(['cache_users', 'cache_posts']);
			});

			test('subquery: nested SQL tables', ({ caches }) => {
				const { explicit: db } = caches;

				const sq = db.select().from(cacheUsers).where(sql`exists (${db.select().from(cacheAudit)})`).as('sq');

				expect(usedTablesOf(db.select().from(sq))).toStrictEqual(['cache_users', 'cache_audit']);
			});

			test('SQL chunks walk', ({ caches }) => {
				const { explicit: db } = caches;
				const usedTables = (source: SQL) => usedTablesOf(db.select().from(source));
				const auditSubquery = () => sql`(select 1 from ${cacheAudit})`;
				const usersAndAudit = ['cache_users', 'cache_audit'];

				// Nested SQL
				expect(usedTables(sql`${cacheUsers} where exists ${sql`${auditSubquery()}`}`)).toStrictEqual(usersAndAudit);
				// Param holding SQL
				expect(usedTables(sql`${cacheUsers} where exists ${sql.param(auditSubquery())}`)).toStrictEqual(usersAndAudit);
				// Chunk arrays
				expect(usedTables(sql`${cacheUsers} where 1 in ${[auditSubquery()]}`)).toStrictEqual(usersAndAudit);
				// Aliased SQL
				expect(usedTables(sql`${cacheUsers} cross join lateral ${auditSubquery().as('a')}`)).toStrictEqual(
					usersAndAudit,
				);
				// Query builders
				expect(usedTables(sql`${cacheUsers} where exists ${db.select().from(cacheAudit)}`)).toStrictEqual(
					usersAndAudit,
				);
				// Subqueries
				const sq = db.select().from(cacheAudit).as('sq');
				expect(usedTables(sql`${cacheUsers} where exists (select 1 from ${sq})`)).toStrictEqual(usersAndAudit);
				// Value rows of data-modifying CTE
				const inserted = db.$with('inserted').as(
					db.insert(cacheAudit).values({ id: 1, userId: sql`(select max(${cacheUsers.id}) from ${cacheUsers})` })
						.returning(),
				);
				expect(usedTablesOf(db.with(inserted).select().from(inserted))).toStrictEqual(['cache_audit', 'cache_users']);
				// Raw SQL in joins & CTEs
				const cte = db.$with('cte', { id: cacheGroups.id }).as(sql`select ${cacheGroups.id} from ${cacheGroups}`);
				expect(
					usedTablesOf(
						db.with(cte).select().from(cacheUsers).leftJoin(sql`${cachePosts}`, sql`true`).leftJoin(cte, sql`true`),
					),
				).toStrictEqual(['cache_groups', 'cache_users', 'cache_posts']);
			});

			test.skipIf(Date.now() < +new Date('2026-11-24'))(
				"View collects tables of all columns it's created from",
				({ caches }) => {
					const { explicit: db } = caches;
					const view = pgView('cache_users_view').as((qb) =>
						qb.select({ id: cacheUsers.id }).from(cacheUsers).leftJoin(cacheAudit, eq(cacheAudit.userId, cacheUsers.id))
					);

					expect(usedTablesOf(db.select().from(view))).toStrictEqual(['cache_users', 'cache_audit']);
					expect(usedTablesOf(db.select().from(cachePosts).leftJoin(alias(view, 'v'), sql`true`))).toStrictEqual([
						'cache_posts',
						'cache_users',
						'cache_audit',
					]);
					expect(usedTablesOf(db.select().from(sql`${cachePosts} cross join ${view}`))).toStrictEqual([
						'cache_posts',
						'cache_users',
						'cache_audit',
					]);
				},
			);

			test('select: filters, selected fields, order, set operators, ctes', ({ caches }) => {
				const { explicit: db } = caches;
				const audits = () => db.select({ id: cacheAudit.id }).from(cacheAudit);

				expect(usedTablesOf(
					db.select().from(cacheUsers).where(exists(audits())).groupBy(cacheUsers.id).having(
						sql`count(*) > (select count(*) from ${cacheGroups})`,
					),
				)).toStrictEqual(['cache_users', 'cache_audit', 'cache_groups']);
				expect(usedTablesOf(
					db.select({ id: cacheUsers.id, audits: db.$count(cacheAudit) }).from(cacheUsers).orderBy(
						sql`(select max(${cachePosts.id}) from ${cachePosts})`,
					),
				)).toStrictEqual(['cache_audit', 'cache_users', 'cache_posts']);
				expect(usedTablesOf(
					db.select({ id: cacheUsers.id }).from(cacheUsers).union(db.select({ id: cachePosts.id }).from(cachePosts))
						.except(audits()),
				)).toStrictEqual(['cache_users', 'cache_posts', 'cache_audit']);
				const cte = db.$with('cte').as(audits());
				expect(usedTablesOf(db.with(cte).select().from(cacheUsers))).toStrictEqual(['cache_audit', 'cache_users']);
			});

			test('select: invalidated by mutations of tables in its filters', async ({ createDB, push }) => {
				const { db } = await setup({ createDB, push }, 'explicit');
				const select = () =>
					db.select({ id: cacheUsers.id }).from(cacheUsers).where(
						notExists(db.select().from(cacheAudit).where(eq(cacheAudit.userId, cacheUsers.id))),
					).$withCache();

				expect(await select()).toStrictEqual([{ id: 1 }]);
				await db.insert(cacheAudit).values({ id: 1, userId: 1 });
				expect(await select()).toStrictEqual([]);
			});

			test('mutations invalidate cached selects & relational queries', async ({ createDB, push }) => {
				const { db } = await setup({ createDB, push }, 'explicit');
				const select = () =>
					db.select({ title: cachePosts.title }).from(cacheUsers).innerJoin(
						cachePosts,
						eq(cachePosts.authorId, cacheUsers.id),
					).$withCache();
				const query = () => db.query.cachePosts.findMany({ columns: { title: true }, withCache: true });

				expect(await select()).toStrictEqual([{ title: 'First' }]);
				expect(await query()).toStrictEqual([{ title: 'First' }]);
				// Manual executes must be invalidated manually
				await db.execute(sql`update ${cachePosts} set title = 'Unseen'`);
				expect(await select()).toStrictEqual([{ title: 'First' }]);
				expect(await query()).toStrictEqual([{ title: 'First' }]);

				await db.update(cachePosts).set({ title: 'Updated' });
				expect(await select()).toStrictEqual([{ title: 'Updated' }]);
				expect(await query()).toStrictEqual([{ title: 'Updated' }]);
			});

			test('inserts & deletes invalidate cached queries, incl. ones reading table via raw SQL', async ({ createDB, push }) => {
				const { db } = await setup({ createDB, push }, 'explicit');
				const select = () => db.select({ title: sql<string>`title` }).from(sql`${cachePosts}`).$withCache();
				const query = () =>
					db.query.cacheUsers.findMany({
						columns: {},
						extras: { posts: (t) => db.$count(cachePosts, eq(cachePosts.authorId, t.id)) },
						withCache: true,
					});

				expect(await select()).toStrictEqual([{ title: 'First' }]);
				expect(await query()).toStrictEqual([{ posts: 1 }]);

				await db.insert(cachePosts).values({ id: 2, authorId: 1, title: 'Second' });
				expect(await select()).toStrictEqual([{ title: 'First' }, { title: 'Second' }]);
				expect(await query()).toStrictEqual([{ posts: 2 }]);

				await db.delete(cachePosts).where(eq(cachePosts.id, 1));
				expect(await select()).toStrictEqual([{ title: 'Second' }]);
				expect(await query()).toStrictEqual([{ posts: 1 }]);
			});

			test('manual invalidation of prefixed & schema tables, by table and by actual name', async ({ createDB, push }) => {
				const { db } = await setup({ createDB, push }, 'explicit');

				const appUsers = pgTableCreator((name) => `app_${name}`)('users', {
					id: integer().primaryKey(),
					name: text(),
				});
				const cacheS = pgSchema('cache_s');
				const sPosts = cacheS.table('posts', { id: integer().primaryKey(), title: text() });
				expect(getCacheKey(appUsers)).toBe('app_users');
				expect(getCacheKey(sPosts)).toBe('cache_s.posts');
				expect(getCacheKey(alias(sPosts, 'p'))).toBe('cache_s.posts');
				await db.execute(sql`drop schema if exists cache_s cascade`);
				onTestFinished(() => db.execute(sql`drop schema if exists cache_s cascade`));
				await push({ appUsers, cacheS, sPosts });
				await db.insert(appUsers).values({ id: 1, name: 'John' });
				await db.insert(sPosts).values({ id: 1, title: 'First' });

				const users = () => db.select({ name: appUsers.name }).from(appUsers).$withCache();
				const posts = () => db.select({ title: sPosts.title }).from(sPosts).$withCache();
				expect(await users()).toStrictEqual([{ name: 'John' }]);
				expect(await posts()).toStrictEqual([{ title: 'First' }]);

				// Bypass automatic invalidation
				await db.execute(sql`update ${appUsers} set name = 'Jane'`);
				await db.execute(sql`update ${sPosts} set title = 'Second'`);
				expect(await users()).toStrictEqual([{ name: 'John' }]);
				expect(await posts()).toStrictEqual([{ title: 'First' }]);

				await db.$cache.invalidate({ tables: appUsers });
				await db.$cache.invalidate({ tables: 'cache_s.posts' });
				expect(await users()).toStrictEqual([{ name: 'Jane' }]);
				expect(await posts()).toStrictEqual([{ title: 'Second' }]);
			});

			test('mutations of prefixed tables invalidate queries reading them', async ({ createDB, push }) => {
				const { db } = await setup({ createDB, push }, 'explicit');

				const users = pgTableCreator((name) => `app_${name}`)('users', {
					id: integer().primaryKey(),
					name: text(),
				});
				await push({ users });
				await db.insert(users).values({ id: 1, name: 'John' });
				const select = () => db.select({ name: sql<string>`name` }).from(sql`${users}`).$withCache();
				const joined = () =>
					db.select({ name: users.name }).from(cachePosts).innerJoin(users, eq(users.id, cachePosts.authorId))
						.$withCache();

				expect(await select()).toStrictEqual([{ name: 'John' }]);
				expect(await joined()).toStrictEqual([{ name: 'John' }]);
				await db.update(users).set({ name: 'Jane' });
				expect(await select()).toStrictEqual([{ name: 'Jane' }]);
				expect(await joined()).toStrictEqual([{ name: 'Jane' }]);
			});
		});
	});
}
