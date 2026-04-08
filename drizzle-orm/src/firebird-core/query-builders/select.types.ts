import type { ColumnsSelection, Placeholder, SQL, View } from '~/sql/sql.ts';
import type { FirebirdColumn } from '~/firebird-core/columns/index.ts';
import type { FirebirdTable, FirebirdTableWithColumns } from '~/firebird-core/table.ts';
import type { Assume, ValidateShape } from '~/utils.ts';

import type {
	SelectedFields as SelectFieldsBase,
	SelectedFieldsFlat as SelectFieldsFlatBase,
	SelectedFieldsOrdered as SelectFieldsOrderedBase,
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
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import type { FirebirdPreparedQuery } from '../session.ts';
import type { FirebirdViewBase } from '../view-base.ts';
import type { FirebirdViewWithSelection } from '../view.ts';
import type { FirebirdSelectBase, FirebirdSelectQueryBuilderBase } from './select.ts';

export interface FirebirdSelectJoinConfig {
	on: SQL | undefined;
	table: FirebirdTable | Subquery | FirebirdViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
}

export type BuildAliasTable<TTable extends FirebirdTable | View, TAlias extends string> = TTable extends Table
	? FirebirdTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'firebird'>;
		}>
	>
	: TTable extends View ? FirebirdViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'firebird'>
		>
	: never;

export interface FirebirdSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: FirebirdTable | Subquery | FirebirdViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: FirebirdSelectJoinConfig[];
	orderBy?: (FirebirdColumn | SQL | SQL.Aliased)[];
	groupBy?: (FirebirdColumn | SQL | SQL.Aliased)[];
	distinct?: boolean;
	setOperators: {
		rightSelect: TypedQueryBuilder<any, any>;
		type: SetOperator;
		isAll: boolean;
		orderBy?: (FirebirdColumn | SQL | SQL.Aliased)[];
		limit?: number | Placeholder;
		offset?: number | Placeholder;
	}[];
}

export type FirebirdSelectJoin<
	T extends AnyFirebirdSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends FirebirdTable | Subquery | FirebirdViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? FirebirdSelectWithout<
		FirebirdSelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			T['_']['resultType'],
			T['_']['runResult'],
			AppendToResult<
				T['_']['tableName'],
				T['_']['selection'],
				TJoinedName,
				TJoinedTable extends FirebirdTable ? TJoinedTable['_']['columns']
					: TJoinedTable extends Subquery | View ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
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

export type FirebirdSelectJoinFn<
	T extends AnyFirebirdSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends FirebirdTable | Subquery | FirebirdViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
) => FirebirdSelectJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type FirebirdSelectCrossJoinFn<
	T extends AnyFirebirdSelectQueryBuilder,
	TDynamic extends boolean,
> = <
	TJoinedTable extends FirebirdTable | Subquery | FirebirdViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable) => FirebirdSelectJoin<T, TDynamic, 'cross', TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectFieldsFlatBase<FirebirdColumn>;

export type SelectedFields = SelectFieldsBase<FirebirdColumn, FirebirdTable>;

export type SelectedFieldsOrdered = SelectFieldsOrderedBase<FirebirdColumn>;

export interface FirebirdSelectHKTBase {
	tableName: string | undefined;
	resultType: 'sync' | 'async';
	runResult: unknown;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	selectedFields: unknown;
	_type: unknown;
}

export type FirebirdSelectKind<
	T extends FirebirdSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TDynamic extends boolean,
	TExcludedMethods extends string,
	TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
> = (T & {
	tableName: TTableName;
	resultType: TResultType;
	runResult: TRunResult;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TResult;
	selectedFields: TSelectedFields;
})['_type'];

