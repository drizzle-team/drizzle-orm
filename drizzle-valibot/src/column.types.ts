import type {
	Assume,
	Column,
	ColumnDataConstraint,
	ColumnDataType,
	ColumnTypeData,
	Dialect,
	ExtractColumnTypeData,
} from 'drizzle-orm';
import type * as v from 'valibot';
import type { IsNever, Json, RemoveNeverElements } from './utils.ts';

export type HasBaseColumn<TColumn> = TColumn extends { _: { baseColumn: Column | undefined } }
	? IsNever<TColumn['_']['baseColumn']> extends false ? true
	: false
	: false;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { readonly [K in TEnumValues[number]]: K };

export type ExtractAdditionalProperties<
	TColumn extends Column,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
	TColumnType extends ColumnDataType = TType['type'],
	TConstraint extends ColumnDataConstraint | undefined = TType['constraint'],
	TDialect extends Dialect = TColumn['dialect'],
	TDialectConstraint = `${TDialect} ${TConstraint}`,
> = {
	max: TDialectConstraint extends `${'pg' | 'mysql' | 'singlestore'} char` | 'pg varchar' | 'sqlite text'
		? Assume<TColumn['_'], { length: number | undefined }>['length']
		: TDialectConstraint extends `${'mysql' | 'singlestore'} ${'text' | 'varchar'}` ? number
		: TConstraint extends 'binary' ? TColumn['_'] extends { dimensions: number } ? TColumn['_']['dimensions'] : number
		: TColumnType extends 'vector'
			? TColumn['_'] extends { dimensions: number } ? Assume<TColumn['_'], { dimensions: number }>['dimensions']
			: undefined
		: TColumnType extends 'array'
			? TColumn['_'] extends { size: number } ? Assume<TColumn['_'], { size: number }>['size'] : undefined
		: undefined;
	fixedLength: TColumnType extends 'vector' | 'array' ? true : TConstraint extends 'char' ? true : false;
};

type GetLengthAction<T extends Record<string, any>, TType extends string | ArrayLike<unknown>> =
	T['fixedLength'] extends true ? v.LengthAction<TType, number, undefined>
		: v.MaxLengthAction<TType, number, undefined>;

type GetArraySchema<
	TColumn extends Column,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = GetValibotType<
	TColumn['_']['data'],
	TType['type'],
	TType['constraint'],
	TColumn['_']['enumValues'],
	HasBaseColumn<TColumn> extends true ? Assume<TColumn['_'], { baseColumn: Column }>['baseColumn'] : undefined,
	ExtractAdditionalProperties<TColumn>
>;

export type GetValibotType<
	TData,
	TColumnType extends ColumnDataType,
	TConstraint extends ColumnDataConstraint | undefined,
	TEnum extends string[] | undefined,
	TBaseColumn extends Column | undefined,
	TAdditionalProperties extends Record<string, any>,
