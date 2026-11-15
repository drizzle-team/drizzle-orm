import type { z } from 'zod/v4';

/*
 * Turns postgres CHECK constraints into zod rules that accept exactly what postgres accepts.
 *
 * Each top-level AND-ed part of a constraint becomes either a native zod check (gte/lte/regex/...),
 * when that is exact, or a custom check that evaluates the expression with postgres semantics
 * (three-valued NULL logic, TRIM strips spaces only, length() counts characters, LIKE matches the whole
 * string, numbers are compared as exact decimals, timestamps at their column's precision). Parts that
 * use anything this evaluator doesn't model are skipped: the database still enforces them. A part of a
 * table CHECK that reads several columns becomes an object-level rule (see `tableCheckRules`). Every
 * rule is labelled with the constraint name, so `schema.update({ 'field.<constraint_name>': '...' })`
 * (or `'<constraint_name>'` for an object-level rule) can override its message.
 */

/** How a column's values are compared in a CHECK expression. */
export type ColumnKind =
	| { t: 'string' } // text, varchar
	| { t: 'enum' }
	| { t: 'number'; float?: 'real' | 'double' }
	| { t: 'bigint' }
	| { t: 'numeric'; scale?: number }
	| { t: 'time'; zone: 'ts' | 'tstz' | 'day'; precision?: number }
	| { t: 'other' };

/** @deprecated kept for callers of the single-column API */
export type ValueKind = 'string' | 'number' | 'bigint' | 'numeric-string';

const fromValueKind = (k: ValueKind | ColumnKind): ColumnKind =>
	typeof k === 'string'
		? k === 'numeric-string'
			? { t: 'numeric' }
			: { t: k }
		: k;

// ---------------------------------------------------------------------------------------------
// tokens

type Tok =
	| { t: 'num'; v: string }
	| { t: 'str'; v: string }
	| { t: 'id'; v: string; quoted: boolean }
	| { t: 'op'; v: string }
	| { t: '(' }
	| { t: ')' }
	| { t: '[' }
	| { t: ']' }
	| { t: ',' };

