import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';

/**
 * ClickHouse has no prepared-statement protocol. Its HTTP `{name:Type}` query parameters require the
 * exact column type to be spelled out at the call site, which Drizzle cannot infer from a bare
 * JavaScript value — a `Date` could be `Date`, `Date32`, `DateTime` or `DateTime64(n, tz)`, and
 * comparing a `String` parameter against a `Date` column is a hard error rather than a coercion.
 *
 * So each column maps its value to a precise ClickHouse literal instead, and the dialect renders
 * queries with parameters inlined. String content still goes through {@link escapeClickHouseString},
 * never through raw interpolation.
 */

const NUMERIC_LITERAL = /^[+-]?(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

/** Wraps a string in single quotes, escaping backslashes and quotes the way ClickHouse expects. */
export function escapeClickHouseString(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Wraps an identifier in backticks, escaping backslashes and backticks. */
export function escapeClickHouseIdentifier(value: string): string {
	return `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``;
}

/**
 * Emits a bare numeric literal, so that wide integers (`Int64` and up) and decimals survive without
 * being coerced through a JavaScript `number`.
 *
 * Throws on anything that is not a plain number, which keeps `sql.raw` from becoming an injection
 * vector when a caller hands us an unexpected value.
 */
export function numericLiteral(value: bigint | number | string): SQL {
	const text = typeof value === 'number' ? numberToText(value) : String(value);
	if (!NUMERIC_LITERAL.test(text)) {
		// `nan` and `inf` are legitimate Float32/Float64 values and are produced by `numberToText`.
		if (text === 'nan' || text === 'inf' || text === '-inf') {
			return sql.raw(text);
		}
		throw new Error(`Invalid numeric value for ClickHouse: ${String(value)}`);
	}
	return sql.raw(text);
}

/** ClickHouse spells the non-finite floats `nan`, `inf` and `-inf`. */
export function numberToText(value: number): string {
	if (Number.isNaN(value)) return 'nan';
	if (value === Number.POSITIVE_INFINITY) return 'inf';
	if (value === Number.NEGATIVE_INFINITY) return '-inf';
	return String(value);
}

/** Builds `fn(<string literal>, ...rest)`, e.g. `toUUID('…')` or `toDateTime64('…', 3, 'UTC')`. */
export function castFromString(fn: string, value: string, ...rest: (string | number)[]): SQL {
	const args: SQL[] = [sql`${value}`];
	for (const arg of rest) {
		args.push(typeof arg === 'number' ? sql.raw(String(arg)) : sql`${arg}`);
	}
	return sql`${sql.raw(fn)}(${sql.join(args, sql`, `)})`;
}
