import { requireEnv } from '@drizzle/test-utils';
import { Redis } from '@upstash/redis';
import { entityKind, getCacheKey, is, Table } from 'drizzle-orm';
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import { UpstashCache } from 'drizzle-orm/cache/upstash';
import * as Effect from 'effect/Effect';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';

/**
 * Real {@link UpstashCache} with every key & table name namespaced per instance, so concurrently running suites
 * sharing one Upstash database can neither read nor invalidate each other's entries.
 *
 * Counts hits & misses to verify that queries are actually served from cache.
 */
export class UpstashTestCache extends Cache {
	static override readonly [entityKind]: string = 'UpstashTestCache';

	hits = 0;
	misses = 0;

	private readonly inner: UpstashCache;
	private readonly namespace = `drizzle-it:${randomUUID()}:`;
	private readonly usedTables = new Set<string>();

	constructor() {
		super();
		const redis = new Redis({
			url: requireEnv('UPSTASH_REDIS_REST_URL'),
			token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
		});
		// Entries outlive the test only if cleanup fails - expire them anyway
		this.inner = new UpstashCache(redis, { ex: 120 });
	}

	override strategy() {
		return 'all' as const;
	}

	private ns = (name: string) => this.namespace + name;

	override async get(key: string, tables: string[], isTag: boolean, isAutoInvalidate?: boolean) {
		const result = await this.inner.get(this.ns(key), tables.map(this.ns), isTag, isAutoInvalidate);
		if (result === undefined) ++this.misses;
		else ++this.hits;
		return result;
	}

	override async put(key: string, response: any, tables: string[], isTag: boolean, config?: CacheConfig) {
		for (const table of tables) this.usedTables.add(table);
		await this.inner.put(this.ns(key), response, tables.map(this.ns), isTag, config);
	}

	override async onMutate({ tags, tables }: MutationOption) {
		const tagList = tags === undefined ? [] : Array.isArray(tags) ? tags : [tags];
		const tableList = tables === undefined ? [] : Array.isArray(tables) ? tables : [tables];

		await this.inner.onMutate({
			tags: tagList.map(this.ns),
			tables: tableList.map((table) => this.ns(is(table, Table) ? getCacheKey(table) : table as string)),
		});
	}

	get lookups() {
		return this.hits + this.misses;
	}

	run = async (query: any): Promise<any> => {
		const execute = () => typeof query === 'function' ? query() : query;

		const lookups = this.lookups;
		const fresh = await execute();
		if (this.lookups === lookups) return fresh; // not a cached query - mutation, `execute`, etc.

		const { hits, misses } = this;
		const cached = await execute();
		expect(this.misses, 'repeated query must not miss the cache').toBe(misses);
		expect(this.hits, 'repeated query must be served from cache').toBeGreaterThan(hits);
		expect(cached).toStrictEqual(fresh);

		return cached;
	};

	/** Asserts that `fn` got at least one query result from cache */
	async expectHits(label: string, fn: () => Promise<unknown>) {
		const hits = this.hits;
		await fn();
		expect(this.hits, `${label}: no queries were served from cache`).toBeGreaterThan(hits);
	}

	/** Removes everything this instance has written */
	async [Symbol.asyncDispose]() {
		if (this.usedTables.size) await this.inner.onMutate({ tables: [...this.usedTables].map(this.ns) });
	}
}

export const withUpstashCache = <A, E, R>(
	fn: (cache: UpstashTestCache, run: (query: any) => Promise<any>) => Effect.Effect<A, E, R>,
) =>
	Effect.gen(function*() {
		const context = yield* Effect.context<R>();
		const cache = new UpstashTestCache();
		const run = (query: any) => cache.run(() => Effect.runPromiseWith(context)(query));

		return yield* fn(cache, run).pipe(Effect.ensuring(Effect.promise(() => cache[Symbol.asyncDispose]())));
	});
