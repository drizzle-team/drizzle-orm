import type { Assume, Column } from 'drizzle-orm';
import type * as v from 'valibot';
import type { ArrayHasAtLeastOneValue, ColumnIsGeneratedAlwaysAs, IsNever, Json, RemoveNeverElements } from './utils';
import { PgArray, PgBinaryVector, PgVarchar } from 'drizzle-orm/pg-core';

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
		: TColumn['_']['columnType'] extends 'PgBinaryVector' | 'PgHalfVector' | 'PgVector'
		? Assume<TColumn, PgBinaryVector<any>>['_']['dimensions']
		: TColumn['_']['columnType'] extends 'PgArray'
		? Assume<TColumn['_'], { size: number | undefined }>['size']
		: undefined;
	fixedLength: TColumn['_']['columnType'] extends 'PgChar' | 'MySqlChar' | 'PgHalfVector' | 'PgVector' | 'PgArray' ? true : false;
	arrayPipelines: [];
}

type RemovePipeIfNoElements<T extends v.SchemaWithPipe<[any, ...any[]]>> = T extends infer TPiped extends { pipe: [any, ...any[]] }
	? TPiped['pipe'][1] extends undefined ? T['pipe'][0] : TPiped
	: never;

type BuildArraySchema<
	TWrapped extends v.GenericSchema,
	TPipelines extends any[][],
> = TPipelines extends [infer TFirst extends any[], ...infer TRest extends any[][]]
	? BuildArraySchema<RemovePipeIfNoElements<v.SchemaWithPipe<[v.ArraySchema<TWrapped, undefined>, ...TFirst]>>, TRest>
	: TPipelines extends [infer TFirst extends any[]]
	? BuildArraySchema<RemovePipeIfNoElements<v.SchemaWithPipe<[v.ArraySchema<TWrapped, undefined>, ...TFirst]>>, []>
	: TWrapped;

type A = [number] extends [infer T1, ...infer T2] ? T2 : [];

export type GetValibotType<
	TData,
	TDataType extends string,
	TColumnType extends string,
	TEnumValues extends [string, ...string[]] | undefined,
	TBaseColumn extends Column | undefined,
	TAdditionalProperties extends Record<string, any>
> = TColumnType extends 'PgHalfVector' | 'PgVector' ? RemovePipeIfNoElements<v.SchemaWithPipe<RemoveNeverElements<[
		v.ArraySchema<v.NumberSchema<undefined>, undefined>,
		TAdditionalProperties['max'] extends number
			? TAdditionalProperties['fixedLength'] extends true ? v.LengthAction<number[], number, undefined> : v.MaxLengthAction<number[], number, undefined>
			: never,
	]>>>
	: TColumnType extends 'PgUUID' ? v.SchemaWithPipe<[v.StringSchema<undefined>, v.UuidAction<string, undefined>]>
	// PG array handling start
	// Nesting `GetValibotType` within `v.ArraySchema` will cause infinite recursion
	// The workaround is to accumulate all the array validations (done via `arrayPipelines` in `TAdditionalProperties`) and then build the schema afterwards
	: TAdditionalProperties['arrayFinished'] extends true
		? GetValibotType<TData, TDataType, TColumnType, TEnumValues, TBaseColumn, Omit<TAdditionalProperties, 'arrayFinished'>> extends infer TSchema extends v.GenericSchema
			? BuildArraySchema<TSchema, TAdditionalProperties['arrayPipelines']>
			: never
  : TBaseColumn extends Column ? GetValibotType<
		TBaseColumn['_']['data'],
		TBaseColumn['_']['dataType'],
		TBaseColumn['_']['columnType'],
		GetEnumValuesFromColumn<TBaseColumn>,
		GetBaseColumn<TBaseColumn>,
		Omit<ExtractAdditionalProperties<TBaseColumn>, 'arrayPipelines'> & {
			arrayPipelines: [
				RemoveNeverElements<[
					TAdditionalProperties['max'] extends number
						? TAdditionalProperties['fixedLength'] extends true
							? v.LengthAction<Assume<TBaseColumn['_']['data'], any[]>[], number, undefined>
							: v.MaxLengthAction<Assume<TBaseColumn['_']['data'], any[]>[], number, undefined>
						: never
				]>,
				...TAdditionalProperties['arrayPipelines'],
			],
			arrayFinished: GetBaseColumn<TBaseColumn> extends undefined ? true : false
		}
	>
	// PG array handling end
	: ArrayHasAtLeastOneValue<TEnumValues> extends true ? v.EnumSchema<EnumValuesToEnum<Assume<TEnumValues, [string, ...string[]]>>, undefined>
	: TData extends infer TTuple extends [any, ...any[]]
		? v.TupleSchema<Assume<{ [K in keyof TTuple]: GetValibotType<TTuple[K], string, string, undefined, undefined, { noPipe: true }> }, [any, ...any[]]>, undefined>
	: TData extends Date ? v.DateSchema<undefined>
	: TData extends Buffer ? v.GenericSchema<Buffer>
	: TDataType extends 'array' ? v.ArraySchema<GetValibotType<Assume<TData, any[]>[number], string, string, undefined, undefined, { noPipe: true }>, undefined>
	: TData extends infer TDict extends Record<string, any>
		? v.ObjectSchema<{ readonly [K in keyof TDict]: GetValibotType<TDict[K], string, string, undefined, undefined, { noPipe: true }> }, undefined>
	: TDataType extends 'json' ? v.GenericSchema<Json>
	: TData extends number ? TAdditionalProperties['noPipe'] extends true ? v.NumberSchema<undefined> : v.SchemaWithPipe<RemoveNeverElements<[
		v.NumberSchema<undefined>,
		v.MinValueAction<number, number, undefined>,
		v.MaxValueAction<number, number, undefined>,
		TColumnType extends 'MySqlTinyInt' | 'PgSmallInt' | 'PgSmallSerial' | 'MySqlSmallInt' | 'MySqlMediumInt' | 'PgInteger' | 'PgSerial' | 'MySqlInt' | 'PgBigInt53' | 'PgBigSerial53' | 'MySqlBigInt53' | 'MySqlSerial' | 'SQLiteInteger' | 'MySqlYear' ? v.IntegerAction<number, undefined> : never
	]>>
	: TData extends bigint ? TAdditionalProperties['noPipe'] extends true ? v.BigintSchema<undefined> : v.SchemaWithPipe<[
		v.BigintSchema<undefined>,
		v.MinValueAction<bigint, bigint, undefined>,
		v.MaxValueAction<bigint, bigint, undefined>
	]>
	: TData extends boolean ? v.BooleanSchema<undefined>
	: TData extends string ? RemovePipeIfNoElements<v.SchemaWithPipe<RemoveNeverElements<[
			v.StringSchema<undefined>,
			TColumnType extends 'PgBinaryVector'
				? v.RegexAction<string, undefined>
				: never,
			TAdditionalProperties['max'] extends number
				? TAdditionalProperties['fixedLength'] extends true ? v.LengthAction<string, number, undefined> : v.MaxLengthAction<string, number, undefined>
				: never,
		]>>>
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
