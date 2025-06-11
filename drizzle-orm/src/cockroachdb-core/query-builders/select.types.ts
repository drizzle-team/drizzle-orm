import type { CockroachDbColumn } from '~/cockroachdb-core/columns/index.ts';
import type { CockroachDbTable, CockroachDbTableWithColumns } from '~/cockroachdb-core/table.ts';
import type { CockroachDbViewBase } from '~/cockroachdb-core/view-base.ts';
import type { CockroachDbViewWithSelection } from '~/cockroachdb-core/view.ts';
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
import type { CockroachDbPreparedQuery, PreparedQueryConfig } from '../session.ts';
import type { CockroachDbSelectBase, CockroachDbSelectQueryBuilderBase } from './select.ts';

export interface CockroachDbSelectJoinConfig {
	on: SQL | undefined;
	table: CockroachDbTable | Subquery | CockroachDbViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
}

export type BuildAliasTable<TTable extends CockroachDbTable | View, TAlias extends string> = TTable extends Table
	? CockroachDbTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'cockroachdb'>;
		}>
	>
	: TTable extends View ? CockroachDbViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'cockroachdb'>
		>
	: never;

export interface CockroachDbSelectConfig {
	withList?: Subquery[];
	// Either fields or fieldsFlat must be defined
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: CockroachDbTable | Subquery | CockroachDbViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: CockroachDbSelectJoinConfig[];
	orderBy?: (CockroachDbColumn | SQL | SQL.Aliased)[];
	groupBy?: (CockroachDbColumn | SQL | SQL.Aliased)[];
	lockingClause?: {
		strength: LockStrength;
		config: LockConfig;
	};
	distinct?: boolean | {
		on: (CockroachDbColumn | SQLWrapper)[];
	};
	setOperators: {
		rightSelect: TypedQueryBuilder<any, any>;
		type: SetOperator;
		isAll: boolean;
		orderBy?: (CockroachDbColumn | SQL | SQL.Aliased)[];
		limit?: number | Placeholder;
		offset?: number | Placeholder;
	}[];
}

export type TableLikeHasEmptySelection<T extends CockroachDbTable | Subquery | CockroachDbViewBase | SQL> = T extends
	Subquery ? Equal<T['_']['selectedFields'], {}> extends true ? true : false
	: false;

export type CockroachDbSelectJoin<
	T extends AnyCockroachDbSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends CockroachDbTable | Subquery | CockroachDbViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? CockroachDbSelectWithout<
		CockroachDbSelectKind<
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

export type CockroachDbSelectJoinFn<
	T extends AnyCockroachDbSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TIsLateral extends boolean,
> = 'cross' extends TJoinType ? <
		TJoinedTable
			extends (TIsLateral extends true ? Subquery | SQL : CockroachDbTable | Subquery | CockroachDbViewBase | SQL),
		TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
	>(
		table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
				"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
			>
			: TJoinedTable,
	) => CockroachDbSelectJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>
	: <
		TJoinedTable
			extends (TIsLateral extends true ? Subquery | SQL : CockroachDbTable | Subquery | CockroachDbViewBase | SQL),
		TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
	>(
		table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
				"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
			>
			: TJoinedTable,
		on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
	) => CockroachDbSelectJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<CockroachDbColumn>;

export type SelectedFields = SelectedFieldsBase<CockroachDbColumn, CockroachDbTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<CockroachDbColumn>;

export type LockStrength = 'update' | 'no key update' | 'share' | 'key share';

