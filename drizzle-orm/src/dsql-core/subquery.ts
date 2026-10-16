import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { Subquery as BaseSubquery, type WithSubquery, type WithSubqueryWithoutSelection } from '~/subquery.ts';
import type { QueryBuilder } from './query-builders/query-builder.ts';

export class DSQLSubquery<
	TAlias extends string = string,
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> extends BaseSubquery<TAlias, TSelectedFields> {
	static override readonly [entityKind]: string = 'DSQLSubquery';
}

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& BaseSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export type WithSubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export interface WithBuilder {
	<TAlias extends string>(alias: TAlias): {
		as: {
			<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias>;
			(
				qb: TypedQueryBuilder<undefined> | ((qb: QueryBuilder) => TypedQueryBuilder<undefined>),
			): WithSubqueryWithoutSelection<TAlias>;
		};
	};
	<TAlias extends string, TSelection extends ColumnsSelection>(alias: TAlias, selection: TSelection): {
		as: (qb: SQL | ((qb: QueryBuilder) => SQL)) => WithSubqueryWithSelection<TSelection, TAlias>;
	};
}
