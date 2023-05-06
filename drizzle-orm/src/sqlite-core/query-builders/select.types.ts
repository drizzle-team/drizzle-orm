import type { Placeholder, SQL } from '~/sql';
import type { Assume } from '~/utils';

import type { AnySQLiteColumn } from '~/sqlite-core/columns';
import type { AnySQLiteTable, SQLiteTableWithColumns, TableConfig } from '~/sqlite-core/table';

import type {
	SelectedFields as SelectFieldsBase,
	SelectedFieldsFlat as SelectFieldsFlatBase,
	SelectedFieldsOrdered as SelectFieldsOrderedBase,
} from '~/operations';
import type {
	AppendToNullabilityMap,
	AppendToResult,
	GetSelectTableName,
	JoinNullability,
	JoinType,
	MapColumnsToTableAlias,
	SelectMode,
} from '~/query-builders/select.types';
import type { Subquery } from '~/subquery';
import type { Table, UpdateTableConfig } from '~/table';
import { type ColumnsSelection, type View } from '~/view';
import type { SQLiteViewBase, SQLiteViewWithSelection } from '../view';
import type { SQLiteSelect, SQLiteSelectQueryBuilder } from './select';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnySQLiteTable | Subquery | SQLiteViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
}

export type AnySQLiteSelect = SQLiteSelect<any, any, any, any, any, any>;

export type BuildAliasTable<TTable extends Table | View, TAlias extends string> = TTable extends Table
	? SQLiteTableWithColumns<
		Assume<
			UpdateTableConfig<TTable['_']['config'], {
				name: TAlias;
				columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias>;
			}>,
			TableConfig
		>
	>
	: TTable extends View ? SQLiteViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias>
		>
	: never;

export interface SQLiteSelectConfig {
	withList: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnySQLiteTable | Subquery | SQLiteViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: JoinsValue[];
	orderBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
	groupBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
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
	TJoinedTable extends AnySQLiteTable | Subquery | SQLiteViewBase | SQL,
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
		TJoinedTable extends AnySQLiteTable ? TJoinedTable['_']['columns']
			: TJoinedTable extends Subquery | View ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type SelectedFieldsFlat = SelectFieldsFlatBase<AnySQLiteColumn>;

export type SelectedFields = SelectFieldsBase<AnySQLiteColumn, AnySQLiteTable>;

export type SelectedFieldsOrdered = SelectFieldsOrderedBase<AnySQLiteColumn>;

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
