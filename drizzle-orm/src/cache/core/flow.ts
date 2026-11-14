import { io, type Program, user } from '~/runtime/index.ts';
import type { MutationOption } from './cache.ts';
import { strategyFor } from './cache.ts';
import type { CacheConfig, QueryMetadata, WithCacheConfig } from './types.ts';

/**
 * The cache as the flow uses it: each method returns what the runtime runs, a Promise for the async API or an
 * Effect for the Effect API
 */
export interface CacheOps {
	get(key: string, tables: string[], isTag: boolean, isAutoInvalidate?: boolean): unknown;
	put(hashedQuery: string, response: unknown, tables: string[], isTag: boolean, config?: CacheConfig): unknown;
	onMutate(params: MutationOption): unknown;
}

/**
 * A query with the cache around it, for both runtimes: a mutation invalidates its tables after it runs, a cached
 * select is answered from the cache or stored in it, and everything else just runs.
 *
 * `cache` is `undefined` when there is none (or a no-op one); `query` returns what the runtime runs
 */
export function* cachedQuery<T>(
	cache: CacheOps | undefined,
	queryString: string,
	params: unknown[],
	queryMetadata: QueryMetadata | undefined,
	cacheConfig: WithCacheConfig | undefined,
	query: () => unknown,
): Program<T> {
	if (cache === undefined) return yield* user<T>(query());

	const strategy = yield* io(() => strategyFor(queryString, params, queryMetadata, cacheConfig));

	if (strategy.type === 'skip') return yield* user<T>(query());

	if (strategy.type === 'invalidate') {
		const result = yield* user<T>(query());
		yield* user(cache.onMutate({ tables: strategy.tables }));
		return result;
	}

	const { tables, key, isTag, autoInvalidate, config } = strategy;
	const fromCache = yield* user<unknown[] | undefined>(cache.get(key, tables, isTag, autoInvalidate));
	if (fromCache !== undefined) return fromCache as T;

	const result = yield* user<T>(query());
	// Tables are sent only when the entry is to be invalidated on each write to them
	yield* user(cache.put(key, result, autoInvalidate ? tables : [], isTag, config));
	return result;
}
