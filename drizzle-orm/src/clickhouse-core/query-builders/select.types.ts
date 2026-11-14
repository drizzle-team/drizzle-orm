import type { ClickHouseColumn } from '~/clickhouse-core/columns/index.ts';
import type { ClickHouseSettings } from '~/clickhouse-core/engines.ts';
import type { ClickHouseTable, ClickHouseTableWithColumns } from '~/clickhouse-core/table.ts';
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
import type { ClickHousePreparedQueryConfig, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
/* import type { ClickHouseViewBase } from '../view-base.ts'; */
/* import type { ClickHouseViewWithSelection } from '../view.ts'; */
import type { ClickHouseSelectBase, ClickHouseSelectQueryBuilderBase } from './select.ts';

export interface ClickHouseSelectJoinConfig {
	on: SQL | undefined;
	table: ClickHouseTable | Subquery | SQL; // ClickHouseViewBase |
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
	/**
	 * ClickHouse's strictness modifier, written between the join type and `JOIN`.
	 *
	 * `ALL` (the default) yields a row per matching pair, `ANY` stops at the first match on the right,
	 * and `ASOF` joins on the closest preceding value of the last condition.
	 */
	strictness?: ClickHouseJoinStrictness;
	/** Emits `GLOBAL JOIN`, which broadcasts the right-hand side to every shard. */
	global?: boolean;
}

/** ClickHouse's join strictness modifiers. */
export type ClickHouseJoinStrictness = 'all' | 'any' | 'asof' | 'semi' | 'anti';

/** An `ARRAY JOIN` clause, which unfolds array columns into one row per element. */
export interface ClickHouseArrayJoinConfig {
	expressions: (ClickHouseColumn | SQL | SQL.Aliased)[];
	/** `LEFT ARRAY JOIN` keeps rows whose array is empty, emitting a default value instead. */
	left: boolean;
}

/** A `LIMIT n [OFFSET m] BY expr` clause, which limits rows *per distinct key*. */
export interface ClickHouseLimitByConfig {
	limit: number | Placeholder;
	offset?: number | Placeholder;
	expressions: (ClickHouseColumn | SQL | SQL.Aliased)[];
}

/** A `SAMPLE k [OFFSET m]` clause. */
export interface ClickHouseSampleConfig {
	/** A fraction of rows when below 1, or an absolute row count when 1 or above. */
	value: number;
	offset?: number;
}

export type BuildAliasTable<TTable extends ClickHouseTable | View, TAlias extends string> = TTable extends Table
	? ClickHouseTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'clickhouse'>;
		}>
	>
	/* : TTable extends View ? ClickHouseViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'clickhouse'>
		> */
	: never;

export interface ClickHouseSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: ClickHouseTable | Subquery | SQL; // | ClickHouseViewBase
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: ClickHouseSelectJoinConfig[];
	orderBy?: (ClickHouseColumn | SQL | SQL.Aliased)[];
	groupBy?: (ClickHouseColumn | SQL | SQL.Aliased)[];
	distinct?: boolean;

	/** `FINAL` — merge parts at read time, so that ReplacingMergeTree/Collapsing tables read cleanly. */
	final?: boolean;
	/** `PREWHERE` — a filter ClickHouse applies before reading the remaining columns. */
	prewhere?: SQL;
	/** `SAMPLE` — read an approximate subset of the table. */
	sample?: ClickHouseSampleConfig;
	/** `ARRAY JOIN` clauses. */
	arrayJoins?: ClickHouseArrayJoinConfig[];
	/** `LIMIT … BY` — limits rows per distinct key rather than over the whole result. */
	limitBy?: ClickHouseLimitByConfig;
	/** `GROUP BY … WITH TOTALS` — appends a totals row to the result. */
	withTotals?: boolean;
	/** Query-level `SETTINGS`. */
	settings?: ClickHouseSettings;
	setOperators: {
		rightSelect: TypedQueryBuilder<any, any>;
		type: SetOperator;
		isAll: boolean;
		orderBy?: (ClickHouseColumn | SQL | SQL.Aliased)[];
		limit?: number | Placeholder;
		offset?: number | Placeholder;
	}[];
}

