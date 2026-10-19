import { eq, sql } from 'drizzle-orm';
import { alias, boolean, int, json, mysqlSchema, mysqlTable, serial, text, timestamp } from 'drizzle-orm/mysql-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';
import { rqbPost, rqbUser } from './schema';

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

		test('write: onMutate runs after the write is committed', async ({ drizzle }) => {
			const { db, onMutate } = drizzle.withCacheExplicit;

			const seen: string[][] = [];
			onMutate.mockImplementationOnce(async () => {
				const rows = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, 1));
				seen.push(rows.map((r) => r.name));
			});

			await db.insert(usersTable).values({ id: 1, name: 'John' });

			expect(onMutate).toHaveBeenCalledTimes(1);
			expect(seen).toStrictEqual([['John']]);
		});

		test('failed write: no onMutate', async ({ drizzle }) => {
			const { db, onMutate } = drizzle.withCacheExplicit;

			await db.insert(usersTable).values({ id: 1, name: 'John' });
			onMutate.mockClear();

			await expect(db.insert(usersTable).values({ id: 1, name: 'Jane' })).rejects.toThrow();

			expect(onMutate).toHaveBeenCalledTimes(0);
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

		test('relational: default global config - no cache should be hit', async ({ drizzle, push }) => {
			const { db, put, get, onMutate } = drizzle.withCacheExplicit;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });
			onMutate.mockClear();

			await db.query.rqbUser.findMany();

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(onMutate).toHaveBeenCalledTimes(0);
		});

		test('relational: default global config + withCache: get, put', async ({ drizzle, push }) => {
			const { db, put, get, onMutate } = drizzle.withCacheExplicit;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });
			onMutate.mockClear();

			await db.query.rqbUser.findMany({ withCache: true });

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(onMutate).toHaveBeenCalledTimes(0);
		});

		test('relational: global: true - cache should be hit', async ({ drizzle, push }) => {
			const { db, put, get, onMutate } = drizzle.withCacheAll;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });
			onMutate.mockClear();

			await db.query.rqbUser.findFirst();

			expect(put).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledTimes(1);
			expect(onMutate).toHaveBeenCalledTimes(0);
		});

		test('relational: global: true - withCache: false - no cache hit', async ({ drizzle, push }) => {
			const { db, put, get, onMutate } = drizzle.withCacheAll;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });
			onMutate.mockClear();

			await db.query.rqbUser.findMany({ withCache: false });

			expect(put).toHaveBeenCalledTimes(0);
			expect(get).toHaveBeenCalledTimes(0);
			expect(onMutate).toHaveBeenCalledTimes(0);
		});

		test('relational: relation tables - cache hit + invalidate', async ({ drizzle, push }) => {
			const { db, put, get } = drizzle.withCacheExplicit;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await db.execute(sql`drop table if exists ${rqbPost}`);
			await push({ rqbUser, rqbPost });
			const createdAt = new Date('2024-01-01T00:00:00.000Z');
			await db.insert(rqbUser).values({ id: 1, name: 'John', createdAt });
			await db.insert(rqbPost).values({ id: 1, userId: 1, content: 'First', createdAt });

			const query = () =>
				db.query.rqbUser.findMany({
					columns: { name: true },
					with: { posts: { columns: { content: true }, orderBy: { id: 'asc' } } },
					withCache: true,
				});

			expect(await query()).toStrictEqual([{ name: 'John', posts: [{ content: 'First' }] }]);
			expect(put).toHaveBeenNthCalledWith(
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
			expect(get).toHaveBeenCalledTimes(2);
			expect(put).toHaveBeenCalledTimes(1);

			await db.insert(rqbPost).values({ id: 3, userId: 1, content: 'Third', createdAt });
			expect(await query()).toStrictEqual([{
				name: 'John',
				posts: [{ content: 'First' }, { content: 'Unseen' }, { content: 'Third' }],
			}]);
			expect(put).toHaveBeenCalledTimes(2);
		});

		test('relational: raw sql tables - invalidate', async ({ drizzle, push }) => {
			const { db, put } = drizzle.withCacheExplicit;

			await db.execute(sql`drop table if exists ${rqbUser}`);
			await push({ rqbUser });
			await db.insert(rqbUser).values({ id: 1, name: 'John', createdAt: new Date('2024-01-01T00:00:00.000Z') });

			const query = () =>
				db.query.rqbUser.findMany({
					columns: { name: true },
					where: {
						RAW: (t) => sql`exists (select 1 from ${usersTable} where ${usersTable.name} = ${t.name})`,
					},
					withCache: true,
				});

			expect(await query()).toStrictEqual([]);
			expect(put).toHaveBeenNthCalledWith(
				1,
				expect.any(String),
				expect.anything(),
				['user_rqb_test', 'users_for_cache'],
				false,
				{},
			);

			await db.insert(usersTable).values({ name: 'John' });
			expect(await query()).toStrictEqual([{ name: 'John' }]);
			expect(put).toHaveBeenCalledTimes(2);
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

		test('used tables: ctes & query builders embedded into raw SQL keep their tables', ({ drizzle }) => {
			const { db } = drizzle.withCacheExplicit;
			const usedTablesOf = (query: unknown): string[] => (query as any).getUsedTables();
			const users = mysqlTable('cache_users', { id: int() });
			const posts = mysqlTable('cache_posts', { id: int() });
			const audit = mysqlTable('cache_audit', { id: int() });
			const comments = mysqlSchema('s').table('cache_comments', { id: int() });

			const cte = db.$with('cte').as(db.select().from(audit));
			expect(usedTablesOf(db.with(cte).select().from(users))).toStrictEqual(['cache_audit', 'cache_users']);

			// Index hints go between aliased table's name and alias
			const author = alias(users, 'author');
			const inner = db.select({ id: author.id }).from(author)
				.leftJoin(posts, sql`true`, { useIndex: ['i1'] })
				.innerJoin(alias(comments, 'c'), sql`true`, { forceIndex: ['i2'] });
			expect(inner.toSQL().sql).toBe(
				'select `author`.`id` from `cache_users` `author` left join `cache_posts` USE INDEX (`i1`) on true'
					+ ' inner join `s`.`cache_comments` FORCE INDEX (`i2`) `c` on true',
			);
			expect(usedTablesOf(db.select().from(sql`${audit} where exists (${inner})`))).toStrictEqual([
				'cache_audit',
				'cache_users',
				'cache_posts',
				's.cache_comments',
			]);
		});
	});
}
