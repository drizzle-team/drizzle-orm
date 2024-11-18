import type { z } from 'zod';
import type { Assume, Column } from 'drizzle-orm';
import type { EnumHasAtLeastOneValue, ColumnIsGeneratedAlwaysAs, Json } from './utils';

export type GetEnumValuesFromColumn<TColumn extends Column> = TColumn['_'] extends { enumValues: [string, ...string[]] } ? TColumn['_']['enumValues'] : undefined

export type GetZodType<
  TData,
  TDataType extends string,
  TEnumValues extends [string, ...string[]] | undefined,
> = EnumHasAtLeastOneValue<TEnumValues> extends true
  ? z.ZodEnum<Assume<TEnumValues, [string, ...string[]]>>
  : TData extends infer TTuple extends [any, ...any[]]
  ? z.ZodTuple<Assume<{ [K in keyof TTuple]: GetZodType<TTuple[K], string, undefined> }, [any, ...any[]]>>
  : TData extends Date
  ? z.ZodDate
  : TData extends Buffer
  ? z.ZodType<Buffer>
  : TDataType extends 'array'
  ? z.ZodArray<GetZodType<Assume<TData, any[]>[number], string, undefined>>
  : TData extends infer TDict extends Record<string, any>
  ? z.ZodObject<{ [K in keyof TDict]: GetZodType<TDict[K], string, undefined> }, 'strip'>
  : TDataType extends 'json'
  ? z.ZodType<Json>
  : TData extends number
  ? z.ZodNumber
  : TData extends bigint
  ? z.ZodBigInt
  : TData extends boolean
  ? z.ZodBoolean
  : TData extends string
  ? z.ZodString
  : z.ZodTypeAny;

type HandleSelectColumn<
  TSchema extends z.ZodTypeAny,
  TColumn extends Column
> = TColumn['_']['notNull'] extends true
  ? TSchema
  : z.ZodNullable<TSchema>;

type HandleInsertColumn<
  TSchema extends z.ZodTypeAny,
  TColumn extends Column
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true
  ? never
  : TColumn['_']['notNull'] extends true
    ? TColumn['_']['hasDefault'] extends true
      ? z.ZodOptional<TSchema>
      : TSchema
    : z.ZodOptional<z.ZodNullable<TSchema>>;

type HandleUpdateColumn<
  TSchema extends z.ZodTypeAny,
  TColumn extends Column
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true
  ? never
  : TColumn['_']['notNull'] extends true
    ? z.ZodOptional<TSchema>
    : z.ZodOptional<z.ZodNullable<TSchema>>;

export type HandleColumn<
  TType extends 'select' | 'insert' | 'update',
  TColumn extends Column
> = GetZodType<
    TColumn['_']['data'],
    TColumn['_']['dataType'],
    GetEnumValuesFromColumn<TColumn>
  > extends infer TSchema extends z.ZodTypeAny
  ? TSchema extends z.ZodAny
    ? z.ZodAny
    : TType extends 'select'
    ? HandleSelectColumn<TSchema, TColumn>
    : TType extends 'insert'
    ? HandleInsertColumn<TSchema, TColumn>
    : TType extends 'update'
    ? HandleUpdateColumn<TSchema, TColumn>
    : TSchema
  : z.ZodAny