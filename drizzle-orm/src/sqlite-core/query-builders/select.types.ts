import type { GetColumnConfig, GetColumnData, UpdateColConfig } from '~/column';
import type { Placeholder, SQL } from '~/sql';
import type { Assume, DrizzleTypeError, Equal, IfThenElse, Simplify } from '~/utils';

import type { AnySQLiteColumn } from '~/sqlite-core/columns';
import type { ChangeColumnTableName, SQLiteColumn } from '~/sqlite-core/columns/common';
import type {
	AnySQLiteTable,
	GetTableConfig,
	SQLiteTableWithColumns,
	TableConfig,
	UpdateTableConfig,
} from '~/sqlite-core/table';

import type {
	SelectFields as SelectFieldsBase,
	SelectFieldsFlat as SelectFieldsFlatBase,
	SelectFieldsOrdered as SelectFieldsOrderedBase,
} from '~/operations';
import type { GetSubqueryAlias, GetSubquerySelection, Subquery } from '~/subquery';
import type { SQLiteViewBase, SQLiteViewWithSelection } from '../view';
import type { SQLiteSelect, SQLiteSelectQueryBuilder } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnySQLiteTable | Subquery | SQL;
	alias: string | undefined;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'null' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityToColumn<TColumn extends AnySQLiteColumn, TNullability extends JoinNullability> =
	TNullability extends 'not-null' ? TColumn
		: TColumn extends SQLiteColumn<infer TConfig> ? SQLiteColumn<
				UpdateColConfig<TConfig, {
					notNull: TNullability extends 'nullable' ? false : TConfig['notNull'];
				}>
			>
		: never;

export type ApplyNotNullMapToJoins<TResult, TNullabilityMap extends Record<string, JoinNullability>> = Simplify<
	{
		[TTableName in keyof TResult & keyof TNullabilityMap & string]: ApplyNullability<
			TResult[TTableName],
			TNullabilityMap[TTableName]
		>;
	}
>;

export type SelectResult<
	TResult,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TResult extends never ? any : TSelectMode extends 'partial' ? SelectPartialResult<TResult, TNullabilityMap>
: TSelectMode extends 'single' ? SelectResultFields<TResult>
: ApplyNotNullMapToJoins<SelectResultFields<TResult>, TNullabilityMap>;

type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true) : never) extends false ? false : true;

type Not<T extends boolean> = T extends true ? false : true;

type SelectPartialResult<TFields, TNullability extends Record<string, JoinNullability>> = TNullability extends
	TNullability ? {
		[Key in keyof TFields]: TFields[Key] extends infer TField
			? TField extends AnySQLiteTable ? GetTableConfig<TField, 'name'> extends keyof TNullability ? ApplyNullability<
						SelectResultFields<GetTableConfig<TField, 'columns'>>,
						TNullability[GetTableConfig<TField, 'name'>]
					>
				: never
			: TField extends AnySQLiteColumn
				? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
				: never
			: TField extends SQL | SQL.Aliased ? SelectResultField<TField>
			: TField extends Record<string, any>
				? TField[keyof TField] extends
					AnySQLiteColumn<{ tableName: infer TTableName extends string }> | SQL | SQL.Aliased
					? Not<IsUnion<TTableName>> extends true
						? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
					: SelectPartialResult<TField, TNullability>
				: never
			: never
			: never;
	}
	: never;

export type AnySQLiteSelect = SQLiteSelect<any, any, any, any, any, any>;

export type BuildAliasTable<TTable extends AnySQLiteTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? SQLiteTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<
	TColumns extends Record<string, AnySQLiteColumn | SQL | SQL.Aliased>,
	TAlias extends string,
> = Simplify<
	{
		[Key in keyof TColumns]: TColumns[Key] extends AnySQLiteColumn ? ChangeColumnTableName<TColumns[Key], TAlias>
			: TColumns[Key];
	}
>;

export type AddAliasToSelection<TSelection, TAlias extends string> = Equal<TSelection, any> extends true ? any
	: Simplify<
		{
			[Key in keyof TSelection]: TSelection[Key] extends AnySQLiteColumn
				? ChangeColumnTableName<TSelection[Key], TAlias>
				: TSelection[Key] extends SQL | SQL.Aliased ? TSelection[Key]
				: TSelection[Key] extends Record<string, AnySQLiteColumn | SQL | SQL.Aliased>
					? MapColumnsToTableAlias<TSelection[Key], TAlias>
				: never;
		}
	>;

