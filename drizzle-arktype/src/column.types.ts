import { Type, type } from 'arktype';
import type { Assume, Column } from 'drizzle-orm';
import type { ColumnIsGeneratedAlwaysAs, IsEnumDefined, IsNever, IsUnknown, Json } from './utils.ts';

export type ArktypeNullable<TSchema> = Type<type.infer<TSchema> | null, {}>;

export type ArktypeOptional<TSchema> = [Type<type.infer<TSchema>, {}>, '?'];

export type GetEnumValuesFromColumn<TColumn extends Column> = TColumn['_'] extends { enumValues: [string, ...string[]] }
	? TColumn['_']['enumValues']
	: undefined;

export type GetArktypeType<
	TData,
	TColumnType extends string,
	TEnumValues extends [string, ...string[]] | undefined,
> = IsEnumDefined<TEnumValues> extends true ? Type<Assume<TEnumValues, any[]>[number]>
	: TColumnType extends 'PgJson' | 'PgJsonb' | 'MySqlJson' | 'SingleStoreJson' | 'SQLiteTextJson' | 'SQLiteBlobJson'
		? IsUnknown<TData> extends true ? Type<Json> : Type<TData>
	: Type<TData>;

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
	TColumn['_']['columnType'],
	GetEnumValuesFromColumn<TColumn>
> extends infer TSchema ? TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: Type;
