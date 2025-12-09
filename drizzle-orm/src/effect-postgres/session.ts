import type { PgClient } from '@effect/sql-pg';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { EffectPgCoreSession } from '~/pg-core/effect/session';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import { EffectPgPreparedQuery } from './prepared-query';

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
	type: (readonly unknown[])[];
}

export class EffectPgSession<
	_TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends EffectPgCoreSession {
	static override readonly [entityKind]: string = 'EffectPgSession';

	private logger: Logger;
	private cache: EffectCache | undefined;

	constructor(
		private client: PgClient.PgClient,
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
}
