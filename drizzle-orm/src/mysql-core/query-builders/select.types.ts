import type { AnyMySqlColumn } from '~/mysql-core/columns';
import type { AnyMySqlTable, MySqlTableWithColumns, TableConfig } from '~/mysql-core/table';
import type { MySqlViewBase } from '~/mysql-core/view';
import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsFlat as SelectedFieldsFlatBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
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
import type { Placeholder, SQL } from '~/sql';
import type { Subquery } from '~/subquery';
import type { AnyTable, UpdateTableConfig } from '~/table';
import type { Assume } from '~/utils';
import type { MySqlSelect, MySqlSelectQueryBuilder } from './select';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnyMySqlTable | Subquery;
	joinType: JoinType;
}

export type AnyMySqlSelect = MySqlSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnyTable, TAlias extends string> = MySqlTableWithColumns<
	Assume<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias>;
		}>,
		TableConfig
	>
>;

export interface MySqlSelectConfig {
	withList: Subquery[];
	fields: SelectedFields;
	fieldsList: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnyMySqlTable | Subquery | MySqlViewBase;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: (AnyMySqlColumn | SQL | SQL.Aliased)[];
	groupBy: (AnyMySqlColumn | SQL | SQL.Aliased)[];
	lockingClause?: {
		strength: LockStrength;
		config: LockConfig;
	};
}

export type JoinFn<
	THKT extends MySqlSelectHKTBase,
	TTableName extends string,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends AnyMySqlTable | Subquery,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: SQL | undefined) => MySqlSelectKind<
	THKT,
	TTableName,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends AnyMySqlTable ? TJoinedTable['_']['columns']
			: TJoinedName extends Subquery ? Assume<TJoinedName['_']['selectedFields'], SelectedFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<AnyMySqlColumn>;

export type SelectedFields = SelectedFieldsBase<AnyMySqlColumn, AnyMySqlTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<AnyMySqlColumn>;

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
	tableName: string;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	_type: unknown;
}

export type MySqlSelectKind<
	T extends MySqlSelectHKTBase,
	TTableName extends string,
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
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface MySqlSelectHKT extends MySqlSelectHKTBase {
	_type: MySqlSelect<
		this['tableName'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
