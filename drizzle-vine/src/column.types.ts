import type {
	BaseLiteralType,
	VineAny,
	VineArray,
	VineBoolean,
	VineDate,
	VineEnum,
	VineNumber,
	VineObject,
	VineString,
} from '@vinejs/vine';
import type { Assume, Column } from 'drizzle-orm';
import type { IsEnumDefined, IsNever } from './utils.ts';

/**
 * A phantom VineJS schema type for JSON columns with a known TypeScript type via `.$type<T>()`.
 * At runtime, `vine.any()` is used — no extra validation is applied.
 * At the type level, `Infer<VineJsonTyped<T>>` resolves to `T`.
 *
 * We re-use `BaseLiteralType<Input, Output, CamelCaseOutput>` so that its generic `Output`
 * parameter carries `T` through the VineJS symbol-keyed inference system without needing
 * to import the internal OTYPE/ITYPE/COTYPE unique symbols directly.
 */
type VineJsonTyped<T> = BaseLiteralType<T | undefined, T, T>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export type HasBaseColumn<TColumn> = TColumn extends { _: { baseColumn: Column | undefined } }
	? IsNever<TColumn['_']['baseColumn']> extends false ? true
	: false
	: false;

/**
 * VineJS does not support bigint natively. Columns whose TypeScript data type
 * is `bigint` will be typed as `VineAny` at the type level (and produce
 * `vine.any()` at runtime).
 * Use the `refine` option to supply a custom schema if needed.
 */
export type VineBigIntUnsupported = VineAny;

/**
 * VineJS does not support Node.js Buffer natively. Buffer columns will be
 * typed as `VineAny` at the type level (and produce `vine.any()` at runtime).
 * Use the `refine` option to supply a custom schema if needed.
 */
export type VineBufferUnsupported = VineAny;

// ---------------------------------------------------------------------------
// Per-column VineJS schema type
// ---------------------------------------------------------------------------

/**
 * Maps a Drizzle column type to its corresponding VineJS schema type.
 *
 * Non-straightforward mappings:
 * - `bigint` columns → `VineAny` (no native bigint in VineJS)
 * - `buffer` columns → `VineAny` (no native Buffer in VineJS)
 * - Geometric tuple columns (PgGeometry, PgLine…) → `VineArray<VineNumber>`
 *   (VineJS has no fixed-arity tuple type analogous to Zod's z.tuple())
 * - JSON columns → `VineAny`
 */
export type GetVineType<TColumn extends Column> =
	// ── Enum ──────────────────────────────────────────────────────────────
	IsEnumDefined<TColumn['_']['enumValues']> extends true
		? VineEnum<Assume<TColumn['_']['enumValues'], readonly [string, ...string[]]>>
		// ── PgUUID ────────────────────────────────────────────────────────────
		: TColumn['_']['columnType'] extends 'PgUUID' ? VineString
		// ── Geometric tuple types (approximated as arrays of numbers) ─────────
		: TColumn['_']['columnType'] extends 'PgGeometry' | 'PgPointTuple' ? VineArray<VineNumber>
		: TColumn['_']['columnType'] extends 'PgLine' ? VineArray<VineNumber>
		// ── Geometric object types ────────────────────────────────────────────
		: TColumn['_']['columnType'] extends 'PgGeometryObject' | 'PgPointObject' ? VineObject<
				{ x: VineNumber; y: VineNumber },
				{ x: number; y: number },
				{ x: number; y: number },
				{ x: number; y: number }
			>
		: TColumn['_']['columnType'] extends 'PgLineABC' ? VineObject<
				{ a: VineNumber; b: VineNumber; c: VineNumber },
				{ a: number; b: number; c: number },
				{ a: number; b: number; c: number },
				{ a: number; b: number; c: number }
			>
		// ── Vector / HalfVector ───────────────────────────────────────────────
		: TColumn['_']['columnType'] extends 'PgHalfVector' | 'PgVector' ? VineArray<VineNumber>
		// ── PgArray (recursive) ───────────────────────────────────────────────
		: HasBaseColumn<TColumn> extends true ? VineArray<GetVineType<Assume<TColumn['_']['baseColumn'], Column>>>
		// ── Generic array dataType ────────────────────────────────────────────
		: TColumn['_']['dataType'] extends 'array' ? VineArray<VineAny>
		// ── Primitives ────────────────────────────────────────────────────────
		: TColumn['_']['data'] extends Date ? VineDate
		: TColumn['_']['data'] extends Buffer ? VineBufferUnsupported
		: TColumn['_']['dataType'] extends 'number' ? VineNumber
		: TColumn['_']['dataType'] extends 'bigint' ? VineBigIntUnsupported
		: TColumn['_']['dataType'] extends 'boolean' ? VineBoolean
		: TColumn['_']['dataType'] extends 'string' ? VineString
		// ── JSON with $type<T>() ──────────────────────────────────────────────
		: TColumn['_']['dataType'] extends 'json'
			? [unknown] extends [TColumn['_']['data']] ? VineAny : VineJsonTyped<TColumn['_']['data']>
		// ── custom / buffer fallback ──────────────────────────────────────────
		: VineAny;

// ---------------------------------------------------------------------------
// Select / insert / update wrappers
// Nullable / optional are expressed via ReturnType<T['nullable']> and
// ReturnType<T['optional']> so we don't need to import the internal
// NullableModifier / OptionalModifier classes directly.
// ---------------------------------------------------------------------------

type Nullable<TSchema> = TSchema extends { nullable(): infer R } ? R : TSchema;
type Optional<TSchema> = TSchema extends { optional(): infer R } ? R : TSchema;

type HandleSelectColumn<TSchema, TColumn extends Column> = TColumn['_']['notNull'] extends true ? TSchema
	: Nullable<TSchema>;

type HandleInsertColumn<TSchema, TColumn extends Column> = TColumn['_']['notNull'] extends true
	? TColumn['_']['hasDefault'] extends true ? Optional<TSchema>
	: TSchema
	: Optional<Nullable<TSchema>>;

type HandleUpdateColumn<TSchema, TColumn extends Column> = TColumn['_']['notNull'] extends true ? Optional<TSchema>
	: Optional<Nullable<TSchema>>;

export type HandleColumn<
	TType extends 'select' | 'insert' | 'update',
	TColumn extends Column,
> = GetVineType<TColumn> extends infer TSchema ? TType extends 'select' ? HandleSelectColumn<TSchema, TColumn>
	: TType extends 'insert' ? HandleInsertColumn<TSchema, TColumn>
	: TType extends 'update' ? HandleUpdateColumn<TSchema, TColumn>
	: TSchema
	: VineAny;
