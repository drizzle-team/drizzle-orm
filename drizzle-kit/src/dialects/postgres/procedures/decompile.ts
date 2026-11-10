import { emitProcedure } from './emit';
import type { TryStmt } from './ir';
import type { DiagItem, Expr, FormatText, IdentExpr, PgScalarType, ProcedureIR, SqlText, Stmt } from './ir';

/**
 * PL/pgSQL → TS DSL decompiler ("pull" for procedures). Scope: the regular
 * subset the emitter produces — DECLARE block, p_/v_ naming, quoted INOUT results,
 * :=/IF/WHILE/FOR-IN/RAISE/GET DIAGNOSTICS/PERFORM-lock statements. The
 * input may be tspgc's own output or pg_get_functiondef() text from a live
 * database (header formatting differences are tolerated; the body text is
 * preserved verbatim by Postgres).
 *
 * Anything outside the subset fails LOUDLY with the offending line — the
 * DSL is a whitelist, so arbitrary plpgsql is unrepresentable by design.
 *
 * Verification is structural: the lifted ProcedureIR is re-emitted through
 * the ordinary emitter and compared against the (normalized) input, so a
 * successful decompile is PROVEN to mean the same SQL.
 */

export class DecompileError extends Error {
	constructor(
		message: string,
		readonly line?: string,
	) {
		super(line ? `${message}\n  at: ${line.trim()}` : message);
	}
}

export interface DecompiledProcedure {
	ir: ProcedureIR;
	/** Generated DSL source for this procedure (without imports). */
	ts: string;
	/** True when emit(lift(sql)) matched the input exactly (normalized). */
	verified: boolean;
}

export interface DecompileResult {
	/** A complete .ts module: imports + every procedure. */
	ts: string;
	procedures: DecompiledProcedure[];
}

// ── entry ────────────────────────────────────────────────────────────────────

/** Decompiles one or more CREATE [OR REPLACE] PROCEDURE statements. */
export function decompileSql(sqlInput: string): DecompileResult {
	const procedures: DecompiledProcedure[] = [];
	for (const block of splitProcedures(sqlInput)) {
		const ir = liftProcedure(block);
		const reEmitted = emitProcedure(ir);
		const verified = normalizeSql(reEmitted) === normalizeSql(block);
		const printer = new TsPrinter(ir);
		procedures.push({ ir, ts: printer.print(), verified });
	}
	const needsPgError = procedures.some((p) => p.ir.body.some(containsRaise));
	const typeAliases = new Set<string>();
	for (const p of procedures) collectTypeAliases(p.ts, typeAliases);
	// Schema-qualified procedures are declared on a pgSchema binding: tenant.procedure(...).
	const schemaVars = new Map<string, string>();
	for (const p of procedures) {
		if (p.ir.schema && !schemaVars.has(p.ir.schema)) {
			schemaVars.set(p.ir.schema, `${p.ir.schema.replace(/\W/g, '_')}Schema`);
		}
	}
	const importNames = [
		...(procedures.some((p) => !p.ir.schema) ? ['procedure'] : []),
		...(schemaVars.size > 0 ? ['pgSchema'] : []),
		...(needsPgError ? ['PgError'] : []),
		...[...typeAliases].sort(),
	];
	const header = `import { ${importNames.join(', ')} } from 'drizzle-orm/pg-core';\n\n`;
	const schemaDecls = [...schemaVars].map(([schema, v]) => `const ${v} = pgSchema('${schema}');\n\n`).join('');
	const body = procedures
		.map((p) => {
			const ts = p.ir.schema ? withCallee(p.ts, `${schemaVars.get(p.ir.schema)}.procedure`) : p.ts;
			return `export const ${p.ir.name} = ${ts};`;
		})
		.join('\n\n');
	return { ts: header + schemaDecls + body + '\n', procedures };
}

