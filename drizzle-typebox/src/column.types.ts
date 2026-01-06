import type * as t from '@sinclair/typebox';
import type { Assume, Column, ColumnTypeData, ExtractColumnTypeData } from 'drizzle-orm';
import type { bigintStringModeSchema, unsignedBigintStringModeSchema } from './column.ts';
import type { BufferSchema, JsonSchema } from './utils.ts';

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export interface GenericSchema<T> extends t.TSchema { // oxlint-disable-line import/namespace false-positive
	static: T;
}

type GetArrayDepth<T, Depth extends number = 0> = Depth extends 5 ? 5
	: T extends readonly (infer U)[] ? GetArrayDepth<U, [1, 2, 3, 4, 5][Depth]>
	: Depth;

type WrapInTArray<TSchema extends t.TSchema, TDepth extends number> = TDepth extends 0 ? TSchema
	: TDepth extends 1 ? t.TArray<TSchema>
	: TDepth extends 2 ? t.TArray<t.TArray<TSchema>>
	: TDepth extends 3 ? t.TArray<t.TArray<t.TArray<TSchema>>>
	: TDepth extends 4 ? t.TArray<t.TArray<t.TArray<t.TArray<TSchema>>>>
	: TDepth extends 5 ? t.TArray<t.TArray<t.TArray<t.TArray<t.TArray<TSchema>>>>>
	: t.TArray<t.TAny>;

type IsPgArrayColumn<TColumn extends Column, TType extends ColumnTypeData> = TType['type'] extends 'array' ? false // Already handled as explicit array type
	: GetArrayDepth<TColumn['_']['data']> extends 0 ? false
	: true;

export type GetTypeboxType<
	TColumn extends Column,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = IsPgArrayColumn<TColumn, TType> extends true
	? WrapInTArray<GetBaseTypeboxType<TColumn, TType>, GetArrayDepth<TColumn['_']['data']>>
	: GetBaseTypeboxType<TColumn, TType>;

type GetBaseTypeboxType<
	TColumn extends Column,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = TType['type'] extends 'array' ? TType['constraint'] extends 'basecolumn' ? t.TArray<
			GetTypeboxType<Assume<TColumn['_'], { baseColumn: Column }>['baseColumn']>
		>
	: TType['constraint'] extends 'geometry' | 'point' ? t.TTuple<[t.TNumber, t.TNumber]>
	: TType['constraint'] extends 'line' ? t.TTuple<[t.TNumber, t.TNumber, t.TNumber]>
	: TType['constraint'] extends 'vector' | 'halfvector' ? t.TArray<t.TNumber>
	: TType['constraint'] extends 'int64vector' ? t.TArray<t.TBigInt>
	: t.TArray<t.TAny>
	: TType['type'] extends 'object'
		? TType['constraint'] extends 'geometry' | 'point' ? t.TObject<{ x: t.TNumber; y: t.TNumber }>
		: TType['constraint'] extends 'line' ? t.TObject<{ a: t.TNumber; b: t.TNumber; c: t.TNumber }>
		: TType['constraint'] extends 'date' ? t.TDate
		: TType['constraint'] extends 'buffer' ? BufferSchema
		: TType['constraint'] extends 'json'
			? TColumn['_']['data'] extends Record<string, any> ? GenericSchema<TColumn['_']['data']> : JsonSchema
		: t.TObject
	: TType['type'] extends 'custom' ? t.TAny
	: TType['type'] extends 'number'
		? TType['constraint'] extends
			'int8' | 'int16' | 'int24' | 'int32' | 'int53' | 'uint8' | 'uint16' | 'uint24' | 'uint32' | 'uint53' | 'year'
			? t.TInteger
		: t.TNumber
	: TType['type'] extends 'bigint' ? t.TBigInt
	: TType['type'] extends 'boolean' ? t.TBoolean
	: TType['type'] extends 'string' ? TType['constraint'] extends 'binary' | 'varbinary' ? t.TRegExp
		: TType['constraint'] extends 'int64' ? typeof bigintStringModeSchema
		: TType['constraint'] extends 'uint64' ? typeof unsignedBigintStringModeSchema
		: TType['constraint'] extends 'enum' ? t.TEnum<{ [K in Assume<TColumn['_']['enumValues'], string[]>[number]]: K }>
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
