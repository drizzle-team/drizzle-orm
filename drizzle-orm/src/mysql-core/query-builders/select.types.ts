import { GetColumnConfig, GetColumnData } from '~/column';
import { Placeholder, SQL, SQLResponse } from '~/sql';
import { Equal, Simplify } from '~/utils';

import { AnyMySqlColumn } from '~/mysql-core/columns';
import { ChangeColumnTableName } from '~/mysql-core/columns/common';
import {
	AnyMySqlTable,
	GetTableConfig,
	MySqlTableWithColumns,
	TableConfig,
	UpdateTableConfig,
} from '~/mysql-core/table';
import { SelectFields as SelectFieldsBase, SelectFieldsOrdered as SelectFieldsOrderedBase } from '~/operations';

import { MySqlSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL;
	table: AnyMySqlTable;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'null' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityNested<T, TNullability extends JoinNullability> = T extends Record<string, any> ? {
		[Key in keyof T]: ApplyNullabilityNested<T[Key], TNullability>;
	}
	: ApplyNullability<T, TNullability>;

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
> = TSelectMode extends 'partial'
	? RemoveDuplicates<SelectPartialResult<TResult, TJoinsNotNullable, IsSimpleFields<TResult>>>
	: TSelectMode extends 'single' ? TResult
	: RemoveDuplicates<Simplify<ApplyNotNullMapToJoins<TResult, TJoinsNotNullable>>>;

type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true)
	: never) extends false ? false : true;

type Not<T extends boolean> = T extends true ? false : true;

type SelectPartialResult<
	TFields,
	TNullability extends Record<string, JoinNullability>,
	TIsSimpleFields extends boolean,
> = TNullability extends TNullability ? {
		[Key in keyof TFields]: TFields[Key] extends infer TField
			? TField extends AnyMySqlTable
				? TIsSimpleFields extends true ? GetTableConfig<TField, 'name'> extends keyof TNullability ? ApplyNullability<
							SelectResultFields<GetTableConfig<TField, 'columns'>>,
							TNullability[GetTableConfig<TField, 'name'>]
						>
					: never
				: SelectPartialResult<GetTableConfig<TField, 'columns'>, TNullability, TIsSimpleFields>
			: TField extends AnyMySqlColumn
				? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
				: never
			: TField extends SQL | SQLResponse ? SelectResultField<TField>
			: TField extends Record<string, any>
				? [TIsSimpleFields, TField[keyof TField]] extends
					[true, AnyMySqlColumn<{ tableName: infer TTableName extends string }>]
					? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
				: SelectPartialResult<TField, TNullability, TIsSimpleFields>
			: SelectResultField<TField>
			: never;
	}
	: never;

export type AnyMySqlSelect = MySqlSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnyMySqlTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? MySqlTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnyMySqlColumn>, TAlias extends string> = {
	[Key in keyof TColumns]: ChangeColumnTableName<TColumns[Key], TAlias>;
};

export type AppendToResult<
	TTableName extends AnyMySqlTable,
	TResult,
	TJoinedName extends string,
	TSelectedFields extends SelectFields,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single'
		? Record<GetTableConfig<TTableName, 'name'>, TResult> & Record<TJoinedName, SelectResultFields<TSelectedFields>>
	: Simplify<TResult & Record<TJoinedName, SelectResultFields<TSelectedFields>>>;

type SetJoinsNullability<TNullabilityMap extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TNullabilityMap]: TValue;
};

// https://stackoverflow.com/a/70061272/9929789
type UnionToParm<U> = U extends any ? (k: U) => void : never;
type UnionToSect<U> = UnionToParm<U> extends ((k: infer I) => void) ? I : never;
type ExtractParm<F> = F extends { (a: infer A): void } ? A : never;
type SpliceOne<Union> = Exclude<Union, ExtractOne<Union>>;
type ExtractOne<Union> = ExtractParm<UnionToSect<UnionToParm<Union>>>;
type ToTupleRec<Union, Result extends any[] = []> = SpliceOne<Union> extends never ? [ExtractOne<Union>, ...Result]
	: ToTupleRec<SpliceOne<Union>, [ExtractOne<Union>, ...Result]>;
