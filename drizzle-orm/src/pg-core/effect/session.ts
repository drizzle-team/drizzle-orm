import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { EffectPgPreparedQuery } from '~/effect-postgres/prepared-query.ts';
import { entityKind } from '~/entity.ts';
import type { Query } from '~/sql/index.ts';
import type { PgDialect } from '../dialect.ts';
import type { SelectedFieldsOrdered } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';

// TODO: implement??
export abstract class PgEffectSession // TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
// TFullSchema extends Record<string, unknown> = Record<string, never>,
// TRelations extends AnyRelations = EmptyRelations,
// TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
{
	static readonly [entityKind]: string = 'PgSession';

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
	): EffectPgPreparedQuery<T>;

	abstract prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): EffectPgPreparedQuery<T>;
}