export type LockConfig =
	& {
		of?: ValueOrArray<CockroachDbTable>;
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

export interface CockroachDbSelectHKTBase {
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

export type CockroachDbSelectKind<
	T extends CockroachDbSelectHKTBase,
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

export interface CockroachDbSelectQueryBuilderHKT extends CockroachDbSelectHKTBase {
	_type: CockroachDbSelectQueryBuilderBase<
		CockroachDbSelectQueryBuilderHKT,
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

export interface CockroachDbSelectHKT extends CockroachDbSelectHKTBase {
	_type: CockroachDbSelectBase<
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

export type CreateCockroachDbSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? CockroachDbSelectBase<TTableName, TSelection, TSelectMode>
	: CockroachDbSelectQueryBuilderBase<CockroachDbSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>;

export type CockroachDbSetOperatorExcludedMethods =
	| 'leftJoin'
	| 'rightJoin'
	| 'innerJoin'
	| 'fullJoin'
	| 'where'
	| 'having'
	| 'groupBy'
	| 'for';

export type CockroachDbSelectWithout<
	T extends AnyCockroachDbSelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	CockroachDbSelectKind<
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

export type CockroachDbSelectPrepare<T extends AnyCockroachDbSelect> = CockroachDbPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type CockroachDbSelectDynamic<T extends AnyCockroachDbSelectQueryBuilder> = CockroachDbSelectKind<
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

export type CockroachDbSelectQueryBuilder<
	THKT extends CockroachDbSelectHKTBase = CockroachDbSelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = CockroachDbSelectQueryBuilderBase<
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

export type AnyCockroachDbSelectQueryBuilder = CockroachDbSelectQueryBuilderBase<
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

export type AnyCockroachDbSetOperatorInterface = CockroachDbSetOperatorInterface<
	any,
	any,
	any,
	any,
	any,
	any,
	any,
	any
>;

export interface CockroachDbSetOperatorInterface<
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
		readonly hkt: CockroachDbSelectHKT;
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

export type CockroachDbSetOperatorWithResult<TResult extends any[]> = CockroachDbSetOperatorInterface<
	any,
	any,
	any,
	any,
	any,
	any,
	TResult,
	any
>;

export type CockroachDbSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = CockroachDbSelectBase<TTableName, TSelection, TSelectMode, TNullabilityMap, true, never>;

export type AnyCockroachDbSelect = CockroachDbSelectBase<any, any, any, any, any, any, any, any>;

export type CockroachDbSetOperator<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = CockroachDbSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	CockroachDbSetOperatorExcludedMethods
>;

export type SetOperatorRightSelect<
	TValue extends CockroachDbSetOperatorWithResult<TResult>,
	TResult extends any[],
> = TValue extends CockroachDbSetOperatorInterface<any, any, any, any, any, any, infer TValueResult, any>
	? ValidateShape<
		TValueResult[number],
		TResult[number],
		TypedQueryBuilder<any, TValueResult>
	>
	: TValue;

export type SetOperatorRestSelect<
	TValue extends readonly CockroachDbSetOperatorWithResult<TResult>[],
	TResult extends any[],
> = TValue extends [infer First, ...infer Rest]
	? First extends CockroachDbSetOperatorInterface<any, any, any, any, any, any, infer TValueResult, any>
		? Rest extends AnyCockroachDbSetOperatorInterface[] ? [
				ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>>,
				...SetOperatorRestSelect<Rest, TResult>,
			]
		: ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>[]>
	: never
	: TValue;

export type CockroachDbCreateSetOperatorFn = <
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TValue extends CockroachDbSetOperatorWithResult<TResult>,
	TRest extends CockroachDbSetOperatorWithResult<TResult>[],
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
>(
	leftSelect: CockroachDbSetOperatorInterface<
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
) => CockroachDbSelectWithout<
	CockroachDbSelectBase<
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
	CockroachDbSetOperatorExcludedMethods,
	true
>;

export type GetCockroachDbSetOperators = {
	union: CockroachDbCreateSetOperatorFn;
	intersect: CockroachDbCreateSetOperatorFn;
	except: CockroachDbCreateSetOperatorFn;
	unionAll: CockroachDbCreateSetOperatorFn;
	intersectAll: CockroachDbCreateSetOperatorFn;
	exceptAll: CockroachDbCreateSetOperatorFn;
};
