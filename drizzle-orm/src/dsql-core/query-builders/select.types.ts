import type { SelectedFieldsOrdered as SelectedFieldsOrderedBase } from '~/operations.ts';
import type { Placeholder, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLTable } from '../table.ts';
import type { DSQLViewBase } from '../view-base.ts';

export interface DSQLSelectJoinConfig {
	on: SQL | undefined;
	table: DSQLTable | Subquery | DSQLViewBase | SQL;
	alias: string | undefined;
	joinType: 'left' | 'right' | 'inner' | 'full';
	lateral?: boolean;
}

export interface DSQLSelectConfig {
	withList?: any[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: DSQLTable | Subquery | DSQLViewBase | SQL;
	joins?: DSQLSelectJoinConfig[];
	orderBy?: (DSQLColumn | SQL | SQL.Aliased)[];
	groupBy?: (DSQLColumn | SQL | SQL.Aliased)[];
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	lockingClause?: {
		strength: 'update' | 'no key update' | 'share' | 'key share';
		config: {
			noWait?: boolean;
			skipLocked?: boolean;
		};
	};
	distinct?: boolean | { on: (DSQLColumn | SQLWrapper)[] };
	setOperators: SetOperatorConfig[];
}

export interface SetOperatorConfig {
	type: 'union' | 'intersect' | 'except';
	isAll: boolean;
	rightSelect: SQL;
	limit?: number | Placeholder;
	orderBy?: (DSQLColumn | SQL | SQL.Aliased)[];
	offset?: number | Placeholder;
}

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<DSQLColumn>;
