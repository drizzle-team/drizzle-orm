import { z } from 'zod';
import type { Column, Equal, Simplify, Table, View } from 'drizzle-orm';
import type { literalSchema } from './column';

type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];

export type GetZodType<
  TData,
  TDataType extends string,
  TEnumValues extends [string, ...string[]] | undefined,
> = TEnumValues extends [string, ...string[]]
  ? z.ZodEnum<TEnumValues>
  : TData extends infer TTuple extends [any, ...any[]]
  ? z.ZodTuple<{ [K in keyof TTuple]: GetZodType<TTuple[K], never, never> }>
  : TData extends infer TDict extends Record<string, any>
  ? z.ZodObject<{ [K in keyof TDict]: GetZodType<TDict[K], never, never> }>
  : TDataType extends 'json'
  ? z.ZodType<Json>
  : Equal<TData, number> extends true
  ? z.ZodNumber
  : Equal<TData, bigint> extends true
  ? z.ZodBigInt
  : Equal<TData, boolean> extends true
  ? z.ZodBoolean
  : Equal<TData, string> extends true
  ? z.ZodString
  : Equal<TData, Date> extends true
  ? z.ZodDate
  : Equal<TData, Buffer> extends true
  ? z.ZodType<Buffer>
  : z.ZodTypeAny;


export type BuildTableSelectSchema<
  TTable extends Table
> = Simplify<{
  [K in keyof TTable['_']['columns']]: TTable['_']['columns'][K] extends infer TColumn extends Column
    ? GetZodType<
        TColumn['_']['data'],
        TColumn['_']['dataType'],
        TColumn['_'] extends { enumValues: [string, ...string[]] } ? TColumn['_']['enumValues'] : undefined
      > extends infer TSchema extends z.ZodTypeAny
      ? TColumn['_']['notNull'] extends true
        ? TSchema
        : z.ZodNullable<TSchema>
      : never
    : never
}>;

export type BuildViewSelectSchema<
  TTable extends View
> = {
  [K in keyof TTable['_']['selectedFields']]: TTable['_']['selectedFields'][K] extends infer TColumn extends Column
    ? GetZodType<
        TColumn['_']['data'],
        TColumn['_']['dataType'],
        TColumn['_'] extends { enumValues: [string, ...string[]] } ? TColumn['_']['enumValues'] : never
      > extends infer TSchema extends z.ZodTypeAny
      ? TColumn['_']['notNull'] extends true
        ? TSchema
        : z.ZodNullable<TSchema>
      : never
    : never
};