export interface FirebirdSelectQueryBuilderHKT extends FirebirdSelectHKTBase {
	_type: FirebirdSelectQueryBuilderBase<
		FirebirdSelectQueryBuilderHKT,
		this['tableName'],
		this['resultType'],
		this['runResult'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface FirebirdSelectHKT extends FirebirdSelectHKTBase {
	_type: FirebirdSelectBase<
		this['tableName'],
		this['resultType'],
		this['runResult'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export type FirebirdSetOperatorExcludedMethods =
	| 'config'
	| 'leftJoin'
	| 'rightJoin'
	| 'innerJoin'
	| 'fullJoin'
	| 'where'
	| 'having'
	| 'groupBy';

export type CreateFirebirdSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? FirebirdSelectBase<
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode
	>
	: FirebirdSelectQueryBuilderBase<
		FirebirdSelectQueryBuilderHKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode
	>;

export type FirebirdSelectWithout<
	T extends AnyFirebirdSelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	FirebirdSelectKind<
		T['_']['hkt'],
		T['_']['tableName'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['selection'],
		T['_']['selectMode'],
		T['_']['nullabilityMap'],
		TDynamic,
		TResetExcluded extends true ? K : T['_']['excludedMethods'] | K,
		T['_']['result'],
		T['_']['selectedFields']
	>,
	TResetExcluded extends true ? K : T['_']['excludedMethods'] | K
>;

export type FirebirdSelectExecute<T extends AnyFirebirdSelect> = T['_']['result'];

export type FirebirdSelectPrepare<T extends AnyFirebirdSelect> = FirebirdPreparedQuery<
	{
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['result'];
		get: T['_']['result'][number] | undefined;
		values: any[][];
		execute: FirebirdSelectExecute<T>;
	}
>;

export type FirebirdSelectDynamic<T extends AnyFirebirdSelectQueryBuilder> = FirebirdSelectKind<
	T['_']['hkt'],
	T['_']['tableName'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['selection'],
	T['_']['selectMode'],
	T['_']['nullabilityMap'],
	true,
	never,
	T['_']['result'],
	T['_']['selectedFields']
>;

export type FirebirdSelectQueryBuilder<
	THKT extends FirebirdSelectHKTBase = FirebirdSelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = FirebirdSelectQueryBuilderBase<
	THKT,
	TTableName,
	TResultType,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never,
	TResult,
	TSelectedFields
>;

export type AnyFirebirdSelectQueryBuilder = FirebirdSelectQueryBuilderBase<
	any,
	any,
	any,
	any,
	any,
	any,
	any,
	any,
	any,
	any,
	any
>;

export type AnyFirebirdSetOperatorInterface = FirebirdSetOperatorInterface<any, any, any, any, any, any, any, any, any>;

export interface FirebirdSetOperatorInterface<
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> {
	_: {
		readonly hkt: FirebirdSelectHKTBase;
		readonly tableName: TTableName;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
	};
}

export type FirebirdSetOperatorWithResult<TResult extends any[]> = FirebirdSetOperatorInterface<
	any,
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

export type FirebirdSelect<
	TTableName extends string | undefined = string | undefined,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = FirebirdSelectBase<TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap, true, never>;

export type AnyFirebirdSelect = FirebirdSelectBase<any, any, any, any, any, any, any, any, any, any>;

export type FirebirdSetOperator<
	TTableName extends string | undefined = string | undefined,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = FirebirdSelectBase<
	TTableName,
	TResultType,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	FirebirdSetOperatorExcludedMethods
>;

export type SetOperatorRightSelect<
	TValue extends FirebirdSetOperatorWithResult<TResult>,
	TResult extends any[],
> = TValue extends FirebirdSetOperatorInterface<any, any, any, any, any, any, any, any, infer TValueResult, any>
	? ValidateShape<
		TValueResult[number],
		TResult[number],
		TypedQueryBuilder<any, TValueResult>
	>
	: TValue;

export type SetOperatorRestSelect<
	TValue extends readonly FirebirdSetOperatorWithResult<TResult>[],
	TResult extends any[],
> = TValue extends [infer First, ...infer Rest]
	? First extends FirebirdSetOperatorInterface<any, any, any, any, any, any, any, any, infer TValueResult, any>
		? Rest extends AnyFirebirdSetOperatorInterface[] ? [
				ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>>,
				...SetOperatorRestSelect<Rest, TResult>,
			]
		: ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>[]>
	: never
	: TValue;

export type FirebirdCreateSetOperatorFn = <
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TValue extends FirebirdSetOperatorWithResult<TResult>,
	TRest extends FirebirdSetOperatorWithResult<TResult>[],
	TSelectMode extends SelectMode = 'single',
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
>(
	leftSelect: FirebirdSetOperatorInterface<
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	rightSelect: SetOperatorRightSelect<TValue, TResult>,
	...restSelects: SetOperatorRestSelect<TRest, TResult>
) => FirebirdSelectWithout<
	FirebirdSelectBase<
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	false,
	FirebirdSetOperatorExcludedMethods,
	true
>;

export type GetFirebirdSetOperators = {
	union: FirebirdCreateSetOperatorFn;
	intersect: FirebirdCreateSetOperatorFn;
	except: FirebirdCreateSetOperatorFn;
	unionAll: FirebirdCreateSetOperatorFn;
};
