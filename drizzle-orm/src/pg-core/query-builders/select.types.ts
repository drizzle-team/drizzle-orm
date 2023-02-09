import { GetColumnConfig, GetColumnData, UpdateColConfig } from '~/column';
import { Placeholder, SQL, SQLResponse } from '~/sql';
import { Assume, Simplify } from '~/utils';

import { SelectFields as SelectFieldsBase, SelectFieldsOrdered as SelectFieldsOrderedBase } from '~/operations';
import { AnyPgColumn } from '~/pg-core/columns';
import { ChangeColumnTableName, PgColumn } from '~/pg-core/columns/common';
import { AnyPgTable, GetTableConfig, PgTableWithColumns, TableConfig, UpdateTableConfig } from '~/pg-core/table';

import { GetSubqueryAlias, GetSubquerySelection, Subquery } from '~/subquery';
import { PgSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnyPgTable | Subquery;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityToColumn<TColumn extends AnyPgColumn, TNullability extends JoinNullability> =
	TNullability extends 'not-null' ? TColumn
		: TColumn extends PgColumn<infer TConfig> ? PgColumn<
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
	: TSelectMode extends 'single' ? Simplify<SelectResultFields<TResult>>
	: Simplify<ApplyNotNullMapToJoins<SelectResultFields<TResult>, TJoinsNotNullable>>;

type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true)
	: never) extends false ? false : true;

type Not<T extends boolean> = T extends true ? false : true;

type SelectPartialResult<TFields, TNullability extends Record<string, JoinNullability>> = TNullability extends
	TNullability ? {
		[Key in keyof TFields]: TFields[Key] extends infer TField
			? TField extends AnyPgTable ? GetTableConfig<TField, 'name'> extends keyof TNullability ? ApplyNullability<
						SelectResultFields<GetTableConfig<TField, 'columns'>>,
						TNullability[GetTableConfig<TField, 'name'>]
					>
				: never
			: TField extends AnyPgColumn
				? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
				: never
			: TField extends SQL | SQLResponse ? SelectResultField<TField>
			: TField extends Record<string, any>
				? TField[keyof TField] extends AnyPgColumn<{ tableName: infer TTableName extends string }> | SQL | SQLResponse
					? Not<IsUnion<TTableName>> extends true
						? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
					: SelectPartialResult<TField, TNullability>
				: never
			: never
			: never;
	}
	: never;

export type AnyPgSelect = PgSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnyPgTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? PgTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyPgColumn>, TAlias extends string> = {
	[Key in keyof TColumns]: ChangeColumnTableName<TColumns[Key], TAlias>;
};

export type BuildSubquerySelection<
	TSelection,
	TAlias extends string,
	TNullability extends Record<string, JoinNullability>,
> = {
	[Key in keyof TSelection]: TSelection[Key] extends SQL | SQLResponse ? TSelection[Key]
		: TSelection[Key] extends AnyPgColumn ? ChangeColumnTableName<
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

export interface PgSelectConfig {
	fields: SelectFields;
	fieldsList: SelectFieldsOrdered;
	where?: SQL | undefined;
	table: AnyPgTable | Subquery;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: (AnyPgColumn | SQL)[];
	groupBy: (AnyPgColumn | SQL)[];
}

export type JoinFn<
	TTable extends AnyPgTable | Subquery,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TResult,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetSelectTableName<TTable>, 'not-null'>,
> = <
	TJoinedTable extends AnyPgTable | Subquery,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: SQL | undefined) => PgSelect<
	TTable,
	AppendToResult<
		GetSelectTableName<TTable>,
		TResult,
		TJoinedName,
		TJoinedTable extends AnyPgTable ? GetTableConfig<TJoinedTable, 'columns'>
			: TJoinedName extends Subquery ? Assume<GetSubquerySelection<TJoinedName>, SelectFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;

export type GetSelectTableName<TTable extends AnyPgTable | Subquery> = TTable extends AnyPgTable
	? GetTableConfig<TTable, 'name'>
	: TTable extends Subquery ? GetSubqueryAlias<TTable>
	: never;

export type SelectFields = SelectFieldsBase<AnyPgColumn, AnyPgTable>;

export type SelectFieldsOrdered = SelectFieldsOrderedBase<AnyPgColumn>;

export type SelectResultField<T> = T extends AnyPgTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnyPgColumn ? GetColumnData<T>
	: T extends SQLResponse<infer TDriverParam> ? TDriverParam
	: T extends SQL ? unknown
	: T extends Record<string, any> ? Simplify<SelectResultFields<T>>
	: never;

export type SelectResultFields<TSelectedFields> = {
	[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
};
