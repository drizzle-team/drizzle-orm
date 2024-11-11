import { z } from 'zod';
import type { Assume, Column, Equal, SelectedFieldsFlat, Simplify } from 'drizzle-orm';
import type { literalSchema } from './column';

type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];

type EnumHasAtLeastOneValue<TEnum extends [string, ...string[]] | undefined> =
  TEnum extends [infer TString, ...string[]]
    ? TString extends `${infer TLiteral}`
      ? TLiteral extends string
        ? true
        : false
      : false
  : false;

export type GetZodType<
  TData,
  TDataType extends string,
  TEnumValues extends [string, ...string[]] | undefined,
> = EnumHasAtLeastOneValue<TEnumValues> extends true
  ? z.ZodEnum<Assume<TEnumValues, [string, ...string[]]>>
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

export type BuildRefineColumns<
  TColumns extends Record<string, any>
> = Simplify<{
  [K in keyof TColumns]:
    TColumns[K] extends infer TColumn extends Column
      ? GetZodType<
        TColumn['_']['data'],
        TColumn['_']['dataType'],
        TColumn['_'] extends { enumValues: [string, ...string[]] } ? TColumn['_']['enumValues'] : undefined
      > extends infer TSchema extends z.ZodTypeAny
        ? TSchema
        : z.ZodAny
      : TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column>
        ? BuildRefineColumns<TObject>
        : TColumns[K]
}>;

export type BuildRefine<TColumns extends Record<string, any>> = BuildRefineColumns<TColumns> extends infer TBuildColumns
  ? {
    [K in keyof TBuildColumns]?:
      TBuildColumns[K] extends z.ZodTypeAny
        ? ((schema: TBuildColumns[K]) => z.ZodTypeAny) | z.ZodTypeAny
        : TBuildColumns[K] extends Record<string, any>
        ? Simplify<BuildRefine<TBuildColumns[K]>>
        : never
  }
  : never;

export type BuildSelectSchema<
  TColumns extends Record<string, any>,
  TRefinements extends Record<string, ((schema: z.ZodTypeAny) => z.ZodTypeAny | z.ZodTypeAny)> | undefined
> = z.ZodObject<
  Simplify<{
    [K in keyof TColumns]:
      TColumns[K] extends infer TColumn extends Column
        ? TRefinements[Assume<K, keyof TRefinements>] extends infer TRefinement extends z.ZodTypeAny | ((schema: z.ZodTypeAny) => z.ZodTypeAny)
          ? TRefinement extends (schema: z.ZodTypeAny) => z.ZodTypeAny
            ? TColumn['_']['notNull'] extends true ? ReturnType<TRefinement> : z.ZodNullable<ReturnType<TRefinement>>
            : TRefinement
          : GetZodType<
            TColumn['_']['data'],
            TColumn['_']['dataType'],
            TColumn['_'] extends { enumValues: [string, ...string[]] } ? TColumn['_']['enumValues'] : undefined
          > extends infer TSchema extends z.ZodTypeAny
            ? TColumn['_']['notNull'] extends true
                ? TSchema
                : z.ZodNullable<TSchema>
              : z.ZodAny
        : TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column>
          ? BuildSelectSchema<TObject, Assume<TRefinements[Assume<K, keyof TRefinements>], Record<string, any>>>
          : z.ZodAny
  }>,
  'strip'
>;
