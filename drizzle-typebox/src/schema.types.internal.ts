import type * as t from '@sinclair/typebox';
import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Simplify, Table, View } from 'drizzle-orm';
import type { GetBaseColumn, GetEnumValuesFromColumn, GetTypeboxType, HandleColumn } from './column.types.ts';
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
			[K in keyof TColumns]: TColumns[K] extends infer TColumn extends Column ? GetTypeboxType<
					TColumn['_']['data'],
					TColumn['_']['dataType'],
					TColumn['_']['columnType'],
					GetEnumValuesFromColumn<TColumn>,
					GetBaseColumn<TColumn>
				> extends infer TSchema extends t.TSchema ? TSchema
				: t.TAny
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View
					? BuildRefineColumns<GetSelection<TObject>>
				: TColumns[K];
		}
	>
>;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = BuildRefineColumns<TColumns> extends infer TBuildColumns ? {
		[K in keyof TBuildColumns]?: TBuildColumns[K] extends t.TSchema
			? ((schema: TBuildColumns[K]) => t.TSchema) | t.TSchema
			: TBuildColumns[K] extends Record<string, any> ? Simplify<BuildRefine<TBuildColumns[K]>>
			: never;
	}
	: never;

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement extends t.TSchema | ((schema: t.TSchema) => t.TSchema),
	TColumn extends Column,
> = TRefinement extends (schema: any) => t.TSchema ? (TColumn['_']['notNull'] extends true ? ReturnType<TRefinement>
		: t.TUnion<[ReturnType<TRefinement>, t.TNull]>) extends infer TSchema
		? TType extends 'update' ? t.TOptional<Assume<TSchema, t.TSchema>> : TSchema
	: t.TSchema
	: TRefinement;

type IsRefinementDefined<TRefinements, TKey extends string> = TKey extends keyof TRefinements
	? TRefinements[TKey] extends t.TSchema | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = t.TObject<
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
					: t.TAny;
			}
		>
	>
>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare ? TRefinement[K] extends t.TSchema ? TRefinement[K]
		: TRefinement[K] extends Record<string, t.TSchema> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
