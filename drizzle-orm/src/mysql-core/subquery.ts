import type { AddAliasToSelection } from '~/query-builders/select.types';
import type { Subquery, WithSubquery } from '~/subquery';

export type SubqueryWithSelection<TSelection, TAlias extends string> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias>>
	& AddAliasToSelection<TSelection, TAlias>;

export type WithSubqueryWithSelection<TSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias>>
	& AddAliasToSelection<TSelection, TAlias>;
