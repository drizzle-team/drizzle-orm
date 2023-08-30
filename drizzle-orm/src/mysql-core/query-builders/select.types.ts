import type { MySqlColumn } from '~/mysql-core/columns/index.ts';
import type { MySqlTable, MySqlTableWithColumns } from '~/mysql-core/table.ts';
import type { MySqlViewBase, MySqlViewWithSelection } from '~/mysql-core/view.ts';
import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsFlat as SelectedFieldsFlatBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
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
import type { Placeholder, SQL } from '~/sql/index.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import type { Assume } from '~/utils.ts';
import { type ColumnsSelection, type View } from '~/view.ts';
import { type PreparedQueryHKTBase } from '../session.ts';
import type { MySqlSelect, MySqlSelectQueryBuilder } from './select.ts';

export interface Join {
	on: SQL | undefined;
	table: MySqlTable | Subquery | MySqlViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
}

export type AnyMySqlSelect = MySqlSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends MySqlTable | View, TAlias extends string> = TTable extends Table
	? MySqlTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'mysql'>;
		}>
	>
	: TTable extends View ? MySqlViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'mysql'>
		>
	: never;

export interface MySqlSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: MySqlTable | Subquery | MySqlViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: Join[];
	orderBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	groupBy?: (MySqlColumn | SQL | SQL.Aliased)[];
	lockingClause?: {
		strength: LockStrength;
		config: LockConfig;
	};
	distinct?: boolean;
}

export type JoinFn<
	THKT extends MySqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends MySqlTable | Subquery | MySqlViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) => MySqlSelectKind<
	THKT,
	TTableName,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends MySqlTable ? TJoinedTable['_']['columns']
			: TJoinedTable extends Subquery ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<MySqlColumn>;

export type SelectedFields = SelectedFieldsBase<MySqlColumn, MySqlTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<MySqlColumn>;

export type LockStrength = 'update' | 'share';

export type LockConfig = {
	noWait: true;
	skipLocked?: undefined;
} | {
	noWait?: undefined;
	skipLocked: true;
} | {
	noWait?: undefined;
	skipLocked?: undefined;
};

export interface MySqlSelectHKTBase {
	tableName: string | undefined;
	selection: unknown;
	selectMode: SelectMode;
	preparedQueryHKT: unknown;
	nullabilityMap: unknown;
	_type: unknown;
}

export type MySqlSelectKind<
	T extends MySqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = (T & {
	tableName: TTableName;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
})['_type'];

export interface MySqlSelectQueryBuilderHKT extends MySqlSelectHKTBase {
	_type: MySqlSelectQueryBuilder<
		this,
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface MySqlSelectHKT extends MySqlSelectHKTBase {
	_type: MySqlSelect<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['preparedQueryHKT'], PreparedQueryHKTBase>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
