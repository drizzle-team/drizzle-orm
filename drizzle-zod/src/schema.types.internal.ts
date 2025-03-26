import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type { z } from 'zod';
import type { GetBaseColumn, GetEnumValuesFromColumn, GetZodType, HandleColumn } from './column.types.ts';
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
			[K in keyof TColumns]: TColumns[K] extends infer TColumn extends Column ? GetZodType<
					TColumn['_']['data'],
					TColumn['_']['dataType'],
					GetEnumValuesFromColumn<TColumn>,
					GetBaseColumn<TColumn>
				> extends infer TSchema extends z.ZodTypeAny ? TSchema
				: z.ZodAny
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View
					? BuildRefineColumns<GetSelection<TObject>>
				: TColumns[K];
		}
	>
>;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = BuildRefineColumns<TColumns> extends infer TBuildColumns ? {
		[K in keyof TBuildColumns]?: TBuildColumns[K] extends z.ZodTypeAny
			? ((schema: TBuildColumns[K]) => z.ZodTypeAny) | z.ZodTypeAny
			: TBuildColumns[K] extends Record<string, any> ? Simplify<BuildRefine<TBuildColumns[K]>>
			: never;
	}
	: never;

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement extends z.ZodTypeAny | ((schema: z.ZodTypeAny) => z.ZodTypeAny),
	TColumn extends Column,
> = TRefinement extends (schema: any) => z.ZodTypeAny ? (TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
		: z.ZodNullable<ReturnType<TRefinement>>) extends infer TSchema
		? TType extends 'update' ? z.ZodOptional<Assume<TSchema, z.ZodTypeAny>> : TSchema
	: z.ZodTypeAny
	: TRefinement;

type IsRefinementDefined<TRefinements, TKey extends string> = TKey extends keyof TRefinements
	? TRefinements[TKey] extends z.ZodTypeAny | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = z.ZodObject<
	Simplify<
		RemoveNever<
			{
				[K in keyof TColumns]: TColumns[K] extends infer TColumn extends Column
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
					: z.ZodAny;
			}
		>
	>,
	'strip'
>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare
		? TRefinement[K] extends Record<string, z.ZodTypeAny> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
