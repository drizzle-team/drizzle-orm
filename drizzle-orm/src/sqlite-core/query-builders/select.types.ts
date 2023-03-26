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
import type { AnyTable, UpdateTableConfig } from '~/table';
import type { SQLiteViewBase } from '../view';
import type { SQLiteSelect, SQLiteSelectQueryBuilder } from './select';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnySQLiteTable | Subquery;
	joinType: JoinType;
}

export type AnySQLiteSelect = SQLiteSelect<any, any, any, any, any, any>;

export type BuildAliasTable<TTable extends AnyTable, TAlias extends string> = SQLiteTableWithColumns<
	Assume<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias>;
		}>,
		TableConfig
	>
>;

export interface SQLiteSelectConfig {
	withList: Subquery[];
	fields: SelectedFields;
	fieldsList: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnySQLiteTable | Subquery | SQLiteViewBase;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
	groupBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
}

export type JoinFn<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends AnySQLiteTable | Subquery,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: SQL | undefined) => SQLiteSelectKind<
	THKT,
	TTableName,
	TResultType,
	TRunResult,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends AnySQLiteTable ? TJoinedTable['_']['columns']
			: TJoinedTable extends Subquery ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
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
	tableName: string;
	resultType: 'sync' | 'async';
	runResult: unknown;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	_type: unknown;
}

export type SQLiteSelectKind<
	T extends SQLiteSelectHKTBase,
	TTableName extends string,
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
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface SQLiteSelectHKT extends SQLiteSelectHKTBase {
	_type: SQLiteSelect<
		this['tableName'],
		this['resultType'],
		this['runResult'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
