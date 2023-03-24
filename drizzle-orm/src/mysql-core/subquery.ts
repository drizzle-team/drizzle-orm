import type { Subquery, WithSubquery } from '~/subquery';
import type { AddAliasToSelection } from './query-builders/select.types';

export type SubqueryWithSelection<TSelection, TAlias extends string> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias>>
	& AddAliasToSelection<TSelection, TAlias>;

export type WithSubqueryWithSelection<TSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias>>
	& AddAliasToSelection<TSelection, TAlias>;
