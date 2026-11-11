import type { ClickHouseColumnBuilder, ClickHouseColumnBuilderBase } from './common.ts';

/**
 * The type produced by {@link nullable}.
 *
 * Column builders start out with `notNull: boolean` (i.e. "unspecified"), so intersecting `false`
 * here narrows it rather than colliding with an existing `true`.
 */
export type Nullable<TBuilder extends ClickHouseColumnBuilderBase> = TBuilder & { _: { notNull: false } };

/**
 * Wraps a type in ClickHouse's `Nullable(T)`.
 *
 * Table columns follow Drizzle's usual convention — nullable unless `.notNull()` — so `nullable()` is
 * mainly for the element types of `Array`, `Map` and `Tuple`, which are non-nullable by default:
 *
 * ```ts
 * tags: array(string()),           // Array(String)
 * scores: array(nullable(int32())) // Array(Nullable(Int32))
 * ```
 */
export function nullable<TBuilder extends ClickHouseColumnBuilderBase>(builder: TBuilder): Nullable<TBuilder> {
	return (builder as unknown as ClickHouseColumnBuilder).markNullable() as unknown as Nullable<TBuilder>;
}

/**
 * The TypeScript type of a value held by `TBuilder` when used as a composite element — `| null` only
 * when it was wrapped in {@link nullable}.
 */
export type ElementData<TBuilder extends ClickHouseColumnBuilderBase> = TBuilder['_']['notNull'] extends false
	? (TBuilder['_'] extends { $type: infer U } ? U : TBuilder['_']['data']) | null
	: TBuilder['_'] extends { $type: infer U } ? U
	: TBuilder['_']['data'];
