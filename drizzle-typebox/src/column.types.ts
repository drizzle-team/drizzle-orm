import type * as t from '@sinclair/typebox';
import type { Assume, Column, ColumnTypeData, ExtractColumnTypeData } from 'drizzle-orm';
import type { BufferSchema, JsonSchema } from './utils.ts';

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export interface GenericSchema<T> extends t.TSchema {
	static: T;
}

export type GetTypeboxType<
	TColumn extends Column,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = TType['type'] extends 'array' ? t.TArray<
		GetTypeboxType<Assume<TColumn['_'], { baseColumn: Column }>['baseColumn']>
	>
	: TType['type'] extends 'enum' ? t.TEnum<{ [K in Assume<TColumn['_']['enumValues'], string[]>[number]]: K }>
	: TType['type'] extends 'geoTuple' | 'pointTuple' ? t.TTuple<[t.TNumber, t.TNumber]>
	: TType['type'] extends 'geoObject' | 'pointObject' ? t.TObject<{ x: t.TNumber; y: t.TNumber }>
	: TType['type'] extends 'lineTuple' ? t.TTuple<[t.TNumber, t.TNumber, t.TNumber]>
	: TType['type'] extends 'lineABC' ? t.TObject<{ a: t.TNumber; b: t.TNumber; c: t.TNumber }>
	: TType['type'] extends 'date' ? t.TDate
	: TType['type'] extends 'buffer' ? BufferSchema
	: TType['type'] extends 'vector' ? t.TArray<t.TNumber>
	: TType['type'] extends 'json'
		? TColumn['_']['data'] extends Record<string, any> ? GenericSchema<TColumn['_']['data']> : JsonSchema
	: TType['type'] extends 'custom' ? t.TAny
	: TType['type'] extends 'number'
		? TType['constraint'] extends 'int8' | 'int16' | 'int24' | 'int32' | 'int53' | 'uint53' | 'year' ? t.TInteger
		: t.TNumber
	: TType['type'] extends 'bigint' ? t.TBigInt
	: TType['type'] extends 'boolean' ? t.TBoolean
	: TType['type'] extends 'string' ? TType['constraint'] extends 'binary' | 'varbinary' ? t.TRegExp
		: t.TString
	: t.TAny;

type HandleSelectColumn<
	TSchema extends t.TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: t.Union<[TSchema, t.TNull]>;

type HandleInsertColumn<
	TSchema extends t.TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? t.TOptional<TSchema>
	: TSchema
	: t.TOptional<t.Union<[TSchema, t.TNull]>>;

type HandleUpdateColumn<
	TSchema extends t.TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? t.TOptional<TSchema>
	: t.TOptional<t.Union<[TSchema, t.TNull]>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = TType extends 'select' ? HandleSelectColumn<GetTypeboxType<TColumn>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetTypeboxType<TColumn>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetTypeboxType<TColumn>, TColumn>
	: GetTypeboxType<TColumn>;
