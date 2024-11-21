import type { Assume, Column } from 'drizzle-orm';
import type * as v from 'valibot';
import type { ArrayHasAtLeastOneValue, ColumnIsGeneratedAlwaysAs, IsArray, IsNever, Json, RemoveNeverElements, UnwrapArray } from './utils';
import { PgBinaryVector, PgVarchar } from 'drizzle-orm/pg-core';

export type GetEnumValuesFromColumn<TColumn extends Column> = TColumn['_'] extends { enumValues: [string, ...string[]] }
	? TColumn['_']['enumValues']
	: undefined;

export type GetBaseColumn<TColumn extends Column> = TColumn['_'] extends { baseColumn: Column | never | undefined }
	? IsNever<TColumn['_']['baseColumn']> extends false ? TColumn['_']['baseColumn']
	: undefined
	: undefined;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { readonly [K in TEnumValues[number]]: K };

export type ExtractAdditionalProperties<TColumn extends Column> = {
	max: TColumn['_']['columnType'] extends 'PgVarchar' | 'SQLiteText' | 'PgChar' | 'MySqlChar'
		? Assume<TColumn, PgVarchar<any>>['_']['length']
		: TColumn['_']['columnType'] extends 'MySqlText' | 'MySqlVarChar'
		? number
		: TColumn['_']['columnType'] extends 'PgBinaryVector'
		? Assume<TColumn, PgBinaryVector<any>>['_']['dimensions']
		: undefined;
	fixedLength: TColumn['_']['columnType'] extends 'PgChar' | 'MySqlChar' ? true : false;
}

export type GetValibotType<
	TData,
	TDataType extends string,
	TColumnType extends string,
	TEnumValues extends [string, ...string[]] | undefined,
	TBaseColumn extends Column | undefined,
	TAdditionalProperties extends Record<string, any>
> = // @ts-ignore (false-positive) - Type instantiation is excessively deep and possibly infinite.
  TBaseColumn extends Column ? v.ArraySchema<
		GetValibotType<
			UnwrapArray<TData>,
			string,
			TBaseColumn['_']['columnType'],
			undefined,
			IsArray<Assume<TData, any[]>[number]> extends true ? TBaseColumn : undefined,
			{}
		>,
    undefined
	>
	: ArrayHasAtLeastOneValue<TEnumValues> extends true ? v.EnumSchema<EnumValuesToEnum<Assume<TEnumValues, [string, ...string[]]>>, undefined>
	: TData extends infer TTuple extends [any, ...any[]]
		? v.TupleSchema<Assume<{ [K in keyof TTuple]: GetValibotType<TTuple[K], string, string, undefined, undefined, {}> }, [any, ...any[]]>, undefined>
	: TData extends Date ? v.DateSchema<undefined>
	: TData extends Buffer ? v.GenericSchema<Buffer>
	: TDataType extends 'array' ? v.ArraySchema<GetValibotType<Assume<TData, any[]>[number], string, string, undefined, undefined, {}>, undefined>
	: TData extends infer TDict extends Record<string, any>
		? v.ObjectSchema<{ readonly [K in keyof TDict]: GetValibotType<TDict[K], string, string, undefined, undefined, {}> }, undefined>
	: TDataType extends 'json' ? v.GenericSchema<Json>
	: TData extends number ? v.SchemaWithPipe<RemoveNeverElements<[
		v.NumberSchema<undefined>,
		v.MinValueAction<number, number, undefined>,
		v.MaxValueAction<number, number, undefined>,
		TColumnType extends 'MySqlTinyInt' | 'PgSmallInt' | 'PgSmallSerial' | 'MySqlSmallInt' | 'MySqlMediumInt' | 'PgInteger' | 'PgSerial' | 'MySqlInt' | 'PgBigInt53' | 'PgBigSerial53' | 'MySqlBigInt53' | 'MySqlSerial' | 'SQLiteInteger' | 'MySqlYear' ? v.IntegerAction<number, undefined> : never
	]>>
	: TData extends bigint ? v.SchemaWithPipe<[
		v.BigintSchema<undefined>,
		v.MinValueAction<bigint, bigint, undefined>,
		v.MaxValueAction<bigint, bigint, undefined>
	]>
	: TData extends boolean ? v.BooleanSchema<undefined>
	: TData extends string
		? TColumnType extends 'PgUUID'
			?	v.SchemaWithPipe<[v.StringSchema<undefined>, v.UuidAction<string, undefined>]>
			: v.SchemaWithPipe<RemoveNeverElements<[
				v.StringSchema<undefined>,
				TAdditionalProperties['max'] extends number
					? TAdditionalProperties['fixedLength'] extends true ? v.LengthAction<string, number, undefined> : v.MaxLengthAction<string, number, undefined>
					: never,
				TColumnType extends 'PgBinaryVector'
					? v.RegexAction<string, undefined>
					: never
			]>> extends infer TPiped extends { pipe: [any, ...any[]] }
				? TPiped['pipe'][1] extends undefined ? v.StringSchema<undefined> : TPiped
				: v.StringSchema<undefined>
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
	TColumn['_']['columnType'],
	GetEnumValuesFromColumn<TColumn>,
	GetBaseColumn<TColumn>,
	ExtractAdditionalProperties<TColumn>
> extends infer TSchema extends v.GenericSchema ? TSchema extends v.AnySchema ? v.AnySchema
	: TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: v.AnySchema;
