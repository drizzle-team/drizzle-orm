import type { SqlError } from '@effect/sql/SqlError';
import { Effect } from 'effect';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query } from '~/sql/index.ts';
import type { PreparedQueryConfig } from '../session.ts';

export abstract class EffectPgCorePreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(
		protected query: Query,
		// cache instance
		private cache: EffectCache | undefined,
		// per query related metadata
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig,
	) {
		// it means that no $withCache options were passed and it should be just enabled
		// if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
		// 	this.cacheConfig = { enabled: true, autoInvalidate: true };
		// }
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	static readonly [entityKind]: string = 'PgPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	private queryWithCache<T>(
		queryString: string,
		params: any[],
		query: Effect.Effect<T, SqlError>,
	): Effect.Effect<T, DrizzleQueryError> {
		return Effect.gen(function*() {
			return yield* query.pipe(Effect.catchAll((e) => {
				// eslint-disable-next-line @drizzle-internal/no-instanceof
				return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
			}));
		});
		// const thisArg = this;
		// return Effect.gen(function*() {

		// 	const cacheStrat = thisArg.cache !== undefined
		// 		? yield* Effect.tryPromise({
		// 			try: () => strategyFor(queryString, params, thisArg.queryMetadata, thisArg.cacheConfig),
		// 			catch: (e) => e,
		// 		})
		// 		: { type: 'skip' as const };

		// 	if (cacheStrat.type === 'skip') {
		// 		yield* query.pipe(Effect.catchAll((e) => {
		// 			// eslint-disable-next-line @drizzle-internal/no-instanceof
		// 			return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
		// 		}));
		// 	}

		// 	const cache = thisArg.cache!;

		// 	// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		// 	if (cacheStrat.type === 'invalidate') {
		// 		yield*
		// 			query.pipe(Effect.catchAll((e) => {
		// 			// eslint-disable-next-line @drizzle-internal/no-instanceof
		// 			return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
		// 		}))
		// 		yield* cache.onMutate({ tables: cacheStrat.tables }),
		// 	}

		// 	if (cacheStrat.type === 'try') {
		// 		const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
		// 		const fromCache = yield* cache.get(
		// 			key,
		// 			tables,
		// 			isTag,
		// 			autoInvalidate,
		// 		);

		// 		if (typeof fromCache !== 'undefined') return fromCache as unknown as T;

		// 		const result = yield* query.pipe(Effect.catchAll((e) => {
		// 			// eslint-disable-next-line @drizzle-internal/no-instanceof
		// 			return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
		// 		}));

		// 		yield* cache.put(
		// 			key,
		// 			result,
		// 			// make sure we send tables that were used in a query only if user wants to invalidate it on each write
		// 			autoInvalidate ? tables : [],
		// 			isTag,
		// 			config,
		// 		);
		// 		// put flag if we should invalidate or not
		// 		return Effect.succeed(result);
		// 	}

		// 	assertUnreachable(cacheStrat);
		// });
	}

	abstract execute(placeholderValues?: Record<string, unknown>): Effect.Effect<T['execute'], DrizzleQueryError>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], SqlError>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}
