import type { z } from 'zod/v4';

/*
 * Derives zod refinements from postgres CHECK constraints.
 *
 * Soundness rule: a derived refinement may be looser than the database, but never stricter -
 * zod must never reject a value that postgres would accept. Anything that can't be translated
 * exactly is skipped (the database still enforces it):
 *   - only top-level AND-ed conjuncts are considered; a top-level OR/NOT disables the whole check
 *   - every conjunct must match a known pattern in full, so `paid > 5` never constrains `id`
 *   - length(trim(x)) only yields a lower bound (trimming can only shorten a string)
 *   - regexes using postgres-only syntax are skipped
 */

export type CheckBounds = {
	min?: { value: number; inclusive: boolean };
	max?: { value: number; inclusive: boolean };
	minLength?: number;
	maxLength?: number;
	regexes: RegExp[];
};

const NUMBER = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?`;
const LITERAL_PLACEHOLDER = '\u0000';

function escapeRegex(value: string) {
	return value.replace(/[$()*+.?[\\\]^{|}\-/]/g, '\\$&');
}

// replaces 'string literals' with placeholders so that the normalisation below can't touch them
function extractLiterals(sql: string): { text: string; literals: string[] } | null {
	const literals: string[] = [];
	let text = '';
	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i]!;
		if (ch !== "'") {
			text += ch;
			continue;
		}
		// E'...' strings have backslash escapes with different semantics: bail out
		if (/[eE]$/.test(text) && !/\w[eE]$/.test(text)) return null;
		let value = '';
		i++;
		for (; i < sql.length; i++) {
			if (sql[i] === "'") {
				if (sql[i + 1] === "'") {
					value += "'";
					i++;
					continue;
				}
				break;
			}
			value += sql[i];
		}
		if (i >= sql.length) return null; // unterminated
		literals.push(value);
		text += `${LITERAL_PLACEHOLDER}${literals.length - 1}${LITERAL_PLACEHOLDER}`;
	}
	return { text, literals };
}

function stripOuterParens(expr: string): string {
	let s = expr.trim();
	while (s.startsWith('(') && s.endsWith(')')) {
		let depth = 0;
		let wrapsAll = true;
		for (let i = 0; i < s.length; i++) {
			if (s[i] === '(') depth++;
			else if (s[i] === ')') depth--;
			if (depth === 0 && i < s.length - 1) {
				wrapsAll = false;
				break;
			}
		}
		if (!wrapsAll) break;
		s = s.slice(1, -1).trim();
	}
	return s;
}

// splits on top-level AND (keeping `x BETWEEN a AND b` intact). returns null if a top-level OR/NOT is present.
function splitConjuncts(expr: string): string[] | null {
	const s = stripOuterParens(expr);
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	let pendingBetween = false;
	const tokenRe = /\(|\)|\b(?:and|or|not|between)\b/gi;
	let m: RegExpExecArray | null;
	while ((m = tokenRe.exec(s))) {
		const tok = m[0].toLowerCase();
		if (tok === '(') depth++;
		else if (tok === ')') depth--;
		else if (depth === 0) {
			if (tok === 'or') return null;
			if (tok === 'not') {
				// `x IS NOT NULL` and `x NOT LIKE` are fine as atoms (they'll just not match a pattern);
				// a leading NOT negates the whole conjunct, which we can't translate
				const before = s.slice(start, m.index).trim();
				if (before === '') return null;
			}
			if (tok === 'between') pendingBetween = true;
			if (tok === 'and') {
				if (pendingBetween) {
					pendingBetween = false;
					continue;
				}
				parts.push(s.slice(start, m.index));
				start = m.index + m[0].length;
			}
		}
	}
	parts.push(s.slice(start));
	return parts.flatMap((part) => {
		const inner = stripOuterParens(part);
		// a parenthesised group may itself be a conjunction
		if (inner !== part.trim() && /\band\b/i.test(inner)) {
			const nested = splitConjuncts(inner);
			return nested ?? ['\u0001']; // unknown token, never matches
		}
		return [inner];
	});
}

// removes casts, table qualifiers and redundant parentheses around the column reference
function normalize(expr: string, column: string): string {
	let s = expr;
	// ::text, ::character varying, ::numeric(10,2), ::"my type"
	s = s.replace(
		/::(?:"[^"]+"|[a-z_][\w]*(?:\s+(?:varying|precision|with(?:out)?\s+time\s+zone))?)(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])*/gi,
		'',
	);
	const col = escapeRegex(column);
	// "table"."col" / table.col -> col
	s = s.replace(new RegExp(String.raw`(?:"[^"]+"|\w+)\.("?${col}"?)(?![\w"])`, 'gi'), '$1');
	// "col" -> col
	s = s.replace(new RegExp(String.raw`"${col}"`, 'g'), column);
	// (col) -> col, (number) -> number, repeatedly
	let prev;
	do {
		prev = s;
		// not after an identifier: length(col) is a call, not redundant parentheses
		s = s.replace(
			new RegExp(
				String.raw`(?<![\w"])\(\s*(${col}|${NUMBER}|${LITERAL_PLACEHOLDER}\d+${LITERAL_PLACEHOLDER})\s*\)`,
				'gi',
			),
			'$1',
		);
	} while (s !== prev);
	return s.replace(/\s+/g, ' ').trim();
}

