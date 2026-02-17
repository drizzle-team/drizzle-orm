import type { BigQueryColumn } from '~/bigquery-core/columns/index.ts';
import type { BigQueryTable, BigQueryTableWithColumns } from '~/bigquery-core/table.ts';
import type { BigQueryViewBase } from '~/bigquery-core/view-base.ts';
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
import type { ColumnsSelection, Placeholder, SQL, SQLWrapper, View } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table, UpdateTableConfig } from '~/table.ts';
import type { Assume, DrizzleTypeError, Equal, ValidateShape, ValueOrArray } from '~/utils.ts';
import type { BigQueryPreparedQuery, PreparedQueryConfig } from '../session.ts';
import type { BigQuerySelectBase, BigQuerySelectQueryBuilderBase } from './select.ts';

export interface BigQuerySelectJoinConfig {
	on: SQL | undefined;
	table: BigQueryTable | Subquery | BigQueryViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	// Note: BigQuery doesn't support LATERAL joins like PostgreSQL
}

export type BuildAliasTable<TTable extends BigQueryTable | View, TAlias extends string> = TTable extends Table
	? BigQueryTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'bigquery'>;
		}>
	>
	: never;

export interface BigQuerySelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: BigQueryTable | Subquery | BigQueryViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: BigQuerySelectJoinConfig[];
	orderBy?: (BigQueryColumn | SQL | SQL.Aliased)[];
	groupBy?: (BigQueryColumn | SQL | SQL.Aliased)[];
	// BigQuery only supports DISTINCT (not DISTINCT ON)
	distinct?: boolean;
	setOperators: {
		rightSelect: TypedQueryBuilder<any, any>;
		type: SetOperator;
		isAll: boolean;
		orderBy?: (BigQueryColumn | SQL | SQL.Aliased)[];
		limit?: number | Placeholder;
		offset?: number | Placeholder;
	}[];
}

export type TableLikeHasEmptySelection<T extends BigQueryTable | Subquery | BigQueryViewBase | SQL> = T extends Subquery
	? Equal<T['_']['selectedFields'], {}> extends true ? true : false
	: false;

export type BigQuerySelectJoin<
	T extends AnyBigQuerySelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends BigQueryTable | Subquery | BigQueryViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? BigQuerySelectWithout<
		BigQuerySelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			AppendToResult<
				T['_']['tableName'],
				T['_']['selection'],
				TJoinedName,
				TJoinedTable extends Table ? TJoinedTable['_']['columns']
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

export type BigQuerySelectJoinFn<
	T extends AnyBigQuerySelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends BigQueryTable | Subquery | BigQueryViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
			"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
		>
		: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
) => BigQuerySelectJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type BigQuerySelectCrossJoinFn<
	T extends AnyBigQuerySelectQueryBuilder,
	TDynamic extends boolean,
> = <
	TJoinedTable extends BigQueryTable | Subquery | BigQueryViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
			"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
		>
		: TJoinedTable,
) => BigQuerySelectJoin<T, TDynamic, 'cross', TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<BigQueryColumn>;

export type SelectedFields = SelectedFieldsBase<BigQueryColumn, BigQueryTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<BigQueryColumn>;

export interface BigQuerySelectHKTBase {
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

export type BigQuerySelectKind<
	T extends BigQuerySelectHKTBase,
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

export interface BigQuerySelectQueryBuilderHKT extends BigQuerySelectHKTBase {
	_type: BigQuerySelectQueryBuilderBase<
		BigQuerySelectQueryBuilderHKT,
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface BigQuerySelectHKT extends BigQuerySelectHKTBase {
	_type: BigQuerySelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export type CreateBigQuerySelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? BigQuerySelectBase<TTableName, TSelection, TSelectMode>
	: BigQuerySelectQueryBuilderBase<BigQuerySelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>;

export type BigQuerySetOperatorExcludedMethods =
	| 'leftJoin'
	| 'rightJoin'
	| 'innerJoin'
	| 'fullJoin'
	| 'where'
	| 'having'
	| 'groupBy';

export type BigQuerySelectWithout<
	T extends AnyBigQuerySelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	BigQuerySelectKind<
		T['_']['hkt'],
		T['_']['tableName'],
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

export type BigQuerySelectPrepare<T extends AnyBigQuerySelect> = BigQueryPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type BigQuerySelectDynamic<T extends AnyBigQuerySelectQueryBuilder> = BigQuerySelectKind<
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

export type BigQuerySelectQueryBuilder<
	THKT extends BigQuerySelectHKTBase = BigQuerySelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = BigQuerySelectQueryBuilderBase<
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

export type AnyBigQuerySelectQueryBuilder = BigQuerySelectQueryBuilderBase<any, any, any, any, any, any, any, any, any>;

export type AnyBigQuerySetOperatorInterface = BigQuerySetOperatorInterface<any, any, any, any, any, any, any, any>;

export interface BigQuerySetOperatorInterface<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
> {
	_: {
		readonly hkt: BigQuerySelectHKT;
		readonly tableName: TTableName;
		readonly selection: TSelection;
		readonly selectMode: TSelectMode;
		readonly nullabilityMap: TNullabilityMap;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TResult;
		readonly selectedFields: TSelectedFields;
	};
}

export type BigQuerySetOperatorWithResult<TResult extends any[]> = BigQuerySetOperatorInterface<
	any,
	any,
	any,
	any,
	any,
	any,
	TResult,
	any
>;

export type BigQuerySelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = BigQuerySelectBase<TTableName, TSelection, TSelectMode, TNullabilityMap, true, never>;

export type AnyBigQuerySelect = BigQuerySelectBase<any, any, any, any, any, any, any, any>;

export type BigQuerySetOperator<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = BigQuerySelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	BigQuerySetOperatorExcludedMethods
>;

export type SetOperatorRightSelect<
	TValue extends BigQuerySetOperatorWithResult<TResult>,
	TResult extends any[],
> = TValue extends BigQuerySetOperatorInterface<any, any, any, any, any, any, infer TValueResult, any> ? ValidateShape<
		TValueResult[number],
		TResult[number],
		TypedQueryBuilder<any, TValueResult>
	>
	: TValue;

export type SetOperatorRestSelect<
	TValue extends readonly BigQuerySetOperatorWithResult<TResult>[],
	TResult extends any[],
> = TValue extends [infer First, ...infer Rest]
	? First extends BigQuerySetOperatorInterface<any, any, any, any, any, any, infer TValueResult, any>
		? Rest extends AnyBigQuerySetOperatorInterface[] ? [
				ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>>,
				...SetOperatorRestSelect<Rest, TResult>,
			]
		: ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>[]>
	: never
	: TValue;

export type BigQueryCreateSetOperatorFn = <
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TValue extends BigQuerySetOperatorWithResult<TResult>,
	TRest extends BigQuerySetOperatorWithResult<TResult>[],
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
>(
	leftSelect: BigQuerySetOperatorInterface<
		TTableName,
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
) => BigQuerySelectWithout<
	BigQuerySelectBase<
		TTableName,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult,
		TSelectedFields
	>,
	false,
	BigQuerySetOperatorExcludedMethods,
	true
>;

export type GetBigQuerySetOperators = {
	union: BigQueryCreateSetOperatorFn;
	intersect: BigQueryCreateSetOperatorFn;
	except: BigQueryCreateSetOperatorFn;
	unionAll: BigQueryCreateSetOperatorFn;
	intersectAll: BigQueryCreateSetOperatorFn;
	exceptAll: BigQueryCreateSetOperatorFn;
};
