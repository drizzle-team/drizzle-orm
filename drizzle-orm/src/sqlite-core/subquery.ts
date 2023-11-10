import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { Subquery, WithSubquery } from '~/subquery.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'sqlite'>>
	& AddAliasToSelection<TSelection, TAlias, 'sqlite'>;

export type WithSubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'sqlite'>>
	& AddAliasToSelection<TSelection, TAlias, 'sqlite'>;