function tokenize(sql: string): Tok[] | null {
	const out: Tok[] = [];
	let i = 0;
	while (i < sql.length) {
		const c = sql[i]!;
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (c === "'") {
			// E'...' strings have backslash escapes with different semantics
			const prev = out.at(-1);
			if (prev?.t === 'id' && !prev.quoted && prev.v.toLowerCase() === 'e') return null;
			let v = '';
			i++;
			for (;;) {
				if (i >= sql.length) return null;
				if (sql[i] === "'") {
					if (sql[i + 1] === "'") {
						v += "'";
						i += 2;
						continue;
					}
					i++;
					break;
				}
				v += sql[i++];
			}
			out.push({ t: 'str', v });
			continue;
		}
		if (c === '"') {
			let v = '';
			i++;
			for (;;) {
				if (i >= sql.length) return null;
				if (sql[i] === '"') {
					if (sql[i + 1] === '"') {
						v += '"';
						i += 2;
						continue;
					}
					i++;
					break;
				}
				v += sql[i++];
			}
			out.push({ t: 'id', v, quoted: true });
			continue;
		}
		const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(sql.slice(i));
		if (num) {
			out.push({ t: 'num', v: num[0] });
			i += num[0].length;
			continue;
		}
		const id = /^[_a-z][\w$]*/i.exec(sql.slice(i));
		if (id) {
			out.push({ t: 'id', v: id[0], quoted: false });
			i += id[0].length;
			continue;
		}
		const op = /^(?:::|<>|!=|>=|<=|!~\*|!~|~\*|~|=|<|>|-|\+|\.)/.exec(sql.slice(i));
		if (op) {
			out.push({ t: 'op', v: op[0] });
			i += op[0].length;
			continue;
		}
		if (c === '(' || c === ')' || c === ',' || c === '[' || c === ']') {
			out.push({ t: c } as Tok);
			i++;
			continue;
		}
		return null;
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// expressions

type CmpOp = '=' | '<>' | '<' | '<=' | '>' | '>=';

export type Expr =
	| { k: 'and' | 'or'; items: Expr[] }
	| { k: 'not'; e: Expr }
	| { k: 'cmp'; op: CmpOp; a: Expr; b: Expr }
	| { k: 'between'; e: Expr; lo: Expr; hi: Expr; neg: boolean }
	| { k: 'like'; e: Expr; pattern: string; ci: boolean; neg: boolean }
	| { k: 'regex'; e: Expr; pattern: string; ci: boolean; neg: boolean }
	| { k: 'in'; e: Expr; list: Expr[]; neg: boolean }
	| { k: 'isnull'; e: Expr; neg: boolean }
	| { k: 'call'; fn: string; args: Expr[]; trim?: 'both' | 'leading' | 'trailing' }
	| { k: 'cast'; e: Expr; to: string }
	| { k: 'col'; key: string }
	| { k: 'num'; v: string }
	| { k: 'str'; v: string }
	| { k: 'bool'; v: boolean };

class Unsupported extends Error {}

/** Maps a column reference to a key, or null when the name isn't a column the rule can read. */
type Resolve = (name: string, quoted: boolean) => string | null;

function parse(tokens: Tok[], resolve: Resolve): Expr {
	let p = 0;
	const peek = () => tokens[p];
	const kw = (word: string) => {
		const t = tokens[p];
		return t?.t === 'id' && !t.quoted && t.v.toLowerCase() === word;
	};
	const eatKw = (word: string) => (kw(word) ? (p++, true) : false);
	const expect = (t: Tok['t']) => {
		const tok = tokens[p];
		if (!tok || tok.t !== t) throw new Unsupported();
		p++;
		return tok;
	};
	const isOp = (v: string) => {
		const t = peek();
		return t?.t === 'op' && t.v === v;
	};

	// ::text, ::character varying, ::numeric(10,2), ::"my type", ::app.mood, ::timestamp without time zone
	function castType(): string {
		const words: string[] = [];
		const first = expect('id') as { v: string; quoted: boolean };
		words.push(first.quoted ? first.v : first.v.toLowerCase());
		while (isOp('.')) {
			p++;
			const t = expect('id') as { v: string; quoted: boolean };
			words[words.length - 1] += `.${t.quoted ? t.v : t.v.toLowerCase()}`;
		}
		while (kw('varying') || kw('precision') || kw('with') || kw('without') || kw('time') || kw('zone')) {
			words.push((tokens[p++] as { v: string }).v.toLowerCase());
		}
		let mod = '';
		if (peek()?.t === '(') {
			p++;
			const parts: string[] = [];
			while (peek() && peek()!.t !== ')') {
				const t = tokens[p++]!;
				parts.push(t.t === 'num' ? t.v : ',');
			}
			expect(')');
			mod = `(${parts.filter((x) => x !== ',').join(',')})`;
		}
		if (peek()?.t === '[') throw new Unsupported(); // array casts
		return words.join(' ') + mod;
	}

	function postfix(e: Expr): Expr {
		while (isOp('::')) {
			p++;
			e = { k: 'cast', e, to: castType() };
		}
		return e;
	}

	function orExpr(): Expr {
		const items = [andExpr()];
		while (eatKw('or')) items.push(andExpr());
		return items.length === 1 ? items[0]! : { k: 'or', items };
	}
	function andExpr(): Expr {
		const items = [notExpr()];
		while (eatKw('and')) items.push(notExpr());
		return items.length === 1 ? items[0]! : { k: 'and', items };
	}
	function notExpr(): Expr {
		if (eatKw('not')) return { k: 'not', e: notExpr() };
		return predicate();
	}
	function predicate(): Expr {
		const left = term();
		const t = peek();
		if (t?.t === 'op' && ['=', '<>', '!=', '<', '<=', '>', '>='].includes(t.v)) {
			p++;
			const op = (t.v === '!=' ? '<>' : t.v) as CmpOp;
			// x = ANY (ARRAY[...]) / x <> ALL (ARRAY[...]), as postgres prints IN lists
			if ((kw('any') || kw('all')) && tokens[p + 1]?.t === '(') {
				const all = kw('all');
				p += 2;
				if (!eatKw('array')) throw new Unsupported();
				expect('[');
				const list = [term()];
				while (peek()?.t === ',') {
					p++;
					list.push(term());
				}
				expect(']');
				expect(')');
				const items: Expr[] = list.map((b) => ({ k: 'cmp', op, a: left, b }));
				return { k: all ? 'and' : 'or', items };
			}
			return { k: 'cmp', op, a: left, b: term() };
		}
		if (t?.t === 'op' && ['~', '~*', '!~', '!~*'].includes(t.v)) {
			p++;
			const pat = term();
			if (pat.k !== 'str') throw new Unsupported();
			return { k: 'regex', e: left, pattern: pat.v, ci: t.v.endsWith('*'), neg: t.v.startsWith('!') };
		}
		if (eatKw('is')) {
			const neg = eatKw('not');
			if (!eatKw('null')) throw new Unsupported();
			return { k: 'isnull', e: left, neg };
		}
		const neg = eatKw('not');
		if (eatKw('between')) {
			const lo = term();
			if (!eatKw('and')) throw new Unsupported();
			return { k: 'between', e: left, lo, hi: term(), neg };
		}
		if (kw('like') || kw('ilike')) {
			const ci = kw('ilike');
			p++;
			const pat = term();
			if (pat.k !== 'str' || kw('escape')) throw new Unsupported();
			return { k: 'like', e: left, pattern: pat.v, ci, neg };
		}
		if (eatKw('in')) {
			expect('(');
			const list = [term()];
			while (peek()?.t === ',') {
				p++;
				list.push(term());
			}
			expect(')');
			return { k: 'in', e: left, list, neg };
		}
		if (neg) throw new Unsupported();
		return left;
	}
	function term(): Expr {
		const t = peek();
		if (!t) throw new Unsupported();
		let e: Expr;
		if (t.t === '(') {
			p++;
			e = orExpr();
			expect(')');
		} else if (t.t === 'num') {
			p++;
			e = { k: 'num', v: t.v };
		} else if (t.t === 'op' && t.v === '-' && tokens[p + 1]?.t === 'num') {
			e = { k: 'num', v: `-${(tokens[p + 1] as { v: string }).v}` };
			p += 2;
		} else if (t.t === 'str') {
			p++;
			e = { k: 'str', v: t.v };
		} else if (t.t === 'id') {
			p++;
			const lower = t.v.toLowerCase();
			if (!t.quoted && (lower === 'true' || lower === 'false')) {
				e = { k: 'bool', v: lower === 'true' };
			} else if (peek()?.t === '(' && !t.quoted) {
				p++;
				e = call(lower);
			} else {
				// column reference, possibly qualified: "table"."col" / table.col
				let name = t.v;
				let quoted = t.quoted;
				while (isOp('.')) {
					p++;
					const nxt = expect('id') as { v: string; quoted: boolean };
					name = nxt.v;
					quoted = nxt.quoted;
				}
				const key = resolve(name, quoted);
				if (key === null) throw new Unsupported();
				e = { k: 'col', key };
			}
		} else {
			throw new Unsupported();
		}
		return postfix(e);
	}
	function call(fn: string): Expr {
		if (fn === 'trim') {
			let mode: 'both' | 'leading' | 'trailing' = 'both';
			for (const m of ['both', 'leading', 'trailing'] as const) {
				if (eatKw(m)) mode = m;
			}
			if (peek()?.t === 'str') throw new Unsupported(); // trim(chars from x)
			eatKw('from');
			const arg = orExpr();
			expect(')');
			return { k: 'call', fn: 'trim', args: [arg], trim: mode };
		}
		const args: Expr[] = [];
		if (peek()?.t !== ')') {
			args.push(orExpr());
			while (peek()?.t === ',') {
				p++;
				args.push(orExpr());
			}
		}
		expect(')');
		return { k: 'call', fn, args };
	}

	const e = orExpr();
	if (p !== tokens.length) throw new Unsupported();
	return e;
}

function parseWith(sql: string, resolve: Resolve): Expr | null {
	const tokens = tokenize(sql.trim().replace(/^check\s*(?=\()/i, ''));
	if (!tokens) return null;
	try {
		return parse(tokens, resolve);
	} catch (e) {
		if (e instanceof Unsupported) return null;
		throw e;
	}
}

// unquoted identifiers fold to lower case; a domain's VALUE is a keyword
const resolveOne = (ref: string): Resolve => (name, quoted) => {
	if (ref === 'VALUE') return !quoted && name.toLowerCase() === 'value' ? ref : null;
	return (quoted ? name : name.toLowerCase()) === ref ? ref : null;
};

/** Parses a CHECK that reads one column (`ref`, or `VALUE` for a domain). */
export function parseCheck(sql: string, ref: string): Expr | null {
	if (!ref) return null;
	return parseWith(sql, resolveOne(ref));
}

// ---------------------------------------------------------------------------------------------
// exact decimals (postgres numeric comparisons without float rounding)

type Dec = { m: bigint; s: number };

function toDec(text: string): Dec | null {
	const m = /^([+-])?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
	if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
	const frac = m[3] ?? '';
	let digits = BigInt((m[2] || '0') + frac);
	let scale = frac.length - Number(m[4] ?? 0);
	if (scale < 0) {
		digits *= 10n ** BigInt(-scale);
		scale = 0;
	}
	return { m: m[1] === '-' ? -digits : digits, s: scale };
}

function cmpDec(a: Dec, b: Dec): number {
	const s = Math.max(a.s, b.s);
	const x = a.m * 10n ** BigInt(s - a.s);
	const y = b.m * 10n ** BigInt(s - b.s);
	return x < y ? -1 : x > y ? 1 : 0;
}

// numeric(p, s) rounds the input half away from zero before any CHECK sees it
function roundDec(d: Dec, scale: number): Dec {
	if (d.s <= scale) return d;
	const f = 10n ** BigInt(d.s - scale);
	const half = f / 2n;
	const m = d.m >= 0n ? (d.m + half) / f : -((-d.m + half) / f);
	return { m, s: scale };
}

const decToNumber = (d: Dec) => Number(`${d.m}e-${d.s}`);

// ---------------------------------------------------------------------------------------------
// dates and timestamps, as microseconds (days for `date`)

const EPOCH_2000_US = 946_684_800_000_000n;
const TIME_RE =
	/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?(?:\s*(z|[+-]\d{2}(?::?\d{2})?))?$/i;

function parseTime(s: string, zone: 'ts' | 'tstz' | 'day'): bigint {
	const m = TIME_RE.exec(s.trim());
	if (!m) throw new Unsupported();
	const [y, mo, d, h = 0, mi = 0, sec = 0] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) =>
		Number(x ?? 0)
	) as number[];
	if (y === 0 || h! > 23 || mi! > 59 || sec! > 59) throw new Unsupported();
	const ms = Date.UTC(y!, mo! - 1, d!, h, mi, sec);
	const check = new Date(ms);
	if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo! - 1 || check.getUTCDate() !== d) {
		throw new Unsupported();
	}
	if (zone === 'day') {
		if (m[4] !== undefined || m[8] !== undefined) throw new Unsupported();
		return BigInt(ms / 86_400_000);
	}
	let us = BigInt(ms) * 1000n + BigInt((m[7] ?? '').padEnd(6, '0') || '0');
	const off = m[8];
	if (zone === 'tstz') {
		// without an offset postgres would use the session time zone, which isn't known here
		if (off === undefined) throw new Unsupported();
		if (off.toUpperCase() !== 'Z') {
			const om = /^([+-])(\d{2}):?(\d{2})?$/.exec(off)!;
			const mins = Number(om[2]) * 60 + Number(om[3] ?? 0);
			us -= BigInt((om[1] === '-' ? -mins : mins) * 60_000_000);
		}
	}
	// a plain timestamp ignores any offset in its input
	return us;
}

