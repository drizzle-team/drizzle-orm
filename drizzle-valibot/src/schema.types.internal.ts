import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type * as v from 'valibot';
import type { GetBaseColumn, GetEnumValuesFromColumn, GetValibotType, HandleColumn } from './column.types';
import type { GetSelection, RemoveNever } from './utils';

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
					GetEnumValuesFromColumn<TColumn>,
					GetBaseColumn<TColumn>
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
	TRefinement extends v.GenericSchema | ((schema: v.GenericSchema) => v.GenericSchema),
	TColumn extends Column,
> = TRefinement extends (schema: v.GenericSchema) => v.GenericSchema
	? TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
	: v.NullableSchema<ReturnType<TRefinement>, undefined>
	: TRefinement;

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
						? TRefinements[Assume<K, keyof TRefinements>] extends
							infer TRefinement extends v.GenericSchema | ((schema: v.GenericSchema) => v.GenericSchema)
							? HandleRefinement<TRefinement, TColumn>
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
