import type { Column } from '~/column.ts';
import type { SelectedFieldsFlat } from '~/operations.ts';
import type { PgEnum } from '~/pg-core/columns/enum.ts';
import type { View } from '~/sql/sql.ts';
import type { Table } from '~/table.ts';

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
