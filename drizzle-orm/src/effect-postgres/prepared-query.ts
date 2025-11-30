import type { PgClient } from '@effect/sql-pg';
import { Effect } from 'effect';
import type { EffectCache } from '~/cache/core/cache-effect';
import { stragegyFor } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors';
import type { Logger } from '~/logger.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery } from '~/pg-core/session.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { assertUnreachable } from '~/utils.ts';

export class EffectPgPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgPreparedQuery
{
	static override readonly [entityKind]: string = 'EffectPgPreparedQuery';

	constructor(
		private client: PgClient.PgClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private cache: EffectCache | undefined,
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		private cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params });
	}

	/** @internal */
	private async *queryWithCache<T>(
		queryString: string,
		params: any[],
		query: Effect.Effect<ReadonlyArray<T>, SqlError>, // TODO: how tf I import that?
	) {
		const cacheStrat = this.cache !== undefined
			? yield* Effect.tryPromise({
				try: () => stragegyFor(queryString, params, this.queryMetadata, this.cacheConfig),
				catch: (e) => e,
			})
			: { type: 'skip' as const };

		if (cacheStrat.type === 'skip') {
			// TODO: throw new DrizzleQueryError(queryString, params, e as Error);
			return query;
		}

		const cache = this.cache!;

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (cacheStrat.type === 'invalidate') {
			/* TODO:

				.then((res) => res[0]).catch((e) => {
					throw new DrizzleQueryError(queryString, params, e as Error);
				});
			*/
			return Effect.all([
				query,
				cache.onMutate({ tables: cacheStrat.tables }),
			]);
		}

		if (cacheStrat.type === 'try') {
			const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
			const fromCache = yield* cache.get(
				key,
				tables,
				isTag,
				autoInvalidate,
			);

			if (typeof fromCache !== 'undefined') return fromCache as unknown as T;

			// TODO: throw new DrizzleQueryError(queryString, params, e as Error);
			const result = yield* query;

			yield* cache.put(
				key,
				result,
				// make sure we send tables that were used in a query only if user wants to invalidate it on each write
				autoInvalidate ? tables : [],
				isTag,
				config,
			);
			// put flag if we should invalidate or not
			return Effect.succeed(result);
		}

		assertUnreachable(cacheStrat);
	}

	/** @internal */
	yield(placeholderValues: Record<string, unknown> | undefined = {}): Effect.Effect<any[], Error, never> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQueryConfig.text, params);

		// TODO: joinsNotNullableMap?
		const { fields, rawQueryConfig: rawQuery, client, queryConfig: query, joinsNotNullableMap: _, customResultMapper } =
			this;

		// TODO:

		if (!fields && !customResultMapper) {
			const query = client.unsafe<T>(rawQuery, params);
			return this.queryWithCache(rawQuery.text, params, query);
		}

		const q = this.queryWithCache(query.text, params, client.unsafe(query, params));

		const result = Effect.tryPromise({
			try: async () => q,
			catch: (e) => {
				throw new DrizzleQueryError(query.text, params, e as Error);
			},
		});

		if (customResultMapper) {
			// TODO: map with custom mapper
			return result;
		}

		// TODO: map regularly
		// .map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap))
		return result;
	}

	// TODO: cache?
	private executeRqbV2(
		placeholderValues: Record<string, unknown> | undefined = {},
	): Effect.Effect<any[], Error, never> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQueryConfig.text, params);
		const { rawQueryConfig: rawQuery, client, customResultMapper: _ } = this;
		// TODO: map
		return client.unsafe(rawQuery, params);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
