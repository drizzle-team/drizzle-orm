import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type * as v from 'valibot';
import type { GetValibotTypeFromColumn, HandleColumn } from './column.types.ts';
import type { ColumnIsGeneratedAlwaysAs, GetSelection } from './utils.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

type BuildRefineField<T> = T extends v.GenericSchema ? ((schema: T) => v.GenericSchema) | v.GenericSchema : never;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = {
	[
		K in keyof TColumns as TColumns[K] extends Column | SelectedFieldsFlat<Column> | Table | View ? K
			: never
	]?: TColumns[K] extends Column ? BuildRefineField<
			GetValibotTypeFromColumn<
				TColumns[K]
			>
		>
		: BuildRefine<GetSelection<TColumns[K]>>;
};

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement,
	TColumn extends Column,
> = TRefinement extends (schema: any) => v.GenericSchema ? (
		TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
			: v.NullableSchema<ReturnType<TRefinement>, undefined>
	) extends infer TSchema ? TType extends 'update' ? v.OptionalSchema<Assume<TSchema, v.GenericSchema>, undefined>
		: TSchema
	: v.AnySchema
	: TRefinement;

type IsRefinementDefined<
	TRefinements extends Record<string | symbol | number, any> | undefined,
	TKey extends string | symbol | number,
> = TRefinements extends object ? TRefinements[TKey] extends v.GenericSchema | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = v.ObjectSchema<
	Simplify<
		{
			readonly [
				K in keyof TColumns as ColumnIsGeneratedAlwaysAs<TColumns[K]> extends true ? TType extends 'select' ? K
					: never
					: K
			]: TColumns[K] extends infer TColumn extends Column
				? IsRefinementDefined<TRefinements, Assume<K, string>> extends true
					? Assume<HandleRefinement<TType, TRefinements[K & keyof TRefinements], TColumn>, v.GenericSchema>
				: HandleColumn<TType, TColumn>
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View ? BuildSchema<
						TType,
						GetSelection<TObject>,
						TRefinements extends object ? TRefinements[K & keyof TRefinements] : undefined
					>
				: v.AnySchema;
		}
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
