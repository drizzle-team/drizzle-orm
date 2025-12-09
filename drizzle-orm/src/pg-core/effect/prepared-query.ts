import type { SqlError } from '@effect/sql/SqlError';
import { Effect } from 'effect';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import { strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query } from '~/sql/index.ts';
import { assertUnreachable } from '~/utils.ts';
import type { PreparedQueryConfig } from '../session.ts';

export abstract class EffectPgCorePreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(
		protected query: Query,
		private cache: EffectCache | undefined,
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		private cacheConfig?: WithCacheConfig,
	) {
		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
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

	protected queryWithCache<T>(
		queryString: string,
		params: any[],
		query: Effect.Effect<T, SqlError>,
	): Effect.Effect<T, DrizzleQueryError> {
		const { cache, cacheConfig, queryMetadata } = this;
		return Effect.gen(function*() {
			const cacheStrat: Awaited<ReturnType<typeof strategyFor>> = cache
				? yield* Effect.tryPromise(
					() => strategyFor(queryString, params, queryMetadata, cacheConfig),
				)
				: { type: 'skip' as const };

			if (cacheStrat.type === 'skip') {
				return yield* query;
			}

			// For mutate queries, we should query the database, wait for a response, and then perform invalidation
			if (cacheStrat.type === 'invalidate') {
				const result = yield* query;
				yield* cache!.onMutate({ tables: cacheStrat.tables });

				return result;
			}

			if (cacheStrat.type === 'try') {
				const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
				const fromCache: any[] | undefined = yield* cache!.get(
					key,
					tables,
					isTag,
					autoInvalidate,
				);

				if (typeof fromCache !== 'undefined') return fromCache as unknown as T;

				const result = yield* query;

				yield* cache!.put(
					key,
					result,
					autoInvalidate ? tables : [],
					isTag,
					config,
				);

				return result;
			}

			assertUnreachable(cacheStrat);
		}).pipe(Effect.catchAll((e) => {
			// eslint-disable-next-line @drizzle-internal/no-instanceof
			return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
		}));
	}

	abstract execute(placeholderValues?: Record<string, unknown>): Effect.Effect<T['execute'], DrizzleQueryError>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], DrizzleQueryError>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}