/** Printed procedures start with `procedure(`; a schema's procedures are called on its binding instead. */
export function withCallee(ts: string, callee: string): string {
	return ts.replace(/^procedure\(/, `${callee}(`);
}

export function containsRaise(stmt: Stmt): boolean {
	switch (stmt.kind) {
		case 'raise':
			return true;
		case 'if':
			return stmt.branches.some((b) => b.body.some(containsRaise)) || (stmt.elseBody?.some(containsRaise) ?? false);
		case 'while':
		case 'for-many':
		case 'try':
			return stmt.body.some(containsRaise);
		default:
			return false;
	}
}

/** The printer emits annotations like `: int` — collect which aliases it used. */
export function collectTypeAliases(ts: string, into: Set<string>): void {
	for (const m of ts.matchAll(/(?::| )\b(int|numeric|text|bigint_)\b/g)) into.add(m[1]);
}

function splitProcedures(input: string): string[] {
	const blocks: string[] = [];
	const re = /CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE/gi;
	const starts: number[] = [];
	for (const m of input.matchAll(re)) starts.push(m.index);
	if (starts.length === 0) throw new DecompileError('no CREATE PROCEDURE statement found in input');
	for (let i = 0; i < starts.length; i++) {
		blocks.push(input.slice(starts[i], starts[i + 1] ?? input.length).trim());
	}
	return blocks;
}

/** Whitespace-insensitive comparison form (per-line trim-right, no blank lines). */
function normalizeSql(sql: string): string {
	return sql
		.split('\n')
		.map((l) => l.replace(/\s+$/, ''))
		.filter((l) => l.trim() !== '')
		.join('\n')
		.trim()
		.replace(/;$/, '');
}

// ── header + body parsing ────────────────────────────────────────────────────

export interface ParsedParam {
	/** `inout` = a result parameter (`INOUT "<key>" <type> DEFAULT NULL`). */
	mode: 'in' | 'inout';
	/**
	 * Spelling without quotes. Result (INOUT) names are case-exact; IN names are
	 * unquoted, so PostgreSQL folds them — compare via {@link paramIdentity}.
	 */
	name: string;
	type: string;
	default?: string;
}

/**
 * Parses a procedure parameter list — the emitter's spelling or Postgres's
 * (`pg_get_function_arguments()`: `p_a integer, INOUT "newBalance" numeric
 * DEFAULT NULL::numeric` — Postgres quotes names only when it must). Defaults
 * are canonicalized to the emitter's form.
 */
export function parseParamList(rawParams: string): ParsedParam[] {
	const params: ParsedParam[] = [];
	for (const piece of splitTopLevel(rawParams, ',')) {
		const p = piece.trim();
		if (!p) continue;
		const m = p.match(/^(?:(IN|OUT|INOUT)\s+)?([A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+")\s+(.+)$/i);
		if (!m) throw new DecompileError(`unrecognized parameter declaration`, p);
		const mode = (m[1] ?? 'IN').toLowerCase();
		if (mode === 'out') {
			throw new DecompileError(
				'OUT parameters are not representable in the DSL (results are INOUT ... DEFAULT NULL)',
				p,
			);
		}
		const [typeText, defaultText] = splitDefault(m[3].trim());
		const name = m[2].startsWith('"') ? m[2].slice(1, -1).replaceAll('""', '"') : m[2];
		if (mode === 'inout' && (defaultText === undefined || normalizeDefault(defaultText, p) !== 'NULL')) {
			throw new DecompileError('INOUT parameters must be DEFAULT NULL result parameters', p);
		}
		params.push({
			mode: mode as 'in' | 'inout',
			name,
			type: typeText.toLowerCase(),
			...(defaultText !== undefined ? { default: normalizeDefault(defaultText, p) } : {}),
		});
	}
	return params;
}

function liftProcedure(block: string): ProcedureIR {
	const headerMatch = block.match(
		// Postgres quotes keyword names in pg_get_functiondef(): public."left"().
		/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+(?:"?([A-Za-z_][A-Za-z0-9_]*)"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(([\s\S]*?)\)\s*LANGUAGE\s+plpgsql/i,
	);
	if (!headerMatch) {
		throw new DecompileError('unrecognized CREATE PROCEDURE header (only LANGUAGE plpgsql is supported)');
	}
	const [, schemaName, name, rawParams] = headerMatch;
	// pg_get_functiondef() always qualifies; the DSL leaves public procedures unqualified.
	const schema = schemaName && schemaName !== 'public' ? schemaName : undefined;

	const params = parseParamList(rawParams);

	const bodyMatch = block.match(/AS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1/);
	if (!bodyMatch) throw new DecompileError('could not locate the dollar-quoted procedure body');
	const body = bodyMatch[2];

	const lines = body
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '');

	// DECLARE section
	const decls = new Map<string, string>(); // emitted name -> pg type
	let i = 0;
	// Emitted for every procedure with results (see emitProcedure); the
	// re-emit verification checks it is present exactly when it should be.
	if (lines[i] === '#variable_conflict use_column') i++;
	if (lines[i] === 'DECLARE') {
		i++;
		while (i < lines.length && lines[i] !== 'BEGIN') {
			const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+);$/);
			if (!m) throw new DecompileError('unrecognized DECLARE entry', lines[i]);
			decls.set(m[1], m[2].toLowerCase());
			i++;
		}
	}
	if (lines[i] !== 'BEGIN') throw new DecompileError('expected BEGIN', lines[i]);
	i++;
	const endIdx = lines.lastIndexOf('END;');
	if (endIdx === -1) throw new DecompileError('expected END;');

	// Result (INOUT) parameters are only ever assigned — and, being unprefixed, their names can equal SQL
	// words in the body (`count(*) AS n` with a result `n`), so they must never be read as identifiers.
	const knownIdents = new Set<string>([...params.filter((p) => p.mode === 'in').map((p) => p.name), ...decls.keys()]);
	const parser = new BodyParser(lines.slice(i, endIdx), knownIdents);
	const stmts = parser.parseStatements();

	return {
		name,
		...(schema !== undefined ? { schema } : {}),
		dependsOn: [],
		params: params
			.filter((p) => p.mode === 'in')
			.map((p) => ({
				emitted: p.name,
				type: normalizePgType(p.type, p.name),
				...(p.default !== undefined ? { default: p.default } : {}),
			})),
		returns: params
			.filter((p) => p.mode === 'inout')
			.map((p) => {
				if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.name)) {
					throw new DecompileError(`result parameter "${p.name}" is not a valid TypeScript identifier`);
				}
				return { key: p.name, emitted: quoteResult(p.name), type: normalizePgType(p.type, p.name) };
			}),
		decls: [...decls.entries()].map(([emitted, type]) => ({
			emitted,
			type: type === 'record' ? 'record' : normalizePgType(type, emitted),
		})),
		body: stmts,
	};
}

function normalizePgType(type: string, where: string): PgScalarType {
	switch (type.trim()) {
		case 'integer':
		case 'int':
		case 'int4':
			return 'integer';
		case 'bigint':
		case 'int8':
			return 'bigint';
		case 'numeric':
			return 'numeric';
		case 'text':
			return 'text';
		case 'boolean':
		case 'bool':
			return 'boolean';
		default:
			throw new DecompileError(
				`unsupported SQL type '${type}' (for '${where}') — the DSL supports integer/bigint/numeric/text/boolean`,
			);
	}
}

function stripPrefix(name: string, prefix: string): string {
	return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** Split on a separator at paren/quote nesting depth zero. */
/** `integer DEFAULT 20` → ['integer', '20']. */
function splitDefault(text: string): [string, string | undefined] {
	const m = text.match(/^(.*?)\s+DEFAULT\s+(.+)$/i);
	return m ? [m[1], m[2].trim()] : [text, undefined];
}

/**
 * Canonicalizes a DEFAULT to the emitter's spelling. pg_get_functiondef()
 * adds casts and quotes non-integer numerics: `'-1.5'::numeric`,
 * `'eur'::text`, `NULL::integer`, `true`.
 */
/** The identifier PostgreSQL sees: results are emitted quoted (case-exact), IN params unquoted (folded). */
export function paramIdentity(p: ParsedParam): string {
	return p.mode === 'inout' ? p.name : p.name.toLowerCase();
}

/** The emitter's spelling of a result parameter: always quoted. */
function quoteResult(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

function normalizeDefault(text: string, where: string): string {
	let t = text.replace(/::[a-z ]+$/i, '').trim();
	if (/^NULL$/i.test(t)) return 'NULL';
	if (/^true$/i.test(t)) return 'TRUE';
	if (/^false$/i.test(t)) return 'FALSE';
	const quotedNum = t.match(/^'(-?[0-9]+(?:\.[0-9]+)?)'$/);
	if (quotedNum) t = quotedNum[1];
	if (/^-?[0-9]+(\.[0-9]+)?$/.test(t) || /^'(?:[^']|'')*'$/.test(t)) return t;
	throw new DecompileError('parameter DEFAULT must be a literal', where);
}

/** Index of `token` at paren depth 0 outside '...' strings, or -1. */
function indexOfTopLevel(text: string, token: string): number {
	let depth = 0;
	let inQuote = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuote) {
			if (c === "'") {
				if (text[i + 1] === "'") i++;
				else inQuote = false;
			}
			continue;
		}
		if (c === "'") inQuote = true;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (depth === 0 && text.startsWith(token, i)) return i;
	}
	return -1;
}

/** Reads a leading '...' SQL string literal: returns [unescaped-by-'' text, rest]. */
function readQuoted(text: string, where: string): [string, string] {
	if (text[0] !== "'") throw new DecompileError('expected a string literal', where);
	let out = '';
	for (let i = 1; i < text.length; i++) {
		if (text[i] === "'") {
			if (text[i + 1] === "'") {
				out += "'";
				i++;
				continue;
			}
			return [out, text.slice(i + 1)];
		}
		out += text[i];
	}
	throw new DecompileError('unterminated string literal', where);
}

/** Splits a format string on its placeholder (`%` or `%s`); `%%` is a literal %. */
function splitFormat(fmt: string, placeholder: '%' | '%s', where: string): string[] {
	const parts: string[] = [];
	let current = '';
	for (let i = 0; i < fmt.length; i++) {
		if (fmt[i] !== '%') {
			current += fmt[i];
			continue;
		}
		if (fmt[i + 1] === '%') {
			current += '%';
			i++;
		} else if (placeholder === '%') {
			parts.push(current);
			current = '';
		} else if (fmt[i + 1] === 's') {
			parts.push(current);
			current = '';
			i++;
		} else {
			throw new DecompileError('unsupported format() placeholder', where);
		}
	}
	parts.push(current);
	return parts;
}