export type BuildSubquerySelection<
	TSelection,
	TNullability extends Record<string, JoinNullability>,
> = TSelection extends never ? any : Simplify<
	{
		[Key in keyof TSelection]: TSelection[Key] extends SQL
			? DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
			: TSelection[Key] extends SQL.Aliased ? TSelection[Key]
			: TSelection[Key] extends AnySQLiteColumn
				? ApplyNullabilityToColumn<TSelection[Key], TNullability[GetColumnConfig<TSelection[Key], 'tableName'>]>
			: TSelection[Key] extends Record<string, AnySQLiteColumn | SQL | SQL.Aliased>
				? BuildSubquerySelection<TSelection[Key], TNullability>
			: never;
	}
>;

export type AppendToResult<
	TTableName extends string | undefined,
	TResult,
	TJoinedName extends string | undefined,
	TSelectedFields extends SelectFields,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single' ? 
			& (TTableName extends string ? Record<TTableName, TResult> : TResult)
			& (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields)
	: TResult & (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields);

type SetJoinsNullability<TNullabilityMap extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TNullabilityMap]: TValue;
};

export type AppendToNullabilityMap<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string | undefined,
	TJoinType extends JoinType,
> = TJoinedName extends string ? 'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
	: 'right' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
	: 'inner' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'nullable' }
	: never
	: TJoinsNotNull;

export interface SQLiteSelectConfig {
	withList: Subquery[];
	fields: SelectFields;
	fieldsList: SelectFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnySQLiteTable | Subquery | SQLiteViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: JoinsValue[];
	orderBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
	groupBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
}

export type JoinFn<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends AnySQLiteTable | Subquery | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) => SQLiteSelectKind<
	THKT,
	TTableName,
	TResultType,
	TRunResult,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends AnySQLiteTable ? GetTableConfig<TJoinedTable, 'columns'>
			: TJoinedName extends Subquery ? Assume<GetSubquerySelection<TJoinedName>, SelectFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type GetSelectTableName<TTable extends AnySQLiteTable | Subquery | SQLiteViewBase | SQL> = TTable extends
	AnySQLiteTable ? GetTableConfig<TTable, 'name'>
	: TTable extends Subquery<infer TAlias> ? TAlias
	: TTable extends SQLiteViewBase<infer TAlias> ? TAlias
	: TTable extends SQL ? undefined
	: never;

export type GetSelectTableSelection<TTable extends AnySQLiteTable | Subquery | SQLiteViewBase | SQL> = TTable extends
	AnySQLiteTable ? GetTableConfig<TTable, 'columns'>
	: TTable extends Subquery<string, infer TSelection> ? TSelection
	: TTable extends SQLiteViewWithSelection<any, any, infer TSelection> ? TSelection
	: TTable extends SQL ? {}
	: never;

export type SelectFieldsFlat = SelectFieldsFlatBase<AnySQLiteColumn>;

export type SelectFields = SelectFieldsBase<AnySQLiteColumn, AnySQLiteTable>;

export type SelectFieldsOrdered = SelectFieldsOrderedBase<AnySQLiteColumn>;

export type SelectResultField<T> = T extends DrizzleTypeError<any> ? T
	: T extends AnySQLiteTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnySQLiteColumn ? GetColumnData<T>
	: T extends SQL<infer T> | SQL.Aliased<infer T> ? T
	: T extends Record<string, any> ? SelectResultFields<T>
	: never;

export type SelectResultFields<TSelectedFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;

export interface SQLiteSelectHKTBase {
	tableName: string | undefined;
	resultType: 'sync' | 'async';
	runResult: unknown;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	$type: unknown;
}

export type SQLiteSelectKind<
	T extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = (T & {
	tableName: TTableName;
	resultType: TResultType;
	runResult: TRunResult;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
})['$type'];

export interface SQLiteSelectQueryBuilderHKT extends SQLiteSelectHKTBase {
	$type: SQLiteSelectQueryBuilder<
		this,
		this['tableName'],
		this['resultType'],
		this['runResult'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface SQLiteSelectHKT extends SQLiteSelectHKTBase {
	$type: SQLiteSelect<
		this['tableName'],
		this['resultType'],
		this['runResult'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