> = TColumnType extends 'vector' ? TAdditionalProperties['max'] extends number ? v.SchemaWithPipe<
			[v.ArraySchema<v.NumberSchema<undefined>, undefined>, GetLengthAction<TAdditionalProperties, number[]>]
		>
	: v.ArraySchema<v.NumberSchema<undefined>, undefined>
	: TBaseColumn extends Column // Equivalent to TColumnType extends 'array', but doesn't cause instantiation overload
		? GetArraySchema<TBaseColumn> extends infer ArrInternals extends v.BaseSchema<any, any, v.BaseIssue<any>>
			? (TAdditionalProperties['max'] extends number ? v.SchemaWithPipe<
					[
						v.ArraySchema<ArrInternals, undefined>,
						GetLengthAction<
							TAdditionalProperties,
							Assume<TData, string | ArrayLike<unknown>>
						>,
					]
				>
				: v.ArraySchema<ArrInternals, undefined>)
		: v.AnySchema
	: TColumnType extends 'enum' ? v.EnumSchema<
			{ readonly [K in Assume<TEnum, string[]>[number]]: K },
			undefined
		>
	: TColumnType extends 'geoTuple' | 'pointTuple'
		? v.TupleSchema<[v.NumberSchema<undefined>, v.NumberSchema<undefined>], undefined>
	: TColumnType extends 'geoObject' | 'pointObject' ? v.ObjectSchema<
			{ readonly x: v.NumberSchema<undefined>; readonly y: v.NumberSchema<undefined> },
			undefined
		>
	: TColumnType extends 'lineTuple'
		? v.TupleSchema<[v.NumberSchema<undefined>, v.NumberSchema<undefined>, v.NumberSchema<undefined>], undefined>
	: TColumnType extends 'lineABC' ? v.ObjectSchema<
			{
				readonly a: v.NumberSchema<undefined>;
				readonly b: v.NumberSchema<undefined>;
				readonly c: v.NumberSchema<undefined>;
			},
			undefined
		>
	: TColumnType extends 'date' ? v.DateSchema<undefined>
	: TColumnType extends 'buffer' ? v.GenericSchema<Buffer>
	: TColumnType extends 'vector' ? v.ArraySchema<
			v.NumberSchema<undefined>,
			undefined
		>
	: TColumnType extends 'json' ? v.GenericSchema<
			TData extends Record<string, any> ? TData : Json
		>
	: TColumnType extends 'custom' ? v.AnySchema
	: TColumnType extends 'number' ? v.SchemaWithPipe<
			RemoveNeverElements<[
				v.NumberSchema<undefined>,
				v.MinValueAction<number, number, undefined>,
				v.MaxValueAction<number, number, undefined>,
				TConstraint extends 'integer' | 'tinyint' | 'smallint' | 'mediumint' | 'uint' | 'year'
					? v.IntegerAction<number, undefined>
					: never,
			]>
		>
	: TColumnType extends 'bigint' ? v.SchemaWithPipe<[
			v.BigintSchema<undefined>,
			v.MinValueAction<bigint, bigint, undefined>,
			v.MaxValueAction<bigint, bigint, undefined>,
		]>
	: TColumnType extends 'boolean' ? v.BooleanSchema<undefined>
	: TColumnType extends 'string'
		? TConstraint extends 'uuid' ? v.SchemaWithPipe<[v.StringSchema<undefined>, v.UuidAction<string, undefined>]>
		: TConstraint extends 'binary' ? v.SchemaWithPipe<
				RemoveNeverElements<[
					v.StringSchema<undefined>,
					v.RegexAction<string, undefined>,
					TAdditionalProperties['max'] extends number ? GetLengthAction<TAdditionalProperties, string> : never,
				]>
			>
		: TAdditionalProperties['max'] extends number
			? v.SchemaWithPipe<[v.StringSchema<undefined>, GetLengthAction<TAdditionalProperties, string>]>
		: v.StringSchema<undefined>
	: v.AnySchema;

export type GetValibotTypeFromColumn<
	TColumn extends Column,
	TDataType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = GetValibotType<
	TColumn['_']['data'],
	TDataType['type'],
	TDataType['constraint'],
	TColumn['_']['enumValues'],
	HasBaseColumn<TColumn> extends true ? Assume<TColumn['_'], { baseColumn: Column }>['baseColumn'] : undefined,
	ExtractAdditionalProperties<TColumn>
>;

type HandleSelectColumn<
	TSchema extends v.GenericSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: v.NullableSchema<TSchema, undefined>;

type HandleInsertColumn<
	TSchema extends v.GenericSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true
	? TColumn['_']['hasDefault'] extends true ? v.OptionalSchema<TSchema, undefined>
	: TSchema
	: v.OptionalSchema<v.NullableSchema<TSchema, undefined>, undefined>;

type HandleUpdateColumn<
	TSchema extends v.GenericSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? v.OptionalSchema<TSchema, undefined>
	: v.OptionalSchema<v.NullableSchema<TSchema, undefined>, undefined>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = GetValibotTypeFromColumn<TColumn> extends infer TSchema extends v.GenericSchema
	? TSchema extends v.AnySchema ? v.AnySchema
	: TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: v.AnySchema;