function timeOf(v: unknown, zone: 'ts' | 'tstz' | 'day', precision: number | undefined): bigint {
	let us: bigint;
	if (v instanceof Date) {
		const ms = v.getTime();
		if (Number.isNaN(ms)) throw new Unsupported();
		// drizzle sends dates as UTC ISO strings
		if (zone === 'day') return BigInt(Math.floor(ms / 86_400_000));
		us = BigInt(ms) * 1000n;
	} else if (typeof v === 'string') {
		us = parseTime(v, zone);
		if (zone === 'day') return us;
	} else throw new Unsupported();
	if (precision !== undefined && precision < 6) {
		// timestamp(p) rounds half away from zero, counted from postgres' 2000-01-01 epoch
		const scale = 10n ** BigInt(6 - precision);
		const t = us - EPOCH_2000_US;
		const half = scale / 2n;
		const r = t >= 0n ? ((t + half) / scale) * scale : -((-t + half) / scale) * scale;
		us = r + EPOCH_2000_US;
	}
	return us;
}

const TIME_TYPES: Record<string, 'ts' | 'tstz' | 'day'> = {
	date: 'day',
	timestamp: 'ts',
	'timestamp without time zone': 'ts',
	timestamptz: 'tstz',
	'timestamp with time zone': 'tstz',
};

