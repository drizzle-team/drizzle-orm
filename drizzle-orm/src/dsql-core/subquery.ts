import { entityKind } from '~/entity.ts';
import { Subquery as BaseSubquery } from '~/subquery.ts';

export class DSQLSubquery<TAlias extends string = string, TSelectedFields = unknown> extends BaseSubquery<
	TAlias,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'DSQLSubquery';
}

export type SubqueryWithSelection<TSelection, TAlias extends string> = DSQLSubquery<TAlias, TSelection> & TSelection;