function postgresRegexToJs(pattern: string, caseInsensitive: boolean): RegExp | undefined {
	// postgres-only escapes / classes have no (or a different) meaning in JS
	if (/\\[mMyYAZ]|\[\[[:.=]|\(\?[^:=!]/.test(pattern)) return undefined;
	try {
		return new RegExp(pattern, caseInsensitive ? 'i' : '');
	} catch {
		return undefined;
	}
}

function likeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
	let out = '';
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i]!;
		if (ch === '\\' && i + 1 < pattern.length) {
			out += escapeRegex(pattern[++i]!);
		} else if (ch === '%') {
			out += '[\\s\\S]*';
		} else if (ch === '_') {
			out += '[\\s\\S]';
		} else {
			out += escapeRegex(ch);
		}
	}
	return new RegExp(`^${out}$`, caseInsensitive ? 'i' : '');
}

type Op = '>' | '>=' | '<' | '<=' | '=';
const FLIP: Record<Op, Op> = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '=': '=' };

function applyBound(bounds: CheckBounds, key: 'value' | 'length', op: Op, n: number) {
	if (key === 'length') {
		// lengths are integers
		const lo = op === '>' ? Math.floor(n) + 1 : op === '>=' || op === '=' ? Math.ceil(n) : undefined;
		const hi = op === '<' ? Math.ceil(n) - 1 : op === '<=' || op === '=' ? Math.floor(n) : undefined;
		if (lo !== undefined) bounds.minLength = Math.max(bounds.minLength ?? 0, lo);
		if (hi !== undefined) bounds.maxLength = Math.min(bounds.maxLength ?? Infinity, hi);
		return;
	}
	if (op === '>' || op === '>=' || op === '=') {
		const inclusive = op !== '>';
		const cur = bounds.min;
		if (!cur || n > cur.value || (n === cur.value && !inclusive)) bounds.min = { value: n, inclusive };
	}
	if (op === '<' || op === '<=' || op === '=') {
		const inclusive = op !== '<';
		const cur = bounds.max;
		if (!cur || n < cur.value || (n === cur.value && !inclusive)) bounds.max = { value: n, inclusive };
	}
}

