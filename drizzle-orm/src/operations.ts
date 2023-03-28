import type { AnyColumn } from './column';
import type { SQL } from './sql';
import type { Table } from './table';

export type RequiredKeyOnly<TKey extends string, T extends AnyColumn> = T extends AnyColumn<{
	notNull: true;
	hasDefault: false;
}> ? TKey
	: never;

export type OptionalKeyOnly<
	TKey extends string,
	T extends AnyColumn,
> = TKey extends RequiredKeyOnly<TKey, T> ? never : TKey;

export type SelectedFieldsFlat<TColumn extends AnyColumn> = Record<
	string,
	TColumn | SQL | SQL.Aliased
>;

export type SelectedFields<TColumn extends AnyColumn, TTable extends Table> = Record<
	string,
	SelectedFieldsFlat<TColumn>[string] | TTable | SelectedFieldsFlat<TColumn>
>;

export type SelectedFieldsOrdered<TColumn extends AnyColumn> = {
	path: string[];
	field: TColumn | SQL | SQL.Aliased;
}[];