// ---------------------------------------------------------------------------------------------
// compile to a predicate with postgres semantics: values are null for SQL NULL

type Ty = 'str' | 'enum' | 'num' | 'flt' | 'bool' | 'ts' | 'tstz' | 'day';
type Val = string | Dec | number | boolean | bigint | null;
type Env = (key: string) => unknown;
type Fn = (env: Env) => Val;
type KindOf = (key: string) => ColumnKind;

const PG_ONLY_REGEX = /\\[AMYZmy]|\[\[[.:=]|\(\?[^!:=]/;
// case-insensitive matching and lower()/upper() outside ASCII depend on the database locale
const ASCII = { test: (s: string) => [...s].every((c) => c.codePointAt(0)! < 128) };

function regexFor(pattern: string, ci: boolean): RegExp {
	if (PG_ONLY_REGEX.test(pattern)) throw new Unsupported();
	try {
		return new RegExp(pattern, ci ? 'iu' : 'u');
	} catch {
		throw new Unsupported();
	}
}

function escapeRegex(value: string) {
	return value.replace(/[$()*+./?[\\\]^{|}\-]/g, '\\$&');
}

function likeRegex(pattern: string, ci: boolean): RegExp {
	let out = '';
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i]!;
		if (ch === '\\' && i + 1 < pattern.length) out += escapeRegex(pattern[++i]!);
		else if (ch === '%') out += '[\\s\\S]*';
		else if (ch === '_') out += '[\\s\\S]';
		else out += escapeRegex(ch);
	}
	return new RegExp(`^${out}$`, ci ? 'iu' : 'u');
}

// postgres counts characters, JS .length counts UTF-16 units
const charLength = (s: string) => [...s].length;

const LENGTH_FNS = new Set(['length', 'char_length', 'character_length']);
const CMP: Record<CmpOp, (c: number) => boolean> = {
	'=': (c) => c === 0,
	'<>': (c) => c !== 0,
	'<': (c) => c < 0,
	'<=': (c) => c <= 0,
	'>': (c) => c > 0,
	'>=': (c) => c >= 0,
};
const TEXT_TYPES = new Set(['text', 'varchar', 'character varying']);
const INT_TYPES = new Set(['integer', 'int', 'int4', 'bigint', 'int8', 'smallint', 'int2']);

const not3 = (x: Val) => (x === null ? null : !x);
const nullable = (f: (...xs: any[]) => Val, ...fns: Fn[]): Fn => (env) => {
	const xs = fns.map((g) => g(env));
	return xs.includes(null) ? null : f(...xs);
};

function compileColumn(key: string, kind: ColumnKind): { ty: Ty; fn: Fn } {
	const read = (env: Env) => env(key);
	switch (kind.t) {
		case 'string':
		case 'enum': {
			return {
				ty: kind.t === 'string' ? 'str' : 'enum',
				fn: (env) => {
					const v = read(env);
					if (v === null) return null;
					if (typeof v !== 'string') throw new Unsupported();
					return v;
				},
			};
		}
		case 'number':
		case 'bigint':
		case 'numeric': {
			if (kind.t === 'number' && kind.float) {
				const float = kind.float;
				return {
					ty: 'flt',
					fn: (env) => {
						const v = read(env);
						if (v === null) return null;
						if (typeof v !== 'number' || !Number.isFinite(v)) throw new Unsupported();
						return float === 'real' ? Math.fround(v) : v;
					},
				};
			}
			// integers and numerics compare exactly as decimals
			return {
				ty: 'num',
				fn: (env) => {
					const v = read(env);
					if (v === null) return null;
					if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'bigint') throw new Unsupported();
					const d = toDec(String(v));
					if (!d) throw new Unsupported(); // not a number: the type checks report it
					return kind.t === 'numeric' && kind.scale !== undefined ? roundDec(d, kind.scale) : d;
				},
			};
		}
		case 'time': {
			return {
				ty: kind.zone,
				fn: (env) => {
					const v = read(env);
					return v === null ? null : timeOf(v, kind.zone, kind.precision);
				},
			};
		}
		case 'other': {
			throw new Unsupported();
		}
	}
}

