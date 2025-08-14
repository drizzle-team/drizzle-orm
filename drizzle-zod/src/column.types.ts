import type {
	Assume,
	Column,
	ColumnDataConstraint,
	ColumnDataType,
	ColumnTypeData,
	ExtractColumnTypeData,
} from 'drizzle-orm';
import type { z } from 'zod/v4';
import type { Json } from './utils.ts';

export type GetZodType<
	TColumn extends Column<any>,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = TType['type'] extends 'enum' ? z.ZodEnum<{ [K in Assume<TColumn['_']['enumValues'], string[]>[number]]: K }>
	: TType['type'] extends 'geoTuple' | 'pointTuple' ? z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>
	: TType['type'] extends 'lineTuple' ? z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>
	: TType['type'] extends 'date' ? CanCoerce<TCoerce, 'date'> extends true ? z.coerce.ZodCoercedDate : z.ZodDate
	: TType['type'] extends 'buffer' ? z.ZodType<Buffer>
	: TType['type'] extends 'array'
		? z.ZodArray<GetZodType<Assume<TColumn['_'], { baseColumn: Column<any> }>['baseColumn'], TCoerce>>
	: TType['type'] extends 'vector' ? z.ZodArray<z.ZodNumber>
	: TType['type'] extends 'pointObject' | 'geoObject' ? z.ZodObject<{ x: z.ZodNumber; y: z.ZodNumber }, z.core.$strip>
	: TType['type'] extends 'lineABC' ? z.ZodObject<{ a: z.ZodNumber; b: z.ZodNumber; c: z.ZodNumber }, z.core.$strip>
	: TColumn['_']['data'] extends Record<string, any> ? z.ZodType<
			TColumn['_']['data'],
			z.core.$strip
		>
	: TType['type'] extends 'json' ? z.ZodType<Json>
	: TType['type'] extends 'custom' ? z.ZodType<
			TColumn['_']['data'],
			z.core.$strip
		>
	: GetZodPrimitiveType<TType['type'], TType['constraint'], TCoerce>;

type CanCoerce<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TTo extends ColumnDataType,
> = TCoerce extends true ? true
	: TCoerce extends Record<string, any> ? TCoerce[TTo] extends true ? true
		: false
	: false;

type GetZodPrimitiveType<
	TColumnType extends ColumnDataType,
	TConstraint extends ColumnDataConstraint | undefined,
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
	TCanCoerce extends boolean = CanCoerce<TCoerce, TColumnType>,
> = TColumnType extends 'number' ? TCanCoerce extends true ? z.coerce.ZodCoercedNumber
	: (TConstraint extends 'integer' | 'tinyint' | 'smallint' | 'mediumint' | 'uint' | 'year' ? z.ZodInt : z.ZodNumber)
	: TColumnType extends 'bigint' ? TCanCoerce extends true ? z.coerce.ZodCoercedBigInt : z.ZodBigInt
	: TColumnType extends 'boolean' ? TCanCoerce extends true ? z.coerce.ZodCoercedBoolean : z.ZodBoolean
	: TColumnType extends 'string'
		? TConstraint extends 'uuid' ? z.ZodUUID : TCanCoerce extends true ? z.coerce.ZodCoercedString
		: z.ZodString
	: z.ZodType;

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
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
> = TType extends 'select' ? HandleSelectColumn<GetZodType<TColumn, TCoerce>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetZodType<TColumn, TCoerce>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetZodType<TColumn, TCoerce>, TColumn>
	: GetZodType<TColumn, TCoerce>;
