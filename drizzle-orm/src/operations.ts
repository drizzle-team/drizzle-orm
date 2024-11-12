import type { AnyColumn, Column } from './column.ts';
import type { SQL } from './sql/sql.ts';
import type { Table } from './table.ts';

export type RequiredKeyOnly<TKey extends string, T extends Column> = T extends AnyColumn<{
	notNull: true;
	hasDefault: false;
}> ? TKey
	: never;

export type NotGenerated<TKey extends string, T extends Column> = T extends AnyColumn<{
	generated: undefined;
}> ? TKey
	: never;

export type OptionalKeyOnly<
	TKey extends string,
	T extends Column,
	OverrideT extends boolean | undefined = false
> = TKey extends RequiredKeyOnly<TKey, T> ? never
	: TKey extends NotGenerated<TKey, T> ? TKey
	: T['_']['generated'] extends object ? T['_']['generated']['type'] extends 'byDefault' ? TKey 
	:
	(
		T['_']['identity'] extends 'always'?
		OverrideT extends true? TKey: never
		: never
	)
	: never;

// byDefault -> accept
// always -> accept only if overide and always
// TODO: SQL -> SQLWrapper
export type SelectedFieldsFlat<TColumn extends Column> = Record<
	string,
	TColumn | SQL | SQL.Aliased
>;

export type SelectedFieldsFlatFull<TColumn extends Column> = Record<
	string,
	TColumn | SQL | SQL.Aliased
>;

export type SelectedFields<TColumn extends Column, TTable extends Table> = Record<
	string,
	SelectedFieldsFlat<TColumn>[string] | TTable | SelectedFieldsFlat<TColumn>
>;

export type SelectedFieldsOrdered<TColumn extends Column> = {
	path: string[];
	field: TColumn | SQL | SQL.Aliased;
}[];
