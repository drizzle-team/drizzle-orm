import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsFlat as SelectedFieldsFlatBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
} from '~/operations.ts';
import type { PgColumn } from '~/pg-core/columns/index.ts';
import type { PgTable, PgTableWithColumns } from '~/pg-core/table.ts';
import type { PgViewBase, PgViewWithSelection } from '~/pg-core/view.ts';
import type {
	AppendToNullabilityMap,
	AppendToResult,
	GetSelectTableName,
	JoinNullability,
	JoinType,
	MapColumnsToTableAlias,
	SelectMode,
} from '~/query-builders/select.types.ts';
import type { Placeholder, SQL, SQLWrapper } from '~/sql/index.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import type { Assume } from '~/utils.ts';
import { type ColumnsSelection, type View } from '~/view.ts';
import type { PgSelect, PgSelectQueryBuilder } from './select.ts';

export interface Join {
	on: SQL | undefined;
	table: PgTable | Subquery | PgViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
}

export type AnyPgSelect = PgSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends PgTable | View, TAlias extends string> = TTable extends Table
	? PgTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'pg'>;
		}>
	>
	: TTable extends View ? PgViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'pg'>
		>
	: never;

export interface PgSelectConfig {
	withList?: Subquery[];
	// Either fields or fieldsFlat must be defined
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: PgTable | Subquery | PgViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: Join[];
	orderBy?: (PgColumn | SQL | SQL.Aliased)[];
	groupBy?: (PgColumn | SQL | SQL.Aliased)[];
	lockingClauses?: {
		strength: LockStrength;
		config: LockConfig;
	}[];
	distinct?: boolean | {
		on: (PgColumn | SQLWrapper)[];
	};
}

export type JoinFn<
	THKT extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
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

export type SelectedFieldsFlat = SelectedFieldsFlatBase<PgColumn>;

export type SelectedFields = SelectedFieldsBase<PgColumn, PgTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<PgColumn>;

export type LockStrength = 'update' | 'no key update' | 'share' | 'key share';

export type LockConfig =
	& {
		of?: PgTable;
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
