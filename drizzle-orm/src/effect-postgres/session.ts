import type { PgClient } from '@effect/sql-pg/PgClient';
import type { SqlError } from '@effect/sql/SqlError';
import * as Effect from 'effect/Effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import { EffectLogger } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from '~/pg-core/effect/session.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export interface EffectPgQueryEffectHKT extends QueryEffectHKTBase {
	readonly error: EffectDrizzleQueryError;
	readonly context: never;
}

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: readonly Assume<this['row'], object>[];
}

export class EffectPgPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgEffectPreparedQuery<T, EffectPgQueryEffectHKT>
{
	static override readonly [entityKind]: string = 'EffectPgPreparedQuery';

	constructor(
		private client: PgClient,
		private queryString: string,
		private params: unknown[],
		private logger: EffectLogger,
		cache: EffectCache,
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

	override execute(placeholderValues?: Record<string, unknown>) {
		return Effect.gen(this, function*() {
			if (this.isRqbV2Query) return yield* this.executeRqbV2(placeholderValues);

			const { query, customResultMapper, fields, joinsNotNullableMap, client } = this;
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			yield* EffectLogger.logQuery(query.sql, params);

			if (!fields && !customResultMapper) {
				return yield* this.queryWithCache<T['execute'], SqlError, never>(
					query.sql,
					params,
					this.client.unsafe(query.sql, params as any).withoutTransform,
				);
			}

			return yield* this.queryWithCache(
				query.sql,
				params,
				client.unsafe(query.sql, params as any).values,
			).pipe(Effect.map(
				(rows) => {
					if (customResultMapper) {
						return (customResultMapper as (rows: unknown[][]) => T['execute'])(rows as unknown[][]);
					}

					return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap)) as T['execute'];
				},
			));
		}).pipe(Effect.provideService(EffectLogger, this.logger));
	}

	private executeRqbV2(
		placeholderValues?: Record<string, unknown>,
	) {
		return Effect.gen(this, function*() {
			const { query, customResultMapper, client } = this;
			const params = fillPlaceholders(query.params, placeholderValues ?? {});

			yield* EffectLogger.logQuery(query.sql, params);
			return yield* client.unsafe(query.sql, params as any).withoutTransform.pipe(
				Effect.flatMap((v) =>
					Effect.try(() =>
						(customResultMapper as (
							rows: Record<string, unknown>[],
							mapColumnValue?: (value: unknown) => unknown,
						) => T['execute'])(v as Record<string, unknown>[])
					)
				),
				Effect.catchAll((e) => new EffectDrizzleQueryError({ query: query.sql, params, cause: e })),
			);
		}).pipe(Effect.provideService(EffectLogger, this.logger));
	}

	override all(placeholderValues?: Record<string, unknown>) {
		return Effect.gen(this, function*() {
			const { query, client } = this;
			const params = fillPlaceholders(query.params, placeholderValues ?? {});

			yield* EffectLogger.logQuery(query.sql, params);

			return yield* this.queryWithCache<T['all'], SqlError, never>(
				query.sql,
				params,
				client.unsafe(query.sql, params as any).withoutTransform,
			);
		}).pipe(Effect.provideService(EffectLogger, this.logger));
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
> extends PgEffectSession<EffectPgQueryEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectPgSession';

	constructor(
		private client: PgClient,
		dialect: PgDialect,
		protected relations: TRelations,
		protected schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private logger: EffectLogger,
		private cache: EffectCache,
	) {
		super(dialect);
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
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
	): EffectPgPreparedQuery<T, false> {
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

	override prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
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

	override execute<T>(query: SQL) {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).execute();
	}

	override all<T>(query: SQL) {
		return this.prepareQuery<PreparedQueryConfig & { all: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	override transaction<A, E, R>(
		transaction: (
			tx: EffectPgTransaction<
				TQueryResult,
				TFullSchema,
				TRelations,
				TSchema
			>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R> {
		const { dialect, relations, schema } = this;

		return this.client.withTransaction(Effect.gen(this, function*() {
			const tx = new EffectPgTransaction<TQueryResult, TFullSchema, TRelations, TSchema>(
				dialect,
				this,
				relations,
				schema,
			);

			return yield* transaction(tx);
		}));
	}
}

export class EffectPgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgEffectTransaction<EffectPgQueryEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'EffectPgTransaction';
}
