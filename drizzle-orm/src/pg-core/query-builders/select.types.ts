import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsFlat as SelectedFieldsFlatBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
} from '~/operations.ts';
import type { PgColumn } from '~/pg-core/columns/index.ts';
import type { PgTable, PgTableWithColumns } from '~/pg-core/table.ts';
import type { PgViewBase } from '~/pg-core/view-base.ts';
import type { PgViewWithSelection } from '~/pg-core/view.ts';
import type {
	AppendToNullabilityMap,
	AppendToResult,
	BuildSubquerySelection,
	GetSelectTableName,
	JoinNullability,
	JoinType,
	MapColumnsToTableAlias,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection, Placeholder, SQL, SQLWrapper, View } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import type { Assume, ValueOrArray } from '~/utils.ts';
import type { PreparedQuery, PreparedQueryConfig } from '../session.ts';
import type { PgSelectBase, PgSelectQueryBuilderBase } from './select.ts';

export interface PgSelectJoinConfig {
	on: SQL | undefined;
	table: PgTable | Subquery | PgViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
}

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
	joins?: PgSelectJoinConfig[];
	orderBy?: (PgColumn | SQL | SQL.Aliased)[];
	groupBy?: (PgColumn | SQL | SQL.Aliased)[];
	lockingClause?: {
		strength: LockStrength;
		config: LockConfig;
	};
	distinct?: boolean | {
		on: (PgColumn | SQLWrapper)[];
	};
}

export type PgJoin<
	T extends AnyPgSelectQueryBuilderBase,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? PgSelectWithout<
		PgSelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			AppendToResult<
				T['_']['tableName'],
				T['_']['selection'],
				TJoinedName,
				TJoinedTable extends Table ? TJoinedTable['_']['columns']
					: TJoinedTable extends Subquery ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
					: never,
				T['_']['selectMode']
			>,
			T['_']['selectMode'] extends 'partial' ? T['_']['selectMode'] : 'multiple',
			AppendToNullabilityMap<T['_']['nullabilityMap'], TJoinedName, TJoinType>,
			T['_']['dynamic'],
			T['_']['excludedMethods']
		>,
		TDynamic,
		T['_']['excludedMethods']
	>
	: never;

export type PgJoinFn<
	T extends AnyPgSelectQueryBuilderBase,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
) => PgJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<PgColumn>;

export type SelectedFields = SelectedFieldsBase<PgColumn, PgTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<PgColumn>;

export type LockStrength = 'update' | 'no key update' | 'share' | 'key share';

export type LockConfig =
	& {
		of?: ValueOrArray<PgTable>;
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
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	selectedFields: unknown;
	_type: unknown;
}

export type PgSelectKind<
	T extends PgSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TDynamic extends boolean,
	TExcludedMethods extends string,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
> = (T & {
	tableName: TTableName;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TResult;
	selectedFields: TSelectedFields;
})['_type'];

export interface PgSelectQueryBuilderHKT extends PgSelectHKTBase {
	_type: PgSelectQueryBuilderBase<
		PgSelectQueryBuilderHKT,
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		this['result'],
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface PgSelectHKT extends PgSelectHKTBase {
	_type: PgSelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		this['result'],
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export type CreatePgSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? PgSelectBase<TTableName, TSelection, TSelectMode>
	: PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>;

export type PgSelectWithout<
	T extends AnyPgSelectQueryBuilderBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	PgSelectKind<
		T['_']['hkt'],
		T['_']['tableName'],
		T['_']['selection'],
		T['_']['selectMode'],
		T['_']['nullabilityMap'],
		TDynamic,
		T['_']['excludedMethods'] | K,
		T['_']['result'],
		T['_']['selectedFields']
	>,
	T['_']['excludedMethods'] | K
>;

export type PgSelectPrepare<T extends AnyPgSelect> = PreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type PgSelectDynamic<T extends AnyPgSelectQueryBuilderBase> = PgSelectKind<
	T['_']['hkt'],
	T['_']['tableName'],
	T['_']['selection'],
	T['_']['selectMode'],
	T['_']['nullabilityMap'],
	true,
	never,
	T['_']['result'],
	T['_']['selectedFields']
>;

export type PgSelectQueryBuilder<
	THKT extends PgSelectHKTBase = PgSelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult = unknown,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = PgSelectQueryBuilderBase<
	THKT,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never,
	TResult,
	TSelectedFields
>;

export type AnyPgSelectQueryBuilderBase = PgSelectQueryBuilderBase<any, any, any, any, any, any, any, any, any>;

export type PgSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = PgSelectBase<TTableName, TSelection, TSelectMode, TNullabilityMap, true, never>;

export type AnyPgSelect = PgSelectBase<any, any, any, any, any, any, any, any>;