export type ClickHouseJoin<
	T extends AnyClickHouseSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends ClickHouseTable | Subquery | SQL, // | ClickHouseViewBase
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? ClickHouseSelectWithout<
		ClickHouseSelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			AppendToResult<
				T['_']['tableName'],
				T['_']['selection'],
				TJoinedName,
				TJoinedTable extends ClickHouseTable ? TJoinedTable['_']['columns']
					: TJoinedTable extends Subquery ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
					: never,
				T['_']['selectMode']
			>,
			T['_']['selectMode'] extends 'partial' ? T['_']['selectMode'] : 'multiple',
			T['_']['preparedQueryHKT'],
			AppendToNullabilityMap<T['_']['nullabilityMap'], TJoinedName, TJoinType>,
			TDynamic,
			T['_']['excludedMethods']
		>,
		TDynamic,
		T['_']['excludedMethods']
	>
	: never;

export type ClickHouseJoinFn<
	T extends AnyClickHouseSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TIsLateral extends boolean,
> = <
	TJoinedTable extends (TIsLateral extends true ? Subquery | SQL
		: ClickHouseTable | Subquery | SQL /* | ClickHouseViewBase */),
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
) => ClickHouseJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type ClickHouseCrossJoinFn<
	T extends AnyClickHouseSelectQueryBuilder,
	TDynamic extends boolean,
	TIsLateral extends boolean,
> = <
	TJoinedTable extends (TIsLateral extends true ? Subquery | SQL
		: ClickHouseTable | Subquery | SQL /* | ClickHouseViewBase */),
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable) => ClickHouseJoin<T, TDynamic, 'cross', TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<ClickHouseColumn>;

export type SelectedFields = SelectedFieldsBase<ClickHouseColumn, ClickHouseTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<ClickHouseColumn>;

export interface ClickHouseSelectHKTBase {
	tableName: string | undefined;
	selection: unknown;
	selectMode: SelectMode;
	preparedQueryHKT: unknown;
	nullabilityMap: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	selectedFields: unknown;
	_type: unknown;
}

export type ClickHouseSelectKind<
	T extends ClickHouseSelectHKTBase,
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
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
	nullabilityMap: TNullabilityMap;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TResult;
	selectedFields: TSelectedFields;
})['_type'];

