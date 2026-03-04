import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { Subquery, WithSubquery } from '~/subquery.ts';

export type SubqueryWithSelection<
	TSelection extends Record<string, unknown>,
	TAlias extends string,
> = Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'surrealdb'>> & AddAliasToSelection<
	TSelection,
	TAlias,
	'surrealdb'
>;

export type WithSubqueryWithSelection<
	TSelection extends Record<string, unknown>,
	TAlias extends string,
> = WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'surrealdb'>> & AddAliasToSelection<
	TSelection,
	TAlias,
	'surrealdb'
>;
