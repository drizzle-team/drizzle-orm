import type { AnyColumn, Column } from './column.ts';
import type { GeneratedColumnConfig } from './index.ts';
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
> = TKey extends RequiredKeyOnly<TKey, T> ? never
	: T extends {
		_: {
			generated: infer G;
		};
	} ? G extends GeneratedColumnConfig<any> ? G['type'] extends 'always' ? never : TKey
		: TKey
	: never;

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
