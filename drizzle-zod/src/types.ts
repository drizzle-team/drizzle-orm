import type { z } from 'zod';
import type { Assume, Column, Equal, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type { literalSchema } from './column';
import { PgEnum } from 'drizzle-orm/pg-core';

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

type ColumnIsGeneratedAlwaysAs<TColumn extends Column> =
  TColumn['_']['generated'] extends infer TGenerated extends { type: string }
    ? TGenerated['type'] extends 'always'
      ? true
      : false
    : false;

type RemoveNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

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

type HandleRefinement<
  TRefinement extends z.ZodTypeAny | ((schema: z.ZodTypeAny) => z.ZodTypeAny),
  TColumn extends Column
> = TRefinement extends (schema: z.ZodTypeAny) => z.ZodTypeAny
  ? TColumn['_']['notNull'] extends true
    ? ReturnType<TRefinement>
    : z.ZodNullable<ReturnType<TRefinement>>
  : TRefinement;

type HandleColumn<
  TType extends 'select' | 'insert' | 'update',
  TColumn extends Column
> = GetZodType<
    TColumn['_']['data'],
    TColumn['_']['dataType'],
    TColumn['_'] extends { enumValues: [string, ...string[]] } ? TColumn['_']['enumValues'] : undefined
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

export type BuildSchema<
  TType extends 'select' | 'insert' | 'update',
  TColumns extends Record<string, any>,
  TRefinements extends Record<string, any> | undefined
> = z.ZodObject<
  Simplify<RemoveNever<{
    [K in keyof TColumns]:
      TColumns[K] extends infer TColumn extends Column
        ? TRefinements extends object
          ? TRefinements[Assume<K, keyof TRefinements>] extends infer TRefinement extends z.ZodTypeAny | ((schema: z.ZodTypeAny) => z.ZodTypeAny)
            ? HandleRefinement<TRefinement, TColumn>
            : HandleColumn<TType, TColumn>
          : HandleColumn<TType, TColumn>
        : TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column>
          ? BuildSchema<
              TType,
              TObject,
              TRefinements extends object
                ? TRefinements[Assume<K, keyof TRefinements>] extends infer TNestedRefinements extends object
                  ? TNestedRefinements
                  : undefined
                : undefined
            >
          : z.ZodAny
  }>>,
  'strip'
>;

export interface CreateSelectSchema {
  <TView extends View>(view: TView): BuildSchema<'select', TView['_']['selectedFields'], undefined>;
  <
    TView extends View,
    TRefine extends BuildRefine<TView['_']['selectedFields']>
  >(
    view: TView,
    refine: TRefine
  ): BuildSchema<'select', TView['_']['selectedFields'], TRefine>;

  <TTable extends Table>(table: TTable): BuildSchema<'select', TTable['_']['columns'], undefined>;
  <
    TTable extends Table,
    TRefine extends BuildRefine<TTable['_']['columns']>
  >(
    table: TTable,
    refine?: TRefine
  ): BuildSchema<'select', TTable['_']['columns'], TRefine>;

  <TEnum extends PgEnum<any>>(enum_: TEnum): z.ZodEnum<TEnum['enumValues']>;
}

export interface CreateInsertSchema {
  <TTable extends Table>(table: TTable): BuildSchema<'insert', TTable['_']['columns'], undefined>;
  <
    TTable extends Table,
    TRefine extends BuildRefine<TTable['_']['columns']>
  >(
    table: TTable,
    refine?: TRefine
  ): BuildSchema<'insert', TTable['_']['columns'], TRefine>;
}

export interface CreateSchemaFactoryOptions {
  zodInstance?: any;
}
