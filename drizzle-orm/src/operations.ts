import { AnyColumn } from './column';
import { SQL, SQLResponse } from './sql';
import { Table } from './table';

export type RequiredKeyOnly<TKey extends string, T extends AnyColumn> = T extends
	AnyColumn<{ notNull: true; hasDefault: false }> ? TKey
	: never;

export type OptionalKeyOnly<TKey extends string, T extends AnyColumn> = TKey extends RequiredKeyOnly<TKey, T> ? never
	: TKey;

export type SelectFields<TColumn extends AnyColumn, TTable extends Table> = {
	[Key: string]: TColumn | SQL | SQLResponse | TTable | {
		[Subkey: string]: TColumn | SQL | SQLResponse;
	};
};

export type SelectFieldsOrdered<TColumn extends AnyColumn> = {
	path: string[];
	field: TColumn | SQL | SQLResponse;
}[];