function parseAtom(atom: string, column: string, literals: string[], bounds: CheckBounds) {
	const col = escapeRegex(column);
	const C = String.raw`(?:${col})`;
	const L = String.raw`${LITERAL_PLACEHOLDER}(\d+)${LITERAL_PLACEHOLDER}`;
	const LEN = String.raw`(?:length|char_length|character_length)`;
	const flags = 'i';
	let m: RegExpExecArray | null;

	// col BETWEEN a AND b
	if ((m = new RegExp(String.raw`^${C} between (${NUMBER}) and (${NUMBER})$`, flags).exec(atom))) {
		applyBound(bounds, 'value', '>=', Number(m[1]));
		applyBound(bounds, 'value', '<=', Number(m[2]));
		return;
	}
	// col op n  /  n op col
	if ((m = new RegExp(String.raw`^${C} ?(>=|<=|>|<|=) ?(${NUMBER})$`, flags).exec(atom))) {
		applyBound(bounds, 'value', m[1] as Op, Number(m[2]));
		return;
	}
	if ((m = new RegExp(String.raw`^(${NUMBER}) ?(>=|<=|>|<|=) ?${C}$`, flags).exec(atom))) {
		applyBound(bounds, 'value', FLIP[m[2] as Op], Number(m[1]));
		return;
	}
	// length(col) BETWEEN a AND b / length(col) op n ; length(trim(col)) -> lower bounds only
	const lenRef = String.raw`${LEN} ?\( ?(trim ?\( ?(?:both from )?${C} ?\)|${C}) ?\)`;
	if ((m = new RegExp(String.raw`^${lenRef} between (${NUMBER}) and (${NUMBER})$`, flags).exec(atom))) {
		const trimmed = /^trim/i.test(m[1]!);
		applyBound(bounds, 'length', '>=', Number(m[2]));
		if (!trimmed) applyBound(bounds, 'length', '<=', Number(m[3]));
		return;
	}
	if ((m = new RegExp(String.raw`^${lenRef} ?(>=|<=|>|<|=) ?(${NUMBER})$`, flags).exec(atom))) {
		const trimmed = /^trim/i.test(m[1]!);
		const op = m[2] as Op;
		if (!trimmed) {
			applyBound(bounds, 'length', op, Number(m[3]));
		} else if (op !== '<' && op !== '<=') {
			// length(trim(x)) >= n implies length(x) >= n, but upper bounds don't carry over
			applyBound(bounds, 'length', '>=', Number(m[3]));
		}
		return;
	}
	// col ~ 'regex' / col ~* 'regex'
	if ((m = new RegExp(String.raw`^${C} ?(~\*?) ?${L}$`, flags).exec(atom))) {
		const regex = postgresRegexToJs(literals[Number(m[2])]!, m[1] === '~*');
		if (regex) bounds.regexes.push(regex);
		return;
	}
	// col LIKE 'pattern' / col ILIKE 'pattern'
	if ((m = new RegExp(String.raw`^${C} (like|ilike) ${L}$`, flags).exec(atom))) {
		bounds.regexes.push(likeToRegex(literals[Number(m[2])]!, m[1]!.toLowerCase() === 'ilike'));
		return;
	}
	// col <> '' -> non-empty
	if ((m = new RegExp(String.raw`^${C} ?(?:<>|!=) ?${L}$`, flags).exec(atom)) && literals[Number(m[1])] === '') {
		applyBound(bounds, 'length', '>=', 1);
		return;
	}
	// col IN ('a', 'b')
	if (
		(m = new RegExp(String.raw`^${C} in \(((?: ?${LITERAL_PLACEHOLDER}\d+${LITERAL_PLACEHOLDER} ?,?)+)\)$`, flags).exec(
			atom,
		))
	) {
		const values = [...m[1]!.matchAll(new RegExp(L, 'g'))].map((it) => literals[Number(it[1])]!);
		bounds.regexes.push(new RegExp(`^(?:${values.map(escapeRegex).join('|')})$`));
		return;
	}
	// anything else: not translatable, ignored (the database still enforces it)
}

export function parseCheckConstraint(sql: string, column: string): CheckBounds | null {
	if (!column) return null;
	const extracted = extractLiterals(sql.trim().replace(/^check\s*/i, ''));
	if (!extracted) return null;

	const conjuncts = splitConjuncts(extracted.text);
	if (!conjuncts) return null;

	const bounds: CheckBounds = { regexes: [] };
	for (const conjunct of conjuncts) {
		parseAtom(normalize(conjunct, column), column, extracted.literals, bounds);
	}

	const empty = !bounds.min && !bounds.max && bounds.minLength === undefined && bounds.maxLength === undefined
		&& bounds.regexes.length === 0;
	return empty ? null : bounds;
}

export function applyCheckBounds(schema: z.ZodType, bounds: CheckBounds): z.ZodType {
	const type = (schema as any)._zod?.def?.type as string | undefined;

	if (type === 'string') {
		let s = schema as z.ZodString;
		if (bounds.minLength !== undefined) s = s.min(bounds.minLength);
		if (bounds.maxLength !== undefined && Number.isFinite(bounds.maxLength)) s = s.max(bounds.maxLength);
		for (const regex of bounds.regexes) s = s.regex(regex);
		return s;
	}

	if (type === 'number') {
		let s = schema as z.ZodNumber;
		if (bounds.min) s = bounds.min.inclusive ? s.gte(bounds.min.value) : s.gt(bounds.min.value);
		if (bounds.max) s = bounds.max.inclusive ? s.lte(bounds.max.value) : s.lt(bounds.max.value);
		return s;
	}

	if (type === 'bigint') {
		// bigint bounds must be integers: round towards the inside of the allowed range
		let s = schema as z.ZodBigInt;
		if (bounds.min) {
			const { value, inclusive } = bounds.min;
			const lo = Number.isInteger(value) ? (inclusive ? value : value + 1) : Math.ceil(value);
			s = s.gte(BigInt(lo));
		}
		if (bounds.max) {
			const { value, inclusive } = bounds.max;
			const hi = Number.isInteger(value) ? (inclusive ? value : value - 1) : Math.floor(value);
			s = s.lte(BigInt(hi));
		}
		return s;
	}

	return schema;
}
