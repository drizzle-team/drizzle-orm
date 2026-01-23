import { entityKind } from '~/entity.ts';
import { Subquery as BaseSubquery } from '~/subquery.ts';

export class DSQLSubquery<
	TAlias extends string = string,
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> extends BaseSubquery<TAlias, TSelectedFields> {
	static override readonly [entityKind]: string = 'DSQLSubquery';
}

export type SubqueryWithSelection<
	TSelection extends Record<string, unknown>,
	TAlias extends string,
> = DSQLSubquery<TAlias, TSelection> & TSelection;
