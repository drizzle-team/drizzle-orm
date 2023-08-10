import type { AddAliasToSelection } from '~/query-builders/select.types';
import type { Subquery, WithSubquery } from '~/subquery';
import { type ColumnsSelection } from '~/view';

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export type WithSubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;
