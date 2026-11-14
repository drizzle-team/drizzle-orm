import { entityKind, is } from '~/entity.ts';
import { io, type Program, user } from '~/runtime/index.ts';
import type { MutationOption } from './cache.ts';
import { mutatedTables, strategyFor } from './cache.ts';
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
 * The tables written by the statements of one batch, pipeline or parallel run, for both runtimes. Such statements
 * stay out of the cache: none is answered from it or stored in it, since a lookup would let a later statement
 * reach the connection first, and an answer from outside a batch's transaction can't see the batch's own writes.
 * What they wrote is invalidated together, by {@link flush}, once the run is done (a batch: committed)
 */
export class PendingInvalidation {
	static readonly [entityKind]: string = 'PendingInvalidation';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	private readonly tables = new Set<string>();

	/** Notes the tables a statement that ran has written. A statement that only reads adds nothing */
	add(queryMetadata: QueryMetadata | undefined): void {
		const tables = mutatedTables(queryMetadata);
		if (tables === undefined) return;
		for (const table of tables) this.tables.add(table);
	}

	/** Invalidates everything noted so far, in one call to the cache, and forgets it */
	*flush(cache: CacheOps | undefined): Program<void> {
		if (cache === undefined || this.tables.size === 0) return;
		const tables = [...this.tables];
		this.tables.clear();
		yield* user(cache.onMutate({ tables }));
	}
}

/**
 * A query with the cache around it, for both runtimes: a mutation invalidates its tables after it runs, a cached
 * select is answered from the cache or stored in it, and everything else just runs.
 *
 * `cache` is `undefined` when there is none (or a no-op one); `query` returns what the runtime runs.
 * With `pending`, the query is a statement of a batch or a pipeline: it runs without the cache, and what it
 * wrote is left in `pending` for the run to invalidate
 */
export function* cachedQuery<T>(
	cache: CacheOps | undefined,
	queryString: string,
	params: unknown[],
	queryMetadata: QueryMetadata | undefined,
	cacheConfig: WithCacheConfig | undefined,
	query: () => unknown,
	pending?: PendingInvalidation,
): Program<T> {
	if (cache === undefined) return yield* user<T>(query());

	if (pending !== undefined) {
		const result = yield* user<T>(query());
		pending.add(queryMetadata);
		return result;
	}

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
