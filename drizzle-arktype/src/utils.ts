import type { type } from 'arktype';
import type { Column, SelectedFieldsFlat, Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import type { literalSchema } from './column.ts';

export function isColumnType<T extends Column>(column: Column, columnTypes: string[]): column is T {
	return columnTypes.includes(column.columnType);
}

export function isWithEnum(column: Column): column is typeof column & { enumValues: [string, ...string[]] } {
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}

export const isPgEnum: (entity: any) => entity is PgEnum<[string, ...string[]]> = isWithEnum as any;

type Literal = type.infer<typeof literalSchema>;
export type Json = Literal | Record<string, any> | any[];

export type ColumnIsGeneratedAlwaysAs<TColumn> = TColumn extends Column
	? TColumn['_']['identity'] extends 'always' ? true
	: TColumn['_']['generated'] extends { type: 'byDefault' } | undefined ? false
	: true
	: false;

export type GetSelection<T extends SelectedFieldsFlat<Column> | Table | View> = T extends Table ? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T;
