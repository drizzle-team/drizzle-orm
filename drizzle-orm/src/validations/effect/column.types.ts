import type { Schema as s } from 'effect';
import type { Array$, Literal, NullOr, optional, Schema, Struct, Tuple, Tuple2, UndefinedOr } from 'effect/Schema';
import type { ColumnTypeData, ExtractColumnTypeData } from '~/column-builder.ts';
import type { Column } from '~/column.ts';
import type { Assume } from '~/utils.ts';
import type { bigintStringModeSchema, bufferSchema, jsonSchema, unsignedBigintStringModeSchema } from './column.ts';

type GetArrayDepth<T, Depth extends number = 0> = Depth extends 5 ? 5
	: T extends readonly (infer U)[] ? GetArrayDepth<U, [1, 2, 3, 4, 5][Depth]>
	: Depth;

type WrapInEffectSchemaArray<TSchema extends Schema.Any, TDepth extends number> = TDepth extends 0 ? TSchema
	: TDepth extends 1 ? Array$<TSchema>
	: TDepth extends 2 ? Array$<Array$<TSchema>>
	: TDepth extends 3 ? Array$<Array$<Array$<TSchema>>>
	: TDepth extends 4 ? Array$<Array$<Array$<Array$<TSchema>>>>
	: TDepth extends 5 ? Array$<Array$<Array$<Array$<Array$<TSchema>>>>>
	: Array$<typeof s.Any>;

type IsPgArrayColumn<TColumn extends Column<any>, TType extends ColumnTypeData> = TType['type'] extends 'array' ? false // Already handled as explicit array type
	: GetArrayDepth<TColumn['_']['data']> extends 0 ? false
	: true;

export type GetEffectSchemaType<
	TColumn extends Column<any>,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = IsPgArrayColumn<TColumn, TType> extends true ? WrapInEffectSchemaArray<
		GetBaseEffectSchemaType<TColumn, TType>,
		GetArrayDepth<TColumn['_']['data']>
	>
	: GetBaseEffectSchemaType<TColumn, TType>;

type GetBaseEffectSchemaType<
	TColumn extends Column<any>,
	TType extends ColumnTypeData = ExtractColumnTypeData<TColumn['_']['dataType']>,
> = TType['type'] extends 'array'
	? TType['constraint'] extends 'geometry' | 'point' ? Tuple2<typeof s.Number, typeof s.Number>
	: TType['constraint'] extends 'line' ? Tuple<[typeof s.Number, typeof s.Number, typeof s.Number]>
	: TType['constraint'] extends 'vector' | 'halfvector' ? Array$<typeof s.Number>
	: TType['constraint'] extends 'int64vector' ? Array$<typeof s.BigIntFromSelf>
	: TType['constraint'] extends 'basecolumn'
		? TColumn['_'] extends { baseColumn: infer TBaseColumn extends Column<any> }
			? Array$<Assume<GetEffectSchemaType<TBaseColumn>, Schema.Any>>
		: never
	: Array$<typeof s.Any>
	: TType['type'] extends 'object' ? TType['constraint'] extends 'date' ? typeof s.Date
		: TType['constraint'] extends 'buffer' ? typeof bufferSchema
		: TType['constraint'] extends 'point' | 'geometry' ? Struct<{ x: typeof s.Number; y: typeof s.Number }>
		: TType['constraint'] extends 'line' ? Struct<{ x: typeof s.Number; y: typeof s.Number; z: typeof s.Number }>
		: TType['constraint'] extends 'json' ? typeof jsonSchema
		: typeof s.Object
	: TType['type'] extends 'custom' ? typeof s.Any
	: TType['type'] extends 'number'
		? (TType['constraint'] extends
			'int8' | 'int16' | 'int24' | 'int32' | 'int53' | 'uint8' | 'uint16' | 'uint24' | 'uint32' | 'uint53' | 'year'
			? typeof s.Int
			: typeof s.Number)
	: TType['type'] extends 'bigint' ? typeof s.BigIntFromSelf
	: TType['type'] extends 'boolean' ? typeof s.Boolean
	: TType['type'] extends 'string' ? TType['constraint'] extends 'uuid' ? typeof s.UUID
		: TType['constraint'] extends 'enum' ? Literal<TColumn['enumValues']>
		: TType['constraint'] extends 'int64' ? typeof bigintStringModeSchema
		: TType['constraint'] extends 'uint64' ? typeof unsignedBigintStringModeSchema
		: typeof s.String
	: typeof s.Any;

type HandleSelectColumn<
	TSchema extends Schema.Any,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TSchema
	: NullOr<TSchema>;

type HandleInsertColumn<
	TSchema extends Schema.Any,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? optional<UndefinedOr<TSchema>>
	: TSchema
	: optional<UndefinedOr<NullOr<TSchema>>>;

type HandleUpdateColumn<
	TSchema extends Schema.Any,
	TColumn extends Column,
> = TColumn['_']['notNull'] extends true ? optional<UndefinedOr<TSchema>>
	: optional<UndefinedOr<NullOr<TSchema>>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = TType extends 'select' ? HandleSelectColumn<GetEffectSchemaType<TColumn>, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<GetEffectSchemaType<TColumn>, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<GetEffectSchemaType<TColumn>, TColumn>
	: GetEffectSchemaType<TColumn>;