export type RemoveDuplicates<T> = ToTupleRec<T> extends any[] ? ToTupleRec<T>[number] : never;

export type AppendToJoinsNotNull<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string,
	TJoinType extends JoinType,
	TIsSimpleFields extends boolean,
> = 'left' extends TJoinType ? TIsSimpleFields extends true ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
	: TJoinsNotNull & { [name in TJoinedName]: 'not-null' } | TJoinsNotNull & { [name in TJoinedName]: 'null' }
	: 'right' extends TJoinType
		? [TIsSimpleFields, Not<IsUnion<keyof TJoinsNotNull>>] extends [true, true]
			? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
		: 
			| TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
			| SetJoinsNullability<TJoinsNotNull, 'null'> & { [name in TJoinedName]: 'not-null' }
	: 'inner' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? 
			| (TJoinsNotNull & { [name in TJoinedName]: 'not-null' })
			| (TJoinsNotNull & { [name in TJoinedName]: 'null' })
			| (SetJoinsNullability<TJoinsNotNull, 'null'> & { [name in TJoinedName]: 'not-null' })
	: never;

// Field selection is considered "simple" if it's either a flat object of columns from the same table (select w/o joins), or nested objects, where each object only has columns from the same table.
// If we are dealing with a simple field selection, the resulting type will be much easier to understand, and you'll be able to use more joins in a single statement,
// because in that case we can just mark the whole nested object as nullable instead of creating unions, where all fields of a certain table are either null or not null.
export type IsSimpleObject<T> = T[keyof T] extends
	AnyMySqlColumn<{ tableName: infer TTableName extends string }> | SQL | SQLResponse
	? Not<IsUnion<TTableName>> extends true ? true : false
	: false;

export type IsSimpleFields<TFields> = IsSimpleObject<TFields> extends true ? true : Equal<
	true,
	{
		[Key in keyof TFields]: TFields[Key] extends AnyMySqlTable ? true
			: TFields[Key] extends
				Record<string, AnyMySqlColumn<{ tableName: infer TTableName extends string }> | SQL | SQLResponse>
				? Not<IsUnion<TTableName>>
			: false;
	}[keyof TFields]
>;

export interface MySqlSelectConfig {
	fields: SelectFieldsOrdered;
	where?: SQL | undefined;
	table: AnyMySqlTable;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: SQL[];
	groupBy: (AnyMySqlColumn | SQL)[];
}

export type JoinFn<
	TTable extends AnyMySqlTable,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TResult,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> = <
	TJoinedTable extends AnyMySqlTable,
	TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
>(table: TJoinedTable, on: SQL) => MySqlSelect<
	TTable,
	AppendToResult<TTable, TResult, TJoinedName, GetTableConfig<TJoinedTable, 'columns'>, TSelectMode>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToJoinsNotNull<
		TJoinsNotNullable,
		TJoinedName,
		TJoinType,
		TSelectMode extends 'partial' ? IsSimpleFields<TResult> : true
	>
>;

export type SelectFields = SelectFieldsBase<AnyMySqlColumn, AnyMySqlTable>;

export type SelectFieldsOrdered = SelectFieldsOrderedBase<AnyMySqlColumn>;

export type SelectResultField<T> = T extends AnyMySqlTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnyMySqlColumn ? GetColumnData<T>
	: T extends SQLResponse<infer TDriverParam> ? TDriverParam
	: T extends SQL ? unknown
	: T extends Record<string, any> ? { [Key in keyof T]: SelectResultField<T[Key]> }
	: never;

export type SelectResultFields<TSelectedFields extends SelectFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;
