/**
 * Rewrites Postgres positional placeholders (`$1`) into the named form the AWS
 * Data API binds (`:1`). The Data API binds named parameters only, so SQL that
 * does not come from the ORM dialect, such as the raw SQL studio forwards,
 * would otherwise arrive with nothing bound.
 *
 * The scan is literal aware: comments, string constants, dollar-quoted bodies,
 * and identifiers pass through untouched, so a `$` that is not a placeholder is
 * never rewritten. Only `$N` with `1 <= N <= parameterCount` is converted.
 *
 * Assumes `standard_conforming_strings` is on, which is the default and what
 * Aurora ships; with it off, backslashes escape in every string constant.
 */
export function prepareAwsDataApiSql(sql: string, parameterCount: number): string {
	if (parameterCount < 1) return sql;

	/** Indexing past the end yields '', which every character test rejects. */
	const at = (index: number): string => sql.charAt(index);

	const isDigit = (char: string): boolean => char >= '0' && char <= '9';
	// Postgres treats every non-ASCII byte as an identifier character, so `é$1`
	// is one identifier and `$é$` is a valid dollar-quote tag.
	const isIdentifierChar = (char: string): boolean => /[A-Za-z0-9_$]/.test(char) || char >= '\u0080';
	const isTagChar = (char: string): boolean => /[A-Za-z0-9_]/.test(char) || char >= '\u0080';
	const isNewline = (char: string): boolean => char === '\n' || char === '\r';
	const isSpace = (char: string): boolean => char === ' ' || char === '\t' || char === '\f' || char === '\v';

	/** End of the line comment opening at `start`. Postgres ends these at CR as well as LF. */
	const endOfLineComment = (start: number): number => {
		let j = start + 2;
		while (j < sql.length && !isNewline(at(j))) j++;
		return j;
	};

	/** End of the block comment opening at `start`. Postgres nests these. */
	const endOfBlockComment = (start: number): number => {
		let depth = 1;
		let j = start + 2;
		while (j < sql.length && depth > 0) {
			if (at(j) === '/' && at(j + 1) === '*') {
				depth++;
				j += 2;
			} else if (at(j) === '*' && at(j + 1) === '/') {
				depth--;
				j += 2;
			} else {
				j++;
			}
		}
		return j;
	};

	/** End of one quoted segment. A doubled quote is an escaped quote. */
	const endOfStringSegment = (start: number, isEString: boolean): number => {
		let j = start + 1;
		while (j < sql.length) {
			if (isEString && at(j) === '\\') {
				j += 2;
			} else if (at(j) === "'") {
				if (at(j + 1) === "'") {
					j += 2;
				} else {
					return j + 1;
				}
			} else {
				j++;
			}
		}
		return j;
	};

	/**
	 * The quote continuing a string constant, or null. Postgres concatenates two
	 * string constants separated by whitespace containing at least one newline,
	 * and the continuation keeps the escape-string property of the first. Line
	 * comments count as whitespace here, and the newline ending one satisfies the
	 * newline requirement.
	 */
	const continuationQuote = (from: number): number | null => {
		let j = from;
		let sawNewline = false;
		while (j < sql.length) {
			const char = at(j);
			if (isNewline(char)) {
				sawNewline = true;
				j++;
			} else if (isSpace(char)) {
				j++;
			} else if (char === '-' && at(j + 1) === '-') {
				j = endOfLineComment(j);
			} else {
				break;
			}
		}
		return sawNewline && at(j) === "'" ? j : null;
	};

	/** End of the string constant opening at `start`, including any continuations. */
	const endOfString = (start: number): number => {
		const previous = at(start - 1);
		const isEString = (previous === 'e' || previous === 'E') && !isIdentifierChar(at(start - 2));

		let j = endOfStringSegment(start, isEString);
		for (let next = continuationQuote(j); next !== null; next = continuationQuote(j)) {
			j = endOfStringSegment(next, isEString);
		}
		return j;
	};

	/** End of the quoted identifier opening at `start`. */
	const endOfQuotedIdentifier = (start: number): number => {
		let j = start + 1;
		while (j < sql.length && at(j) !== '"') j++;
		return Math.min(j + 1, sql.length);
	};

	/**
	 * The `$$` or `$tag$` marker opening at `start`, or null when what follows is
	 * not a marker. A tag never starts with a digit, which keeps `$1` a placeholder.
	 */
	const dollarQuoteMarker = (start: number): string | null => {
		let j = start + 1;
		if (isDigit(at(j))) return null;
		while (j < sql.length && isTagChar(at(j))) j++;
		return at(j) === '$' ? sql.slice(start, j + 1) : null;
	};

	/** The placeholder opening at `start`, or null when `$` is not followed by digits. */
	const placeholderAt = (start: number): { index: number; end: number } | null => {
		let j = start + 1;
		while (j < sql.length && isDigit(at(j))) j++;
		if (j === start + 1) return null;
		return { index: Number(sql.slice(start + 1, j)), end: j };
	};

	let out = '';
	let i = 0;

	while (i < sql.length) {
		const char = at(i);
		let end = i + 1;

		if (char === '-' && at(i + 1) === '-') {
			end = endOfLineComment(i);
		} else if (char === '/' && at(i + 1) === '*') {
			end = endOfBlockComment(i);
		} else if (char === "'") {
			end = endOfString(i);
		} else if (char === '"') {
			end = endOfQuotedIdentifier(i);
		} else if (char === '$' && !isIdentifierChar(at(i - 1))) {
			const marker = dollarQuoteMarker(i);
			if (marker !== null) {
				// An unterminated body runs to the end, as Postgres would read it.
				const close = sql.indexOf(marker, i + marker.length);
				end = close === -1 ? sql.length : close + marker.length;
			} else {
				const placeholder = placeholderAt(i);
				if (placeholder !== null && placeholder.index >= 1 && placeholder.index <= parameterCount) {
					out += `:${placeholder.index}`;
					i = placeholder.end;
					continue;
				}
			}
		}

		out += sql.slice(i, end);
		i = end;
	}

	return out;
}
