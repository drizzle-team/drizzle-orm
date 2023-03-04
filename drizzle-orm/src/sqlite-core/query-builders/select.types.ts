import { GetColumnConfig, GetColumnData, UpdateColConfig } from '~/column';
import { Placeholder, SQL } from '~/sql';
import { Assume, DrizzleTypeError, Simplify } from '~/utils';

import { AnySQLiteColumn } from '~/sqlite-core/columns';
import { ChangeColumnTableName, SQLiteColumn } from '~/sqlite-core/columns/common';
import {
	AnySQLiteTable,
	GetTableConfig,
	SQLiteTableWithColumns,
	TableConfig,
	UpdateTableConfig,
} from '~/sqlite-core/table';

import {
	SelectFields as SelectFieldsBase,
	SelectFieldsFlat as SelectFieldsFlatBase,
	SelectFieldsOrdered as SelectFieldsOrderedBase,
} from '~/operations';
import { GetSubqueryAlias, GetSubquerySelection, Subquery } from '~/subquery';
import { SQLiteSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnySQLiteTable | Subquery;
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

export type ApplyNotNullMapToJoins<TResult, TNullabilityMap extends Record<string, JoinNullability>> = {
	[TTableName in keyof TResult & keyof TNullabilityMap & string]: ApplyNullability<
		TResult[TTableName],
		TNullabilityMap[TTableName]
	>;
};

export type SelectResult<
	TResult,
	TSelectMode extends SelectMode,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TSelectMode extends 'partial' ? SelectPartialResult<TResult, TJoinsNotNullable>
	: TSelectMode extends 'single' ? SelectResultFields<TResult>
	: ApplyNotNullMapToJoins<SelectResultFields<TResult>, TJoinsNotNullable>;

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

export type MapColumnsToTableAlias<TColumns extends Record<string, AnySQLiteColumn>, TAlias extends string> = {
	[Key in keyof TColumns]: ChangeColumnTableName<TColumns[Key], TAlias>;
};

export type BuildSubquerySelection<
	TSelection,
	TAlias extends string,
	TNullability extends Record<string, JoinNullability>,
> = {
	[Key in keyof TSelection]: TSelection[Key] extends SQL
		? DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
		: TSelection[Key] extends SQL.Aliased ? TSelection[Key]
		: TSelection[Key] extends AnySQLiteColumn ? ChangeColumnTableName<
				ApplyNullabilityToColumn<TSelection[Key], TNullability[GetColumnConfig<TSelection[Key], 'tableName'>]>,
				TAlias
			>
		: TSelection[Key] extends Record<string, any>
			? Simplify<BuildSubquerySelection<TSelection[Key], TAlias, TNullability>>
		: never;
};

export type AppendToResult<
	TTableName extends string,
	TResult,
	TJoinedName extends string,
	TSelectedFields extends SelectFields,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single' ? Record<TTableName, TResult> & Record<TJoinedName, TSelectedFields>
	: TResult & Record<TJoinedName, TSelectedFields>;

type SetJoinsNullability<TNullabilityMap extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TNullabilityMap]: TValue;
};

export type AppendToJoinsNotNull<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string,
	TJoinType extends JoinType,
> = 'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
	: 'right' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
	: 'inner' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'nullable' }
	: never;

export interface SQLiteSelectConfig {
	withList: Subquery[];
	fields: SelectFields;
	fieldsList: SelectFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnySQLiteTable | Subquery;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
	groupBy: (AnySQLiteColumn | SQL | SQL.Aliased)[];
}

export type JoinFn<
	TTable extends AnySQLiteTable | Subquery,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TResult,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetSelectTableName<TTable>, 'not-null'>,
> = <
	TJoinedTable extends AnySQLiteTable | Subquery,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: SQL | undefined) => SQLiteSelect<
	TTable,
	TResultType,
	TRunResult,
	AppendToResult<
		GetSelectTableName<TTable>,
		TResult,
		TJoinedName,
		TJoinedTable extends AnySQLiteTable ? GetTableConfig<TJoinedTable, 'columns'>
			: TJoinedName extends Subquery ? Assume<GetSubquerySelection<TJoinedName>, SelectFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;

export type GetSelectTableName<TTable extends AnySQLiteTable | Subquery> = TTable extends AnySQLiteTable
	? GetTableConfig<TTable, 'name'>
	: TTable extends Subquery ? GetSubqueryAlias<TTable>
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
