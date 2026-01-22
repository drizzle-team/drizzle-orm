import type { Placeholder, SQL } from '~/sql/sql.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLTable } from '../table.ts';

export interface DSQLSelectJoinConfig {
	on: SQL | undefined;
	table: DSQLTable | SQL;
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
	table: DSQLTable | SQL;
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
	distinct?: boolean | { on: (DSQLColumn | SQL | SQL.Aliased)[] };
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

export type SelectedFieldsOrdered = {
	path: string[];
	field: unknown;
}[];
