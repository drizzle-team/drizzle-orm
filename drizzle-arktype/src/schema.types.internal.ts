import type { Type, type } from 'arktype';
import type { Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type { ArktypeNullable, ArktypeOptional, GetArktypeType, HandleColumn } from './column.types.ts';
import type { GetSelection, RemoveNever } from './utils.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

type GenericSchema = type.cast<unknown> | [type.cast<unknown>, '?'];

type BuildRefineField<T> = T extends GenericSchema ? ((schema: T) => GenericSchema) | GenericSchema : never;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = RemoveNever<
	{
		[K in keyof TColumns]?: TColumns[K] extends Column ? BuildRefineField<GetArktypeType<TColumns[K]>>
			: TColumns[K] extends SelectedFieldsFlat<Column> | Table | View ? BuildRefine<GetSelection<TColumns[K]>>
			: never;
	}
>;

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement,
	TColumn extends Column,
> = TRefinement extends (schema: any) => GenericSchema ? (
		TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
			: ArktypeNullable<ReturnType<TRefinement>>
	) extends infer TSchema ? TType extends 'update' ? ArktypeOptional<TSchema>
		: TSchema
	: Type<any, {}>
	: TRefinement;

type IsRefinementDefined<
	TRefinements extends Record<string | symbol | number, any> | undefined,
	TKey extends string | symbol | number,
> = TRefinements extends object ? TRefinements[TKey] extends GenericSchema | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = type.instantiate<
	Simplify<
		RemoveNever<
			{
				readonly [K in keyof TColumns]: TColumns[K] extends infer TColumn extends Column
					? IsRefinementDefined<TRefinements, K> extends true
						? HandleRefinement<TType, TRefinements[K & keyof TRefinements], TColumn>
					: HandleColumn<TType, TColumn>
					: TColumns[K] extends SelectedFieldsFlat<Column> | Table | View ? BuildSchema<
							TType,
							GetSelection<TColumns[K]>,
							TRefinements extends object
								? TRefinements[K & keyof TRefinements] extends infer TNestedRefinements extends object
									? TNestedRefinements
								: undefined
								: undefined
						>
					: any;
			}
		>
	>
>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare
		? TRefinement[K] extends Record<string, GenericSchema> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