function compileCast(e: Extract<Expr, { k: 'cast' }>, kindOf: KindOf): { ty: Ty; fn: Fn } {
	const to = e.to;
	const inner = e.e;
	if (inner.k === 'str') {
		const zone = TIME_TYPES[to];
		if (zone) {
			const t = parseTime(inner.v, zone);
			return { ty: zone, fn: () => t };
		}
		if (TEXT_TYPES.has(to)) return { ty: 'str', fn: () => inner.v };
		if (to === 'numeric' || INT_TYPES.has(to)) {
			const d = toDec(inner.v);
			if (!d || (to !== 'numeric' && d.s > 0)) throw new Unsupported();
			return { ty: 'num', fn: () => d };
		}
		if (/^(?:bool|boolean|double precision|real|float\d?|json|jsonb|uuid|bytea|interval|time)\b/.test(to)) {
			throw new Unsupported();
		}
		// any other type: an enum label, e.g. 'workflow'::app.conversation_kind
		return { ty: 'enum', fn: () => inner.v };
	}
	if (inner.k === 'num') {
		const d = toDec(inner.v);
		if (!d) throw new Unsupported();
		if (to === 'numeric' || (INT_TYPES.has(to) && d.s === 0)) return { ty: 'num', fn: () => d };
		throw new Unsupported();
	}
	const x = compile(inner, kindOf);
	// only casts that leave the value unchanged
	if ((x.ty === 'str' || x.ty === 'enum') && TEXT_TYPES.has(to)) return { ty: 'str', fn: x.fn };
	if (x.ty === 'num' && inner.k === 'col') {
		const kind = kindOf(inner.key);
		if (to === 'numeric' && kind.t !== 'numeric') return x;
		if (kind.t === 'numeric' && kind.scale === undefined && to === 'numeric') return x;
	}
	if ((x.ty === 'ts' || x.ty === 'tstz' || x.ty === 'day') && TIME_TYPES[to] === x.ty && inner.k === 'col') {
		const kind = kindOf(inner.key);
		if (kind.t === 'time' && kind.precision === undefined) return x;
	}
	throw new Unsupported();
}

// a comparison of two values postgres can compare without a collation, cast or session time zone
function comparator(a: Ty, b: Ty, op: CmpOp): (x: any, y: any) => number {
	const eqOnly = op === '=' || op === '<>';
	if (a === 'num' && b === 'num') return cmpDec;
	if ((a === 'flt' || a === 'num') && (b === 'flt' || b === 'num')) {
		const f = (v: any) => (typeof v === 'number' ? v : decToNumber(v));
		return (x, y) => Math.sign(f(x) - f(y));
	}
	if (a === b && (a === 'ts' || a === 'tstz' || a === 'day')) return (x, y) => (x < y ? -1 : x > y ? 1 : 0);
	if ((a === 'ts' && b === 'day') || (a === 'day' && b === 'ts')) {
		const us = (v: bigint, t: Ty) => (t === 'day' ? v * 86_400_000_000n : v);
		return (x, y) => {
			const p = us(x, a);
			const q = us(y, b);
			return p < q ? -1 : p > q ? 1 : 0;
		};
	}
	// string ordering depends on the collation, enum ordering on the type's declaration
	if (eqOnly && ((a === 'str' && b === 'str') || (a === 'enum' && b === 'enum') || (a === 'enum' && b === 'str'))) {
		return (x, y) => (x === y ? 0 : 1);
	}
	if (eqOnly && a === 'str' && b === 'enum') return (x, y) => (x === y ? 0 : 1);
	if (eqOnly && a === 'bool' && b === 'bool') return (x, y) => (x === y ? 0 : 1);
	throw new Unsupported();
}

