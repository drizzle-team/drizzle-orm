import type { z } from 'zod/v4';

/*
 * Turns postgres CHECK constraints into zod rules that accept exactly what postgres accepts.
 *
 * Each top-level AND-ed part of a constraint becomes either a native zod check (gte/lte/regex/...),
 * when that is exact, or a custom check that evaluates the expression with postgres semantics
 * (TRIM strips spaces only, length() counts characters, LIKE matches the whole string, numbers are
 * compared as exact decimals). Parts that use anything this evaluator doesn't model, or that reference
 * other columns, are skipped: the database still enforces them. Every rule is labelled with the
 * constraint name, so `schema.update({ 'field.<constraint_name>': '...' })` can override its message.
 */

export type ValueKind = 'string' | 'number' | 'bigint' | 'numeric-string';

// ---------------------------------------------------------------------------------------------
// tokens

type Tok =
	| { t: 'num'; v: string }
	| { t: 'str'; v: string }
	| { t: 'id'; v: string; quoted: boolean }
	| { t: 'op'; v: string }
	| { t: '(' }
	| { t: ')' }
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
			const prev = out[out.length - 1];
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
			const end = sql.indexOf('"', i + 1);
			if (end === -1) return null;
			out.push({ t: 'id', v: sql.slice(i + 1, end), quoted: true });
			i = end + 1;
			continue;
		}
		const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/i.exec(sql.slice(i));
		if (num) {
			out.push({ t: 'num', v: num[0] });
			i += num[0].length;
			continue;
		}
		const id = /^[a-z_][\w$]*/i.exec(sql.slice(i));
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
		if (c === '(' || c === ')' || c === ',') {
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

export type Expr =
	| { k: 'and' | 'or'; items: Expr[] }
	| { k: 'not'; e: Expr }
	| { k: 'cmp'; op: '=' | '<>' | '<' | '<=' | '>' | '>='; a: Expr; b: Expr }
	| { k: 'between'; e: Expr; lo: Expr; hi: Expr; neg: boolean }
	| { k: 'like'; e: Expr; pattern: string; ci: boolean; neg: boolean }
	| { k: 'regex'; e: Expr; pattern: string; ci: boolean; neg: boolean }
	| { k: 'in'; e: Expr; list: Expr[]; neg: boolean }
	| { k: 'isnull'; e: Expr; neg: boolean }
	| { k: 'call'; fn: string; args: Expr[]; trim?: 'both' | 'leading' | 'trailing' }
	| { k: 'col' }
	| { k: 'num'; v: string }
	| { k: 'str'; v: string }
	| { k: 'bool'; v: boolean };

class Unsupported extends Error {}

function parse(tokens: Tok[], ref: string): Expr {
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

	function skipCast() {
		// ::text, ::character varying, ::numeric(10,2), ::"my type", ::app.mood
		while (isOp('::')) {
			p++;
			expect('id');
			while (isOp('.')) {
				p++;
				expect('id');
			}
			while (kw('varying') || kw('precision') || kw('with') || kw('without') || kw('time') || kw('zone')) p++;
			if (peek()?.t === '(') {
				p++;
				while (peek() && peek()!.t !== ')') p++;
				expect(')');
			}
		}
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
			const op = (t.v === '!=' ? '<>' : t.v) as Extract<Expr, { k: 'cmp' }>['op'];
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
				const matches = quoted ? name === ref : name.toLowerCase() === ref.toLowerCase();
				if (!matches) throw new Unsupported(); // another column: not checkable per field
				e = { k: 'col' };
			}
		} else {
			throw new Unsupported();
		}
		skipCast();
		return e;
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

export function parseCheck(sql: string, ref: string): Expr | null {
	if (!ref) return null;
	const tokens = tokenize(sql.trim().replace(/^check\s*(?=\()/i, ''));
	if (!tokens) return null;
	try {
		return parse(tokens, ref);
	} catch (e) {
		if (e instanceof Unsupported) return null;
		throw e;
	}
}

// ---------------------------------------------------------------------------------------------
// exact decimals (postgres numeric comparisons without float rounding)

type Dec = { m: bigint; s: number };

function toDec(text: string): Dec | null {
	const m = /^([-+])?(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(text.trim());
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

// ---------------------------------------------------------------------------------------------
// compile to a predicate with postgres semantics (the value is never null here: nulls pass CHECKs)

type Ty = 'str' | 'num' | 'bool';
type Val = string | Dec | boolean;
type Fn = (v: unknown) => Val;

const PG_ONLY_REGEX = /\\[mMyYAZ]|\[\[[:.=]|\(\?[^:=!]/;

function regexFor(pattern: string, ci: boolean): RegExp {
	if (PG_ONLY_REGEX.test(pattern)) throw new Unsupported();
	try {
		return new RegExp(pattern, ci ? 'iu' : 'u');
	} catch {
		throw new Unsupported();
	}
}

function escapeRegex(value: string) {
	return value.replace(/[$()*+.?[\\\]^{|}\-/]/g, '\\$&');
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

const LENGTH_FNS = ['length', 'char_length', 'character_length'];
const CMP: Record<Extract<Expr, { k: 'cmp' }>['op'], (c: number) => boolean> = {
	'=': (c) => c === 0,
	'<>': (c) => c !== 0,
	'<': (c) => c < 0,
	'<=': (c) => c <= 0,
	'>': (c) => c > 0,
	'>=': (c) => c >= 0,
};

function compile(e: Expr, kind: ValueKind): { ty: Ty; fn: Fn } {
	switch (e.k) {
		case 'col': {
			if (kind === 'string') return { ty: 'str', fn: (v) => v as string };
			return {
				ty: 'num',
				fn: (v) => {
					const d = toDec(String(v));
					if (!d) throw new Unsupported(); // not a number: the type checks report it
					return d;
				},
			};
		}
		case 'num': {
			const d = toDec(e.v);
			if (!d) throw new Unsupported();
			return { ty: 'num', fn: () => d };
		}
		case 'str':
			return { ty: 'str', fn: () => e.v };
		case 'bool':
			return { ty: 'bool', fn: () => e.v };
		case 'call': {
			const args = e.args.map((a) => compile(a, kind));
			if (args.length !== 1 || args[0]!.ty !== 'str') throw new Unsupported();
			const f = args[0]!.fn;
			if (LENGTH_FNS.includes(e.fn)) {
				return { ty: 'num', fn: (v) => ({ m: BigInt(charLength(f(v) as string)), s: 0 }) };
			}
			if (['trim', 'btrim', 'ltrim', 'rtrim'].includes(e.fn)) {
				const mode = e.fn === 'ltrim' ? 'leading' : e.fn === 'rtrim' ? 'trailing' : e.trim ?? 'both';
				// postgres trims spaces only, not tabs or newlines
				const re = mode === 'leading' ? /^ +/ : mode === 'trailing' ? / +$/ : /^ +| +$/g;
				return { ty: 'str', fn: (v) => (f(v) as string).replace(re, '') };
			}
			if (e.fn === 'lower') return { ty: 'str', fn: (v) => (f(v) as string).toLowerCase() };
			if (e.fn === 'upper') return { ty: 'str', fn: (v) => (f(v) as string).toUpperCase() };
			throw new Unsupported();
		}
		case 'cmp': {
			const a = compile(e.a, kind);
			const b = compile(e.b, kind);
			if (a.ty !== b.ty || a.ty === 'bool') throw new Unsupported();
			// string ordering depends on the database collation
			if (a.ty === 'str' && e.op !== '=' && e.op !== '<>') throw new Unsupported();
			const test = CMP[e.op];
			if (a.ty === 'num') return { ty: 'bool', fn: (v) => test(cmpDec(a.fn(v) as Dec, b.fn(v) as Dec)) };
			return { ty: 'bool', fn: (v) => test(a.fn(v) === b.fn(v) ? 0 : 1) };
		}
		case 'between': {
			const x = compile(e.e, kind);
			const lo = compile(e.lo, kind);
			const hi = compile(e.hi, kind);
			if (x.ty !== 'num' || lo.ty !== 'num' || hi.ty !== 'num') throw new Unsupported();
			return {
				ty: 'bool',
				fn: (v) => {
					const d = x.fn(v) as Dec;
					const r = cmpDec(d, lo.fn(v) as Dec) >= 0 && cmpDec(d, hi.fn(v) as Dec) <= 0;
					return e.neg ? !r : r;
				},
			};
		}
		case 'like':
		case 'regex': {
			const x = compile(e.e, kind);
			if (x.ty !== 'str') throw new Unsupported();
			const re = e.k === 'like' ? likeRegex(e.pattern, e.ci) : regexFor(e.pattern, e.ci);
			return { ty: 'bool', fn: (v) => re.test(x.fn(v) as string) !== e.neg };
		}
		case 'in': {
			const x = compile(e.e, kind);
			const list = e.list.map((it) => compile(it, kind));
			if (x.ty === 'bool' || list.some((it) => it.ty !== x.ty)) throw new Unsupported();
			return {
				ty: 'bool',
				fn: (v) => {
					const val = x.fn(v);
					const found = list.some((it) =>
						x.ty === 'num' ? cmpDec(val as Dec, it.fn(v) as Dec) === 0 : val === it.fn(v)
					);
					return found !== e.neg;
				},
			};
		}
		case 'isnull': {
			if (e.e.k !== 'col') throw new Unsupported();
			return { ty: 'bool', fn: () => e.neg };
		}
		case 'not': {
			const x = compile(e.e, kind);
			if (x.ty !== 'bool') throw new Unsupported();
			return { ty: 'bool', fn: (v) => !x.fn(v) };
		}
		case 'and':
		case 'or': {
			const items = e.items.map((it) => compile(it, kind));
			if (items.some((it) => it.ty !== 'bool')) throw new Unsupported();
			if (e.k === 'and') return { ty: 'bool', fn: (v) => items.every((it) => it.fn(v)) };
			return { ty: 'bool', fn: (v) => items.some((it) => it.fn(v)) };
		}
	}
}

// ---------------------------------------------------------------------------------------------
// native zod checks where they are exact (standard issue codes, JSON schema, `update()` by method name)

type Native =
	| { kind: 'gte' | 'gt' | 'lte' | 'lt'; value: string }
	| { kind: 'nonEmpty' }
	| { kind: 'regex'; value: RegExp };

const FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=', '<>': '<>' } as const;
const NATIVE_CMP = { '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' } as const;

function asNative(e: Expr, kind: ValueKind): Native[] | null {
	const numeric = kind === 'number' || kind === 'bigint';
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
	if (kind === 'string') {
		// zod's min()/max() count UTF-16 units rather than characters, so only "non-empty" is identical;
		// other length bounds use the character-counting custom check
		if (e.k === 'cmp' && e.a.k === 'col' && e.b.k === 'str' && e.b.v === '' && e.op === '<>') {
			return [{ kind: 'nonEmpty' }];
		}
		if (e.k === 'regex' && !e.neg && e.e.k === 'col') {
			try {
				return [{ kind: 'regex', value: regexFor(e.pattern, e.ci) }];
			} catch {
				return null;
			}
		}
		if (e.k === 'like' && !e.neg && e.e.k === 'col') return [{ kind: 'regex', value: likeRegex(e.pattern, e.ci) }];
	}
	return null;
}

// ---------------------------------------------------------------------------------------------
// default messages

function lengthTarget(x: Expr): 'plain' | 'trimmed' | null {
	if (x.k !== 'call' || !LENGTH_FNS.includes(x.fn)) return null;
	const arg = x.args[0];
	if (arg?.k === 'col') return 'plain';
	if (arg?.k === 'call' && ['trim', 'btrim'].includes(arg.fn) && arg.args[0]?.k === 'col') return 'trimmed';
	return null;
}

// the part after "Must be ...", or null when there is no plain-language reading
function phrase(e: Expr): string | null {
	const chars = (n: string) => `${n} character${n === '1' ? '' : 's'}`;
	const suffix = (x: Expr) => lengthTarget(x) === 'trimmed' ? ', not counting leading or trailing spaces' : '';
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
	if (e.k === 'cmp' && e.a.k === 'col' && e.b.k === 'num') {
		const text = {
			'>=': 'at least',
			'>': 'greater than',
			'<=': 'at most',
			'<': 'less than',
			'=': 'equal to',
			'<>': 'different from',
		}[e.op];
		return `${text} ${e.b.v}`;
	}
	if (e.k === 'between' && !e.neg && e.e.k === 'col' && e.lo.k === 'num' && e.hi.k === 'num') {
		return `between ${e.lo.v} and ${e.hi.v}`;
	}
	if (e.k === 'in' && !e.neg && e.list.every((it) => it.k === 'str')) {
		return `one of ${e.list.map((it) => JSON.stringify((it as { v: string }).v)).join(', ')}`;
	}
	if (e.k === 'or') {
		const parts = e.items.map(phrase);
		return parts.every(Boolean) ? parts.join(' or ') : null;
	}
	return null;
}

function describe(e: Expr, name: string): string {
	const p = phrase(e);
	return p ? `Must be ${p}` : `Must satisfy ${name}`;
}

// ---------------------------------------------------------------------------------------------

function flattenAnd(e: Expr): Expr[] {
	return e.k === 'and' ? e.items.flatMap(flattenAnd) : [e];
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

/** Adds the rules a CHECK constraint guarantees for one field; returns the schema unchanged if nothing applies. */
export function applyCheckConstraint(
	schema: z.ZodType,
	sql: string,
	ref: string,
	name: string,
	kind: ValueKind,
): z.ZodType {
	const type = (schema as any)._zod?.def?.type as string | undefined;
	if (type !== 'string' && type !== 'number' && type !== 'bigint') return schema;
	const expr = parseCheck(sql, ref);
	if (!expr) return schema;

	let out: any = schema;
	for (const part of flattenAnd(expr)) {
		const natives = asNative(part, kind);
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
		let fn: Fn;
		try {
			const compiled = compile(part, kind);
			if (compiled.ty !== 'bool') continue;
			fn = compiled.fn;
		} catch (e) {
			if (e instanceof Unsupported) continue;
			throw e;
		}
		out = out.refine((v: unknown) => {
			try {
				return fn(v) as boolean;
			} catch (e) {
				// a value this evaluator can't read (e.g. not a number) is left to the other checks
				if (e instanceof Unsupported) return true;
				throw e;
			}
		}, { name, message: describe(part, name) });
	}
	return out;
}
