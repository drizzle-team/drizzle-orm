import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsFlat as SelectedFieldsFlatBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
} from '~/operations';
import type { AnyPgColumn } from '~/pg-core/columns';
import type { AnyPgTable, PgTableWithColumns, TableConfig } from '~/pg-core/table';
import type { PgViewBase } from '~/pg-core/view';
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
import type { AnyTable, Table, UpdateTableConfig } from '~/table';
import type { Assume } from '~/utils';
import { type ColumnsSelection } from '~/view';
import type { PgSelect, PgSelectQueryBuilder } from './select';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnyPgTable | Subquery | PgViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
}

export type AnyPgSelect = PgSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnyTable, TAlias extends string> = PgTableWithColumns<
	Assume<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias>;
		}>,
		TableConfig
	>
>;

export interface PgSelectConfig {
	withList: Subquery[];
	// Either fields or fieldsFlat must be defined
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnyPgTable | Subquery | PgViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: JoinsValue[];
	orderBy: (AnyPgColumn | SQL | SQL.Aliased)[];
	groupBy: (AnyPgColumn | SQL | SQL.Aliased)[];
	lockingClauses: {
		strength: LockStrength;
		config: LockConfig;
	}[];
}

export type JoinFn<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends AnyPgTable | Subquery | PgViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) => PgSelectKind<
	THKT,
	TTableName,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends Table ? TJoinedTable['_']['columns']
			: TJoinedTable extends Subquery ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<AnyPgColumn>;

export type SelectedFields = SelectedFieldsBase<AnyPgColumn, AnyPgTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<AnyPgColumn>;

export type LockStrength = 'update' | 'no key update' | 'share' | 'key share';

export type LockConfig =
	& {
		of?: AnyPgTable;
	}
	& ({
		noWait: true;
		skipLocked?: undefined;
	} | {
		noWait?: undefined;
		skipLocked: true;
	} | {
		noWait?: undefined;
		skipLocked?: undefined;
	});

export interface PgSelectHKTBase {
	tableName: string | undefined;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	_type: unknown;
}

export type PgSelectKind<
	T extends PgSelectHKTBase,
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

export interface PgSelectQueryBuilderHKT extends PgSelectHKTBase {
	_type: PgSelectQueryBuilder<
		this,
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface PgSelectHKT extends PgSelectHKTBase {
	_type: PgSelect<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
