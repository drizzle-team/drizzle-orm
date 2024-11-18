import { is } from 'drizzle-orm';
import type { Column, DrizzleEntityClass, SelectedFieldsFlat, Table, View } from 'drizzle-orm';
import type { z } from 'zod';
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

type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];

export type EnumHasAtLeastOneValue<TEnum extends [string, ...string[]] | undefined> =
  TEnum extends [infer TString, ...string[]]
    ? TString extends `${infer TLiteral}`
      ? TLiteral extends string
        ? true
        : false
      : false
  : false;

export type ColumnIsGeneratedAlwaysAs<TColumn extends Column> =
  TColumn['_']['generated'] extends infer TGenerated extends { type: string }
    ? TGenerated['type'] extends 'always'
      ? true
      : false
    : false;

export type RemoveNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type GetSelection<T extends SelectedFieldsFlat<Column> | Table | View> = T extends Table
  ? T['_']['columns']
  : T extends View
  ? T['_']['selectedFields']
  : T;
