import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import type { Subquery, WithSubquery } from '~/subquery.ts';
import type { QueryBuilder } from './query-builders';

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export type WithSubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export type WithSubqueryWithoutSelection<TAlias extends string> = WithSubquery<TAlias, {}>;

export interface WithSubqueryQuery<TAlias extends string> {
	<TSelection extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
	): WithSubqueryWithSelection<TSelection, TAlias>;
	(
		qb: TypedQueryBuilder<undefined> | ((qb: QueryBuilder) => TypedQueryBuilder<undefined>),
	): WithSubqueryWithoutSelection<TAlias>;
}
