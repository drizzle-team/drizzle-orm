import type {
	AppendToNullabilityMap,
	AppendToResult,
	BuildSubquerySelection,
	GetSelectTableName,
	JoinNullability,
	JoinType,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import type { ColumnsSelection, SQL, View } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table } from '~/table.ts';
import type { Assume, DrizzleTypeError } from '~/utils.ts';
import type { PgSelectHKTBase, SelectedFields, TableLikeHasEmptySelection } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { PgTable } from '../table.ts';
import type { PgViewBase } from '../view-base.ts';
import type { EffectPgCorePreparedQuery } from './prepared-query.ts';
import type { EffectPgSelectBase, EffectPgSelectQueryBuilderBase } from './select.ts';

export interface EffectPgSelectQueryBuilderHKT extends PgSelectHKTBase {
	_type: EffectPgSelectQueryBuilderBase<
		EffectPgSelectQueryBuilderHKT,
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

export type CreateEffectPgSelectFromBuilderMode<
	TBuilderMode extends 'db' | 'qb',
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
> = TBuilderMode extends 'db' ? EffectPgSelectBase<TTableName, TSelection, TSelectMode>
	: EffectPgSelectQueryBuilderBase<EffectPgSelectQueryBuilderHKT, TTableName, TSelection, TSelectMode>;

export type EffectPgSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = EffectPgSelectBase<TTableName, TSelection, TSelectMode, TNullabilityMap, true, never>;

export type AnyEffectPgSelect = EffectPgSelectBase<any, any, any, any, any, any, any, any>;

export type EffectPgSelectJoin<
	T extends AnyEffectPgSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TJoinedTable extends PgTable | Subquery | PgViewBase | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
> = T extends any ? EffectPgSelectWithout<
		EffectPgSelectKind<
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

export type EffectPgSelectJoinFn<
	T extends AnyEffectPgSelectQueryBuilder,
	TDynamic extends boolean,
	TJoinType extends JoinType,
	TIsLateral extends boolean,
> = <
	TJoinedTable extends (TIsLateral extends true ? Subquery | SQL : PgTable | Subquery | PgViewBase | SQL),
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
			"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
		>
		: TJoinedTable,
	on: ((aliases: T['_']['selection']) => SQL | undefined) | SQL | undefined,
) => EffectPgSelectJoin<T, TDynamic, TJoinType, TJoinedTable, TJoinedName>;

export type EffectPgSelectCrossJoinFn<
	T extends AnyEffectPgSelectQueryBuilder,
	TDynamic extends boolean,
	TIsLateral extends boolean,
> = <
	TJoinedTable extends (TIsLateral extends true ? Subquery | SQL : PgTable | Subquery | PgViewBase | SQL),
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(
	table: TableLikeHasEmptySelection<TJoinedTable> extends true ? DrizzleTypeError<
			"Cannot reference a data-modifying statement subquery if it doesn't contain a `returning` clause"
		>
		: TJoinedTable,
) => EffectPgSelectJoin<T, TDynamic, 'cross', TJoinedTable, TJoinedName>;

export type EffectPgSelectWithout<
	T extends AnyEffectPgSelectQueryBuilder,
	TDynamic extends boolean,
	K extends keyof T & string,
	TResetExcluded extends boolean = false,
> = TDynamic extends true ? T : Omit<
	EffectPgSelectKind<
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

export type EffectPgSelectDynamic<T extends AnyEffectPgSelectQueryBuilder> = EffectPgSelectKind<
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

export type EffectPgSelectPrepare<T extends AnyEffectPgSelect> = EffectPgCorePreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['result'];
	}
>;

export type EffectPgSelectKind<
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

export type AnyEffectPgSelectQueryBuilder = EffectPgSelectQueryBuilderBase<any, any, any, any, any, any, any, any, any>;

export interface EffectPgSelectQueryBuilderHKT extends PgSelectHKTBase {
	_type: EffectPgSelectQueryBuilderBase<
		EffectPgSelectQueryBuilderHKT,
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

export interface EffectPgSelectHKT extends PgSelectHKTBase {
	_type: EffectPgSelectBase<
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
