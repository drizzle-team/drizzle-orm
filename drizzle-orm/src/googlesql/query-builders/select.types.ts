import type { GoogleSqlColumn } from '~/googlesql/columns/index.ts';
import type { GoogleSqlTable, GoogleSqlTableWithColumns } from '~/googlesql/table.ts';
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
import type { GoogleSqlPreparedQueryConfig, PreparedQueryHKTBase, PreparedQueryKind } from '../session.ts';
import type { GoogleSqlViewBase } from '../view-base.ts';
import type { GoogleSqlViewWithSelection } from '../view.ts';
import type { IndexConfig, GoogleSqlSelectBase, GoogleSqlSelectQueryBuilderBase } from './select.ts';

export interface GoogleSqlSelectJoinConfig {
	on: SQL | undefined;
	table: GoogleSqlTable | Subquery | GoogleSqlViewBase | SQL;
	alias: string | undefined;
	joinType: JoinType;
	lateral?: boolean;
	useIndex?: string[];
	forceIndex?: string[];
	ignoreIndex?: string[];
}

export type BuildAliasTable<TTable extends GoogleSqlTable | View, TAlias extends string> = TTable extends Table
	? GoogleSqlTableWithColumns<
		UpdateTableConfig<TTable['_']['config'], {
			name: TAlias;
			columns: MapColumnsToTableAlias<TTable['_']['columns'], TAlias, 'googlesql'>;
		}>
	>
	: TTable extends View ? GoogleSqlViewWithSelection<
			TAlias,
			TTable['_']['existing'],
			MapColumnsToTableAlias<TTable['_']['selectedFields'], TAlias, 'googlesql'>
		>
	: never;

export interface GoogleSqlSelectConfig {
	withList?: Subquery[];
	fields: Record<string, unknown>;
	fieldsFlat?: SelectedFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: GoogleSqlTable | Subquery | GoogleSqlViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins?: GoogleSqlSelectJoinConfig[];
	orderBy?: (GoogleSqlColumn | SQL | SQL.Aliased)[];
	groupBy?: (GoogleSqlColumn | SQL | SQL.Aliased)[];
	lockingClause?: {
		strength: LockStrength;
		config: LockConfig;
	};
	distinct?: boolean;
	setOperators: {
		rightSelect: TypedQueryBuilder<any, any>;
		type: SetOperator;
		isAll: boolean;
		orderBy?: (GoogleSqlColumn | SQL | SQL.Aliased)[];
		limit?: number | Placeholder;
		offset?: number | Placeholder;
	}[];
	useIndex?: string[];
	forceIndex?: string[];
	ignoreIndex?: string[];
}

export type GoogleSqlJoin<
	T extends AnyGoogleSqlSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends GoogleSqlTable | Subquery | GoogleSqlViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? GoogleSqlSelectWithout<
		GoogleSqlSelectKind<
			T['_']['hkt'],
			T['_']['tableName'],
			AppendToResult<
				T['_']['tableName'],
				T['_']['selection'],
				TJoinedName,
				TJoinedTable extends GoogleSqlTable ? TJoinedTable['_']['columns']
					: TJoinedTable extends Subquery | View ? Assume<TJoinedTable['_']['selectedFields'], SelectedFields>
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

export type GoogleSqlJoinFn<
	T extends AnyGoogleSqlSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
> = <
	TJoinedTable extends GoogleSqlTable | Subquery | GoogleSqlViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
	onIndex?: TJoinedTable extends GoogleSqlTable ? IndexConfig
		: 'Index hint configuration is allowed only for GoogleSqlTable and not for subqueries or views',
) => GoogleSqlJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type SelectedFieldsFlat = SelectedFieldsFlatBase<GoogleSqlColumn>;

export type SelectedFields = SelectedFieldsBase<GoogleSqlColumn, GoogleSqlTable>;

export type SelectedFieldsOrdered = SelectedFieldsOrderedBase<GoogleSqlColumn>;

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

