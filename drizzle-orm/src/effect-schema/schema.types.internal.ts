import type { Schema as s } from 'effect';
import type { Struct, UndefinedOr } from 'effect/Schema';
import type { Schema } from 'effect/Schema';
import type { Column } from '~/column.ts';
import type { SelectedFieldsFlat } from '~/operations.ts';
import type { View } from '~/sql/sql.ts';
import type { Table } from '~/table.ts';
import type { Assume, DrizzleTypeError, Simplify } from '~/utils.ts';
import type { ColumnIsGeneratedAlwaysAs, GetSelection } from '../utils.ts';
import type { GetEffectSchemaType, HandleColumn } from './column.types.ts';

export interface Conditions {
	never: (column?: Column) => boolean;
	optional: (column: Column) => boolean;
	nullable: (column: Column) => boolean;
}

type BuildRefineField<T> = T extends Schema.Any ? ((schema: T) => Schema.Any) | Schema.Any
	: never;

export type BuildRefine<
	TColumns extends Record<string, any>,
> = {
	[K in keyof TColumns as TColumns[K] extends Column | SelectedFieldsFlat<Column> | Table | View ? K : never]?:
		TColumns[K] extends Column ? BuildRefineField<GetEffectSchemaType<TColumns[K]>>
			: BuildRefine<GetSelection<TColumns[K]>>;
};

type HandleRefinement<
	TType extends 'select' | 'insert' | 'update',
	TRefinement,
	TColumn extends Column,
> = TRefinement extends (((schema: any) => infer R extends Schema.Any)) ? (TColumn['_']['notNull'] extends true ? R
		: (s.NullOr<R>)) extends infer TSchema extends Schema.Any
		? TType extends 'update' ? s.optional<UndefinedOr<TSchema>>
		: TSchema
	: typeof s.Any
	: TRefinement;

type IsRefinementDefined<
	TRefinements extends Record<string | symbol | number, any> | undefined,
	TKey extends string | symbol | number,
> = TRefinements extends object
	? TRefinements[TKey] extends
		Schema.Any | s.optional<Schema.Any> | s.optionalWith<Schema.Any, any> | ((schema: any) => any) ? true
	: false
	: false;

export type BuildSchema<
	TType extends 'select' | 'insert' | 'update',
	TColumns extends Record<string, any>,
	TRefinements extends Record<string, any> | undefined,
> = Struct<
	Simplify<
		{
			[
				K in keyof TColumns as ColumnIsGeneratedAlwaysAs<TColumns[K]> extends true ? TType extends 'select' ? K
					: never
					: K
			]: TColumns[K] extends infer TColumn extends Column ? IsRefinementDefined<TRefinements, K> extends true ? Assume<
						HandleRefinement<TType, TRefinements[K & keyof TRefinements], TColumn>,
						Schema.Any | s.optional<Schema.Any> | s.optionalWith<Schema.Any, any>
					>
				: HandleColumn<TType, TColumn>
				: TColumns[K] extends infer TObject extends SelectedFieldsFlat<Column> | Table | View ? BuildSchema<
						TType,
						GetSelection<TObject>,
						TRefinements extends object ? TRefinements[K & keyof TRefinements] : undefined
					>
				: typeof s.Any;
		}
	>
>;

export type NoUnknownKeys<
	TRefinement extends Record<string, any>,
	TCompare extends Record<string, any>,
> = {
	[K in keyof TRefinement]: K extends keyof TCompare
		? TRefinement[K] extends Record<string, Schema.Any> ? NoUnknownKeys<TRefinement[K], TCompare[K]>
		: TRefinement[K]
		: DrizzleTypeError<`Found unknown key in refinement: "${K & string}"`>;
};
