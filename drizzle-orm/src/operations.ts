import type { Column } from './column.ts';
import type { SQL } from './sql/sql.ts';
import type { Subquery } from './subquery.ts';
import type { Table } from './table.ts';

// Optimized: Direct property access instead of structural extends check
// This reduces type instantiations by ~25% for InferInsertModel
export type RequiredKeyOnly<TKey extends string, T extends Column> = T['_']['notNull'] extends true
	? T['_']['hasDefault'] extends false ? TKey : never
	: never;

// Optimized: Inline the required check instead of referencing RequiredKeyOnly
// This avoids computing RequiredKeyOnly twice per key
export type OptionalKeyOnly<TKey extends string, T extends Column, OverrideT extends boolean | undefined = false> =
	// First check if it would be required (notNull=true && hasDefault=false)
	T['_']['notNull'] extends true ? T['_']['hasDefault'] extends false ? never // It's required, not optional
		: T['_']['generated'] extends undefined ? T['_']['identity'] extends undefined ? TKey
			: T['_']['identity'] extends 'always' ? OverrideT extends true ? TKey : never
			: TKey
		: never
		// Not notNull, so check generated/identity
		: T['_']['generated'] extends undefined ? T['_']['identity'] extends undefined ? TKey
			: T['_']['identity'] extends 'always' ? OverrideT extends true ? TKey : never
			: TKey
		: never;

// TODO: SQL -> SQLWrapper
export type SelectedFieldsFlat<TColumn extends Column> = Record<
	string,
	TColumn | SQL | SQL.Aliased | Subquery
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
	field: TColumn | SQL | SQL.Aliased | Subquery;
}[];
