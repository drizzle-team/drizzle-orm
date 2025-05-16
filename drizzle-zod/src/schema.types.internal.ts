import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type { z } from 'zod';
import type { GetZodType, HandleColumn } from './column.types.ts';
import type { ColumnIsGeneratedAlwaysAs, GetSelection } from './utils.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

type BuildRefineField<T> = T extends z.ZodTypeAny ? ((schema: T) => z.ZodTypeAny) | z.ZodTypeAny : never;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = {
	[K in keyof TColumns as TColumns[K] extends Column | SelectedFieldsFlat<Column> | Table | View ? K : never]?:
		TColumns[K] extends Column ? BuildRefineField<GetZodType<TColumns[K]>>
			: BuildRefine<GetSelection<TColumns[K]>>;
};

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement,
	TColumn extends Column,
> = TRefinement extends (schema: any) => z.ZodTypeAny ? (TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
		: z.ZodNullable<ReturnType<TRefinement>>) extends infer TSchema extends z.ZodTypeAny
		? TType extends 'update' ? z.ZodOptional<TSchema> : TSchema
	: z.ZodTypeAny
	: TRefinement;

type IsRefinementDefined<
	TRefinements extends Record<string | symbol | number, any> | undefined,
	TKey extends string | symbol | number,
> = TRefinements extends object ? TRefinements[TKey] extends z.ZodTypeAny | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = z.ZodObject<
	Simplify<
		{
			[K in keyof TColumns as ColumnIsGeneratedAlwaysAs<TColumns[K]> extends true ? never : K]: TColumns[K] extends
				infer TColumn extends Column
				? IsRefinementDefined<TRefinements, K> extends true
					? Assume<HandleRefinement<TType, TRefinements[K & keyof TRefinements], TColumn>, z.ZodTypeAny>
				: HandleColumn<TType, TColumn>
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View ? BuildSchema<
						TType,
						GetSelection<TObject>,
						TRefinements extends object ? TRefinements[K & keyof TRefinements] : undefined
					>
				: z.ZodAny;
		}
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
