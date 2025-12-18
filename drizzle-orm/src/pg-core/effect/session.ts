import type { SqlError } from '@effect/sql/SqlError';
import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import { strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { Query } from '~/sql/index.ts';
import { assertUnreachable } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { SelectedFieldsOrdered } from '../query-builders/select.types.ts';
import { PgBasePreparedQuery, PgSession, type PreparedQueryConfig } from '../session.ts';
import type { AnyPgEffectSelectQueryBuilder } from './select.ts';

export type PgEffectSelectPrepare<T extends AnyPgEffectSelectQueryBuilder> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export abstract class PgEffectPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgEffectPreparedQuery';

	constructor(
		query: Query,
		private cache: EffectCache | undefined,
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		private cacheConfig?: WithCacheConfig,
	) {
		super(query);

		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	protected override queryWithCache<T>(
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

	abstract override execute(
		placeholderValues?: Record<string, unknown>,
	): Effect.Effect<T['execute'], DrizzleQueryError>;

	/** @internal */
	abstract override all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], DrizzleQueryError>;
}

export abstract class PgEffectSession<
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	_TRelations extends AnyRelations = EmptyRelations,
	_TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgEffectSession';

	constructor(dialect: PgDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgEffectPreparedQuery<T>;

	abstract override prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): PgEffectPreparedQuery<T>;
}
