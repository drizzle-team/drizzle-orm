import { type Dialect } from '~/column-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { Subquery, WithSubquery } from '~/subquery.ts';
import { type ColumnsSelection } from '~/view.ts';

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
