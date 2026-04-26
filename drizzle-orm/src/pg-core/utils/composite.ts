/**
 * PostgreSQL composite (row) type text-format codec.
 *
 * Wire format reference: https://www.postgresql.org/docs/current/rowtypes.html#ROWTYPES-IO-SYNTAX
 *
 * Output form: `(field1,field2,...)`
 *   - empty (nothing between separators) → NULL
 *   - `""`                                → empty string (not NULL)
 *   - quoted fields use `\"` or `""` for embedded quotes, `\\` for embedded backslashes
 *   - any field containing `(`, `)`, `,`, `"`, `\`, or whitespace must be quoted on output
 *
 * Composites embedded in arrays receive an extra layer of quoting handled by
 * the array codec — this module operates on already-unwrapped composite literals.
 */

const QUOTE_REQUIRED_RE = /[(),"\\\s]|^$/;

/**
 * Parse a PostgreSQL composite text literal into an array of raw field strings.
 *
 * Returns one entry per field. NULL fields become `null`; the empty string `""`
 * is preserved as `''`. The caller is responsible for converting each raw field
 * string into a typed value (numbers, dates, etc.) using its column's
 * `mapFromDriverValue`.
 *
 * @throws if the input is not wrapped in matching parentheses.
 */
export function parsePgComposite(input: string): (string | null)[] {
	if (input.length < 2 || input[0] !== '(' || input[input.length - 1] !== ')') {
		throw new Error(`Invalid composite literal: ${JSON.stringify(input)}`);
	}

	// `()` is a zero-field composite (rare, but valid).
	if (input.length === 2) return [];

	const result: (string | null)[] = [];
	const end = input.length - 1; // position of the closing ')'
	let i = 1;

	while (i <= end) {
		// We're at the start of a field (just after '(' or after a ',').
		if (input[i] === '"') {
			// Quoted field: read until unescaped closing quote.
			i++; // skip opening quote
			let buf = '';
			while (i < end) {
				const c = input[i]!;
				if (c === '\\') {
					// `\\` → `\`, `\"` → `"`, `\<other>` → `<other>` (PG accepts arbitrary backslash escapes)
					if (i + 1 < end) {
						buf += input[i + 1];
						i += 2;
					} else {
						// trailing backslash before the closing paren — treat literally
						buf += c;
						i++;
					}
				} else if (c === '"') {
					// `""` is a doubled-quote escape inside a quoted field
					if (input[i + 1] === '"') {
						buf += '"';
						i += 2;
					} else {
						// closing quote
						i++;
						break;
					}
				} else {
					buf += c;
					i++;
				}
			}
			result.push(buf);
		} else {
			// Unquoted field: read until ',' or ')'.
			let buf = '';
			while (i < end && input[i] !== ',' && input[i] !== ')') {
				if (input[i] === '\\') {
					// PG also honors backslash escapes outside quotes
					if (i + 1 < end) {
						buf += input[i + 1];
						i += 2;
					} else {
						buf += input[i];
						i++;
					}
				} else {
					buf += input[i];
					i++;
				}
			}
			// An empty unquoted field is NULL.
			result.push(buf.length === 0 ? null : buf);
		}

		// Consume the field separator.
		if (i < end && input[i] === ',') {
			i++;
			// `(a,)` — a trailing comma means the final field is NULL.
			if (i === end) {
				result.push(null);
				break;
			}
		} else {
			// Reached ')' — done.
			break;
		}
	}

	return result;
}

/**
 * Serialize an array of raw field strings into a PostgreSQL composite text literal.
 *
 * `null` entries are emitted as empty (NULL); an empty string `''` is emitted as `""`
 * to disambiguate it from NULL. Fields containing structural characters or whitespace
 * are double-quoted with `\\` and `\"` escapes.
 */
export function makePgComposite(fields: readonly (string | null)[]): string {
	return '(' + fields.map(formatPgCompositeField).join(',') + ')';
}

/** @internal — exposed for unit tests */
export function formatPgCompositeField(value: string | null): string {
	if (value === null) return '';
	if (value === '') return '""';
	if (QUOTE_REQUIRED_RE.test(value)) {
		return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
	}
	return value;
}
