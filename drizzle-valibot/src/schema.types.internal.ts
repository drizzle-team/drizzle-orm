import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type * as v from 'valibot';
import type {
	ExtractAdditionalProperties,
	GetBaseColumn,
	GetEnumValuesFromColumn,
	GetValibotType,
	HandleColumn,
} from './column.types.ts';
import type { GetSelection, RemoveNever } from './utils.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

export type BuildRefineColumns<
	TColumns extends Record<string, any>,
> = Simplify<
	RemoveNever<
		{
			[K in keyof TColumns]: TColumns[K] extends infer TColumn extends Column ? GetValibotType<
					TColumn['_']['data'],
					TColumn['_']['dataType'],
					TColumn['_']['columnType'],
					GetEnumValuesFromColumn<TColumn>,
					GetBaseColumn<TColumn>,
					ExtractAdditionalProperties<TColumn>
				> extends infer TSchema extends v.GenericSchema ? TSchema
				: v.AnySchema
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View
					? BuildRefineColumns<GetSelection<TObject>>
				: TColumns[K];
		}
	>
>;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = BuildRefineColumns<TColumns> extends infer TBuildColumns ? {
		[K in keyof TBuildColumns]?: TBuildColumns[K] extends v.GenericSchema
			? ((schema: TBuildColumns[K]) => v.GenericSchema) | v.GenericSchema
			: TBuildColumns[K] extends Record<string, any> ? Simplify<BuildRefine<TBuildColumns[K]>>
			: never;
	}
	: never;

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement extends v.GenericSchema | ((schema: v.GenericSchema) => v.GenericSchema),
	TColumn extends Column,
> = TRefinement extends (schema: any) => v.GenericSchema ? (
		TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
			: v.NullableSchema<ReturnType<TRefinement>, undefined>
	) extends infer TSchema ? TType extends 'update' ? v.OptionalSchema<Assume<TSchema, v.GenericSchema>, undefined>
		: TSchema
	: v.AnySchema
	: TRefinement;

type IsRefinementDefined<TRefinements, TKey extends string> = TKey extends keyof TRefinements
	? TRefinements[TKey] extends v.GenericSchema | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = v.ObjectSchema<
	Simplify<
		RemoveNever<
			{
				readonly [K in keyof TColumns]: TColumns[K] extends infer TColumn extends Column
					? TRefinements extends object
						? IsRefinementDefined<TRefinements, Assume<K, string>> extends true
							? HandleRefinement<TType, TRefinements[Assume<K, keyof TRefinements>], TColumn>
						: HandleColumn<TType, TColumn>
					: HandleColumn<TType, TColumn>
					: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View ? BuildSchema<
							TType,
							GetSelection<TObject>,
							TRefinements extends object
								? TRefinements[Assume<K, keyof TRefinements>] extends infer TNestedRefinements extends object
									? TNestedRefinements
								: undefined
								: undefined
						>
					: v.AnySchema;
			}
		>
	>,
	undefined
>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare
		? TRefinement[K] extends Record<string, v.GenericSchema> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
