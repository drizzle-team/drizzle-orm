import type { Column, SelectedFieldsFlat, Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import type { z } from 'zod/v4';
import type { literalSchema } from './column.ts';

export function isWithEnum(column: Column<any>): column is typeof column & { enumValues: [string, ...string[]] } {
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}

export const isPgEnum: (entity: any) => entity is PgEnum<[string, ...string[]]> = isWithEnum as any;

type Literal = z.infer<typeof literalSchema>;
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
