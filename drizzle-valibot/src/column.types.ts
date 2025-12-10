import type {
	Assume,
	Column,
	ColumnDataConstraint,
	ColumnDataType,
	ColumnTypeData,
	ExtractColumnTypeData,
} from 'drizzle-orm';
import type * as v from 'valibot';
import type { bigintStringModeSchema, unsignedBigintStringModeSchema } from './column.ts';
import type { IsNever, Json, RemoveNeverElements } from './utils.ts';

export type HasBaseColumn<TColumn> = TColumn extends { _: { baseColumn: Column | undefined } }
	? IsNever<TColumn['_']['baseColumn']> extends false ? true
	: false
	: false;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { readonly [K in TEnumValues[number]]: K };

export type ExtractAdditionalProperties<
	TColumn extends Column,
> = {
	// Broken - type-level length was removed
	max: TColumn['length'];
	// Broken - type-level isLengthExact was removed
	fixedLength: TColumn['isLengthExact'] extends true ? true : false;
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
> = TColumnType extends 'array'
	? TConstraint extends 'vector' | 'halfvector' ? TAdditionalProperties['max'] extends number ? v.SchemaWithPipe<
				[v.ArraySchema<v.NumberSchema<undefined>, undefined>, GetLengthAction<TAdditionalProperties, number[]>]
			>
		: v.ArraySchema<v.NumberSchema<undefined>, undefined>
	: TConstraint extends 'int64vector' ? v.ArraySchema<v.BigintSchema<undefined>, undefined>
	: TConstraint extends 'geometry' | 'point'
		? v.TupleSchema<[v.NumberSchema<undefined>, v.NumberSchema<undefined>], undefined>
	: TConstraint extends 'line'
		? v.TupleSchema<[v.NumberSchema<undefined>, v.NumberSchema<undefined>, v.NumberSchema<undefined>], undefined>
	: TConstraint extends 'basecolumn'
		? TBaseColumn extends Column
			? (GetArraySchema<TBaseColumn> extends infer ArrInternals extends v.BaseSchema<any, any, v.BaseIssue<any>>
				? TAdditionalProperties['max'] extends number ? v.SchemaWithPipe<
						[
							v.ArraySchema<ArrInternals, undefined>,
							GetLengthAction<
								TAdditionalProperties,
								Assume<TData, string | ArrayLike<unknown>>
							>,
						]
					>
				: v.ArraySchema<ArrInternals, undefined>
				: v.AnySchema)
		: v.ArraySchema<v.AnySchema, undefined>
	: v.ArraySchema<v.AnySchema, undefined>
	: TColumnType extends 'object' ? TConstraint extends 'geometry' | 'point' ? v.ObjectSchema<
				{ readonly x: v.NumberSchema<undefined>; readonly y: v.NumberSchema<undefined> },
				undefined
			>
		: TConstraint extends 'line' ? v.ObjectSchema<
				{
					readonly a: v.NumberSchema<undefined>;
					readonly b: v.NumberSchema<undefined>;
					readonly c: v.NumberSchema<undefined>;
				},
				undefined
			>
		: TConstraint extends 'date' ? v.DateSchema<undefined>
		: TConstraint extends 'buffer' ? v.GenericSchema<Buffer>
		: TConstraint extends 'json' ? v.GenericSchema<
				TData extends Record<string, any> ? TData : Json
			>
		: v.LooseObjectSchema<{}, undefined>
	: TColumnType extends 'custom' ? v.AnySchema
	: TColumnType extends 'number' ? v.SchemaWithPipe<
			RemoveNeverElements<[
				v.NumberSchema<undefined>,
				v.MinValueAction<number, number, undefined>,
				v.MaxValueAction<number, number, undefined>,
				TConstraint extends
					'int8' | 'int16' | 'int24' | 'int32' | 'int53' | 'uint8' | 'uint16' | 'uint24' | 'uint32' | 'uint53' | 'year'
					? v.IntegerAction<number, undefined>
					: never,
			]>
		>
	: TColumnType extends 'bigint' ? TConstraint extends 'int64' | 'uint64' ? v.SchemaWithPipe<[
				v.BigintSchema<undefined>,
				v.MinValueAction<bigint, bigint, undefined>,
				v.MaxValueAction<bigint, bigint, undefined>,
			]>
		: v.BigintSchema<undefined>
	: TColumnType extends 'boolean' ? v.BooleanSchema<undefined>
	: TColumnType extends 'string'
		? TConstraint extends 'uuid' ? v.SchemaWithPipe<[v.StringSchema<undefined>, v.UuidAction<string, undefined>]>
		: TConstraint extends 'enum' ? v.EnumSchema<
				{ readonly [K in Assume<TEnum, string[]>[number]]: K },
				undefined
			>
		: TConstraint extends 'int64' ? typeof bigintStringModeSchema
		: TConstraint extends 'uint64' ? typeof unsignedBigintStringModeSchema
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
