import type { Placeholder, SQL } from '~/sql/index.ts';
import type { Assume } from '~/utils.ts';

import type { SQLiteColumn } from '~/sqlite-core/columns/index.ts';
import type { SQLiteTable, SQLiteTableWithColumns } from '~/sqlite-core/table.ts';

import type {
	SelectedFields as SelectFieldsBase,
	SelectedFieldsFlat as SelectFieldsFlatBase,
	SelectedFieldsOrdered as SelectFieldsOrderedBase,
} from '~/operations.ts';
import type {
	AppendToNullabilityMap,
	AppendToResult,
	GetSelectTableName,
	JoinNullability,
	JoinType,
	MapColumnsToTableAlias,
	SelectMode,
} from '~/query-builders/select.types.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import { type ColumnsSelection, type View } from '~/view.ts';
import type { SQLiteViewBase, SQLiteViewWithSelection } from '../view.ts';
import type { SQLiteSelect, SQLiteSelectQueryBuilder } from './select.ts';

export interface Join {
	on: SQL | undefined;
	table: SQLiteTable | Subquery | SQLiteViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
}

export type AnySQLiteSelect = SQLiteSelect<any, any, any, any, any, any>;

export type BuildAliasTable<TTable extends SQLiteTable | View, TAlias extends string> = TTable extends Table
	? SQLiteTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'sqlite'>;
		}>
	>
	: TTable extends View ? SQLiteViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'sqlite'>
		>
	: never;

export interface SQLiteSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: SQLiteTable | Subquery | SQLiteViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: Join[];
	orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	groupBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	distinct?: boolean;
}

export type JoinFn<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends SQLiteTable | Subquery | SQLiteViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) => SQLiteSelectKind<
	THKT,
	TTableName,
	TResultType,
	TRunResult,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends SQLiteTable ? TJoinedTable['_']['columns']
			: TJoinedTable extends Subquery | View ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type SelectedFieldsFlat = SelectFieldsFlatBase<SQLiteColumn>;

export type SelectedFields = SelectFieldsBase<SQLiteColumn, SQLiteTable>;

export type SelectedFieldsOrdered = SelectFieldsOrderedBase<SQLiteColumn>;

export interface SQLiteSelectHKTBase {
	tableName: string | undefined;
	resultType: 'sync' | 'async';
	runResult: unknown;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	_type: unknown;
}

export type SQLiteSelectKind<
	T extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = (T & {
	tableName: TTableName;
	resultType: TResultType;
	runResult: TRunResult;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
})['_type'];

export interface SQLiteSelectQueryBuilderHKT extends SQLiteSelectHKTBase {
	_type: SQLiteSelectQueryBuilder<
		this,
		this['tableName'],
		this['resultType'],
		this['runResult'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface SQLiteSelectHKT extends SQLiteSelectHKTBase {
	_type: SQLiteSelect<
		this['tableName'],
		this['resultType'],
		this['runResult'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
