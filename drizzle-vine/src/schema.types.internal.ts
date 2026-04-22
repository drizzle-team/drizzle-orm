import type { VineObject } from '@vinejs/vine';
import type { Infer, SchemaTypes } from '@vinejs/vine/types';
import type { Assume, Column, DrizzleTypeError, SelectedFieldsFlat, Table, View } from 'drizzle-orm';
import type { GetVineType } from './column.types.ts';
import type { ColumnIsGeneratedAlwaysAs, GetSelection } from './utils.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

type BuildRefineField<T> = T extends SchemaTypes ? ((schema: T) => SchemaTypes) | SchemaTypes : never;

export type BuildRefine<TColumns extends Record<string, any>> = {
	[K in keyof TColumns as TColumns[K] extends Column | SelectedFieldsFlat<Column> | Table | View ? K : never]?:
		TColumns[K] extends Column ? BuildRefineField<GetVineType<TColumns[K]>>
			: BuildRefine<GetSelection<TColumns[K]>>;
};

type IsRefinementDefined<
	TRefinements extends Record<string | symbol | number, any> | undefined,
	TKey extends string | symbol | number,
> = TRefinements extends object ? TRefinements[TKey] extends SchemaTypes | ((schema: any) => any) ? true
	: false
	: false;

// ---------------------------------------------------------------------------
// Direct output-type computation — avoids the expensive
// "infer return type of nullable()/optional()" modifier-chain per column.
// ---------------------------------------------------------------------------

/** Base TypeScript output type for a column's VineJS schema (no null/undefined). */
type ColumnBaseOutput<TColumn extends Column> = GetVineType<TColumn> extends infer S extends SchemaTypes ? Infer<S>
	: any;

/** Apply nullable/optional semantics via arithmetic unions (no modifier inference). */
type HandleColumnOutput<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = ColumnBaseOutput<TColumn> extends infer Out
	? TType extends 'select' ? TColumn['_']['notNull'] extends true ? Out : Out | null
	: TType extends 'insert'
		? TColumn['_']['notNull'] extends true ? TColumn['_']['hasDefault'] extends true ? Out | undefined : Out
		: Out | null | undefined
		// update: always optional
	: TColumn['_']['notNull'] extends true ? Out | undefined
	: Out | null | undefined
	: any;

/**
 * Output type for a refined column.
 * - Function refinements: extract the return type, apply null/optional via unions.
 * - Literal schema refinements (`vine.string()`): use Infer<> as-is (no wrapping).
 */
type HandleRefinementOutput<
	TType extends 'select' | 'insert' | 'update',
	TRefinement,
	TColumn extends Column,
> = TRefinement extends (schema: any) => SchemaTypes
	? Infer<ReturnType<TRefinement>> extends infer BaseOut
		? TColumn['_']['notNull'] extends true ? TType extends 'update' ? BaseOut | undefined : BaseOut
		: TType extends 'update' ? BaseOut | null | undefined
		: BaseOut | null
	: never
	: TRefinement extends SchemaTypes ? Infer<TRefinement>
	: any;

// ---------------------------------------------------------------------------
// Output properties — single pass over columns producing TypeScript types.
// ---------------------------------------------------------------------------
type BuildOutputProperties<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = {
	-readonly [
		K in keyof TColumns as ColumnIsGeneratedAlwaysAs<TColumns[K]> extends true ? TType extends 'select' ? K
			: never
			: K
	]: TColumns[K] extends infer TColumn extends Column
		? IsRefinementDefined<TRefinements, Assume<K, string>> extends true
			? HandleRefinementOutput<TType, TRefinements[K & keyof TRefinements], TColumn>
		: HandleColumnOutput<TType, TColumn>
		: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View ? Infer<
				BuildSchema<
					TType,
					GetSelection<TObject>,
					TRefinements extends object ? TRefinements[K & keyof TRefinements] : undefined
				>
			>
		: any;
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Construct the full VineObject type.
 *
 * Properties is `Record<string, SchemaTypes>` — the concrete shape is determined
 * at runtime by `schema.ts`. The Output / CamelCaseOutput parameters carry the
 * TypeScript output types computed via a single, direct pass over the columns
 * (no NullableModifier / OptionalModifier wrapper-chain inference needed).
 * Input is `any` (InferInput<> is rarely used).
 *
 * Refinement callback parameter types (e.g. `(schema: VineNumber) => ...`) are
 * provided through `BuildRefine`, which is computed independently from `TColumns`.
 */
export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = BuildOutputProperties<TType, TColumns, TRefinements> extends infer O extends Record<string, any>
	? VineObject<Record<string, SchemaTypes>, any, O, O>
	: VineObject<Record<string, SchemaTypes>, any, any, any>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare
		? TRefinement[K] extends Record<string, SchemaTypes> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
