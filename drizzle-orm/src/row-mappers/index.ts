import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import type { BuildRelationalQueryResult } from '~/relations.ts';
import { noopDecoder, SQL, type SQLWrapper, View } from '~/sql/sql.ts';
import { Table } from '~/table.ts';

/**
 * Type for the selection structure used by row mappers.
 */
export type RowMapperSelection = BuildRelationalQueryResult['selection'];

/**
 * Result of a row mapper generator.
 * Contains the mapper function and metadata about the expected input format.
 */
export interface RowMapperResult {
	/** The mapper function that transforms ALL raw rows into typed objects in a single call */
	mapper:
		| ((rows: Record<string, unknown>[]) => Record<string, unknown>[])
		| ((rows: unknown[][]) => Record<string, unknown>[]);
	/** Whether this mapper expects array-mode input (from .values()) */
	isArrayMode: boolean;
	/** The generated function body code (for debugging purposes) */
	code?: string;
}

/**
 * A function that generates a row mapper for a given selection.
 * The row mapper transforms raw database rows into properly typed objects.
 */
export type RowMapperGenerator = (
	selection: RowMapperSelection,
	parseJson: boolean,
) => RowMapperResult;

// ============================================================================
// JIT Row Mapper (uses new Function for best performance)
// ============================================================================

function resolveDecoder(
	field: RowMapperSelection[number]['field'],
): ((value: unknown) => unknown) | null {
	let decoder: { mapFromDriverValue: (v: unknown) => unknown; mapFromJsonValue?: (v: unknown) => unknown };

	if (is(field, Column)) {
		decoder = field;
	} else if (is(field, SQL)) {
		decoder = field.decoder;
	} else if (is(field, SQL.Aliased)) {
		decoder = field.sql.decoder;
	} else if (is(field, Table) || is(field, View)) {
		return null;
	} else {
		decoder = (field as SQLWrapper).getSQL().decoder;
	}

	if (decoder.mapFromDriverValue === noopDecoder.mapFromDriverValue) {
		return null;
	}

	return 'mapFromJsonValue' in decoder && decoder.mapFromJsonValue
		? (decoder.mapFromJsonValue as (value: unknown) => unknown).bind(decoder)
		: decoder.mapFromDriverValue.bind(decoder);
}

function generateObjectCode(
	selection: RowMapperSelection,
	decoders: ((value: unknown) => unknown)[],
	rowVar: string,
	parseJson: boolean,
): string {
	const props: string[] = [];

	for (const item of selection) {
		const key = item.key;
		const keyLiteral = JSON.stringify(key);
		const accessor = `${rowVar}[${keyLiteral}]`;

		if (item.selection) {
			const innerVar = `i${decoders.length}`;
			const innerObject = generateObjectCode(item.selection, decoders, innerVar, false);

			let nestedCode: string;
			if (item.isArray) {
				nestedCode = `((a) => {
          const l = a.length, r = Array.from({ length: l });
          for (let j = 0; j < l; j++) { const ${innerVar} = a[j]; r[j] = ${innerObject}; }
          return r;
        })`;
			} else {
				nestedCode = `((${innerVar}) => (${innerObject}))`;
			}

			if (parseJson) {
				props.push(`${keyLiteral}: ${accessor} === null ? null : ((v) => {
          const p = JSON.parse(v);
          return p === null ? null : ${nestedCode}(p);
        })(${accessor})`);
			} else {
				props.push(`${keyLiteral}: ${accessor} === null ? null : ${nestedCode}(${accessor})`);
			}
		} else {
			const decoder = resolveDecoder(item.field);
			if (decoder === null) {
				props.push(`${keyLiteral}: ${accessor}`);
			} else {
				const idx = decoders.length;
				decoders.push(decoder);
				props.push(`${keyLiteral}: d[${idx}](${accessor})`);
			}
		}
	}

	return `{ ${props.join(', ')} }`;
}

