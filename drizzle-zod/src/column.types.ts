import type { Assume, Column, ColumnBaseConfig, ColumnDataType } from 'drizzle-orm';
import type { z } from 'zod';
import type { IsEnumDefined, IsNever, Json } from './utils.ts';

type HasBaseColumn<TColumn> = TColumn extends { _: { baseColumn: Column | undefined } }
	? IsNever<TColumn['_']['baseColumn']> extends false ? true
	: false
	: false;

export type GetZodType<
	TColumn extends Column,
> = HasBaseColumn<TColumn> extends true ? z.ZodArray<
		GetZodType<Assume<TColumn['_']['baseColumn'], Column>>
	>
	: IsEnumDefined<TColumn['_']['enumValues']> extends true
		? z.ZodEnum<Assume<TColumn['_']['enumValues'], [string, ...string[]]>>
	: TColumn['_']['columnType'] extends 'PgGeometry' | 'PgPointTuple' ? z.ZodTuple<[z.ZodNumber, z.ZodNumber]>
	: TColumn['_']['columnType'] extends 'PgLine' ? z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber]>
	: TColumn['_']['data'] extends Date ? z.ZodDate
	: TColumn['_']['data'] extends Buffer ? z.ZodType<Buffer>
	: TColumn['_']['dataType'] extends 'array'
		? z.ZodArray<GetZodPrimitiveType<Assume<TColumn['_']['data'], any[]>[number]>>
	: TColumn['_']['data'] extends Record<string, any>
		? TColumn['_']['columnType'] extends
			'PgJson' | 'PgJsonb' | 'MySqlJson' | 'SingleStoreJson' | 'SQLiteTextJson' | 'SQLiteBlobJson'
			? z.ZodType<TColumn['_']['data'], z.ZodTypeDef, TColumn['_']['data']>
		: z.ZodObject<{ [K in keyof TColumn['_']['data']]: GetZodPrimitiveType<TColumn['_']['data'][K]> }, 'strip'>
	: TColumn['_']['dataType'] extends 'json' ? z.ZodType<Json>
	: GetZodPrimitiveType<TColumn['_']['data']>;

type GetZodPrimitiveType<TData> = TData extends number ? z.ZodNumber
	: TData extends bigint ? z.ZodBigInt
	: TData extends boolean ? z.ZodBoolean
	: TData extends string ? z.ZodString
	: z.ZodTypeAny;

type HandleSelectColumn<
	TSchema extends z.ZodTypeAny,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: z.ZodNullable<TSchema>;

type HandleInsertColumn<
	TSchema extends z.ZodTypeAny,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? z.ZodOptional<TSchema>
	: TSchema
	: z.ZodOptional<z.ZodNullable<TSchema>>;

type HandleUpdateColumn<
	TSchema extends z.ZodTypeAny,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? z.ZodOptional<TSchema>
	: z.ZodOptional<z.ZodNullable<TSchema>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = TType extends 'select' ? HandleSelectColumn<GetZodType<TColumn>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetZodType<TColumn>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetZodType<TColumn>, TColumn>
	: GetZodType<TColumn>;