export interface GoogleSqlSelectHKTBase {
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

export type GoogleSqlSelectKind<
	T extends GoogleSqlSelectHKTBase,
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

export interface GoogleSqlSelectQueryBuilderHKT extends GoogleSqlSelectHKTBase {
	_type: GoogleSqlSelectQueryBuilderBase<
		GoogleSqlSelectQueryBuilderHKT,
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

export interface GoogleSqlSelectHKT extends GoogleSqlSelectHKTBase {
	_type: GoogleSqlSelectBase<
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

export type GoogleSqlSetOperatorExcludedMethods =
	| 'where'
	| 'having'
	| 'groupBy'
	| 'session'
	| 'leftJoin'
	| 'rightJoin'
	| 'innerJoin'
	| 'fullJoin'
	| 'for';

export type GoogleSqlSelectWithout<
	T extends AnyGoogleSqlSelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	GoogleSqlSelectKind<
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

export type GoogleSqlSelectPrepare<T extends AnyGoogleSqlSelect> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	GoogleSqlPreparedQueryConfig & {
		execute: T['_']['result'];
		iterator: T['_']['result'][number];
	},
	true
>;

export type GoogleSqlSelectDynamic<T extends AnyGoogleSqlSelectQueryBuilder> = GoogleSqlSelectKind<
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

export type CreateGoogleSqlSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> = TBuilderMode extends 'db' ? GoogleSqlSelectBase<TTableName, TSelection, TSelectMode, TPreparedQueryHKT>
	: GoogleSqlSelectQueryBuilderBase<GoogleSqlSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode, TPreparedQueryHKT>;

export type GoogleSqlSelectQueryBuilder<
	THKT extends GoogleSqlSelectHKTBase = GoogleSqlSelectQueryBuilderHKT,
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = ColumnsSelection,
	TSelectMode extends SelectMode = SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
	TResult extends any[] = unknown[],
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = GoogleSqlSelectQueryBuilderBase<
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

export type AnyGoogleSqlSelectQueryBuilder = GoogleSqlSelectQueryBuilderBase<any, any, any, any, any, any, any, any, any>;

export type AnyGoogleSqlSetOperatorInterface = GoogleSqlSetOperatorInterface<any, any, any, any, any, any, any, any, any>;

export interface GoogleSqlSetOperatorInterface<
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
		readonly hkt: GoogleSqlSelectHKT;
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

export type GoogleSqlSetOperatorWithResult<TResult extends any[]> = GoogleSqlSetOperatorInterface<
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

export type GoogleSqlSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = GoogleSqlSelectBase<TTableName, TSelection, TSelectMode, PreparedQueryHKTBase, TNullabilityMap, true, never>;

export type AnyGoogleSqlSelect = GoogleSqlSelectBase<any, any, any, any, any, any, any, any>;

export type GoogleSqlSetOperator<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = GoogleSqlSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TPreparedQueryHKT,
	TNullabilityMap,
	true,
	GoogleSqlSetOperatorExcludedMethods
>;

export type SetOperatorRightSelect<
	TValue extends GoogleSqlSetOperatorWithResult<TResult>,
	TResult extends any[],
> = TValue extends GoogleSqlSetOperatorInterface<any, any, any, any, any, any, any, infer TValueResult, any>
	? ValidateShape<
		TValueResult[number],
		TResult[number],
		TypedQueryBuilder<any, TValueResult>
	>
	: TValue;

export type SetOperatorRestSelect<
	TValue extends readonly GoogleSqlSetOperatorWithResult<TResult>[],
	TResult extends any[],
> = TValue extends [infer First, ...infer Rest]
	? First extends GoogleSqlSetOperatorInterface<any, any, any, any, any, any, any, infer TValueResult, any>
		? Rest extends AnyGoogleSqlSetOperatorInterface[] ? [
				ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>>,
				...SetOperatorRestSelect<Rest, TResult>,
			]
		: ValidateShape<TValueResult[number], TResult[number], TypedQueryBuilder<any, TValueResult>[]>
	: never
	: TValue;

export type GoogleSqlCreateSetOperatorFn = <
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TValue extends GoogleSqlSetOperatorWithResult<TResult>,
	TRest extends GoogleSqlSetOperatorWithResult<TResult>[],
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
>(
	leftSelect: GoogleSqlSetOperatorInterface<
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
) => GoogleSqlSelectWithout<
	GoogleSqlSelectBase<
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
	GoogleSqlSetOperatorExcludedMethods,
	true
>;

export type GetGoogleSqlSetOperators = {
	union: GoogleSqlCreateSetOperatorFn;
	intersect: GoogleSqlCreateSetOperatorFn;
	except: GoogleSqlCreateSetOperatorFn;
	unionAll: GoogleSqlCreateSetOperatorFn;
	intersectAll: GoogleSqlCreateSetOperatorFn;
	exceptAll: GoogleSqlCreateSetOperatorFn;
};
