import { entityKind } from '~/entity.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { Subquery as BaseSubquery, type WithSubquery } from '~/subquery.ts';

export class DSQLSubquery<
	TAlias extends string = string,
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> extends BaseSubquery<TAlias, TSelectedFields> {
	static override readonly [entityKind]: string = 'DSQLSubquery';
}

export type SubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& BaseSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;

export type WithSubqueryWithSelection<TSelection extends ColumnsSelection, TAlias extends string> =
	& WithSubquery<TAlias, AddAliasToSelection<TSelection, TAlias, 'pg'>>
	& AddAliasToSelection<TSelection, TAlias, 'pg'>;
