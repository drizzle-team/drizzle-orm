import type { PgClient } from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError, type TransactionRollbackError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders, sql } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';
export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: readonly object[];
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
		private wrap: Effect.Adapter = <T>(t: T): T => t,
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
	}

	execute(placeholderValues?: Record<string, unknown>): Effect.Effect<T['execute'], DrizzleQueryError> {
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
			this.wrap(
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
			),
		);
	}

	private executeRqbV2(
		placeholderValues?: Record<string, unknown>,
	): Effect.Effect<T['execute'], DrizzleQueryError> {
		const { query, logger, customResultMapper, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		logger.logQuery(query.sql, params);
		return this.wrap(
			client.unsafe(query.sql, params as any).withoutTransform.pipe(
				Effect.andThen((v) =>
					(customResultMapper as (
						rows: Record<string, unknown>[],
						mapColumnValue?: (value: unknown) => unknown,
					) => unknown)(v as Record<string, unknown>[])
				),
			).pipe(Effect.catchAll((e) => {
				// eslint-disable-next-line @drizzle-internal/no-instanceof
				return Effect.fail(new DrizzleQueryError(query.sql, params, e instanceof Error ? e : undefined));
			})),
		);
	}

	override all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], DrizzleQueryError, never> {
		const { query, logger, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		logger.logQuery(query.sql, params);

		return this.queryWithCache(
			query.sql,
			params,
			this.wrap(client.unsafe(query.sql, params as any).withoutTransform),
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
		private wrap: Effect.Adapter = <T>(t: T): T => t,
		private nestedIndex = 0,
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
			this.wrap,
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
			this.wrap,
		);
	}

	override execute<T>(query: SQL): Effect.Effect<T, DrizzleQueryError> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).execute();
	}

	override all<T>(query: SQL): Effect.Effect<T, DrizzleQueryError> {
		return this.prepareQuery<PreparedQueryConfig & { all: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	override transaction<T>(
		transaction: (
			tx: EffectPgTransaction<
				TQueryResult,
				TFullSchema,
				TRelations,
				TSchema
			>,
		) => Effect.Effect<T, DrizzleQueryError | TransactionRollbackError, never>,
	): Effect.Effect<T, DrizzleQueryError | TransactionRollbackError, never> {
		const { dialect, relations, schema, client, logger, cache, nestedIndex } = this;
		const sp = `sp${this.nestedIndex}`;

		return this.client.withTransaction(Effect.gen(function*(txAdapter) {
			const session = new EffectPgSession(
				client,
				dialect,
				relations,
				schema,
				{ logger, cache },
				txAdapter,
				nestedIndex + 1,
			);

			const tx = new EffectPgTransaction<TQueryResult, TFullSchema, TRelations, TSchema>(
				dialect,
				session,
				relations,
				schema,
				nestedIndex + 1,
			);

			if (nestedIndex) yield* tx.execute(sql.raw(`savepoint ${sp}`));

			const res = yield* transaction(tx).pipe(Effect.catchAll((e) =>
				Effect.gen(function*() {
					if (nestedIndex) yield* (tx.execute(sql.raw(`rollback to savepoint ${sp}`)));
					return yield* Effect.fail(e);
				})
			));
			if (nestedIndex) yield* (tx.execute(sql.raw(`release savepoint ${sp}`)));

			return res;
		}));
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
		) => Effect.Effect<T, DrizzleQueryError | TransactionRollbackError, never>,
	): Effect.Effect<T, DrizzleQueryError | TransactionRollbackError, never> {
		return this.session.transaction(transaction);
	}
}
