import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import type { Subquery, WithSubquery, WithSubqueryWithoutSelection } from '~/subquery.ts';
import type { QueryBuilder } from './query-builders/query-builder.ts';

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export type WithSubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

interface WithBuilderAs<TAlias extends string> {
	<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias>;
			(
				qb: TypedQueryBuilder<undefined> | ((qb: QueryBuilder) => TypedQueryBuilder<undefined>),
			): WithSubqueryWithoutSelection<TAlias>;
}

interface WithBuilderAsSelection<TAlias extends string, TSelection extends ColumnsSelection> {
	(qb: SQL | ((qb: QueryBuilder) => SQL)): WithSubqueryWithSelection<TSelection, TAlias>;
}

export interface WithBuilder {
	<TAlias extends string>(alias: TAlias): {
		as: WithBuilderAs<TAlias>;
		materialized: (shouldBeMaterialized: boolean) => { as: WithBuilderAs<TAlias> };
	};
	<TAlias extends string, TSelection extends ColumnsSelection>(alias: TAlias, selection: TSelection): {
		as: WithBuilderAsSelection<TAlias, TSelection>;
		materialized: (shouldBeMaterialized: boolean) => { as: WithBuilderAsSelection<TAlias, TSelection> };
	};
}
