import type * as t from '@sinclair/typebox';
import type { Assume, Column } from 'drizzle-orm';
import type { ArrayHasAtLeastOneValue, BufferSchema, ColumnIsGeneratedAlwaysAs, IsNever, JsonSchema } from './utils.ts';

export type GetEnumValuesFromColumn<TColumn extends Column> = TColumn['_'] extends { enumValues: [string, ...string[]] }
	? TColumn['_']['enumValues']
	: undefined;

export type GetBaseColumn<TColumn extends Column> = TColumn['_'] extends { baseColumn: Column | never | undefined }
	? IsNever<TColumn['_']['baseColumn']> extends false ? TColumn['_']['baseColumn']
	: undefined
	: undefined;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export type GetTypeboxType<
	TData,
	TDataType extends string,
	TColumnType extends string,
	TEnumValues extends [string, ...string[]] | undefined,
	TBaseColumn extends Column | undefined,
> = TColumnType extends
	| 'MySqlTinyInt'
	| 'SingleStoreTinyInt'
	| 'PgSmallInt'
	| 'PgSmallSerial'
	| 'MySqlSmallInt'
	| 'MySqlMediumInt'
	| 'SingleStoreSmallInt'
	| 'SingleStoreMediumInt'
	| 'PgInteger'
	| 'PgSerial'
	| 'MySqlInt'
	| 'SingleStoreInt'
	| 'PgBigInt53'
	| 'PgBigSerial53'
	| 'MySqlBigInt53'
	| 'MySqlSerial'
	| 'SingleStoreBigInt53'
	| 'SingleStoreSerial'
	| 'SQLiteInteger'
	| 'MySqlYear'
	| 'SingleStoreYear' ? t.TInteger
	: TColumnType extends 'PgBinaryVector' ? t.TRegExp
	: TBaseColumn extends Column ? t.TArray<
			GetTypeboxType<
				TBaseColumn['_']['data'],
				TBaseColumn['_']['dataType'],
				TBaseColumn['_']['columnType'],
				GetEnumValuesFromColumn<TBaseColumn>,
				GetBaseColumn<TBaseColumn>
			>
		>
	: ArrayHasAtLeastOneValue<TEnumValues> extends true
		? t.TEnum<EnumValuesToEnum<Assume<TEnumValues, [string, ...string[]]>>>
	: TData extends infer TTuple extends [any, ...any[]] ? t.TTuple<
			Assume<{ [K in keyof TTuple]: GetTypeboxType<TTuple[K], string, string, undefined, undefined> }, [any, ...any[]]>
		>
	: TData extends Date ? t.TDate
	: TData extends Buffer ? BufferSchema
	: TDataType extends 'array'
		? t.TArray<GetTypeboxType<Assume<TData, any[]>[number], string, string, undefined, undefined>>
	: TData extends infer TDict extends Record<string, any>
		? t.TObject<{ [K in keyof TDict]: GetTypeboxType<TDict[K], string, string, undefined, undefined> }>
	: TDataType extends 'json' ? JsonSchema
	: TData extends number ? t.TNumber
	: TData extends bigint ? t.TBigInt
	: TData extends boolean ? t.TBoolean
	: TData extends string ? t.TString
	: t.TAny;

type HandleSelectColumn<
	TSchema extends t.TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: t.Union<[TSchema, t.TNull]>;

type HandleInsertColumn<
	TSchema extends t.TSchema,
	TColumn extends Column,
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true ? never
	: TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? t.TOptional<TSchema>
		: TSchema
	: t.TOptional<t.Union<[TSchema, t.TNull]>>;

type HandleUpdateColumn<
	TSchema extends t.TSchema,
	TColumn extends Column,
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true ? never
	: TColumn['_']['notNull'] extends true ? t.TOptional<TSchema>
	: t.TOptional<t.Union<[TSchema, t.TNull]>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = GetTypeboxType<
	TColumn['_']['data'],
	TColumn['_']['dataType'],
	TColumn['_']['columnType'],
	GetEnumValuesFromColumn<TColumn>,
	GetBaseColumn<TColumn>
> extends infer TSchema extends t.TSchema ? TSchema extends t.TAny ? t.TAny
	: TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: t.TAny;