function compile(e: Expr, kindOf: KindOf): { ty: Ty; fn: Fn } {
	switch (e.k) {
		case 'col': {
			return compileColumn(e.key, kindOf(e.key));
		}
		case 'num': {
			const d = toDec(e.v);
			if (!d) throw new Unsupported();
			return { ty: 'num', fn: () => d };
		}
		case 'str': {
			return { ty: 'str', fn: () => e.v };
		}
		case 'bool': {
			return { ty: 'bool', fn: () => e.v };
		}
		case 'cast': {
			return compileCast(e, kindOf);
		}
		case 'call': {
			const args = e.args.map((a) => compile(a, kindOf));
			if (args.length !== 1 || args[0]!.ty !== 'str') throw new Unsupported();
			const f = args[0]!.fn;
			if (LENGTH_FNS.has(e.fn)) {
				return { ty: 'num', fn: nullable((s: string) => ({ m: BigInt(charLength(s)), s: 0 }), f) };
			}
			if (['trim', 'btrim', 'ltrim', 'rtrim'].includes(e.fn)) {
				const mode = e.fn === 'ltrim' ? 'leading' : e.fn === 'rtrim' ? 'trailing' : e.trim ?? 'both';
				// postgres trims spaces only, not tabs or newlines
				const re = mode === 'leading' ? /^ +/ : mode === 'trailing' ? / +$/ : /^ +| +$/g;
				return { ty: 'str', fn: nullable((s: string) => s.replace(re, ''), f) };
			}
			if (e.fn === 'lower' || e.fn === 'upper') {
				return {
					ty: 'str',
					fn: nullable((s: string) => {
						if (!ASCII.test(s)) throw new Unsupported();
						return e.fn === 'lower' ? s.toLowerCase() : s.toUpperCase();
					}, f),
				};
			}
			throw new Unsupported();
		}
		case 'cmp': {
			const a = compile(e.a, kindOf);
			const b = compile(e.b, kindOf);
			const order = comparator(a.ty, b.ty, e.op);
			const test = CMP[e.op];
			return { ty: 'bool', fn: nullable((x, y) => test(order(x, y)), a.fn, b.fn) };
		}
		case 'between': {
			const lo: Expr = { k: 'cmp', op: '>=', a: e.e, b: e.lo };
			const hi: Expr = { k: 'cmp', op: '<=', a: e.e, b: e.hi };
			const both = compile({ k: 'and', items: [lo, hi] }, kindOf);
			return e.neg ? { ty: 'bool', fn: (env) => not3(both.fn(env)) } : both;
		}
		case 'like':
		case 'regex': {
			const x = compile(e.e, kindOf);
			if (x.ty !== 'str') throw new Unsupported();
			const re = e.k === 'like' ? likeRegex(e.pattern, e.ci) : regexFor(e.pattern, e.ci);
			return {
				ty: 'bool',
				fn: nullable((s: string) => {
					if (e.ci && !ASCII.test(s)) throw new Unsupported();
					return re.test(s) !== e.neg;
				}, x.fn),
			};
		}
		case 'in': {
			const items: Expr = { k: 'or', items: e.list.map((b): Expr => ({ k: 'cmp', op: '=', a: e.e, b })) };
			const any = compile(items, kindOf);
			return e.neg ? { ty: 'bool', fn: (env) => not3(any.fn(env)) } : any;
		}
		case 'isnull': {
			if (e.e.k === 'col') {
				const key = e.e.key;
				return { ty: 'bool', fn: (env) => (env(key) === null) !== e.neg };
			}
			const x = compile(e.e, kindOf);
			return { ty: 'bool', fn: (env) => (x.fn(env) === null) !== e.neg };
		}
		case 'not': {
			const x = compile(e.e, kindOf);
			if (x.ty !== 'bool') throw new Unsupported();
			return { ty: 'bool', fn: (env) => not3(x.fn(env)) };
		}
		case 'and':
		case 'or': {
			const items = e.items.map((it) => compile(it, kindOf));
			if (items.some((it) => it.ty !== 'bool')) throw new Unsupported();
			const stop = e.k === 'or'; // the value that decides the result
			return {
				ty: 'bool',
				fn: (env) => {
					let unknown = false;
					for (const it of items) {
						const r = it.fn(env);
						if (r === stop) return stop;
						if (r === null) unknown = true;
					}
					return unknown ? null : !stop;
				},
			};
		}
	}
}

// a CHECK fails only when its expression is FALSE; NULL passes
function predicateOf(part: Expr, kindOf: KindOf): ((env: Env) => boolean) | null {
	let fn: Fn;
	try {
		const compiled = compile(part, kindOf);
		if (compiled.ty !== 'bool') return null;
		fn = compiled.fn;
	} catch (e) {
		if (e instanceof Unsupported) return null;
		throw e;
	}
	return (env) => {
		try {
			return fn(env) !== false;
		} catch (e) {
			// a value this evaluator can't read (e.g. not a number) is left to the other checks
			if (e instanceof Unsupported) return true;
			throw e;
		}
	};
}

// ---------------------------------------------------------------------------------------------
// native zod checks where they are exact (standard issue codes, JSON schema, `update()` by method name)

type Native =
	| { kind: 'gte' | 'gt' | 'lte' | 'lt'; value: string }
	| { kind: 'nonEmpty' }
	| { kind: 'regex'; value: RegExp };

const FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=', '<>': '<>' } as const;
const NATIVE_CMP = { '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' } as const;

