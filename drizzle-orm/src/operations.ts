import { AnyColumn } from './column';
import { SQL } from './sql';
import { SelectionProxyHandler } from './subquery';
import { Table } from './table';
import { Simplify } from './utils';

export type RequiredKeyOnly<TKey extends string, T extends AnyColumn> = T extends AnyColumn<{
	notNull: true;
	hasDefault: false;
}> ? TKey
	: never;

export type OptionalKeyOnly<
	TKey extends string,
	T extends AnyColumn,
> = TKey extends RequiredKeyOnly<TKey, T> ? never : TKey;

export type SelectFieldsFlat<TColumn extends AnyColumn> = Record<
	string,
	TColumn | SQL | SQL.Aliased
>;

export type SelectFields<TColumn extends AnyColumn, TTable extends Table> = Record<
	string,
	SelectFieldsFlat<TColumn>[string] | TTable | SelectFieldsFlat<TColumn>
>;

export type SelectFieldsOrdered<TColumn extends AnyColumn> = {
	path: string[];
	field: TColumn | SQL | SQL.Aliased;
}[];

// export function normalizeSQLCallback<TReturn, TTable extends Table, TColumn extends AnyColumn, TSelection>(
// 	builder: (fields: TSelection) => TReturn,
// 	fields: SelectFields<TColumn, TTable>,
// ): TReturn {
// 	const aliases = new Proxy(fields, new SelectionProxyHandler()) as TSelection;
// 	return builder(aliases);
// }
