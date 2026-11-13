import type { Expr, FormatText, ProcedureIR, SqlText, Stmt } from './ir';

/**
 * IR → PL/pgSQL text. Mechanical by design: all renaming and validation
 * happened in the visitor. The one semantic rule that lives here is layout
 * of inseparable nodes — a sql statement and its GET DIAGNOSTICS are emitted
 * strictly adjacent because they arrive as a single IR node (invariant 1).
 */

const INDENT = '  ';

export function emitProcedure(proc: ProcedureIR): string {
	const lines: string[] = [];
	const ins = proc.params.map((p) => `${p.emitted} ${p.type}${p.default !== undefined ? ` DEFAULT ${p.default}` : ''}`);
	// A returned record compiles to INOUT parameters defaulting to NULL: unlike
	// OUT parameters, CALL may omit them (named notation), so callers pass only
	// the real arguments and get one row back keyed exactly by the return keys.
	// Being defaulted they always go last, after any defaulted IN parameter.
	const inouts = proc.returns.map((o) => `INOUT ${o.emitted} ${o.type} DEFAULT NULL`);
	const params = [...ins, ...inouts].join(', ');
	const body: string[] = [];
	emitStmts(proc.body, 1, body);

	const qualifiedName = proc.schema ? `"${proc.schema.replaceAll('"', '""')}".${proc.name}` : proc.name;
	lines.push(`CREATE OR REPLACE PROCEDURE ${qualifiedName}(${params})`);
	lines.push('LANGUAGE plpgsql');

	const inner: string[] = [];
	// INOUT parameters are named by their (quoted) return keys, so a key like
	// "balance" would make every unqualified `balance` column reference in the
	// body ambiguous. The compiler only ever ASSIGNS them — they never appear
	// inside sql`...` — so in queries the column must win.
	if (proc.returns.length > 0) inner.push('#variable_conflict use_column');
	if (proc.decls.length > 0) {
		// The single hoisted DECLARE block (invariant 5).
		inner.push('DECLARE');
		for (const d of proc.decls) inner.push(`${INDENT}${d.emitted} ${d.type};`);
	}
	inner.push('BEGIN');
	inner.push(...body);
	inner.push('END;');

	const quote = dollarQuote(inner.join('\n'));
	lines.push(`AS ${quote}`);
	lines.push(...inner);
	lines.push(`${quote};`);
	return lines.join('\n');
}

/** $$ unless the body itself contains $$. */
function dollarQuote(body: string): string {
	let tag = '$$';
	while (body.includes(tag)) tag = tag === '$$' ? '$tspgc$' : `$tspgc${tag.length}$`;
	return tag;
}

function emitStmts(stmts: readonly Stmt[], level: number, out: string[]): void {
	for (const stmt of stmts) emitStmt(stmt, level, out);
}