function asNative(e: Expr, kind: ColumnKind): Native[] | null {
	// integers only: float columns compare as float8 and numeric(p, s) rounds first
	const numeric = (kind.t === 'number' && !kind.float) || kind.t === 'bigint';
	if (e.k === 'cmp' && numeric) {
		let op = e.op;
		let lit: string | undefined;
		if (e.a.k === 'col' && e.b.k === 'num') lit = e.b.v;
		else if (e.b.k === 'col' && e.a.k === 'num') {
			lit = e.a.v;
			op = FLIP[op];
		}
		if (lit === undefined || op === '<>') return null;
		if (op === '=') return [{ kind: 'gte', value: lit }, { kind: 'lte', value: lit }];
		return [{ kind: NATIVE_CMP[op], value: lit }];
	}
	if (e.k === 'between' && !e.neg && numeric && e.e.k === 'col' && e.lo.k === 'num' && e.hi.k === 'num') {
		return [{ kind: 'gte', value: e.lo.v }, { kind: 'lte', value: e.hi.v }];
	}
	if (kind.t === 'string') {
		// zod's min()/max() count UTF-16 units rather than characters, so only "non-empty" is identical;
		// other length bounds use the character-counting custom check
		if (e.k === 'cmp' && e.a.k === 'col' && e.b.k === 'str' && e.b.v === '' && e.op === '<>') {
			return [{ kind: 'nonEmpty' }];
		}
		if (e.k === 'regex' && !e.neg && !e.ci && e.e.k === 'col') {
			try {
				return [{ kind: 'regex', value: regexFor(e.pattern, false) }];
			} catch {
				return null;
			}
		}
		if (e.k === 'like' && !e.neg && !e.ci && e.e.k === 'col') {
			return [{ kind: 'regex', value: likeRegex(e.pattern, false) }];
		}
	}
	return null;
}

// ---------------------------------------------------------------------------------------------
// default messages

type Label = (key: string) => string;

function lengthTarget(x: Expr): 'plain' | 'trimmed' | null {
	if (x.k === 'cast') return lengthTarget(x.e);
	if (x.k !== 'call' || !LENGTH_FNS.has(x.fn)) return null;
	let arg = x.args[0];
	if (arg?.k === 'cast') arg = arg.e;
	if (arg?.k === 'col') return 'plain';
	if (arg?.k === 'call' && ['trim', 'btrim'].includes(arg.fn)) {
		const inner = arg.args[0]?.k === 'cast' ? (arg.args[0] as { e: Expr }).e : arg.args[0];
		if (inner?.k === 'col') return 'trimmed';
	}
	return null;
}

const bare = (x: Expr): Expr => (x.k === 'cast' ? bare(x.e) : x);

function literal(x: Expr): string | null {
	const b = bare(x);
	if (b.k === 'num') return b.v;
	if (b.k === 'str') return x.k === 'cast' && TIME_TYPES[x.to] ? b.v : JSON.stringify(b.v);
	return null;
}

// the part after "Must be ...", or null when there is no plain-language reading
function phrase(e: Expr, kindOf: KindOf, label: Label): string | null {
	const chars = (n: string) => `${n} character${n === '1' ? '' : 's'}`;
	const suffix = (x: Expr) => lengthTarget(x) === 'trimmed' ? ', not counting leading or trailing spaces' : '';
	const isTime = (x: Expr) => {
		const b = bare(x);
		if (b.k === 'col') return kindOf(b.key).t === 'time';
		return x.k === 'cast' && TIME_TYPES[x.to] !== undefined;
	};
	if (e.k === 'between' && !e.neg && lengthTarget(e.e) && e.lo.k === 'num' && e.hi.k === 'num') {
		return `${e.lo.v} to ${chars(e.hi.v)}${suffix(e.e)}`;
	}
	if (e.k === 'cmp' && lengthTarget(e.a) && e.b.k === 'num') {
		const n = e.b.v;
		const text = {
			'>=': `at least ${chars(n)}`,
			'>': `more than ${chars(n)}`,
			'<=': `at most ${chars(n)}`,
			'<': `fewer than ${chars(n)}`,
			'=': `exactly ${chars(n)}`,
			'<>': `any length but ${chars(n)}`,
		}[e.op];
		return `${text}${suffix(e.a)}`;
	}
	if (e.k === 'cmp' && bare(e.a).k === 'col') {
		const other = bare(e.b).k === 'col' ? label((bare(e.b) as { key: string }).key) : literal(e.b);
		if (other === null) return null;
		const time = isTime(e.a);
		const text = {
			'>=': time ? 'on or after' : 'at least',
			'>': time ? 'after' : 'greater than',
			'<=': time ? 'on or before' : 'at most',
			'<': time ? 'before' : 'less than',
			'=': 'equal to',
			'<>': 'different from',
		}[e.op];
		return `${text} ${other}`;
	}
	if (e.k === 'between' && !e.neg && bare(e.e).k === 'col') {
		const lo = literal(e.lo);
		const hi = literal(e.hi);
		if (lo !== null && hi !== null) return `between ${lo} and ${hi}`;
	}
	if (e.k === 'in' && !e.neg) {
		const values = e.list.map((x) => literal(x));
		if (values.every((v) => v !== null)) return `one of ${values.join(', ')}`;
	}
	if (e.k === 'or') {
		// x = 'a' OR x = 'b' (how postgres prints IN lists)
		const subject = (it: Expr) => {
			const a = it.k === 'cmp' && it.op === '=' ? bare(it.a) : undefined;
			return a?.k === 'col' ? a.key : null;
		};
		const values = e.items.map((it) => (subject(it) === null ? null : literal((it as { b: Expr }).b)));
		const one = e.items.every((it) => subject(it) !== null && subject(it) === subject(e.items[0]!));
		if (one && values.every((v) => v !== null)) return `one of ${values.join(', ')}`;
		// "a or b" only reads well when both parts are about the same single column
		if (columnsOf(e).length > 1) return null;
		const parts = e.items.map((it) => phrase(it, kindOf, label));
		return parts.every(Boolean) ? parts.join(' or ') : null;
	}
	return null;
}

