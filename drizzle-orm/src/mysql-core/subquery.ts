import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { Subquery, WithSubquery } from '~/subquery.ts';
import { type ColumnsSelection } from '~/view.ts';

export type SubqueryWithSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'mysql'>>
	& AddAliasToSelection<TSelection, TAlias, 'mysql'>;

export type WithSubqueryWithSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'mysql'>>
	& AddAliasToSelection<TSelection, TAlias, 'mysql'>;
