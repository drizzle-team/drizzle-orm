import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type { z } from 'zod/v4';
import type { GetZodType, HandleColumn } from './column.types.ts';
import type { CoerceOptions } from './schema.types.ts';
import type { ColumnIsGeneratedAlwaysAs, GetSelection } from './utils.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

type BuildRefineField<T> = T extends z.ZodType ? ((schema: T) => z.ZodType) | z.ZodType : never;

export type BuildRefine<
	TColumns extends Record<string, any>,
	TCoerce extends CoerceOptions,
> = {
	[K in keyof TColumns as TColumns[K] extends Column | SelectedFieldsFlat<Column> | Table | View ? K : never]?:
		TColumns[K] extends Column ? BuildRefineField<GetZodType<TColumns[K], TCoerce>>
			: BuildRefine<GetSelection<TColumns[K]>, TCoerce>;
};

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement,
	TColumn extends Column,
> = TRefinement extends (schema: any) => z.ZodType ? (TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
		: z.ZodNullable<ReturnType<TRefinement>>) extends infer TSchema extends z.ZodType
		? TType extends 'update' ? z.ZodOptional<TSchema> : TSchema
	: z.ZodType
	: TRefinement;

type IsRefinementDefined<
	TRefinements extends Record<string | symbol | number, any> | undefined,
	TKey extends string | symbol | number,
> = TRefinements extends object ? TRefinements[TKey] extends z.ZodType | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
	TCoerce extends CoerceOptions,
> = z.ZodObject<
	Simplify<
		{
			[
				K in keyof TColumns as ColumnIsGeneratedAlwaysAs<TColumns[K]> extends true ? TType extends 'select' ? K
					: never
					: K
			]: TColumns[K] extends infer TColumn extends Column
				? IsRefinementDefined<TRefinements, K> extends true
					? Assume<HandleRefinement<TType, TRefinements[K & keyof TRefinements], TColumn>, z.ZodType>
				: HandleColumn<TType, TColumn, TCoerce>
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View ? BuildSchema<
						TType,
						GetSelection<TObject>,
						TRefinements extends object ? TRefinements[K & keyof TRefinements] : undefined,
						TCoerce
					>
				: z.ZodAny;
		}
	>,
	{ out: {}; in: {} }
>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare
		? TRefinement[K] extends Record<string, z.ZodType> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
