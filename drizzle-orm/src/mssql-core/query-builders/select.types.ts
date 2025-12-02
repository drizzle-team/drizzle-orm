import type { MsSqlColumn } from '~/mssql-core/columns/index.ts';
import type { MsSqlTable, MsSqlTableWithColumns } from '~/mssql-core/table.ts';
import type {
	SelectedFields as SelectedFieldsBase,
	SelectedFieldsFlat as SelectedFieldsFlatBase,
	SelectedFieldsOrdered as SelectedFieldsOrderedBase,
} from '~/operations.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
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
	SetOperator,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection, Placeholder, SQL, View } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import type { Assume, ValidateShape } from '~/utils.ts';
import type { PreparedQueryConfig, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
import type { MsSqlViewBase } from '../view-base.ts';
import type { MsSqlView, MsSqlViewWithSelection } from '../view.ts';
import type { MsSqlSelectBase, MsSqlSelectQueryBuilderBase } from './select.ts';

export interface MsSqlSelectJoinConfig {
	on: SQL | undefined;
	table: MsSqlTable | Subquery | MsSqlViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
}

export type BuildAliasTable<TTable extends MsSqlTable | MsSqlView, TAlias extends string> = TTable extends Table<any>
	? MsSqlTableWithColumns<
		UpdateTableConfig<TTable['_'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'mssql'>;
		}>
	>
	: TTable extends View<any, any, any> ? MsSqlViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'mssql'>
		>
	: never;

export interface MsSqlSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: MsSqlTable | Subquery | MsSqlViewBase | SQL;
	fetch?: number | Placeholder;
	joins?: MsSqlSelectJoinConfig[];
	orderBy?: (MsSqlColumn | SQL | SQL.Aliased)[];
	groupBy?: (MsSqlColumn | SQL | SQL.Aliased)[];
	for?: { // this is not exposed. Just used internally for the RQB
		mode: 'browse'; // TODO: implement in dialect
	} | {
		mode: 'xml'; // TODO: implement in dialect
	} | {
		mode: 'json';
		type: 'auto' | 'path';
		options?: {
			root?: string;
			includeNullValues?: true;
			withoutArrayWrapper?: true;
		};
	};
	top?: number | Placeholder;
	offset?: number | Placeholder;
	distinct?: boolean;
	setOperators: {
		rightSelect: TypedQueryBuilder<any, any>;
		type: SetOperator;
		isAll: boolean;
		orderBy?: (MsSqlColumn | SQL | SQL.Aliased)[];
		fetch?: number | Placeholder;
		offset?: number | Placeholder;
	}[];
}

export type MsSqlJoin<
	T extends AnyMsSqlSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends MsSqlTable | Subquery | MsSqlViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? MsSqlSelectWithout<
		MsSqlSelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			AppendToResult<
				T['_']['tableName'],
				T['_']['selection'],
				TJoinedName,
				TJoinedTable extends MsSqlTable ? TJoinedTable['_']['columns']
					: TJoinedTable extends Subquery ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
					: never,
				T['_']['selectMode']
			>,
			T['_']['selectMode'] extends 'partial' ? T['_']['selectMode'] : 'multiple',
			T['_']['preparedQueryHKT'],
			T['_']['branch'],
			AppendToNullabilityMap<T['_']['nullabilityMap'], TJoinedName, TJoinType>,
			TDynamic,
			T['_']['excludedMethods']
		>,
		TDynamic,
		T['_']['excludedMethods']
	>
	: never;

export type MsSqlJoinFn<
	T extends AnyMsSqlSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends MsSqlTable | Subquery | MsSqlViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
) => MsSqlJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<MsSqlColumn>;

export type SelectedFieldsFlatUpdate = {
	inserted?: SelectedFieldsFlat | true;
	deleted?: SelectedFieldsFlat | true;
};

export type SelectedFields = SelectedFieldsBase<MsSqlColumn, MsSqlTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<MsSqlColumn>;

export interface MsSqlSelectHKTBase {
	tableName: string | undefined;
	selection: unknown;
	selectMode: SelectMode;
	preparedQueryHKT: unknown;
	branch: 'from' | 'top';
	nullabilityMap: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	selectedFields: unknown;
	_type: unknown;
}

export type MsSqlSelectKind<
	T extends MsSqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TBranch extends 'from' | 'top',
	TNullabilityMap extends Record<string, JoinNullability>,
	TDynamic extends boolean,
	TExcludedMethods extends string,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
> = (T & {
	tableName: TTableName;
	selection: TSelection;
	selectMode: TSelectMode;
	preparedQueryHKT: TPreparedQueryHKT;
	branch: TBranch;
	nullabilityMap: TNullabilityMap;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TResult;
	selectedFields: TSelectedFields;
})['_type'];

