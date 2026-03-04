import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
} from '~/operations.ts';
import type { SurrealDBColumn } from '~/surrealdb-core/columns/common.ts';
import type { SurrealDBTable } from '~/surrealdb-core/table.ts';
import type { Placeholder, SQL } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<SurrealDBColumn>;
export type SelectedFields = SelectedFieldsBase<SurrealDBColumn, SurrealDBTable>;

export interface SurrealDBSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: SurrealDBTable;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: SurrealDBSelectJoinConfig[];
	orderBy?: (SurrealDBColumn | SQL | SQL.Aliased)[];
	groupBy?: (SurrealDBColumn | SQL | SQL.Aliased)[];
	distinct?: boolean;
	setOperators: {
		type: 'union' | 'intersect' | 'except';
		isAll: boolean;
		rightSelect: SQL;
		limit?: number | Placeholder;
		orderBy?: (SurrealDBColumn | SQL | SQL.Aliased)[];
		offset?: number | Placeholder;
	}[];
}

export interface SurrealDBSelectJoinConfig {
	on: SQL | undefined;
	table: SurrealDBTable | Subquery | SQL;
	alias: string | undefined;
	joinType: string;
	lateral?: boolean;
}
