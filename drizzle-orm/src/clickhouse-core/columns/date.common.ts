/**
 * How a date/time column is surfaced in TypeScript.
 *
 * - `date` (the default) hands back a JavaScript `Date`.
 * - `string` passes ClickHouse's textual form through untouched, which avoids the round-trip through
 *   `Date` for callers that only ever forward the value on.
 */
export type ClickHouseDateMode = 'date' | 'string';

function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

/** Renders a `Date` as ClickHouse's `YYYY-MM-DD`, in UTC. */
export function formatClickHouseDate(value: Date): string {
	return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Renders a `Date` as ClickHouse's `YYYY-MM-DD hh:mm:ss[.fff]`, in UTC. */
export function formatClickHouseDateTime(value: Date, precision = 0): string {
	const base = `${formatClickHouseDate(value)} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${
		pad(value.getUTCSeconds())
	}`;
	if (precision === 0) return base;
	// `Date` only carries millisecond resolution, so anything beyond three digits is zero-filled.
	const fraction = pad(value.getUTCMilliseconds(), 3).slice(0, Math.min(precision, 3)).padEnd(precision, '0');
	return `${base}.${fraction}`;
}

const ISO_LIKE = /[Tt]/;
const HAS_ZONE = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Parses the textual date/time ClickHouse returns.
 *
 * The driver asks for `date_time_output_format = 'iso'`, so values normally arrive zone-qualified and
 * are unambiguous. When a caller has overridden that setting ClickHouse falls back to the bare
 * `YYYY-MM-DD hh:mm:ss` form, which is rendered in the column's own timezone — we read it as UTC,
 * which is correct for the `UTC`-typed and untyped-but-UTC-server cases and is why declaring a
 * timezone on the column is worth doing.
 */
export function parseClickHouseDateTime(value: string): Date {
	if (ISO_LIKE.test(value)) {
		return new Date(HAS_ZONE.test(value) ? value : `${value}Z`);
	}
	return new Date(`${value.replace(' ', 'T')}Z`);
}

/** Parses ClickHouse's `YYYY-MM-DD` into a `Date` pinned to midnight UTC. */
export function parseClickHouseDate(value: string): Date {
	return new Date(`${value}T00:00:00Z`);
}
