import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { entityKind } from '~/entity.ts';
import { type Cache as DrizzleCache, type MutationOption, NoopCache } from './cache.ts';

/**
 * Effect service for caching query results in Drizzle ORM.
 *
 * By default, this service uses a no-op cache (no caching occurs). Use
 * `EffectCache.fromDrizzle` to adapt a standard Drizzle cache implementation.
 *
 * @example
 * ```ts
 * // Use default (no caching)
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 *
 * // Use a custom Drizzle cache
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectCache.layerFromDrizzle(myCache)),
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 * ```
 */
export class EffectCache extends Effect.Service<EffectCache>()('drizzle-orm/EffectCache', {
	sync: () => make(new NoopCache()),
	accessors: true,
}) {
	static readonly [entityKind]: string = this.Service._tag;

	/**
	 * Creates an EffectCache instance from a standard Drizzle cache.
	 *
	 * @param cache - A Drizzle cache instance implementing the `Cache` interface.
	 * @returns A new EffectCache that delegates to the provided Drizzle cache.
	 *
	 * @example
	 * ```ts
	 * const drizzleCache = new MyCustomCache();
	 * const effectCache = EffectCache.fromDrizzle(drizzleCache);
	 * ```
	 */
	static fromDrizzle(cache: DrizzleCache) {
		return new EffectCache(make(cache));
	}

	/**
	 * Creates a Layer that provides an EffectCache from a standard Drizzle cache.
	 *
	 * @param cache - A Drizzle cache instance implementing the `Cache` interface.
	 * @returns A Layer that provides the EffectCache service.
	 *
	 * @example
	 * ```ts
	 * const drizzleCache = new MyCustomCache();
	 * const db = yield* PgDrizzle.make({ relations }).pipe(
	 *   Effect.provide(EffectCache.layerFromDrizzle(drizzleCache)),
	 *   Effect.provide(PgDrizzle.DefaultServices),
	 * );
	 * ```
	 */
	static layerFromDrizzle(cache: DrizzleCache) {
		return Layer.succeed(EffectCache, EffectCache.fromDrizzle(cache));
	}
}

function make(cache: DrizzleCache) {
	const strategy = () => cache.strategy();

	const get = (...args: Parameters<DrizzleCache['get']>) =>
		Effect.tryPromise({
			try: () => cache.get(...args),
			catch: (error) => new EffectCacheError({ cause: error }),
		});

	const put = (...args: Parameters<DrizzleCache['put']>) =>
		Effect.tryPromise({
			try: () => cache.put(...args),
			catch: (error) => new EffectCacheError({ cause: error }),
		});

	const onMutate = (params: MutationOption) =>
		Effect.tryPromise({
			try: () => cache.onMutate(params),
			catch: (error) => new EffectCacheError({ cause: error }),
		});

	return {
		strategy,
		get,
		put,
		onMutate,
		cache,
	};
}

/**
 * Error type for cache operation failures.
 *
 * This error is thrown when any cache operation (get, put, onMutate) fails.
 * The original error is available in the `cause` property.
 */
export class EffectCacheError extends Schema.TaggedError<EffectCacheError>()('EffectCacheError', {
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = 'EffectCacheError';
}
