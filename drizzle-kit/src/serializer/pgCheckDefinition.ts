// Index of the `)` matching the `(` at `openIndex`, or -1 when unbalanced.
// Parentheses inside single-quoted literals and double-quoted identifiers do
// not count; a doubled quote is an escaped quote and stays inside the literal.
const matchingParenIndex = (value: string, openIndex: number) => {
	let depth = 0;
	let quote: string | null = null;

	for (let i = openIndex; i < value.length; i++) {
		const char = value[i];

		if (quote) {
			if (char === quote) {
				if (value[i + 1] === quote) i++;
				else quote = null;
			}
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
		} else if (char === '(') {
			depth++;
		} else if (char === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}

	return -1;
};

// Strips one wrapping parenthesis pair, if the whole expression is wrapped.
const unwrapOnce = (expression: string) => {
	const trimmed = expression.trim();
	if (!trimmed.startsWith('(')) return trimmed;
	return matchingParenIndex(trimmed, 0) === trimmed.length - 1 ? trimmed.slice(1, -1) : trimmed;
};

/**
 * Pulls the expression out of a `pg_get_constraintdef()` check definition.
 *
 * Postgres returns the expression wrapped twice — `CHECK ((email <> ''))` —
 * and appends trailing modifiers such as `NOT VALID` or `NO INHERIT`. Matching
 * `))` at the end of the string misses those modifiers, so
 * `CHECK ((version >= 0)) NOT VALID` used to be read as
 * `version >= 0)) NOT VALID` and that unbalanced text reached generated SQL.
 * Walking to the parenthesis that actually closes `CHECK (` handles both.
 */
export const parseCheckDefinition = (definition: string) => {
	const check = /^CHECK\s*\(/i.exec(definition);
	if (!check) return definition;

	const open = check[0].length - 1;
	const close = matchingParenIndex(definition, open);
	if (close === -1) return definition;

	return unwrapOnce(definition.slice(open + 1, close));
};
