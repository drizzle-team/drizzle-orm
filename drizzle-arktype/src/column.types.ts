import { Type, type } from 'arktype';
import type { Assume, Column } from 'drizzle-orm';
import type { ArrayHasAtLeastOneValue, ColumnIsGeneratedAlwaysAs, IsNever, Json } from './utils.ts';

export type ArktypeNullable<TSchema> = Type<type.infer<TSchema> | null, {}>;

export type ArktypeOptional<TSchema> = [Type<type.infer<TSchema> | undefined, {}>, '?'];

export type GetEnumValuesFromColumn<TColumn extends Column> = TColumn['_'] extends { enumValues: [string, ...string[]] }
	? TColumn['_']['enumValues']
	: undefined;

export type GetBaseColumn<TColumn extends Column> = TColumn['_'] extends { baseColumn: Column | never | undefined }
	? IsNever<TColumn['_']['baseColumn']> extends false ? TColumn['_']['baseColumn']
	: undefined
	: undefined;

export type GetArktypeType<
	TData,
	TDataType extends string,
	TEnumValues extends [string, ...string[]] | undefined,
	TBaseColumn extends Column | undefined,
> = TBaseColumn extends Column ? Type<TData, {}>
	: ArrayHasAtLeastOneValue<TEnumValues> extends true ? Type<Assume<TEnumValues, any[]>[number], {}>
	: TData extends infer TTuple extends [any, ...any[]]
		? type.instantiate<{ [K in keyof TTuple]: GetArktypeType<TTuple[K], string, undefined, undefined> }>
	: TData extends Date ? Type<Date, {}>
	: TData extends Buffer ? Type<Buffer, {}>
	: TDataType extends 'array' ? Type<TData, {}>
	: TData extends infer TDict extends Record<string, any>
		? type.instantiate<{ [K in keyof TDict]: GetArktypeType<TDict[K], string, undefined, undefined> }>
	: TDataType extends 'json' ? Type<Json, {}>
	: TData extends number ? Type<number, {}>
	: TData extends bigint ? Type<bigint, {}>
	: TData extends boolean ? Type<boolean, {}>
	: TData extends string ? Type<string, {}>
	: Type<any, {}>;

type HandleSelectColumn<
	TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: ArktypeNullable<TSchema>;

type HandleInsertColumn<
	TSchema,
	TColumn extends Column,
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true ? never
	: TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? ArktypeOptional<TSchema>
		: TSchema
	: ArktypeOptional<ArktypeNullable<TSchema>>;

type HandleUpdateColumn<
	TSchema,
	TColumn extends Column,
> = ColumnIsGeneratedAlwaysAs<TColumn> extends true ? never
	: TColumn['_']['notNull'] extends true ? ArktypeOptional<TSchema>
	: ArktypeOptional<ArktypeNullable<TSchema>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = GetArktypeType<
	TColumn['_']['data'],
	TColumn['_']['dataType'],
	GetEnumValuesFromColumn<TColumn>,
	GetBaseColumn<TColumn>
> extends infer TSchema ? TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: Type<any, {}>;
