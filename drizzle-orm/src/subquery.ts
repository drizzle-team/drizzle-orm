import { entityKind } from './entity.ts';
import type { SQL, SQLWrapper, ColumnsSelection } from './sql/sql.ts';

export const SubqueryConfig = Symbol.for('drizzle:SubqueryConfig');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Subquery<TAlias extends string = string, TSelectedFields = unknown> extends SQLWrapper {
	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
}
export class Subquery<TAlias extends string = string, TSelectedFields = unknown> implements SQLWrapper {
	static readonly [entityKind]: string = 'Subquery';

	declare _: {
		brand: 'Subquery';
		selectedFields: TSelectedFields;
		alias: TAlias;
	};

	/** @internal */
	[SubqueryConfig]: {
		sql: SQL;
		selection: ColumnsSelection;
		alias: string;
		isWith: boolean;
	};

	constructor(sql: SQL, selection: Record<string, unknown>, alias: string, isWith = false) {
		this[SubqueryConfig] = {
			sql,
			selection,
			alias,
			isWith,
		};
	}

	// getSQL(): SQL<unknown> {
	// 	return new SQL([this]);
	// }
}

export class WithSubquery<TAlias extends string = string, TSelection = unknown> extends Subquery<TAlias, TSelection> {
	static readonly [entityKind]: string = 'WithSubquery';
}