import type { Assume, Column, ColumnTypeData, ExtractColumnTypeData } from 'drizzle-orm';
import type { z } from 'zod/v4';
import type { bigintStringModeSchema, unsignedBigintStringModeSchema } from './column.ts';
import type { CoerceOptions } from './schema.types.ts';
import type { Json } from './utils.ts';

type GetArrayDepth<T, Depth extends number = 0> = Depth extends 5 ? 5
	: T extends readonly (infer U)[] ? GetArrayDepth<U, [1, 2, 3, 4, 5][Depth]>
	: Depth;

type WrapInZodArray<TSchema extends z.ZodType, TDepth extends number> = TDepth extends 0 ? TSchema
	: TDepth extends 1 ? z.ZodArray<TSchema>
	: TDepth extends 2 ? z.ZodArray<z.ZodArray<TSchema>>
	: TDepth extends 3 ? z.ZodArray<z.ZodArray<z.ZodArray<TSchema>>>
	: TDepth extends 4 ? z.ZodArray<z.ZodArray<z.ZodArray<z.ZodArray<TSchema>>>>
	: TDepth extends 5 ? z.ZodArray<z.ZodArray<z.ZodArray<z.ZodArray<z.ZodArray<TSchema>>>>>
	: z.ZodArray<z.ZodAny>;

type IsPgArrayColumn<TColumn extends Column<any>, TType extends ColumnTypeData> = TType['type'] extends 'array' ? false // Already handled as explicit array type
	: GetArrayDepth<TColumn['_']['data']> extends 0 ? false
	: true;

export type GetZodType<
	TColumn extends Column<any>,
	TCoerce extends CoerceOptions,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
	TCanCoerce extends boolean = CanCoerce<TCoerce, ColumnTypeDataToCoerceKey<TType>>,
> = IsPgArrayColumn<TColumn, TType> extends true
	? WrapInZodArray<GetBaseZodType<TColumn, TCoerce, TType, TCanCoerce>, GetArrayDepth<TColumn['_']['data']>>
	: GetBaseZodType<TColumn, TCoerce, TType, TCanCoerce>;

type GetBaseZodType<
	TColumn extends Column<any>,
	TCoerce extends CoerceOptions,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
	TCanCoerce extends boolean = CanCoerce<TCoerce, ColumnTypeDataToCoerceKey<TType>>,
> = TType['type'] extends 'array'
	? TType['constraint'] extends 'geometry' | 'point' ? z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>
	: TType['constraint'] extends 'line' ? z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>
	: TType['constraint'] extends 'vector' | 'halfvector' ? z.ZodArray<z.ZodNumber>
	: TType['constraint'] extends 'int64vector' ? z.ZodArray<z.ZodBigInt>
	: TType['constraint'] extends 'basecolumn'
		? z.ZodArray<GetZodType<Assume<TColumn['_'], { baseColumn: Column<any> }>['baseColumn'], TCoerce>>
	: z.ZodArray<z.ZodAny>
	: TType['type'] extends 'object'
		? TType['constraint'] extends 'date' ? CanCoerce<TCoerce, 'date'> extends true ? z.coerce.ZodCoercedDate : z.ZodDate
		: TType['constraint'] extends 'buffer' ? z.ZodType<Buffer>
		: TType['constraint'] extends 'point' | 'geometry' ? z.ZodObject<{ x: z.ZodNumber; y: z.ZodNumber }, z.core.$strip>
		: TType['constraint'] extends 'line'
			? z.ZodObject<{ a: z.ZodNumber; b: z.ZodNumber; c: z.ZodNumber }, z.core.$strip>
		: TType['constraint'] extends 'json' ? TColumn['_']['data'] extends Record<string, any> ? z.ZodType<
					TColumn['_']['data'],
					z.core.$strip
				>
			: z.ZodType<Json>
		: z.ZodObject<{}, z.core.$loose>
	: TType['type'] extends 'custom' ? z.ZodType
	: TType['type'] extends 'number' ? TCanCoerce extends true ? z.coerce.ZodCoercedNumber
		: (TType['constraint'] extends
			'int8' | 'int16' | 'int24' | 'int32' | 'int53' | 'uint8' | 'uint16' | 'uint24' | 'uint32' | 'uint53' | 'year'
			? z.ZodInt
			: z.ZodNumber)
	: TType['type'] extends 'bigint' ? TCanCoerce extends true ? z.coerce.ZodCoercedBigInt : z.ZodBigInt
	: TType['type'] extends 'boolean' ? TCanCoerce extends true ? z.coerce.ZodCoercedBoolean : z.ZodBoolean
	: TType['type'] extends 'string'
		? TType['constraint'] extends 'uuid' ? z.ZodUUID : TCanCoerce extends true ? z.coerce.ZodCoercedString
		: TType['constraint'] extends 'enum' ? z.ZodEnum<{ [K in Assume<TColumn['_']['enumValues'], string[]>[number]]: K }>
		: TType['constraint'] extends 'int64' ? typeof bigintStringModeSchema
		: TType['constraint'] extends 'uint64' ? typeof unsignedBigintStringModeSchema
		: z.ZodString
	: z.ZodType;

type ColumnTypeDataToCoerceKey<TType extends ColumnTypeData> = TType['type'] extends
	'bigint' | 'boolean' | 'number' | 'string' ? TType['type']
	: TType['type'] extends 'object' ? TType['constraint'] extends 'date' ? TType['constraint'] : 'none'
	: 'none';

type CanCoerce<
	TCoerce extends CoerceOptions,
	TTo extends 'bigint' | 'boolean' | 'date' | 'number' | 'string' | 'none',
> = TCoerce extends true ? true
	: TCoerce extends Record<string, any> ? TCoerce[TTo] extends true ? true
		: false
	: false;

type HandleSelectColumn<
	TSchema extends z.ZodType,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: z.ZodNullable<TSchema>;

type HandleInsertColumn<
	TSchema extends z.ZodType,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? z.ZodOptional<TSchema>
	: TSchema
	: z.ZodOptional<z.ZodNullable<TSchema>>;

type HandleUpdateColumn<
	TSchema extends z.ZodType,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? z.ZodOptional<TSchema>
	: z.ZodOptional<z.ZodNullable<TSchema>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
	TCoerce extends CoerceOptions,
> = TType extends 'select' ? HandleSelectColumn<GetZodType<TColumn, TCoerce>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetZodType<TColumn, TCoerce>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetZodType<TColumn, TCoerce>, TColumn>
	: GetZodType<TColumn, TCoerce>;