function emitStmt(stmt: Stmt, level: number, out: string[]): void {
	const ind = INDENT.repeat(level);
	switch (stmt.kind) {
		case 'assign':
			out.push(`${ind}${stmt.target} := ${emitExpr(stmt.expr)};`);
			return;
		case 'sql':
			out.push(`${ind}${emitSqlText(stmt.sql)};`);
			// Inseparable from the statement above (invariant 1): ROW_COUNT is
			// clobbered by any intervening statement.
			if (stmt.result) out.push(`${ind}GET DIAGNOSTICS ${stmt.result.countVar} = ROW_COUNT;`);
			return;
		case 'sql-one':
			// plpgsql extracts INTO wherever it appears at the top nesting level;
			// appending keeps this correct for both SELECT and ... RETURNING.
			out.push(`${ind}${emitSqlText(stmt.sql)} INTO STRICT ${stmt.into};`);
			return;
		case 'sql-maybe-one':
			out.push(`${ind}${emitSqlText(stmt.sql)} INTO ${stmt.into};`);
			out.push(`${ind}GET DIAGNOSTICS ${stmt.countVar} = ROW_COUNT;`);
			return;
		case 'for-many':
			out.push(`${ind}FOR ${stmt.recordVar} IN ${emitSqlText(stmt.sql)} LOOP`);
			emitStmts(stmt.body, level + 1, out);
			out.push(`${ind}END LOOP;`);
			return;
		case 'lock-rows':
			out.push(
				`${ind}PERFORM 1 FROM ${stmt.table} WHERE id IN (${
					stmt.ids
						.map((id) => id.emitted)
						.join(', ')
				}) ORDER BY id FOR UPDATE;`,
			);
			return;
		case 'if': {
			stmt.branches.forEach((branch, i) => {
				out.push(`${ind}${i === 0 ? 'IF' : 'ELSIF'} ${emitExpr(branch.cond)} THEN`);
				emitStmts(branch.body, level + 1, out);
			});
			if (stmt.elseBody) {
				out.push(`${ind}ELSE`);
				emitStmts(stmt.elseBody, level + 1, out);
			}
			out.push(`${ind}END IF;`);
			return;
		}
		case 'while':
			out.push(`${ind}WHILE ${emitExpr(stmt.cond)} LOOP`);
			emitStmts(stmt.body, level + 1, out);
			out.push(`${ind}END LOOP;`);
			return;
		case 'raise': {
			const using = [`ERRCODE = '${stmt.errcode}'`];
			if (stmt.detail) using.push(`DETAIL = ${emitFormatValue(stmt.detail)}`);
			if (stmt.hint) using.push(`HINT = ${emitFormatValue(stmt.hint)}`);
			out.push(`${ind}RAISE EXCEPTION ${emitRaiseFormat(stmt.message)} USING ${using.join(', ')};`);
			return;
		}
		case 'return':
			out.push(`${ind}RETURN;`);
			return;
		case 'exit':
			out.push(`${ind}EXIT;`);
			return;
		case 'continue':
			out.push(`${ind}CONTINUE;`);
			return;
		case 'commit':
			out.push(`${ind}COMMIT;`);
			return;
		case 'try': {
			const inner = INDENT.repeat(level + 1);
			out.push(`${ind}BEGIN`);
			emitStmts(stmt.body, level + 1, out);
			out.push(`${ind}EXCEPTION`);
			for (const cond of stmt.conditions) {
				const when = /^[0-9A-Z]{5}$/.test(cond) ? `SQLSTATE '${cond}'` : cond;
				out.push(`${inner}WHEN ${when} THEN`);
				const h = INDENT.repeat(level + 2);
				if (!stmt.err) {
					out.push(`${h}NULL;`);
					continue;
				}
				out.push(`${h}${stmt.err.codeVar} := '${cond}';`);
				if (stmt.err.items.length > 0) {
					const items = stmt.err.items.map((i) => `${i.variable} = ${i.item}`).join(', ');
					out.push(`${h}GET STACKED DIAGNOSTICS ${items};`);
				}
			}
			out.push(`${ind}END;`);
			return;
		}
		case 'rollback':
			out.push(`${ind}ROLLBACK;`);
			return;
		case 'notice':
			out.push(`${ind}RAISE ${stmt.level} ${emitRaiseFormat(stmt.message)};`);
			return;
	}
}

/** Interpolations are renamed identifiers or quoted schema names (invariant 3). */
function emitSqlText(sql: SqlText): string {
	let text = sql.parts[0];
	sql.args.forEach((arg, i) => {
		text += (arg.kind === 'ident' ? arg.emitted : arg.sql) + sql.parts[i + 1];
	});
	return text;
}

/** RAISE messages are format strings: ' and % both need escaping. */
function escapeRaise(message: string): string {
	return message.replaceAll("'", "''").replaceAll('%', '%%');
}

