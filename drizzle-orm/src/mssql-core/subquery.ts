import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import type { Subquery, WithSubquery } from '~/subquery.ts';

export type SubqueryWithSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'mssql'>>
	& AddAliasToSelection<TSelection, TAlias, 'mssql'>;

export type WithSubqueryWithSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'mssql'>>
	& AddAliasToSelection<TSelection, TAlias, 'mssql'>;
