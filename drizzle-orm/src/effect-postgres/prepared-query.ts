import type { PgClient } from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';
import type { EffectCache } from '~/cache/core/cache-effect';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { EffectPgCorePreparedQuery } from '~/pg-core/effect/prepared-query';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

export class EffectPgPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends EffectPgCorePreparedQuery<T>
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