/**
 * JIT-compiled row mapper generator.
 * Uses `new Function()` to generate optimized mapping code at prepare time.
 *
 * **Note:** This mapper does NOT work in environments that restrict dynamic code evaluation,
 * such as Cloudflare Workers, Deno Deploy, or Vercel Edge Functions.
 * Use `interpretedRowMapper` in those environments.
 *
 * @example
 * ```ts
 * import { jitRowMapper } from 'drizzle-orm/row-mappers';
 *
 * const db = drizzle({
 *   client,
 *   schema,
 *   relations,
 *   rowMapperGenerator: jitRowMapper,
 * });
 * ```
 */
export const jitRowMapper: RowMapperGenerator = (
	selection: RowMapperSelection,
	parseJson: boolean,
): RowMapperResult => {
	const decoders: ((value: unknown) => unknown)[] = [];
	const objectCode = generateObjectCode(selection, decoders, 'r', parseJson);

	// Generate batch processing code - mutates rows in-place to avoid allocation
	const batchCode = `const l = rows.length;
for (let i = 0; i < l; i++) {
  const r = rows[i];
  rows[i] = ${objectCode};
}
return rows;`;

	const fn = decoders.length > 0
		? new Function('rows', 'd', batchCode) as (
			rows: Record<string, unknown>[],
			decoders: ((v: unknown) => unknown)[],
		) => Record<string, unknown>[]
		: new Function('rows', batchCode) as (rows: Record<string, unknown>[]) => Record<string, unknown>[];

	return {
		mapper: decoders.length > 0
			? (rows: Record<string, unknown>[]) =>
				(fn as (rows: Record<string, unknown>[], d: ((v: unknown) => unknown)[]) => Record<string, unknown>[])(
					rows,
					decoders,
				)
			: fn as (rows: Record<string, unknown>[]) => Record<string, unknown>[],
		isArrayMode: false,
		code: batchCode,
	};
};

// ============================================================================
// Interpreted Row Mapper (works in all environments)
// ============================================================================

function mapRowInterpreted(
	row: Record<string, unknown>,
	selection: RowMapperSelection,
	parseJson: boolean,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const item of selection) {
		const key = item.key;
		let value = row[key];

		if (item.selection) {
			// Nested relation
			if (value === null) {
				result[key] = null;
			} else {
				if (parseJson && typeof value === 'string') {
					value = JSON.parse(value);
					if (value === null) {
						result[key] = null;
						continue;
					}
				}

				if (item.isArray) {
					const arr = value as Record<string, unknown>[];
					const mapped: Record<string, unknown>[] = [];
					for (let i = 0; i < arr.length; i++) {
						mapped[i] = mapRowInterpreted(arr[i]!, item.selection, false);
					}
					result[key] = mapped;
				} else {
					result[key] = mapRowInterpreted(value as Record<string, unknown>, item.selection, false);
				}
			}
		} else {
			// Leaf field
			if (value === null) {
				result[key] = null;
			} else {
				const decoder = resolveDecoder(item.field);
				result[key] = decoder ? decoder(value) : value;
			}
		}
	}

	return result;
}

/**
 * Interpreted row mapper generator.
 * Uses a recursive function to map rows at runtime.
 *
 * This mapper works in ALL JavaScript environments, including those that
 * restrict dynamic code evaluation (Cloudflare Workers, Deno Deploy, Vercel Edge Functions).
 *
 * Performance is slightly slower than `jitRowMapper`, but the difference
 * is negligible for most use cases.
 *
 * @example
 * ```ts
 * import { interpretedRowMapper } from 'drizzle-orm/row-mappers';
 *
 * const db = drizzle({
 *   client,
 *   schema,
 *   relations,
 *   rowMapperGenerator: interpretedRowMapper,
 * });
 * ```
 */
export const interpretedRowMapper: RowMapperGenerator = (
	selection: RowMapperSelection,
	parseJson: boolean,
): RowMapperResult => {
	return {
		mapper: (rows: Record<string, unknown>[]) => {
			const l = rows.length;
			for (let i = 0; i < l; i++) {
				rows[i] = mapRowInterpreted(rows[i]!, selection, parseJson);
			}
			return rows;
		},
		isArrayMode: false,
		code: '[interpreted mode - no generated code]',
	};
};

/**
 * Default row mapper generator.
 * Currently uses the JIT mapper for best performance.
 */
export const defaultRowMapper: RowMapperGenerator = jitRowMapper;