export interface ClickHouseSelectQueryBuilderHKT extends ClickHouseSelectHKTBase {
	_type: ClickHouseSelectQueryBuilderBase<
		ClickHouseSelectQueryBuilderHKT,
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['preparedQueryHKT'], PreparedQueryHKTBase>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export interface ClickHouseSelectHKT extends ClickHouseSelectHKTBase {
	_type: ClickHouseSelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['preparedQueryHKT'], PreparedQueryHKTBase>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>
	>;
}

export type ClickHouseSetOperatorExcludedMethods =
	| 'where'
	| 'having'
	| 'groupBy'
	| 'session'
	| 'leftJoin'
	| 'rightJoin'
	| 'innerJoin'
	| 'fullJoin'
	| 'final'
	| 'prewhere'
	| 'sample'
	| 'limitBy'
	| 'withTotals'
	| 'settings';

export type ClickHouseSelectWithout<
	T extends AnyClickHouseSelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	ClickHouseSelectKind<
		T['_']['hkt'],
		T['_']['tableName'],
		T['_']['selection'],
		T['_']['selectMode'],
		T['_']['preparedQueryHKT'],
		T['_']['nullabilityMap'],
		TDynamic,
		TResetExcluded extends true ? K : T['_']['excludedMethods'] | K,
		T['_']['result'],
		T['_']['selectedFields']
	>,
	TResetExcluded extends true ? K : T['_']['excludedMethods'] | K
>;

export type ClickHouseSelectPrepare<T extends AnyClickHouseSelect> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	ClickHousePreparedQueryConfig & {
		execute: T['_']['result'];
		iterator: T['_']['result'][number];
	},
	true
>;

export type ClickHouseSelectDynamic<T extends AnyClickHouseSelectQueryBuilder> = ClickHouseSelectKind<
	T['_']['hkt'],
	T['_']['tableName'],
	T['_']['selection'],
	T['_']['selectMode'],
	T['_']['preparedQueryHKT'],
	T['_']['nullabilityMap'],
	true,
	never,
	T['_']['result'],
	T['_']['selectedFields']
>;

export type CreateClickHouseSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> = TBuilderMode extends 'db' ? ClickHouseSelectBase<TTableName, TSelection, TSelectMode, TPreparedQueryHKT>
	: ClickHouseSelectQueryBuilderBase<
		ClickHouseSelectQueryBuilderHKT,
		TTableName,
		TSelection,
		TSelectMode,
		TPreparedQueryHKT
	>;

export type ClickHouseSelectQueryBuilder<
	THKT extends ClickHouseSelectHKTBase = ClickHouseSelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = ClickHouseSelectQueryBuilderBase<
	THKT,
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap,
	true,
	never,
	TResult,
	TSelectedFields
>;

export type AnyClickHouseSelectQueryBuilder = ClickHouseSelectQueryBuilderBase<
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

export type AnyClickHouseSetOperatorInterface = ClickHouseSetOperatorInterface<
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

export interface ClickHouseSetOperatorInterface<
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
		readonly hkt: ClickHouseSelectHKT;
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

export type ClickHouseSetOperatorWithResult<TResult extends any[]> = ClickHouseSetOperatorInterface<
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

export type ClickHouseSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = ClickHouseSelectBase<TTableName, TSelection, TSelectMode, PreparedQueryHKTBase, TNullabilityMap, true, never>;

export type AnyClickHouseSelect = ClickHouseSelectBase<any, any, any, any, any, any, any, any>;

export type ClickHouseSetOperator<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = ClickHouseSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap,
	true,
	ClickHouseSetOperatorExcludedMethods
>;

export type SetOperatorRightSelect<
	TValue extends ClickHouseSetOperatorWithResult<TResult>,
	TResult extends any[],
> = TValue extends ClickHouseSetOperatorInterface<any, any, any, any, any, any, any, infer TValueResult, any>
	? ValidateShape<
		TValueResult[number],
		TResult[number],
		TypedQueryBuilder<any, TValueResult>
	>
	: TValue;

export type SetOperatorRestSelect<
	TValue extends readonly ClickHouseSetOperatorWithResult<TResult>[],
	TResult extends any[],
> = TValue extends [infer First, ...infer Rest]
	? First extends ClickHouseSetOperatorInterface<any, any, any, any, any, any, any, infer TValueResult, any>
		? Rest extends AnyClickHouseSetOperatorInterface[] ? [
				ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>>,
				...SetOperatorRestSelect<Rest, TResult>,
			]
		: ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>[]>
	: never
	: TValue;

export type ClickHouseCreateSetOperatorFn = <
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TValue extends ClickHouseSetOperatorWithResult<TResult>,
	TRest extends ClickHouseSetOperatorWithResult<TResult>[],
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
>(
	leftSelect: ClickHouseSetOperatorInterface<
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
) => ClickHouseSelectWithout<
	ClickHouseSelectBase<
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
	false,
	ClickHouseSetOperatorExcludedMethods,
	true
>;

export type GetClickHouseSetOperators = {
	union: ClickHouseCreateSetOperatorFn;
	intersect: ClickHouseCreateSetOperatorFn;
	except: ClickHouseCreateSetOperatorFn;
	unionAll: ClickHouseCreateSetOperatorFn;
	minus: ClickHouseCreateSetOperatorFn;
};
