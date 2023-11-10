import type { BuiltInFunction } from './built-in-function.ts';
import type { AnyColumn, Column } from './column.ts';
import type { SQL } from './sql/sql.ts';
import type { Table } from './table.ts';

export type RequiredKeyOnly<TKey extends string, T extends Column> = T extends AnyColumn<{
	notNull: true;
	hasDefault: false;
}> ? TKey
	: never;

export type OptionalKeyOnly<
	TKey extends string,
	T extends Column,
> = TKey extends RequiredKeyOnly<TKey, T> ? never : TKey;

export type SelectedFieldsFlat<TColumn extends Column, TBuiltInFunction extends BuiltInFunction> = Record<
	string,
	TColumn | TBuiltInFunction | SQL | SQL.Aliased
>;

export type SelectedFieldsFlatFull<TColumn extends Column, TBuiltInFunction extends BuiltInFunction> = Record<
	string,
	TColumn | TBuiltInFunction | SQL | SQL.Aliased
>;

export type SelectedFields<TColumn extends Column, TTable extends Table, TBuiltInFunction extends BuiltInFunction> = Record<
	string,
	SelectedFieldsFlat<TColumn, TBuiltInFunction>[string] | TTable | SelectedFieldsFlat<TColumn, TBuiltInFunction>
>;

export type SelectedFieldsOrdered<TColumn extends Column, TBuiltInFunction extends BuiltInFunction> = {
	path: string[];
	field: TColumn | TBuiltInFunction | SQL | SQL.Aliased;
}[];
