import type { PgClient } from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { TaggedDrizzleQueryError, type TaggedTransactionRollbackError } from '~/effect-core/errors.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: readonly Assume<this['row'], object>[];
}

export class EffectPgPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgEffectPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'EffectPgPreparedQuery';

	constructor(
		private client: PgClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		cache: EffectCache | undefined,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
	}

	execute(placeholderValues?: Record<string, unknown>): Effect.Effect<T['execute'], TaggedDrizzleQueryError> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const { query, logger, customResultMapper, fields, joinsNotNullableMap, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		if (!fields && !customResultMapper) {
			return this.queryWithCache(
				query.sql,
				params,
				this.client.unsafe(query.sql, params as any).withoutTransform,
			);
		}

		return this.queryWithCache(
			query.sql,
			params,
			client.unsafe(query.sql, params as any).values.pipe(Effect.andThen(
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
			)),
		);
	}

	private executeRqbV2(
		placeholderValues?: Record<string, unknown>,
	): Effect.Effect<T['execute'], TaggedDrizzleQueryError> {
		const { query, logger, customResultMapper, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		logger.logQuery(query.sql, params);
		return (
			client.unsafe(query.sql, params as any).withoutTransform.pipe(
				Effect.andThen((v) =>
					(customResultMapper as (
						rows: Record<string, unknown>[],
						mapColumnValue?: (value: unknown) => unknown,
					) => unknown)(v as Record<string, unknown>[])
				),
			).pipe(Effect.catchAll((e) => {
				// eslint-disable-next-line @drizzle-internal/no-instanceof
				return Effect.fail(new TaggedDrizzleQueryError(query.sql, params, e instanceof Error ? e : undefined));
			}))
		);
	}

	override all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], TaggedDrizzleQueryError, never> {
		const { query, logger, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		logger.logQuery(query.sql, params);

		return this.queryWithCache(
			query.sql,
			params,
			client.unsafe(query.sql, params as any).withoutTransform,
		);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export class EffectPgSession<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgEffectSession<TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectPgSession';

	private logger: Logger;
	private cache: EffectCache | undefined;

	constructor(
		private client: PgClient,
		dialect: PgDialect,
		protected relations: TRelations,
		protected schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: { logger?: Logger; cache?: EffectCache } = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache;
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	) {
		return new EffectPgPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			name,
			isResponseInArrayMode,
			customResultMapper,
			false,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: Record<string, unknown>[]) => T['execute'],
	): EffectPgPreparedQuery<T, true> {
		return new EffectPgPreparedQuery<T, true>(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			name,
			false,
			customResultMapper,
			true,
		);
	}

	override execute<T>(query: SQL): Effect.Effect<T, TaggedDrizzleQueryError> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).execute();
	}

	override all<T>(query: SQL): Effect.Effect<T, TaggedDrizzleQueryError> {
		return this.prepareQuery<PreparedQueryConfig & { all: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	override transaction<T>(
		transaction: (
			/** Every query within transaction Effect is completed in transaction, regardless of database instance used
			 *
			 * `tx` argument is only required for `tx.rollback()`
			 */
			tx: EffectPgTransaction<
				TQueryResult,
				TFullSchema,
				TRelations,
				TSchema
			>,
		) => Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError, never>,
	): Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError, never> {
		const { dialect, relations, schema } = this;
		const session = this;

		return this.client.withTransaction(Effect.gen(function*() {
			const tx = new EffectPgTransaction<TQueryResult, TFullSchema, TRelations, TSchema>(
				dialect,
				session,
				relations,
				schema,
			);

			return yield* transaction(tx);
		})) as Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError, never>;
	}
}

export class EffectPgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgEffectTransaction<TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectPgTransaction';

	override transaction<T>(
		transaction: (
			tx: PgEffectTransaction<TQueryResult, TFullSchema, TRelations, TSchema>,
		) => Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError, never>,
	): Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError, never> {
		return this.session.transaction(transaction);
	}
}
