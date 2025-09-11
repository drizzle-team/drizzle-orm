import type { Type, type } from 'arktype';
import type { Column, ColumnTypeData, ExtractColumnTypeData } from 'drizzle-orm';
import type { Json } from './utils.ts';

export type ArktypeNullable<TSchema> = Type<type.infer<TSchema> | null>;

export type ArktypeOptional<TSchema> = [Type<type.infer<TSchema>>, '?'];

export type GetArktypeType<
	TColumn extends Column,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = TType['constraint'] extends 'json' ? unknown extends TColumn['_']['data'] ? Type<Json> : Type<TColumn['_']['data']>
	: TType['type'] extends 'custom' ? Type<any>
	: Type<TColumn['_']['data']>;

type HandleSelectColumn<
	TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: ArktypeNullable<TSchema>;

type HandleInsertColumn<
	TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? ArktypeOptional<TSchema>
	: TSchema
	: ArktypeOptional<ArktypeNullable<TSchema>>;

type HandleUpdateColumn<
	TSchema,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? ArktypeOptional<TSchema>
	: ArktypeOptional<ArktypeNullable<TSchema>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = TType extends 'select' ? HandleSelectColumn<GetArktypeType<TColumn>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetArktypeType<TColumn>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetArktypeType<TColumn>, TColumn>
	: GetArktypeType<TColumn>;