// ============================================================================
// JIT Array-Mode Row Mapper (uses new Function + .values() for best performance)
// ============================================================================

function generateArrayObjectCode(
	selection: RowMapperSelection,
	decoders: ((value: unknown) => unknown)[],
	rowVar: string,
	indexRef: { value: number },
	parseJson: boolean,
): string {
	const props: string[] = [];

	for (const item of selection) {
		const key = item.key;
		const keyLiteral = JSON.stringify(key);

		if (item.selection) {
			// Nested relations are still accessed by key (they come as JSON objects)
			const idx = indexRef.value++;
			const accessor = `${rowVar}[${idx}]`;
			const innerVar = `i${decoders.length}`;
			// Nested objects still use key-based access since they're parsed JSON
			const innerObject = generateObjectCode(item.selection, decoders, innerVar, false);

			let nestedCode: string;
			if (item.isArray) {
				nestedCode = `((a) => {
          const l = a.length, r = Array.from({ length: l });
          for (let j = 0; j < l; j++) { const ${innerVar} = a[j]; r[j] = ${innerObject}; }
          return r;
        })`;
			} else {
				nestedCode = `((${innerVar}) => (${innerObject}))`;
			}

			if (parseJson) {
				props.push(`${keyLiteral}: ${accessor} === null ? null : ((v) => {
          const p = JSON.parse(v);
          return p === null ? null : ${nestedCode}(p);
        })(${accessor})`);
			} else {
				props.push(`${keyLiteral}: ${accessor} === null ? null : ${nestedCode}(${accessor})`);
			}
		} else {
			// Leaf field - access by index
			const idx = indexRef.value++;
			const accessor = `${rowVar}[${idx}]`;
			const decoder = resolveDecoder(item.field);
			if (decoder === null) {
				props.push(`${keyLiteral}: ${accessor}`);
			} else {
				const decoderIdx = decoders.length;
				decoders.push(decoder);
				props.push(`${keyLiteral}: d[${decoderIdx}](${accessor})`);
			}
		}
	}

	return `{ ${props.join(', ')} }`;
}

/**
 * JIT-compiled array-mode row mapper generator.
 * Uses `new Function()` to generate optimized mapping code that works with
 * array-based rows from `.values()` queries for maximum performance.
 *
 * This mapper expects the driver to return rows as arrays (e.g., `[1, "John", "2024-01-01"]`)
 * instead of objects (e.g., `{id: 1, name: "John", createdAt: "2024-01-01"}`).
 *
 * **Note:** This mapper does NOT work in environments that restrict dynamic code evaluation,
 * such as Cloudflare Workers, Deno Deploy, or Vercel Edge Functions.
 *
 * @example
 * ```ts
 * import { jitArrayRowMapper } from 'drizzle-orm/row-mappers';
 *
 * const db = drizzle({
 *   client,
 *   schema,
 *   relations,
 *   rowMapperGenerator: jitArrayRowMapper,
 * });
 * ```
 */
export const jitArrayRowMapper: RowMapperGenerator = (
	selection: RowMapperSelection,
	parseJson: boolean,
): RowMapperResult => {
	const decoders: ((value: unknown) => unknown)[] = [];
	const indexRef = { value: 0 };
	const objectCode = generateArrayObjectCode(selection, decoders, 'r', indexRef, parseJson);

	// Generate batch processing code - mutates rows in-place to avoid allocation
	const batchCode = `const l = rows.length;
for (let i = 0; i < l; i++) {
  const r = rows[i];
  rows[i] = ${objectCode};
}
return rows;`;

	const fn = decoders.length > 0
		? new Function('rows', 'd', batchCode) as (
			rows: unknown[][],
			decoders: ((v: unknown) => unknown)[],
		) => Record<string, unknown>[]
		: new Function('rows', batchCode) as (rows: unknown[][]) => Record<string, unknown>[];

	return {
		mapper: decoders.length > 0
			? (rows: unknown[][]) =>
				(fn as (rows: unknown[][], d: ((v: unknown) => unknown)[]) => Record<string, unknown>[])(rows, decoders)
			: fn as (rows: unknown[][]) => Record<string, unknown>[],
		isArrayMode: true,
		code: batchCode,
	};
};
