import { type Dialect } from '~/column-builder';
import type { AddAliasToSelection } from '~/query-builders/select.types';
import type { Subquery, WithSubquery } from '~/subquery';
import { type ColumnsSelection } from '~/view';

export type SubqueryWithSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
	TDialect extends Dialect,
> =
	& Subquery<TAlias, AddAliasToSelection<TSelection, TAlias, TDialect>>
	& AddAliasToSelection<TSelection, TAlias, TDialect>;

export type WithSubqueryWithSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
	TDialect extends Dialect,
> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, TDialect>>
	& AddAliasToSelection<TSelection, TAlias, TDialect>;