export interface MsSqlSelectQueryBuilderHKT extends MsSqlSelectHKTBase {
	_type: MsSqlSelectQueryBuilderBase<
		MsSqlSelectQueryBuilderHKT,
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['preparedQueryHKT'], PreparedQueryHKTBase>,
		this['branch'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface MsSqlSelectHKT extends MsSqlSelectHKTBase {
	_type: MsSqlSelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['preparedQueryHKT'], PreparedQueryHKTBase>,
		this['branch'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export type MsSqlSetOperatorExcludedMethods =
	| 'where'
	| 'having'
	| 'groupBy'
	| 'session'
	| 'fetch'
	| 'offset'
	| 'leftJoin'
	| 'rightJoin'
	| 'innerJoin'
	| 'fullJoin';

export type MsSqlSelectWithout<
	T extends AnyMsSqlSelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	MsSqlSelectKind<
		T['_']['hkt'],
		T['_']['tableName'],
		T['_']['selection'],
		T['_']['selectMode'],
		T['_']['preparedQueryHKT'],
		T['_']['branch'],
		T['_']['nullabilityMap'],
		TDynamic,
		TResetExcluded extends true ? K : T['_']['excludedMethods'] | K,
		T['_']['result'],
		T['_']['selectedFields']
	>,
	TResetExcluded extends true ? K : T['_']['excludedMethods'] | K
>;

export type MsSqlSelectReplace<
	T extends AnyMsSqlSelectQueryBuilder,
	TDynamic extends boolean,
	NewExcluded extends string,
	OldExcluded extends string,
> = TDynamic extends true ? T
	: Omit<
		MsSqlSelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			T['_']['selection'],
			T['_']['selectMode'],
			T['_']['preparedQueryHKT'],
			T['_']['branch'],
			T['_']['nullabilityMap'],
			TDynamic,
			Exclude<T['_']['excludedMethods'], OldExcluded> | NewExcluded,
			T['_']['result'],
			T['_']['selectedFields']
		>,
		NewExcluded | Exclude<T['_']['excludedMethods'], OldExcluded>
	>;

export type MsSqlSelectPrepare<T extends AnyMsSqlSelect> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	PreparedQueryConfig & {
		execute: T['_']['result'];
		iterator: T['_']['result'][number];
	},
	true
>;

export type MsSqlSelectDynamic<T extends AnyMsSqlSelectQueryBuilder> = MsSqlSelectKind<
	T['_']['hkt'],
	T['_']['tableName'],
	T['_']['selection'],
	T['_']['selectMode'],
	T['_']['preparedQueryHKT'],
	T['_']['branch'],
	T['_']['nullabilityMap'],
	true,
	never,
	T['_']['result'],
	T['_']['selectedFields']
>;

export type CreateMsSqlSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TBranch extends 'from' | 'top',
> = TBuilderMode extends 'db' ? MsSqlSelectBase<TTableName, TSelection, TSelectMode, TPreparedQueryHKT, TBranch>
	: MsSqlSelectQueryBuilderBase<
		MsSqlSelectQueryBuilderHKT,
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TBranch
	>;

export type AnyMsSqlSelectQueryBuilder = MsSqlSelectQueryBuilderBase<any, any, any, any, any, any, any, any, any>;

export type AnyMsSqlSetOperatorInterface = MsSqlSetOperatorInterface<any, any, any, any, any, any, any, any>;

export interface MsSqlSetOperatorInterface<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> {
	_: {
		readonly hkt: MsSqlSelectHKT;
		readonly tableName: TTableName;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
	};
}

export type MsSqlSetOperatorWithResult<TResult extends any[]> = MsSqlSetOperatorInterface<
	any,
	any,
	any,
	any,
	any,
	any,
	any,
	TResult,
	any
>;

export type AnyMsSqlSelect = MsSqlSelectBase<any, any, any, any, any, any, any, any, any>;

export type SetOperatorRightSelect<
	TValue extends MsSqlSetOperatorWithResult<TResult>,
	TResult extends any[],
> = TValue extends MsSqlSetOperatorInterface<any, any, any, any, any, any, any, infer TValueResult, any>
	? ValidateShape<
		TValueResult[number],
		TResult[number],
		TypedQueryBuilder<any, TValueResult>
	>
	: TValue;

export type MsSqlSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TBranch extends 'from' | 'top' = 'from' | 'top',
> = MsSqlSelectBase<TTableName, TSelection, TSelectMode, PreparedQueryHKTBase, TBranch, TNullabilityMap, true, never>;

export type MsSqlSetOperator<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TBranch extends 'from' | 'top' = 'from' | 'top',
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = MsSqlSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TBranch,
	TNullabilityMap,
	true,
	MsSqlSetOperatorExcludedMethods
>;

export type SetOperatorRestSelect<
	TValue extends readonly MsSqlSetOperatorWithResult<TResult>[],
	TResult extends any[],
> = TValue extends [infer First, ...infer Rest]
	? First extends MsSqlSetOperatorInterface<any, any, any, any, any, any, any, infer TValueResult, any>
		? Rest extends AnyMsSqlSetOperatorInterface[] ? [
				ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>>,
				...SetOperatorRestSelect<Rest, TResult>,
			]
		: ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>[]>
	: never
	: TValue;

export type MsSqlCreateSetOperatorFn = <
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TValue extends MsSqlSetOperatorWithResult<TResult>,
	TRest extends MsSqlSetOperatorWithResult<TResult>[],
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = 'offset' | 'fetch',
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
>(
	leftSelect: MsSqlSetOperatorInterface<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	rightSelect: SetOperatorRightSelect<TValue, TResult>,
	...restSelects: SetOperatorRestSelect<TRest, TResult>
) => MsSqlSelectWithout<
	MsSqlSelectBase<
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT,
		'from',
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	false,
	MsSqlSetOperatorExcludedMethods,
	true
>;

export type GetMsSqlSetOperators = {
	union: MsSqlCreateSetOperatorFn;
	intersect: MsSqlCreateSetOperatorFn;
	except: MsSqlCreateSetOperatorFn;
	unionAll: MsSqlCreateSetOperatorFn;
};

export type MsSqlSelectQueryBuilder<
	THKT extends MsSqlSelectHKTBase = MsSqlSelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
	TBranch extends 'from' | 'top' = 'from' | 'top',
> = MsSqlSelectQueryBuilderBase<
	THKT,
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TBranch,
	TNullabilityMap,
	true,
	never,
	TResult,
	TSelectedFields
>;
