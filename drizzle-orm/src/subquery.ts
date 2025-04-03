import { entityKind } from './entity.ts';
import type { SQL, SQLWrapper } from './sql/sql.ts';

export interface Subquery<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TAlias extends string = string,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> extends SQLWrapper {
	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
}
export class Subquery<
	TAlias extends string = string,
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'Subquery';

	declare _: {
		brand: 'Subquery';
		sql: SQL;
		selectedFields: TSelectedFields;
		alias: TAlias;
		isWith: boolean;
		isMaterialized?: boolean;
	};

	constructor(sql: SQL, selection: Record<string, unknown>, alias: string, isWith = false, isMaterialized?: boolean) {
		this._ = {
			brand: 'Subquery',
			sql,
			selectedFields: selection as TSelectedFields,
			alias: alias as TAlias,
			isWith,
			isMaterialized,
		};
	}

	// getSQL(): SQL<unknown> {
	// 	return new SQL([this]);
	// }
}

export class WithSubquery<
	TAlias extends string = string,
	TSelection extends Record<string, unknown> = Record<string, unknown>,
> extends Subquery<TAlias, TSelection> {
	static override readonly [entityKind]: string = 'WithSubquery';
}

export type WithSubqueryWithoutSelection<TAlias extends string> = WithSubquery<TAlias, {}>;
