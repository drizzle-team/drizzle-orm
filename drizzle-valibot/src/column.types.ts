import type { Assume, Column } from 'drizzle-orm';
import type * as v from 'valibot';
import type { ArrayHasAtLeastOneValue, ColumnIsGeneratedAlwaysAs, IsArray, IsNever, Json, UnwrapArray } from './utils';

export type GetEnumValuesFromColumn<TColumn extends Column> = TColumn['_'] extends { enumValues: [string, ...string[]] }
	? TColumn['_']['enumValues']
	: undefined;

export type GetBaseColumn<TColumn extends Column> = TColumn['_'] extends { baseColumn: Column | never | undefined }
	? IsNever<TColumn['_']['baseColumn']> extends false ? TColumn['_']['baseColumn']
	: undefined
	: undefined;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export type GetValibotType<
	TData,
	TDataType extends string,
	TEnumValues extends [string, ...string[]] | undefined,
	TBaseColumn extends Column | undefined,
> = // @ts-ignore (false-positive) - Type instantiation is excessively deep and possibly infinite.
  TBaseColumn extends Column ? v.ArraySchema<
		GetValibotType<
			UnwrapArray<TData>,
			string,
			undefined,
			IsArray<Assume<TData, any[]>[number]> extends true ? TBaseColumn : undefined
		>,
    undefined
	>
	: ArrayHasAtLeastOneValue<TEnumValues> extends true ? v.EnumSchema<EnumValuesToEnum<Assume<TEnumValues, [string, ...string[]]>>, undefined>
	: TData extends infer TTuple extends [any, ...any[]]
		? v.TupleSchema<Assume<{ [K in keyof TTuple]: GetValibotType<TTuple[K], string, undefined, undefined> }, [any, ...any[]]>, undefined>
	: TData extends Date ? v.DateSchema<undefined>
	: TData extends Buffer ? v.GenericSchema<Buffer>
	: TDataType extends 'array' ? v.ArraySchema<GetValibotType<Assume<TData, any[]>[number], string, undefined, undefined>, undefined>
	: TData extends infer TDict extends Record<string, any>
		? v.ObjectSchema<{ readonly [K in keyof TDict]: GetValibotType<TDict[K], string, undefined, undefined> }, undefined>
	: TDataType extends 'json' ? v.GenericSchema<Json>
	: TData extends number ? v.NumberSchema<undefined>
	: TData extends bigint ? v.BigintSchema<undefined>
	: TData extends boolean ? v.BooleanSchema<undefined>
	: TData extends string ? v.StringSchema<undefined>
	: v.AnySchema;

type HandleSelectColumn<
	TSchema extends v.GenericSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: v.NullableSchema<TSchema, undefined>;

type HandleInsertColumn<
	TSchema extends v.GenericSchema,
	TColumn extends Column,
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true ? never
	: TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? v.OptionalSchema<TSchema, undefined>
		: TSchema
	: v.OptionalSchema<v.NullableSchema<TSchema, undefined>, undefined>;

type HandleUpdateColumn<
	TSchema extends v.GenericSchema,
	TColumn extends Column,
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true ? never
	: TColumn['_']['notNull'] extends true ? v.OptionalSchema<TSchema, undefined>
	: v.OptionalSchema<v.NullableSchema<TSchema, undefined>, undefined>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = GetValibotType<
	TColumn['_']['data'],
	TColumn['_']['dataType'],
	GetEnumValuesFromColumn<TColumn>,
	GetBaseColumn<TColumn>
> extends infer TSchema extends v.GenericSchema ? TSchema extends v.AnySchema ? v.AnySchema
	: TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: v.AnySchema;
