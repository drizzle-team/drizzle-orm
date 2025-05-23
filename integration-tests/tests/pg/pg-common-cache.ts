import type Docker from 'dockerode';
import { eq, getTableName, is, sql, Table } from 'drizzle-orm';
import type { MutationOption } from 'drizzle-orm/cache/core';
import { Cache } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { alias, boolean, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import Keyv from 'keyv';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class TestGlobalCache extends Cache {
	private globalTtl: number = 1000;
	private usedTablesPerKey: Record<string, string[]> = {};

	constructor(private kv: Keyv = new Keyv()) {
		super();
	}

	override strategy(): 'explicit' | 'all' {
		return 'all';
	}
	override async get(key: string, _tables: string[], _isTag: boolean): Promise<any[] | undefined> {
		const res = await this.kv.get(key) ?? undefined;
		return res;
	}
	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Promise<void> {
		await this.kv.set(key, response, config ? config.ex : this.globalTtl);
		for (const table of tables) {
			const keys = this.usedTablesPerKey[table];
			if (keys === undefined) {
				this.usedTablesPerKey[table] = [key];
			} else {
				keys.push(key);
			}
		}
	}
	override async onMutate(params: MutationOption): Promise<void> {
		const tagsArray = params.tags ? Array.isArray(params.tags) ? params.tags : [params.tags] : [];
		const tablesArray = params.tables ? Array.isArray(params.tables) ? params.tables : [params.tables] : [];

		const keysToDelete = new Set<string>();

		for (const table of tablesArray) {
			const tableName = is(table, Table) ? getTableName(table) : table as string;
			const keys = this.usedTablesPerKey[tableName] ?? [];
			for (const key of keys) keysToDelete.add(key);
		}

		if (keysToDelete.size > 0 || tagsArray.length > 0) {
			for (const tag of tagsArray) {
				await this.kv.delete(tag);
			}

			for (const key of keysToDelete) {
				await this.kv.delete(key);
				for (const table of tablesArray) {
					const tableName = is(table, Table) ? getTableName(table) : table as string;
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class TestCache extends TestGlobalCache {
	override strategy(): 'explicit' | 'all' {
		return 'explicit';
	}
}

declare module 'vitest' {
	interface TestContext {
		cachedPg: {
			db: PgDatabase<PgQueryResultHKT>;
			dbGlobalCached: PgDatabase<PgQueryResultHKT>;
		};
	}
}

const usersTable = pgTable('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	jsonb: jsonb().$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const postsTable = pgTable('posts', {
	id: serial().primaryKey(),
	description: text().notNull(),
	userId: integer('city_id').references(() => usersTable.id),
});

let pgContainer: Docker.Container;

afterAll(async () => {
	await pgContainer?.stop().catch(console.error);
});

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db, dbGlobalCached } = ctx.cachedPg;
			await db.execute(sql`drop schema if exists public cascade`);
			await db.$cache?.invalidate({ tables: 'users' });
			await dbGlobalCached.$cache?.invalidate({ tables: 'users' });
			await db.execute(sql`create schema public`);
			// public users
			await db.execute(
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

		test('test force invalidate', async (ctx) => {
			const { db } = ctx.cachedPg;

			const spyInvalidate = vi.spyOn(db.$cache, 'invalidate');
			await db.$cache?.invalidate({ tables: 'users' });
			expect(spyInvalidate).toHaveBeenCalledTimes(1);
		});

		test('default global config - no cache should be hit', async (ctx) => {
			const { db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable);

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('default global config + enable cache on select: get, put', async (ctx) => {
			const { db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache();

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('default global config + enable cache on select + write: get, put, onMutate', async (ctx) => {
			const { db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

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

		test('default global config + enable cache on select + disable invalidate: get, put', async (ctx) => {
			const { db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false, config: { ex: 1 } });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);

			await db.insert(usersTable).values({ name: 'John' });

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
		});

		test('global: true + disable cache', async (ctx) => {
			const { dbGlobalCached: db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache(false);

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - cache should be hit', async (ctx) => {
			const { dbGlobalCached: db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable);

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - cache: false on select - no cache hit', async (ctx) => {
			const { dbGlobalCached: db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache(false);

			expect(spyPut).toHaveBeenCalledTimes(0);
			expect(spyGet).toHaveBeenCalledTimes(0);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);
		});

		test('global: true - disable invalidate - cache hit + no invalidate', async (ctx) => {
			const { dbGlobalCached: db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

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

		test('global: true - with custom tag', async (ctx) => {
			const { dbGlobalCached: db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ tag: 'custom', autoInvalidate: false });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);
			expect(spyInvalidate).toHaveBeenCalledTimes(0);

			await db.insert(usersTable).values({ name: 'John' });

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
		});

		test('global: true - with custom tag + with autoinvalidate', async (ctx) => {
			const { dbGlobalCached: db } = ctx.cachedPg;

			// @ts-expect-error
			const spyPut = vi.spyOn(db.$cache, 'put');
			// @ts-expect-error
			const spyGet = vi.spyOn(db.$cache, 'get');
			// @ts-expect-error
			const spyInvalidate = vi.spyOn(db.$cache, 'onMutate');

			await db.select().from(usersTable).$withCache({ tag: 'custom' });

			expect(spyPut).toHaveBeenCalledTimes(1);
			expect(spyGet).toHaveBeenCalledTimes(1);

			await db.insert(usersTable).values({ name: 'John' });

			expect(spyInvalidate).toHaveBeenCalledTimes(1);

			// invalidate force
			await db.$cache?.invalidate({ tags: ['custom'] });
		});

		// check select used tables
		test('check simple select used tables', (ctx) => {
			const { db } = ctx.cachedPg;

			// @ts-expect-error
			expect(db.select().from(usersTable).getUsedTables()).toStrictEqual(['users']);
			// @ts-expect-error
			expect(db.select().from(sql`${usersTable}`).getUsedTables()).toStrictEqual(['users']);
		});
		// check select+join used tables
		test('select+join', (ctx) => {
			const { db } = ctx.cachedPg;

			// @ts-expect-error
			expect(db.select().from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables())
				.toStrictEqual(['users', 'posts']);
			expect(
				// @ts-expect-error
				db.select().from(sql`${usersTable}`).leftJoin(postsTable, eq(usersTable.id, postsTable.userId)).getUsedTables(),
			).toStrictEqual(['users', 'posts']);
		});
		// check select+2join used tables
		test('select+2joins', (ctx) => {
			const { db } = ctx.cachedPg;

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
		test('select+join', (ctx) => {
			const { db } = ctx.cachedPg;

			const sq = db.select().from(usersTable).where(eq(usersTable.id, 42)).as('sq');
			db.select().from(sq);

			// @ts-expect-error
			expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users']);
		});
	});
}
