import type { PgClient } from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectPreparedQuery, PgEffectSession } from '~/pg-core/effect/session.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

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
	): Effect.Effect<T['execute'], DrizzleQueryError> {
		const { query, logger, customResultMapper, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		logger.logQuery(query.sql, params);
		return this.queryWithCache(
			query.sql,
			params,
			client.unsafe(query.sql, params as any).withoutTransform.pipe(
				Effect.andThen((v) =>
					(customResultMapper as (
						rows: Record<string, unknown>[],
						mapColumnValue?: (value: unknown) => unknown,
					) => unknown)(v as Record<string, unknown>[])
				),
			),
		);
	}

	override all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], DrizzleQueryError, never> {
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

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: (readonly unknown[])[];
}

export class EffectPgSession<
	_TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgEffectSession {
	static override readonly [entityKind]: string = 'EffectPgSession';

	private logger: Logger;
	private cache: EffectCache | undefined;

	constructor(
		private client: PgClient,
		dialect: PgDialect,
		relations: TRelations,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
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
	override count(sql: SQL): Effect.Effect<number, DrizzleQueryError> {
		return this.prepareQuery<PreparedQueryConfig & { execute: number }>(
			this.dialect.sqlToQuery(sql),
			undefined,
			undefined,
			true,
			(rows) => Number(rows[0]?.[0] ?? 0),
		).execute();
	}
}
