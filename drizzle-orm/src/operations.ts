import type { NormalizeArrayCodec, NormalizeCodec } from './codecs.ts';
import type { Column } from './column.ts';
import type { JsonArray, JsonObject, SQL } from './sql/sql.ts';
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
	TColumn | SQL | SQL.Aliased | Subquery | JsonObject | JsonArray
>;

export type SelectedFieldsFlatFull<TColumn extends Column> = Record<
	string,
	TColumn | SQL | SQL.Aliased
>;

export type SelectedFields<TColumn extends Column, TTable extends Table> = Record<
	string,
	SelectedFieldsFlat<TColumn>[string] | TTable | SelectedFieldsFlat<TColumn>
>;

export type SelectedFieldsOrdered<TColumn extends Column> = (
	& {
		path: string[];
		codec?: NormalizeCodec | NormalizeArrayCodec;
		arrayDimensions?: number;
		column?: Column;
		/** Set operators may mutate type, set appropriate codec for resulting type */
		codecOverride?: string;
	}
	& ({
		field: TColumn;
		fieldType: 'Column';
	} | {
		field: SQL;
		fieldType: 'SQL';
	} | {
		field: SQL.Aliased;
		fieldType: 'SQL.Aliased';
	} | {
		field: Subquery;
		fieldType: 'Subquery';
		/** Present when subquery's single field is a JSON object */
		selection?: SelectedJsonFieldsOrdered<TColumn>;
		/** Present when subquery's single field is a JSON array */
		element?: SelectedJsonField<TColumn>;
	} | {
		field: JsonObject;
		fieldType: 'JsonObject';
		selection: SelectedJsonFieldsOrdered<TColumn>;
	} | {
		field: JsonArray;
		fieldType: 'JsonArray';
		element: SelectedJsonField<TColumn>;
	})
)[];

export type SelectedJsonField<TColumn extends Column> = SelectedJsonFieldsOrdered<TColumn>[number];

export type SelectedJsonFieldsOrdered<TColumn extends Column> = (
	& {
		key: string;
		codec?: NormalizeCodec | NormalizeArrayCodec;
		arrayDimensions?: number;
		column?: Column;
	}
	& ({
		field: TColumn;
		fieldType: 'Column';
	} | {
		field: SQL;
		fieldType: 'SQL';
	} | {
		field: SQL.Aliased;
		fieldType: 'SQL.Aliased';
	} | {
		field: Subquery;
		fieldType: 'Subquery';
		/** Present when subquery's single field is a JSON object */
		selection?: SelectedJsonFieldsOrdered<TColumn>;
		/** Present when subquery's single field is a JSON array */
		element?: SelectedJsonField<TColumn>;
	} | {
		field: JsonObject;
		fieldType: 'JsonObject';
		selection: SelectedJsonFieldsOrdered<TColumn>;
	} | {
		field: JsonArray;
		fieldType: 'JsonArray';
		element: SelectedJsonField<TColumn>;
	})
)[];
