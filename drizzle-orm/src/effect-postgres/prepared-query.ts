import type { PgClient } from '@effect/sql-pg/PgClient';
import type { SqlError } from '@effect/sql/SqlError';
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
import { assertUnreachable, mapResultRow } from '~/utils.ts';

export class EffectPgPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgPreparedQuery
{
	static override readonly [entityKind]: string = 'EffectPgPreparedQuery';

	constructor(
		private client: PgClient,
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
		query: Effect.Effect<ReadonlyArray<T>, SqlError>,
	) {
		const cacheStrat = this.cache !== undefined
			? yield* Effect.tryPromise({
				try: () => stragegyFor(queryString, params, this.queryMetadata, this.cacheConfig),
				catch: (e) => e,
			})
			: { type: 'skip' as const };

		if (cacheStrat.type === 'skip') {
			return query.pipe(Effect.catchAll((e) => {
				// eslint-disable-next-line @drizzle-internal/no-instanceof
				return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
			}));
		}

		const cache = this.cache!;

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (cacheStrat.type === 'invalidate') {
			return Effect.all([
				query,
				cache.onMutate({ tables: cacheStrat.tables }),
			]).pipe(Effect.catchAll((e) => {
				// eslint-disable-next-line @drizzle-internal/no-instanceof
				return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
			}));
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

			const result = yield* query.pipe(Effect.catchAll((e) => {
				// eslint-disable-next-line @drizzle-internal/no-instanceof
				return Effect.fail(new DrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
			}));

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

	execute(placeholderValues?: Record<string, unknown>): Effect.Effect<T['execute'], DrizzleQueryError, PgClient> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const { query, logger, customResultMapper, fields, joinsNotNullableMap, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		if (!fields && !customResultMapper) {
			return this.client.unsafe(query.sql, params as any).withoutTransform.pipe(Effect.catchAll((e) => {
				return Effect.fail(new DrizzleQueryError(query.sql, params, e));
			}));
		}

		return client.unsafe(query.sql, params as any).values.pipe(Effect.andThen(
			(rows) => {
				if (customResultMapper) return (customResultMapper as (rows: unknown[][]) => unknown)(rows as unknown[][]);

				return rows.map((row) =>
					mapResultRow(
						fields!,
						row as unknown[],
						joinsNotNullableMap,
					)
				);
			},
		)).pipe(Effect.catchAll((e) => {
			return Effect.fail(new DrizzleQueryError(query.sql, params, e));
		}));
	}

	private executeRqbV2(
		placeholderValues?: Record<string, unknown>,
	): Effect.Effect<T['execute'], DrizzleQueryError, PgClient> {
		const { query, logger, customResultMapper, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		logger.logQuery(query.sql, params);
		return client.unsafe(query.sql, params as any).withoutTransform.pipe(
			Effect.andThen((v) =>
				(customResultMapper as (
					rows: Record<string, unknown>[],
					mapColumnValue?: (value: unknown) => unknown,
				) => unknown)(v as Record<string, unknown>[])
			),
		).pipe(Effect.catchAll((e) => {
			return Effect.fail(new DrizzleQueryError(query.sql, params, e));
		}));
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
