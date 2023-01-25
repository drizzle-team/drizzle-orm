import { GetColumnConfig } from '~/column';
import { Placeholder, SQL, SQLResponse } from '~/sql';
import { Simplify } from '~/utils';

import { AnyMySqlColumn } from '~/mysql-core/columns';
import { ChangeColumnTableName } from '~/mysql-core/columns/common';
import { SelectFields, SelectFieldsOrdered, SelectResultField, SelectResultFields } from '~/mysql-core/operations';
import {
	AnyMySqlTable,
	GetTableConfig,
	MySqlTableWithColumns,
	TableConfig,
	UpdateTableConfig,
} from '~/mysql-core/table';

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

export type ApplyNotNullMapToJoins<TResult, TJoinsNotNullable extends Record<string, JoinNullability>> =
	TJoinsNotNullable extends TJoinsNotNullable ? {
			[TTableName in keyof TResult & keyof TJoinsNotNullable & string]: ApplyNullability<
				TResult[TTableName],
				TJoinsNotNullable[TTableName]
			>;
		}
		: never;

export type SelectResult<
	TResult,
	TSelectMode extends SelectMode,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TSelectMode extends 'partial' ? SelectPartialResult<TResult, TJoinsNotNullable>
	: TSelectMode extends 'single' ? TResult
	: RemoveDuplicates<Simplify<ApplyNotNullMapToJoins<TResult, TJoinsNotNullable>>>;

type GetNullableKeys<T extends Record<string, JoinNullability>> = {
	[Key in keyof T]: T[Key] extends 'nullable' ? Key : never;
}[keyof T];

// Splits a single variant with 'nullable' into two variants with 'null' and 'not-null'
type SplitNullability<T extends Record<string, JoinNullability>> = RemoveDuplicates<
	'nullable' extends T[keyof T]
		? T extends T ? GetNullableKeys<T> extends infer TKey extends string ? [TKey] extends [TKey] ? TKey extends TKey ? 
							| Simplify<SplitNullability<Omit<T, TKey>> & { [Key in TKey]: 'not-null' }>
							| Simplify<SplitNullability<Omit<T, TKey>> & { [Key in TKey]: 'null' }>
					: never
				: never
			: T
		: never
		: T
>;

type SelectPartialResult<
	TFields,
	TNullability extends Record<string, JoinNullability>,
> = SplitNullability<TNullability> extends infer TNullability extends Record<string, JoinNullability>
	? TNullability extends TNullability ? {
			[Key in keyof TFields as Key extends string ? Key : never]: TFields[Key] extends infer TField
				? TField extends AnyMySqlTable ? SelectPartialResult<GetTableConfig<TField, 'columns'>, TNullability>
				: TField extends AnyMySqlColumn
					? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
						? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
					: never
				: TField extends SQL | SQLResponse ? SelectResultField<TField>
				: TField extends Record<string, any> ? SelectPartialResult<TField, TNullability>
				: SelectResultField<TField>
				: never;
		}
	: never
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

type SetJoinsNotNull<TJoinsNotNull extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TJoinsNotNull]: TValue;
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
> = Simplify<
	'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
		: 'right' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
		: 'inner' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, 'not-null'> & { [name in TJoinedName]: 'not-null' }
		: 'full' extends TJoinType ? 
				| (TJoinsNotNull & { [name in TJoinedName]: 'not-null' })
				| (TJoinsNotNull & { [name in TJoinedName]: 'null' })
				| (SetJoinsNotNull<TJoinsNotNull, 'null'> & { [name in TJoinedName]: 'not-null' })
		: never
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
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;
