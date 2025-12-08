import type * as V1 from '~/_relations.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { Query } from '~/sql/index.ts';
import type { PgDialect } from '../dialect.ts';
import type { SelectedFieldsOrdered } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { EffectPgCorePreparedQuery } from './prepared-query.ts';

// TODO: implement??
export abstract class EffectPgCoreSession<
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	_TRelations extends AnyRelations = EmptyRelations,
	_TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'EffectPgCoreSession';

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
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
	): EffectPgCorePreparedQuery<T>;

	abstract prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): EffectPgCorePreparedQuery<T>;
}
