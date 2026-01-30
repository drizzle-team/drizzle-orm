import type { Column } from '~/column.ts';
import type { SelectedFieldsFlat } from '~/operations.ts';
import type { PgEnum } from '~/pg-core/columns/enum.ts';
import type { View } from '~/sql/sql.ts';
import type { Table } from '~/table.ts';
import type { IsNever } from '~/utils';

export function isWithEnum(column: Column<any>): column is typeof column & { enumValues: [string, ...string[]] } {
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}

export const isPgEnum: (entity: any) => entity is PgEnum<[string, ...string[]]> = isWithEnum as any;

type Literal = string | number | boolean | null;
export type Json = Literal | { [key: string]: any } | any[];

export type ColumnIsGeneratedAlwaysAs<TColumn> = TColumn extends Column<any>
	? TColumn['_']['identity'] extends 'always' ? true
	: TColumn['_'] extends { generated: undefined } ? false
	: TColumn['_']['generated'] extends { type: 'byDefault' } ? false
	: true
	: false;

export type GetSelection<T extends SelectedFieldsFlat<Column<any>> | Table<any> | View> = T extends Table<any>
	? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T;

export type RemoveNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type RemoveNeverElements<T extends any[]> = T extends [infer First, ...infer Rest]
	? IsNever<First> extends true ? RemoveNeverElements<Rest>
	: [First, ...RemoveNeverElements<Rest>]
	: [];

export type HasBaseColumn<TColumn> = TColumn extends { _: { baseColumn: Column | undefined } }
	? IsNever<TColumn['_']['baseColumn']> extends false ? true
	: false
	: false;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export type EnumValuesToReadonlyEnum<TEnumValues extends [string, ...string[]]> = {
	readonly [K in TEnumValues[number]]: K;
};
