import { Type, type } from 'arktype';
import type { Assume, Column } from 'drizzle-orm';
import type { ColumnIsGeneratedAlwaysAs, IsEnumDefined, IsUnknown, Json } from './utils.ts';

export type ArktypeNullable<TSchema> = Type<type.infer<TSchema> | null, {}>;

export type ArktypeOptional<TSchema> = [Type<type.infer<TSchema>, {}>, '?'];

export type GetArktypeType<
	TColumn extends Column,
> = IsEnumDefined<TColumn['_']['enumValues']> extends true ? Type<Assume<TColumn['_']['enumValues'], any[]>[number]>
	: TColumn['_']['columnType'] extends
		'PgJson' | 'PgJsonb' | 'MySqlJson' | 'SingleStoreJson' | 'SQLiteTextJson' | 'SQLiteBlobJson'
		? IsUnknown<TColumn['_']['data']> extends true ? Type<Json> : Type<TColumn['_']['data']>
	: Type<TColumn['_']['data']>;

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
> = TType extends 'select' ? HandleSelectColumn<GetArktypeType<TColumn>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetArktypeType<TColumn>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetArktypeType<TColumn>, TColumn>
	: GetArktypeType<TColumn>;