/**
 * `'low on %: %', v_a, v_b` — RAISE's own format string + arguments.
 *
 * RAISE knows only `%` (placeholder) and `%%` (literal %), scanned left to
 * right — so a placeholder directly followed by a literal % (`${x}%`) or by
 * another placeholder (`${a}${b}`) is unrepresentable: both produce `%%`,
 * which reads as a literal. Those messages go through format() instead
 * (`%s` placeholders are unambiguous): RAISE NOTICE '%', format(...).
 */
function emitRaiseFormat(fmt: FormatText): string {
	const ambiguous = fmt.parts.some((p, i) => i > 0 && (p.startsWith('%') || (p === '' && i < fmt.parts.length - 1)));
	if (ambiguous) return `'%', ${emitFormatValue(fmt)}`;
	const text = fmt.parts.map(escapeRaise).join('%');
	return [`'${text}'`, ...fmt.args.map((a) => emitExpr(a))].join(', ');
}

/**
 * A USING option value is a plain expression: a literal when there are no
 * holes, otherwise format() (which uses %s placeholders and %% escapes).
 */
function emitFormatValue(fmt: FormatText): string {
	if (fmt.args.length === 0) return `'${fmt.parts[0].replaceAll("'", "''")}'`;
	const text = fmt.parts.map((p) => p.replaceAll("'", "''").replaceAll('%', '%%')).join('%s');
	return `format(${[`'${text}'`, ...fmt.args.map((a) => emitExpr(a))].join(', ')})`;
}

// ── expressions ──────────────────────────────────────────────────────────────

const enum Prec {
	Or = 1,
	And = 2,
	Not = 3,
	Comparison = 4,
	Concat = 5,
	Additive = 6,
	Multiplicative = 7,
	Unary = 8,
	Atom = 9,
}

function precedenceOf(expr: Expr): Prec {
	switch (expr.kind) {
		case 'binary':
			switch (expr.op) {
				case 'OR':
					return Prec.Or;
				case 'AND':
					return Prec.And;
				case '=':
				case '<>':
				case '<':
				case '<=':
				case '>':
				case '>=':
					return Prec.Comparison;
				case '||':
					return Prec.Concat;
				case '+':
				case '-':
					return Prec.Additive;
				case '*':
				case '/':
				case '%':
					return Prec.Multiplicative;
			}
		// eslint-disable-next-line no-fallthrough
		case 'not':
			return Prec.Not;
		case 'neg':
			return Prec.Unary;
		case 'is-null':
			return Prec.Comparison;
		default:
			return Prec.Atom;
	}
}

export function emitExpr(expr: Expr): string {
	switch (expr.kind) {
		case 'ident':
			return expr.emitted;
		case 'field':
			return `${expr.record}.${expr.field}`;
		case 'literal':
			return expr.sql;
		case 'binary': {
			const prec = precedenceOf(expr);
			// Comparisons are non-associative: parenthesize nested comparisons on
			// both sides. AND/OR/arithmetic are left-associative: keep chains flat.
			const leftMin = prec === Prec.Comparison ? prec + 1 : prec;
			return `${wrap(expr.left, leftMin)} ${expr.op} ${wrap(expr.right, prec + 1)}`;
		}
		case 'not':
			return `NOT ${wrap(expr.operand, Prec.Not + 1)}`;
		case 'neg':
			return `-${wrap(expr.operand, Prec.Unary + 1)}`;
		case 'case-when':
			return `CASE WHEN ${emitExpr(expr.cond)} THEN ${emitExpr(expr.then)} ELSE ${emitExpr(expr.else)} END`;
		case 'is-null':
			return `${wrap(expr.operand, Prec.Comparison + 1)} IS NULL`;
		case 'coalesce':
			return `coalesce(${expr.args.map(emitExpr).join(', ')})`;
	}
}

function wrap(expr: Expr, minPrec: number): string {
	const text = emitExpr(expr);
	return precedenceOf(expr) < minPrec ? `(${text})` : text;
}