function splitTopLevel(text: string, sep: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let inQuote = false;
	let current = '';
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuote) {
			current += c;
			if (c === "'") inQuote = text[i + 1] === "'" ? ((current += "'"), i++, true) : false;
			continue;
		}
		if (c === "'") inQuote = true;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		if (c === sep && depth === 0 && !inQuote) {
			out.push(current);
			current = '';
			continue;
		}
		current += c;
	}
	out.push(current);
	return out;
}

// ── statement parsing (line-oriented — matches the emitter's layout) ─────────

class BodyParser {
	private pos = 0;
	constructor(
		private readonly lines: string[],
		private readonly knownIdents: ReadonlySet<string>,
	) {}

	parseStatements(terminators: string[] = []): Stmt[] {
		const out: Stmt[] = [];
		while (this.pos < this.lines.length) {
			const line = this.lines[this.pos];
			if (terminators.some((t) => line === t || line.startsWith(t))) return out;
			out.push(...this.parseStatement());
		}
		return out;
	}

	private next(): string {
		return this.lines[this.pos++];
	}

	private peek(): string | undefined {
		return this.lines[this.pos];
	}

	/**
	 * The emitter's ctx.try() block: BEGIN <body> EXCEPTION, then one
	 * `WHEN <cond> THEN` handler per condition holding either `NULL;` or
	 * `v_<err>__code := '<cond>';` [+ GET STACKED DIAGNOSTICS ...;], END;
	 */
	private parseTry(): Stmt {
		const body = this.parseStatements(['EXCEPTION']);
		this.expect('EXCEPTION');
		const conditions: string[] = [];
		let err: TryStmt['err'];
		let first = true;
		while (this.peek() !== 'END;') {
			const when = this.next();
			const wm = when?.match(/^WHEN (?:([a-z_]+)|SQLSTATE '([0-9A-Z]{5})') THEN$/);
			if (!wm) throw new DecompileError('unrecognized exception handler', when ?? '(end of body)');
			const cond = wm[1] ?? wm[2];
			conditions.push(cond);
			const h = this.next();
			if (h === 'NULL;') {
				if (!first && err) throw new DecompileError('exception handlers disagree on the error binding', h);
				first = false;
				continue;
			}
			const cm = h?.match(/^([A-Za-z_][A-Za-z0-9_]*) := '([^']*)';$/);
			if (!cm || cm[2] !== cond || !/^v_[A-Za-z0-9_]+__code$/.test(cm[1])) {
				throw new DecompileError('exception handlers must only record the matched condition', h ?? when);
			}
			const items: { variable: string; item: DiagItem }[] = [];
			if (this.peek()?.startsWith('GET STACKED DIAGNOSTICS ')) {
				const g = this.next();
				const list = g.slice('GET STACKED DIAGNOSTICS '.length, -1);
				for (const piece of list.split(',')) {
					const im = piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*) = ([A-Z_]+)$/);
					if (!im) throw new DecompileError('unrecognized GET STACKED DIAGNOSTICS item', g);
					items.push({ variable: im[1], item: im[2] as DiagItem });
				}
			}
			const name = cm[1].slice(2, -'__code'.length);
			if (first) err = { name, codeVar: cm[1], items };
			else if (!err || err.codeVar !== cm[1] || JSON.stringify(err.items) !== JSON.stringify(items)) {
				throw new DecompileError('exception handlers disagree on the error binding', h);
			}
			first = false;
		}
		this.expect('END;');
		const stmt: TryStmt = { kind: 'try', body, conditions };
		if (err) stmt.err = err;
		// res: the body's trailing assignments to v_<res>__<key> (the visitor's
		// lowering of the body's `return { ... }`).
		const trailing: { key: string; emitted: string }[] = [];
		let resName: string | undefined;
		for (let i = body.length - 1; i >= 0; i--) {
			const st = body[i];
			const m = st.kind === 'assign'
				? st.target.match(/^v_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*?)__([a-z_][a-z0-9_]*)$/)
				: null;
			if (!m || (resName !== undefined && m[1] !== resName) || (err && m[1] === err.name)) break;
			resName = m[1];
			trailing.unshift({ key: m[2], emitted: (st as Extract<Stmt, { kind: 'assign' }>).target });
		}
		if (resName !== undefined) stmt.res = { name: resName, fields: trailing };
		return stmt;
	}

	/** `RAISE <level> '<fmt>'[, args] [USING ERRCODE = '...'[, DETAIL = ...][, HINT = ...]];` */
	private parseRaise(line: string): Stmt {
		const lm = line.match(/^RAISE (EXCEPTION|NOTICE|WARNING) /);
		if (!lm || !line.endsWith(';')) throw new DecompileError('unrecognized RAISE', line);
		const [fmt, afterFmt] = readQuoted(line.slice(lm[0].length, -1), line);
		const usingAt = indexOfTopLevel(afterFmt, ' USING ');
		const argText = usingAt === -1 ? afterFmt : afterFmt.slice(0, usingAt);
		const usingText = usingAt === -1 ? undefined : afterFmt.slice(usingAt + ' USING '.length);
		let argTexts: string[] = [];
		if (argText.trim() !== '') {
			if (!argText.startsWith(', ')) throw new DecompileError('unrecognized RAISE arguments', line);
			argTexts = splitTopLevel(argText.slice(2), ',').map((a) => a.trim());
		}
		let message: FormatText;
		if (fmt === '%' && argTexts.length === 1 && argTexts[0].startsWith('format(')) {
			// The emitter's fallback for messages RAISE's own format cannot spell.
			message = this.parseFormatValue(argTexts[0], line);
		} else {
			const args = argTexts.map((a) => parseExpr(a, this.knownIdents));
			message = { parts: splitFormat(fmt, '%', line), args };
			if (message.parts.length !== args.length + 1) {
				throw new DecompileError('RAISE placeholder/argument mismatch', line);
			}
		}

		if (lm[1] !== 'EXCEPTION') {
			if (usingText !== undefined) throw new DecompileError('RAISE NOTICE/WARNING options are not representable', line);
			return { kind: 'notice', level: lm[1] as 'NOTICE' | 'WARNING', message };
		}
		if (usingText === undefined) throw new DecompileError('RAISE EXCEPTION without USING ERRCODE', line);
		const opts = splitTopLevel(usingText, ',').map((o) => o.trim());
		const code = opts.shift()?.match(/^ERRCODE = '([0-9A-Z]{5})'$/);
		if (!code) throw new DecompileError('RAISE EXCEPTION must start its USING clause with ERRCODE', line);
		const raise: Extract<Stmt, { kind: 'raise' }> = { kind: 'raise', errcode: code[1], message };
		for (const opt of opts) {
			const om = opt.match(/^(DETAIL|HINT) = (.+)$/);
			if (!om) throw new DecompileError('unsupported RAISE option', line);
			const key = om[1].toLowerCase() as 'detail' | 'hint';
			if (raise[key]) throw new DecompileError(`duplicate RAISE ${om[1]}`, line);
			raise[key] = this.parseFormatValue(om[2], line);
		}
		return raise;
	}

	/** `'text'` or `format('a %s b', x)` — the emitter's USING-value spellings. */
	private parseFormatValue(text: string, line: string): FormatText {
		if (text.startsWith("'")) {
			const [value, rest] = readQuoted(text, line);
			if (rest !== '') throw new DecompileError('unsupported RAISE option value', line);
			return { parts: [value], args: [] };
		}
		const fm = text.match(/^format\((.*)\)$/);
		if (!fm) throw new DecompileError('unsupported RAISE option value', line);
		const [fmt, rest] = readQuoted(fm[1], line);
		if (!rest.startsWith(', ')) throw new DecompileError('format() without arguments', line);
		const args = splitTopLevel(rest.slice(2), ',').map((a) => parseExpr(a.trim(), this.knownIdents));
		const parts = splitFormat(fmt, '%s', line);
		if (parts.length !== args.length + 1) throw new DecompileError('format() placeholder/argument mismatch', line);
		return { parts, args };
	}

	private parseStatement(): Stmt[] {
		const line = this.next();

		if (line === 'RETURN;') return [{ kind: 'return' }];
		if (line === 'EXIT;') return [{ kind: 'exit' }];
		if (line === 'CONTINUE;') return [{ kind: 'continue' }];
		if (line === 'COMMIT;') return [{ kind: 'commit' }];
		if (line === 'ROLLBACK;') return [{ kind: 'rollback' }];

		if (line.startsWith('RAISE ')) return [this.parseRaise(line)];
		if (line === 'BEGIN') return [this.parseTry()];

		let m: RegExpMatchArray | null;

		m = line.match(/^GET DIAGNOSTICS ([A-Za-z_][A-Za-z0-9_]*) = ROW_COUNT;$/);
		if (m) throw new DecompileError('GET DIAGNOSTICS without a preceding SQL statement', line);

		m = line.match(/^([A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+") := (.+);$/);
		if (m) return [{ kind: 'assign', target: m[1], expr: parseExpr(m[2], this.knownIdents) }];

		if (line.startsWith('IF ')) return this.parseIf(line);

		m = line.match(/^WHILE (.+) LOOP$/);
		if (m) {
			const cond = parseExpr(m[1], this.knownIdents);
			const body = this.parseStatements(['END LOOP;']);
			this.expect('END LOOP;');
			return [{ kind: 'while', cond, body }];
		}

		m = line.match(/^FOR ([A-Za-z_][A-Za-z0-9_]*) IN (.+) LOOP$/);
		if (m) {
			const sql = liftSqlText(m[2], this.knownIdents);
			const body = this.parseStatements(['END LOOP;']);
			this.expect('END LOOP;');
			return [{ kind: 'for-many', sql, recordVar: m[1], body }];
		}

		m = line.match(/^PERFORM 1 FROM ([A-Za-z_][A-Za-z0-9_.]*) WHERE id IN \(([^)]*)\) ORDER BY id FOR UPDATE;$/);
		if (m) {
			const ids = m[2].split(',').map((s): IdentExpr => {
				const t = s.trim();
				if (!this.knownIdents.has(t)) throw new DecompileError(`lock id '${t}' is not a parameter or local`, line);
				return { kind: 'ident', emitted: t };
			});
			return [{ kind: 'lock-rows', table: m[1], ids }];
		}

		// SQL statement (UPDATE/INSERT/SELECT/DELETE ...), possibly with an
		// INTO [STRICT] suffix and a paired GET DIAGNOSTICS on the next line.
		if (/^(SELECT|UPDATE|INSERT|DELETE|WITH|VALUES|TABLE)\b/i.test(line)) {
			if (!line.endsWith(';')) {
				throw new DecompileError('multi-line SQL statements are not supported by the decompiler', line);
			}
			let text = line.slice(0, -1);
			let into: string | undefined;
			let strict = false;
			const intoMatch = text.match(/^(.*) INTO (STRICT )?([A-Za-z_][A-Za-z0-9_]*)$/);
			if (intoMatch) {
				text = intoMatch[1];
				strict = intoMatch[2] !== undefined;
				into = intoMatch[3];
			}
			let countVar: string | undefined;
			const follow = this.peek()?.match(/^GET DIAGNOSTICS ([A-Za-z_][A-Za-z0-9_]*) = ROW_COUNT;$/);
			if (follow) {
				countVar = follow[1];
				this.pos++;
			}
			const sql = liftSqlText(text, this.knownIdents);
			if (into && strict) return [{ kind: 'sql-one', sql, into }];
			if (into && countVar) return [{ kind: 'sql-maybe-one', sql, into, countVar }];
			if (into) throw new DecompileError('INTO without STRICT or GET DIAGNOSTICS is not a tspgc pattern', line);
			if (countVar) return [{ kind: 'sql', sql, result: { countVar } }];
			return [{ kind: 'sql', sql }];
		}

		throw new DecompileError('unsupported PL/pgSQL statement — outside the DSL subset', line);
	}

	private parseIf(firstLine: string): Stmt[] {
		const branches: { cond: Expr; body: Stmt[] }[] = [];
		let elseBody: Stmt[] | undefined;
		let line = firstLine;
		for (;;) {
			const m = line.match(/^(?:IF|ELSIF) (.+) THEN$/);
			if (!m) throw new DecompileError('unrecognized IF/ELSIF header', line);
			const cond = parseExpr(m[1], this.knownIdents);
			const body = this.parseStatements(['ELSIF ', 'ELSE', 'END IF;']);
			branches.push({ cond, body });
			const nextLine = this.peek();
			if (nextLine === 'END IF;') {
				this.pos++;
				break;
			}
			if (nextLine === 'ELSE') {
				this.pos++;
				elseBody = this.parseStatements(['END IF;']);
				this.expect('END IF;');
				break;
			}
			line = this.next(); // ELSIF ...
		}
		return [{ kind: 'if', branches, elseBody }];
	}

	private expect(line: string): void {
		const got = this.next();
		if (got !== line) throw new DecompileError(`expected '${line}'`, got);
	}
}

/**
 * Splits emitted SQL text back into parts + identifier interpolations: any
 * bare identifier outside quotes that names a param/local/out becomes a
 * hole (the exact inverse of emitSqlText).
 */
function liftSqlText(text: string, knownIdents: ReadonlySet<string>): SqlText {
	const parts: string[] = [];
	const args: IdentExpr[] = [];
	let current = '';
	let i = 0;
	let inSingle = false;
	let inDouble = false;
	while (i < text.length) {
		const c = text[i];
		if (inSingle) {
			current += c;
			if (c === "'") {
				if (text[i + 1] === "'") {
					current += "'";
					i += 2;
					continue;
				}
				inSingle = false;
			}
			i++;
			continue;
		}
		if (inDouble) {
			current += c;
			if (c === '"') inDouble = false;
			i++;
			continue;
		}
		if (c === "'") {
			inSingle = true;
			current += c;
			i++;
			continue;
		}
		if (c === '"') {
			inDouble = true;
			current += c;
			i++;
			continue;
		}
		if (/[A-Za-z_]/.test(c)) {
			let j = i;
			while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
			const word = text.slice(i, j);
			if (knownIdents.has(word)) {
				parts.push(current);
				current = '';
				args.push({ kind: 'ident', emitted: word });
			} else {
				current += word;
			}
			i = j;
			continue;
		}
		current += c;
		i++;
	}
	parts.push(current);
	return { parts, args };
}

// ── expression parsing (inverse of emitExpr) ─────────────────────────────────

type Token =
	| { t: 'ident'; v: string }
	| { t: 'num'; v: string }
	| { t: 'str'; v: string }
	| { t: 'op'; v: string }
	| { t: 'kw'; v: string };

function tokenizeExpr(text: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const kw = new Set(['AND', 'OR', 'NOT', 'IS', 'NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'TRUE', 'FALSE']);
	while (i < text.length) {
		const c = text[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (/[A-Za-z_]/.test(c)) {
			let j = i;
			while (j < text.length && /[A-Za-z0-9_.]/.test(text[j])) j++;
			const word = text.slice(i, j);
			tokens.push(
				kw.has(word.toUpperCase()) && !word.includes('.')
					? { t: 'kw', v: word.toUpperCase() }
					: { t: 'ident', v: word },
			);
			i = j;
			continue;
		}
		if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
			let j = i;
			while (j < text.length && /[0-9.eE+-]/.test(text[j])) {
				if ((text[j] === '+' || text[j] === '-') && !/[eE]/.test(text[j - 1])) break;
				j++;
			}
			tokens.push({ t: 'num', v: text.slice(i, j) });
			i = j;
			continue;
		}
		if (c === "'") {
			let j = i + 1;
			let v = '';
			while (j < text.length) {
				if (text[j] === "'") {
					if (text[j + 1] === "'") {
						v += "'";
						j += 2;
						continue;
					}
					break;
				}
				v += text[j];
				j++;
			}
			tokens.push({ t: 'str', v });
			i = j + 1;
			continue;
		}
		const three = text.slice(i, i + 2);
		if (three === '<>' || three === '<=' || three === '>=' || three === '||') {
			tokens.push({ t: 'op', v: three });
			i += 2;
			continue;
		}
		if ('=<>+-*/%(),'.includes(c)) {
			tokens.push({ t: 'op', v: c });
			i++;
			continue;
		}
		throw new DecompileError(`unrecognized character '${c}' in expression`, text);
	}
	return tokens;
}

function parseExpr(text: string, knownIdents: ReadonlySet<string>): Expr {
	const tokens = tokenizeExpr(text);
	let pos = 0;
	const peek = () => tokens[pos];
	const next = () => tokens[pos++];
	const atOp = (v: string) => peek()?.t === 'op' && peek().v === v;
	const atKw = (v: string) => peek()?.t === 'kw' && peek().v === v;

	// Precedence mirrors the emitter: OR < AND < NOT < cmp/IS < || < +- < */% < unary
	function parseOr(): Expr {
		let left = parseAnd();
		while (atKw('OR')) {
			next();
			left = { kind: 'binary', op: 'OR', left, right: parseAnd() };
		}
		return left;
	}
	function parseAnd(): Expr {
		let left = parseNot();
		while (atKw('AND')) {
			next();
			left = { kind: 'binary', op: 'AND', left, right: parseNot() };
		}
		return left;
	}
	function parseNot(): Expr {
		if (atKw('NOT')) {
			next();
			return { kind: 'not', operand: parseNot() };
		}
		return parseCmp();
	}
	function parseCmp(): Expr {
		const left = parseConcat();
		const t = peek();
		if (t?.t === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(t.v)) {
			next();
			return { kind: 'binary', op: t.v as '=', left, right: parseConcat() };
		}
		if (atKw('IS')) {
			next();
			if (!atKw('NULL')) throw new DecompileError('only IS NULL is supported', text);
			next();
			return { kind: 'is-null', operand: left };
		}
		return left;
	}
	function parseConcat(): Expr {
		let left = parseAdd();
		while (atOp('||')) {
			next();
			left = { kind: 'binary', op: '||', left, right: parseAdd() };
		}
		return left;
	}
	function parseAdd(): Expr {
		let left = parseMul();
		while (atOp('+') || atOp('-')) {
			const op = next().v as '+' | '-';
			left = { kind: 'binary', op, left, right: parseMul() };
		}
		return left;
	}
	function parseMul(): Expr {
		let left = parseUnary();
		while (atOp('*') || atOp('/') || atOp('%')) {
			const op = next().v as '*' | '/' | '%';
			left = { kind: 'binary', op, left, right: parseUnary() };
		}
		return left;
	}
	function parseUnary(): Expr {
		if (atOp('-')) {
			next();
			const operand = parseUnary();
			if (operand.kind === 'literal') return { kind: 'literal', sql: `-${operand.sql}` };
			return { kind: 'neg', operand };
		}
		return parseAtom();
	}
	function parseAtom(): Expr {
		const t = peek();
		if (!t) throw new DecompileError('unexpected end of expression', text);
		if (t.t === 'op' && t.v === '(') {
			next();
			const inner = parseOr();
			if (!atOp(')')) throw new DecompileError("expected ')'", text);
			next();
			return inner;
		}
		if (t.t === 'num') {
			next();
			return { kind: 'literal', sql: t.v };
		}
		if (t.t === 'str') {
			next();
			return { kind: 'literal', sql: `'${t.v.replaceAll("'", "''")}'` };
		}
		if (t.t === 'kw' && (t.v === 'TRUE' || t.v === 'FALSE' || t.v === 'NULL')) {
			next();
			return { kind: 'literal', sql: t.v };
		}
		if (t.t === 'kw' && t.v === 'CASE') {
			next();
			if (!atKw('WHEN')) throw new DecompileError('expected WHEN', text);
			next();
			const cond = parseOr();
			if (!atKw('THEN')) throw new DecompileError('expected THEN', text);
			next();
			const then = parseOr();
			if (!atKw('ELSE')) throw new DecompileError('expected ELSE', text);
			next();
			const els = parseOr();
			if (!atKw('END')) throw new DecompileError('expected END', text);
			next();
			return { kind: 'case-when', cond, then, else: els };
		}
		if (t.t === 'ident') {
			next();
			if (t.v.toLowerCase() === 'coalesce' && atOp('(')) {
				next();
				const args: Expr[] = [parseOr()];
				while (atOp(',')) {
					next();
					args.push(parseOr());
				}
				if (!atOp(')')) throw new DecompileError("expected ')'", text);
				next();
				return { kind: 'coalesce', args };
			}
			if (t.v.includes('.')) {
				const [record, field] = t.v.split('.');
				return { kind: 'field', record, field };
			}
			if (!knownIdents.has(t.v)) throw new DecompileError(`unknown identifier '${t.v}' in expression`, text);
			return { kind: 'ident', emitted: t.v };
		}
		throw new DecompileError(`unexpected token '${'v' in t ? t.v : ''}' in expression`, text);
	}

	const result = parseOr();
	if (pos !== tokens.length) throw new DecompileError('trailing tokens in expression', text);
	return result;
}

// ── TS printing (inverse of the visitor's lowering) ──────────────────────────

const PG_TO_ANNOTATION: Record<string, string> = {
	integer: 'int',
	bigint: 'bigint_',
	numeric: 'numeric',
	text: 'text',
	boolean: 'boolean',
};

class TsPrinter {
	private readonly lines: string[] = [];
	private readonly paramNames: Set<string>;
	private readonly countOwners = new Map<string, string>(); // v_x__count -> v_x
	private readonly recordDecls = new Set<string>();
	private readonly scalarDecls = new Map<string, PgScalarType>();
	private readonly assignedTwice = new Set<string>();
	/** ctx.try() variables → their DSL spelling (`res.id`, `err.message`, `err.code`). */
	private readonly tryNames = new Map<string, string>();
	/** ctx.try() error code variables → the err binding name. */
	private readonly tryCodeVars = new Map<string, string>();
	/** Locals that are ever assigned NULL — declared `T | null`. */
	private readonly nullableLocals = new Set<string>();
	private readonly declaredLocals = new Set<string>();
	private readonly usedDsl = new Set<string>();
	private readonly fieldUsage = new Map<string, Map<string, { pg: string; nullable: boolean }>>();

	constructor(private readonly ir: ProcedureIR) {
		this.paramNames = new Set(ir.params.map((p) => p.emitted));
		for (const d of ir.decls) {
			if (d.emitted.endsWith('__count')) this.countOwners.set(d.emitted, d.emitted.slice(0, -'__count'.length));
			else if (d.type === 'record') this.recordDecls.add(d.emitted);
			else this.scalarDecls.set(d.emitted, d.type);
		}
		this.analyze(ir.body);
	}

	/** Pre-pass: which locals are assigned more than once; record field usage. */
	private analyze(stmts: Stmt[], seen = new Set<string>()): void {
		for (const stmt of stmts) {
			switch (stmt.kind) {
				case 'assign': {
					if (seen.has(stmt.target)) this.assignedTwice.add(stmt.target);
					seen.add(stmt.target);
					if (stmt.expr.kind === 'literal' && stmt.expr.sql === 'NULL') this.nullableLocals.add(stmt.target);
					// The assignment target's declared type (OUT param or local) is
					// the strongest field-typing signal: o_charged := v_row.balance.
					const targetType = this.ir.returns.find((r) => r.emitted === stmt.target)?.type
						?? this.scalarDecls.get(stmt.target);
					this.analyzeExpr(stmt.expr, targetType ? { pg: targetType } : undefined);
					break;
				}
				case 'if':
					for (const b of stmt.branches) {
						this.analyzeExpr(b.cond, { pg: 'boolean' });
						this.analyze(b.body, seen);
					}
					if (stmt.elseBody) this.analyze(stmt.elseBody, seen);
					break;
				case 'while':
					this.analyzeExpr(stmt.cond, { pg: 'boolean' });
					this.analyze(stmt.body, seen);
					break;
				case 'for-many':
					this.analyze(stmt.body, seen);
					break;
				case 'try':
					this.analyze(stmt.body, seen);
					for (const f of stmt.res?.fields ?? []) this.tryNames.set(f.emitted, `${stmt.res!.name}.${f.key}`);
					if (stmt.err) {
						this.tryCodeVars.set(stmt.err.codeVar, stmt.err.name);
						this.tryNames.set(stmt.err.codeVar, `${stmt.err.name}.code`);
						for (const it of stmt.err.items) {
							this.tryNames.set(it.variable, `${stmt.err.name}.${it.variable.slice(`v_${stmt.err.name}__`.length)}`);
						}
					}
					break;
				case 'notice':
					for (const a of stmt.message.args) this.analyzeExpr(a);
					break;
				case 'raise':
					for (const a of [...stmt.message.args, ...(stmt.detail?.args ?? []), ...(stmt.hint?.args ?? [])]) {
						this.analyzeExpr(a);
					}
					break;
				default:
					break;
			}
		}
	}

	private analyzeExpr(expr: Expr, context?: { pg: string; nullable?: boolean }): void {
		switch (expr.kind) {
			case 'field': {
				let fields = this.fieldUsage.get(expr.record);
				if (!fields) {
					fields = new Map();
					this.fieldUsage.set(expr.record, fields);
				}
				const prior = fields.get(expr.field) ?? { pg: 'text', nullable: false };
				fields.set(expr.field, {
					pg: context?.pg && context.pg !== 'unknown' ? context.pg : prior.pg,
					nullable: prior.nullable || (context?.nullable ?? false),
				});
				return;
			}
			case 'binary': {
				// Conditions must be boolean in the DSL (no truthiness): AND/OR
				// operands are boolean-typed.
				if (expr.op === 'AND' || expr.op === 'OR') {
					this.analyzeExpr(expr.left, { pg: 'boolean' });
					this.analyzeExpr(expr.right, { pg: 'boolean' });
					return;
				}
				const numeric = ['+', '-', '*', '/', '%', '<', '<=', '>', '>='].includes(expr.op);
				const partner = (side: Expr): { pg: string } | undefined => {
					if (side.kind === 'literal') {
						if (/^-?[0-9]+$/.test(side.sql)) return { pg: 'integer' };
						if (/^-?[0-9.]+$/.test(side.sql)) return { pg: 'numeric' };
						if (side.sql.startsWith("'")) return { pg: 'text' };
					}
					if (side.kind === 'ident') {
						const param = this.ir.params.find((p) => p.emitted === side.emitted);
						if (param) return { pg: param.type };
						const local = this.scalarDecls.get(side.emitted);
						if (local) return { pg: local };
					}
					return undefined;
				};
				this.analyzeExpr(expr.left, numeric ? (partner(expr.right) ?? { pg: 'numeric' }) : partner(expr.right));
				this.analyzeExpr(expr.right, numeric ? (partner(expr.left) ?? { pg: 'numeric' }) : partner(expr.left));
				return;
			}
			case 'is-null':
				this.analyzeExpr(expr.operand, { pg: 'unknown', nullable: true });
				return;
			case 'coalesce': {
				const sibling = expr.args
					.map((a) => (a.kind === 'literal' && /^-?[0-9]/.test(a.sql) ? 'numeric' : undefined))
					.find(Boolean);
				for (const a of expr.args) this.analyzeExpr(a, { pg: sibling ?? 'unknown', nullable: true });
				return;
			}
			case 'not':
				this.analyzeExpr(expr.operand, { pg: 'boolean' });
				return;
			case 'neg':
				this.analyzeExpr(expr.operand);
				return;
			case 'case-when':
				this.analyzeExpr(expr.cond, { pg: 'boolean' });
				this.analyzeExpr(expr.then);
				this.analyzeExpr(expr.else);
				return;
			default:
				return;
		}
	}

	print(): string {
		const paramList = this.ir.params.map((p) => {
			const typeName = `'${p.type === 'integer' ? 'int' : p.type}'`;
			const spec = p.default === undefined ? typeName : `{ type: ${typeName}, default: ${sqlLiteralToTs(p.default)} }`;
			return `${stripPrefix(p.emitted, 'p_')}: ${spec}`;
		});
		this.emitBody(this.ir.body);
		const dsl = [...this.usedDsl].sort();
		const destructure: string[] = [];
		if (this.usesArgs()) destructure.push('args');
		destructure.push(...dsl);
		const header = `procedure('${this.ir.name}', { ${paramList.join(', ')} }, (ctx) => {`;
		const preamble = destructure.length > 0 ? [`  const { ${destructure.join(', ')} } = ctx`] : [];
		return [header, ...preamble, ...this.lines, '})'].join('\n');
	}

	private usesArgs(): boolean {
		return this.lines.some((l) => /\bargs\./.test(l));
	}

	private emitBody(stmts: Stmt[], depth = 1): void {
		const ind = '  '.repeat(depth);
		for (let i = 0; i < stmts.length; i++) {
			const stmt = stmts[i];
			switch (stmt.kind) {
				case 'assign': {
					// `v_err__code := NULL` immediately before its try block is the
					// visitor's reset — part of the ctx.try() spelling, not a statement.
					if (
						this.tryCodeVars.has(stmt.target)
						&& stmt.expr.kind === 'literal'
						&& stmt.expr.sql === 'NULL'
						&& stmts[i + 1]?.kind === 'try'
					) {
						break;
					}
					// Trailing result assignments + RETURN fuse back into `return { ... }`.
					if (this.ir.returns.some((r) => r.emitted === stmt.target)) {
						const fused: { key: string; expr: Expr }[] = [];
						let j = i;
						while (j < stmts.length && stmts[j].kind === 'assign') {
							const a = stmts[j] as Extract<Stmt, { kind: 'assign' }>;
							const ret = this.ir.returns.find((r) => r.emitted === a.target);
							if (!ret) break;
							fused.push({ key: ret.key, expr: a.expr });
							j++;
						}
						if (stmts[j]?.kind === 'return' && fused.length === this.ir.returns.length) {
							this.lines.push(`${ind}return { ${fused.map((f) => `${f.key}: ${this.expr(f.expr)}`).join(', ')} }`);
							i = j;
							continue;
						}
					}
					const local = stripPrefix(stmt.target, 'v_');
					if (!this.declaredLocals.has(stmt.target) && this.scalarDecls.has(stmt.target)) {
						this.declaredLocals.add(stmt.target);
						const keyword = this.assignedTwice.has(stmt.target) ? 'let' : 'const';
						const ann = PG_TO_ANNOTATION[this.scalarDecls.get(stmt.target)!]
							+ (this.nullableLocals.has(stmt.target) ? ' | null' : '');
						this.lines.push(`${ind}${keyword} ${local}: ${ann} = ${this.expr(stmt.expr)}`);
					} else {
						this.lines.push(`${ind}${local} = ${this.expr(stmt.expr)}`);
					}
					break;
				}
				case 'sql': {
					this.usedDsl.add('sql');
					const template = this.template(stmt.sql);
					if (stmt.result) {
						const owner = stripPrefix(this.countOwners.get(stmt.result.countVar) ?? stmt.result.countVar, 'v_');
						this.lines.push(`${ind}const ${owner} = sql\`${template}\``);
					} else {
						this.lines.push(`${ind}sql\`${template}\``);
					}
					break;
				}
				case 'sql-one': {
					this.usedDsl.add('sql');
					this.lines.push(
						`${ind}const ${stripPrefix(stmt.into, 'v_')} = sql\`${this.template(stmt.sql)}\`.one<{ ${
							this.rowType(stmt.into)
						} }>()`,
					);
					break;
				}
				case 'sql-maybe-one': {
					this.usedDsl.add('sql');
					this.lines.push(
						`${ind}const ${stripPrefix(stmt.into, 'v_')} = sql\`${this.template(stmt.sql)}\`.maybeOne<{ ${
							this.rowType(stmt.into)
						} }>()`,
					);
					break;
				}
				case 'for-many': {
					this.usedDsl.add('sql');
					const rec = stripPrefix(stmt.recordVar, 'v_');
					const rowType = this.fieldUsage.has(stmt.recordVar) ? `<{ ${this.rowType(stmt.recordVar)} }>` : '';
					this.lines.push(`${ind}for (const ${rec} of sql\`${this.template(stmt.sql)}\`.many${rowType}()) {`);
					this.emitBody(stmt.body, depth + 1);
					this.lines.push(`${ind}}`);
					break;
				}
				case 'lock-rows':
					this.usedDsl.add('lockRowsOrdered');
					this.lines.push(
						`${ind}lockRowsOrdered('${stmt.table}', [${stmt.ids.map((id) => this.name(id.emitted)).join(', ')}])`,
					);
					break;
				case 'if': {
					stmt.branches.forEach((branch, bi) => {
						const kw = bi === 0 ? 'if' : '} else if';
						this.lines.push(`${ind}${kw} (${this.cond(branch.cond)}) {`);
						this.emitBody(branch.body, depth + 1);
					});
					if (stmt.elseBody) {
						this.lines.push(`${ind}} else {`);
						this.emitBody(stmt.elseBody, depth + 1);
					}
					this.lines.push(`${ind}}`);
					break;
				}
				case 'while':
					this.lines.push(`${ind}while (${this.cond(stmt.cond)}) {`);
					this.emitBody(stmt.body, depth + 1);
					this.lines.push(`${ind}}`);
					break;
				case 'raise': {
					const opts: string[] = [];
					if (stmt.detail) opts.push(`detail: ${this.formatText(stmt.detail)}`);
					if (stmt.hint) opts.push(`hint: ${this.formatText(stmt.hint)}`);
					const optText = opts.length > 0 ? `, { ${opts.join(', ')} }` : '';
					this.lines.push(`${ind}throw new PgError('${stmt.errcode}', ${this.formatText(stmt.message)}${optText})`);
					break;
				}
				case 'return':
					this.lines.push(`${ind}return`);
					break;
				case 'try': {
					const res = stmt.res;
					const body = res ? stmt.body.slice(0, stmt.body.length - res.fields.length) : stmt.body;
					const binding: string[] = [];
					if (res) binding.push(res.name === 'res' ? 'res' : `res: ${res.name}`);
					if (stmt.err) binding.push(stmt.err.name === 'err' ? 'err' : `err: ${stmt.err.name}`);
					const head = binding.length > 0 ? `const { ${binding.join(', ')} } = ` : '';
					this.lines.push(`${ind}${head}ctx.try(() => {`);
					this.emitBody(body, depth + 1);
					if (res) {
						const fields = res.fields.map((f, k) => {
							const a = stmt.body[body.length + k] as Extract<Stmt, { kind: 'assign' }>;
							return `${f.key}: ${this.expr(a.expr)}`;
						});
						this.lines.push(`${ind}  return { ${fields.join(', ')} }`);
					}
					this.lines.push(`${ind}}, [${stmt.conditions.map((c) => `'${c}'`).join(', ')}])`);
					break;
				}
				case 'exit':
					this.lines.push(`${ind}break`);
					break;
				case 'continue':
					this.lines.push(`${ind}continue`);
					break;
				case 'commit':
				case 'rollback':
					this.usedDsl.add(stmt.kind);
					this.lines.push(`${ind}${stmt.kind}()`);
					break;
				case 'notice':
					{
						const fn = stmt.level === 'NOTICE' ? 'notice' : 'warning';
						this.usedDsl.add(fn);
						const m = stmt.message;
						const bare = m.args.length === 1 && m.parts[0] === '' && m.parts[1] === '';
						this.lines.push(`${ind}${fn}(${bare ? this.expr(m.args[0]) : this.formatText(m)})`);
					}
					break;
			}
		}
	}

	/** A message as a TS string literal, or a template literal when it has holes. */
	private formatText(fmt: FormatText): string {
		if (fmt.args.length === 0) return tsString(fmt.parts[0]);
		if (fmt.args.length === 1 && fmt.parts[0] === '' && fmt.parts[1] === '') return this.expr(fmt.args[0]);
		const esc = (p: string) => p.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
		let out = esc(fmt.parts[0]);
		fmt.args.forEach((a, i) => {
			out += `\${${this.expr(a)}}` + esc(fmt.parts[i + 1]);
		});
		return `\`${out}\``;
	}

	private rowType(recordVar: string): string {
		const fields = this.fieldUsage.get(recordVar);
		if (!fields || fields.size === 0) return '';
		return [...fields.entries()]
			.map(([field, t]) => `${field}: ${PG_TO_ANNOTATION[t.pg] ?? 'text'}${t.nullable ? ' | null' : ''}`)
			.join('; ');
	}

	private template(sql: SqlText): string {
		let out = sql.parts[0];
		sql.args.forEach((arg, i) => {
			const name = arg.kind === 'ident' ? `\${${this.name(arg.emitted)}}` : arg.sql;
			out += name + sql.parts[i + 1];
		});
		return out;
	}

	/** De-prefixes an emitted name into its DSL spelling. */
	private name(emitted: string): string {
		if (this.paramNames.has(emitted)) return `args.${stripPrefix(emitted, 'p_')}`;
		return stripPrefix(emitted, 'v_');
	}

	/** Conditions: rewrite `v_x__count > 0` to `x.found`, `= 0` to `x.count === 0`. */
	private cond(expr: Expr): string {
		return this.expr(expr);
	}

	private expr(expr: Expr, parentPrec = 0): string {
		switch (expr.kind) {
			case 'ident': {
				const tryName = this.tryNames.get(expr.emitted);
				if (tryName !== undefined) return tryName;
				const owner = this.countOwners.get(expr.emitted);
				if (owner !== undefined) return `${stripPrefix(owner, 'v_')}.count`;
				return this.name(expr.emitted);
			}
			case 'field': {
				const rec = stripPrefix(expr.record, 'v_');
				// maybeOne records read fields via .row; for-of/one records directly.
				const isMaybeOne = this.someStmt((s) => s.kind === 'sql-maybe-one' && s.into === expr.record);
				return isMaybeOne ? `${rec}.row.${expr.field}` : `${rec}.${expr.field}`;
			}
			case 'literal': {
				if (expr.sql === 'TRUE') return 'true';
				if (expr.sql === 'FALSE') return 'false';
				if (expr.sql === 'NULL') return 'null';
				if (expr.sql.startsWith("'")) return tsString(expr.sql.slice(1, -1).replaceAll("''", "'"));
				return expr.sql;
			}
			case 'binary': {
				// `v_x__count > 0` is the emitter's lowering of `x.found` — restore
				// it (the visitor's maybeOne row-guard tracking keys on .found).
				if (
					expr.op === '>'
					&& expr.left.kind === 'ident'
					&& this.countOwners.has(expr.left.emitted)
					&& expr.right.kind === 'literal'
					&& expr.right.sql === '0'
				) {
					const owner = stripPrefix(this.countOwners.get(expr.left.emitted)!, 'v_');
					return `${owner}.found`;
				}
				const prec = binaryPrec(expr.op);
				const opTs = expr.op === '='
					? '==='
					: expr.op === '<>'
					? '!=='
					: expr.op === 'AND'
					? '&&'
					: expr.op === 'OR'
					? '||'
					: expr.op === '||'
					? '+'
					: expr.op;
				const text = `${this.expr(expr.left, prec)} ${opTs} ${this.expr(expr.right, prec + 1)}`;
				return prec < parentPrec ? `(${text})` : text;
			}
			case 'not': {
				const errName = this.tryErrTest(expr.operand);
				if (errName !== undefined) return `${errName} !== null`;
				return `!${this.expr(expr.operand, 9)}`;
			}
			case 'neg':
				return `-${this.expr(expr.operand, 9)}`;
			case 'is-null':
				if (this.tryErrTest(expr) !== undefined) return `${this.tryErrTest(expr)} === null`;
				this.usedDsl.add('isNull');
				return `isNull(${this.expr(expr.operand)})`;
			case 'coalesce':
				this.usedDsl.add('coalesce');
				return `coalesce(${expr.args.map((a) => this.expr(a)).join(', ')})`;
			case 'case-when':
				return `${this.expr(expr.cond, 3)} ? ${this.expr(expr.then, 3)} : ${this.expr(expr.else, 3)}`;
		}
	}

	/** `v_err__code IS NULL` → the err binding's name. */
	private tryErrTest(expr: Expr): string | undefined {
		if (expr.kind !== 'is-null' || expr.operand.kind !== 'ident') return undefined;
		return this.tryCodeVars.get(expr.operand.emitted);
	}

	private someStmt(pred: (s: Stmt) => boolean): boolean {
		const walk = (stmts: Stmt[]): boolean =>
			stmts.some((s) => {
				if (pred(s)) return true;
				if (s.kind === 'if') return s.branches.some((b) => walk(b.body)) || (s.elseBody ? walk(s.elseBody) : false);
				if (s.kind === 'while' || s.kind === 'for-many' || s.kind === 'try') return walk(s.body);
				return false;
			});
		return walk(this.ir.body);
	}
}

function binaryPrec(op: string): number {
	switch (op) {
		case 'OR':
			return 1;
		case 'AND':
			return 2;
		case '=':
		case '<>':
		case '<':
		case '<=':
		case '>':
		case '>=':
			return 4;
		case '||':
		case '+':
		case '-':
			return 6;
		default:
			return 7;
	}
}

/** `TRUE` → true, `NULL` → null, `'it''s'` → 'it\'s', numbers verbatim. */
function sqlLiteralToTs(sql: string): string {
	if (sql === 'TRUE') return 'true';
	if (sql === 'FALSE') return 'false';
	if (sql === 'NULL') return 'null';
	if (sql.startsWith("'")) return tsString(sql.slice(1, -1).replaceAll("''", "'"));
	return sql;
}

function tsString(value: string): string {
	return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