function describe(e: Expr, name: string, kindOf: KindOf, label: Label = (k) => k): string {
	const p = phrase(e, kindOf, label);
	return p ? `Must be ${p}` : `Must satisfy ${name}`;
}

// ---------------------------------------------------------------------------------------------

function flattenAnd(e: Expr): Expr[] {
	return e.k === 'and' ? e.items.flatMap((x) => flattenAnd(x)) : [e];
}

// columns in the order the expression first reads them
function columnsOf(e: Expr, out: string[] = []): string[] {
	if (e.k === 'col') {
		if (!out.includes(e.key)) out.push(e.key);
		return out;
	}
	for (const v of Object.values(e)) {
		if (Array.isArray(v)) { for (const x of v) typeof x === 'object' && columnsOf(x, out); }
		else if (v && typeof v === 'object') columnsOf(v as Expr, out);
	}
	return out;
}

function bigintBound(value: string, kind: 'gte' | 'gt' | 'lte' | 'lt'): { op: 'gte' | 'lte'; value: bigint } {
	// bigint bounds must be integers: round towards the inside of the allowed range
	const d = toDec(value)!;
	const scale = 10n ** BigInt(d.s);
	const floor = d.m >= 0n ? d.m / scale : -((-d.m + scale - 1n) / scale);
	const exact = d.m % scale === 0n;
	if (kind === 'gte') return { op: 'gte', value: exact ? floor : floor + 1n };
	if (kind === 'gt') return { op: 'gte', value: floor + 1n };
	if (kind === 'lte') return { op: 'lte', value: floor };
	return { op: 'lte', value: exact ? floor - 1n : floor };
}

const FIELD_TYPES = new Set(['string', 'number', 'bigint', 'date']);

/** Adds the rules the given parts of a CHECK guarantee for one non-null field. */
export function applyCheckParts(schema: z.ZodType, parts: Expr[], name: string, kind: ColumnKind): z.ZodType {
	const type = (schema as any)._zod?.def?.type as string | undefined;
	if (!type || !FIELD_TYPES.has(type)) return schema;
	const kindOf = () => kind;
	let out: any = schema;
	for (const part of parts) {
		const natives = type === 'date' ? null : asNative(part, kind);
		if (natives) {
			for (const n of natives) {
				if (n.kind === 'nonEmpty') out = out.min(1, { name });
				else if (n.kind === 'regex') out = out.regex(n.value, { name });
				else if (type === 'bigint') {
					const b = bigintBound(n.value, n.kind);
					out = out[b.op](b.value, { name });
				} else out = out[n.kind](Number(n.value), { name });
			}
			continue;
		}
		const test = predicateOf(part, kindOf);
		if (!test) continue;
		out = out.refine((v: unknown) => test(() => v), { name, message: describe(part, name, kindOf) });
	}
	return out;
}

/** Adds the rules a single-column CHECK constraint guarantees for one field; returns the schema unchanged if nothing applies. */
export function applyCheckConstraint(
	schema: z.ZodType,
	sql: string,
	ref: string,
	name: string,
	kind: ValueKind | ColumnKind,
): z.ZodType {
	const expr = parseCheck(sql, ref);
	if (!expr) return schema;
	return applyCheckParts(schema, flattenAnd(expr), name, fromValueKind(kind));
}

export interface CheckColumn {
	/** the key in the zod object */
	key: string;
	/** the column's name in the database */
	name: string;
	kind: ColumnKind;
}

export interface ObjectCheckRule {
	name: string;
	/** keys the rule reads; it is skipped while any of them is undefined (omitted from the input) */
	keys: string[];
	/** where the issue is reported: the first column the expression reads */
	path: string;
	message: string;
	test: (value: Record<string, unknown>) => boolean;
}

/**
 * Splits a table CHECK into rules: parts that read one column (and pass for NULL, so they never need to
 * see one) are field rules, everything else is an object-level rule over the columns it reads.
 */
export function tableCheckRules(
	sql: string,
	name: string,
	columns: CheckColumn[],
	label: Label,
): { fields: Map<string, Expr[]>; objects: ObjectCheckRule[] } {
	const fields = new Map<string, Expr[]>();
	const objects: ObjectCheckRule[] = [];
	const byName = new Map(columns.map((c) => [c.name, c]));
	const resolve: Resolve = (n, quoted) => byName.get(quoted ? n : n.toLowerCase())?.key ?? null;
	const kinds = new Map(columns.map((c) => [c.key, c.kind]));
	const kindOf: KindOf = (key) => kinds.get(key) ?? { t: 'other' };
	const expr = parseWith(sql, resolve);
	if (!expr) return { fields, objects };

	for (const part of flattenAnd(expr)) {
		const keys = columnsOf(part);
		if (keys.length === 0) continue;
		const test = predicateOf(part, kindOf);
		if (!test) continue;
		if (keys.length === 1 && test(() => null)) {
			fields.set(keys[0]!, [...(fields.get(keys[0]!) ?? []), part]);
			continue;
		}
		objects.push({
			name,
			keys,
			path: keys[0]!,
			message: describe(part, name, kindOf, label),
			test: (value) => {
				if (keys.some((k) => value[k] === undefined)) return true;
				return test((k) => value[k]);
			},
		});
	}
	return { fields, objects };
}
