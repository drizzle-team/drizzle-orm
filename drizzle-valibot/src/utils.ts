import { is } from 'drizzle-orm';
import type { Column, DrizzleEntityClass, SelectedFieldsFlat, Table, View } from 'drizzle-orm';
import type * as v from 'valibot';
import type { literalSchema } from './column';

export function isAny<T extends DrizzleEntityClass<any>[]>(value: unknown, type: T): value is InstanceType<T[number]> {
	for (let i = 0; i < type.length; i++) {
		if (is(value, type[i]!)) {
			return true;
		}
	}
	return false;
}

export function isWithEnum(column: Column): column is typeof column & { enumValues: [string, ...string[]] } {
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}

type Literal = v.InferOutput<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];

export type IsNever<T> = [T] extends [never] ? true : false;

export type ArrayHasAtLeastOneValue<TEnum extends [any, ...any[]] | undefined> = TEnum extends [infer TString, ...any[]]
	? TString extends `${infer TLiteral}` ? TLiteral extends any ? true
		: false
	: false
	: false;

export type ColumnIsGeneratedAlwaysAs<TColumn extends Column> = TColumn['_']['generated'] extends undefined
	? false
		: TColumn['_']['generated'] extends infer TGenerated extends { type: string } ? TGenerated['type'] extends 'byDefault' ? false
		: true
		: true;

export type RemoveNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type RemoveNeverElements<T extends any[]> = T extends [infer First, ...infer Rest]
  ? IsNever<First> extends true
    ? RemoveNeverElements<Rest>
    : [First, ...RemoveNeverElements<Rest>]
  : [];

export type GetSelection<T extends SelectedFieldsFlat<Column> | Table | View> = T extends Table ? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T;
