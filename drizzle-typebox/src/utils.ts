import type { Kind, Static, TSchema } from '@sinclair/typebox';
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

type Literal = Static<typeof literalSchema>;
export type Json = Literal | { [key: string]: any } | any[];
export interface JsonSchema extends TSchema {
	[Kind]: 'Union';
	static: Json;
	anyOf: Json;
}
export interface BufferSchema extends TSchema {
	[Kind]: 'Buffer';
	static: Buffer;
	type: 'buffer';
}
export interface BigIntStringModeSchema extends TSchema {
	[Kind]: 'BigIntStringMode';
	static: string;
	type: 'string';
}

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsEnumDefined<TEnum extends string[] | undefined> = [string, ...string[]] extends TEnum ? false
	: undefined extends TEnum ? false
	: true;

export type ColumnIsGeneratedAlwaysAs<TColumn> = TColumn extends Column
	? TColumn['_']['identity'] extends 'always' ? true
	: TColumn['_'] extends { generated: undefined } ? false
	: TColumn['_'] extends { generated: { type: 'byDefault' } } ? false
	: true
	: false;

export type GetSelection<T extends SelectedFieldsFlat<Column> | Table | View> = T extends Table ? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T;
