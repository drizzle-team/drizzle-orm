/**
 * Intermediate representation. The visitor produces this; the emitter turns
 * it into PL/pgSQL text. All identifiers in the IR are ALREADY RENAMED
 * (p_* params, v_* locals) — renaming is a visitor concern, emission is
 * purely mechanical.
 */

export type PgScalarType = 'integer' | 'bigint' | 'numeric' | 'text' | 'boolean';
export type PgDeclType = PgScalarType | 'record';

export interface ProcedureIR {
	name: string;
	/** `tenant.procedure(...)` on a `pgSchema('tenant')`; undefined = unqualified (public). */
	schema?: string;
	/**
	 * Qualified names of every drizzle table referenced in the body —
	 * the dependency manifest for migration tooling (regenerate the
	 * procedure when any of these tables change).
	 */
	dependsOn: string[];
	params: ParamIR[];
	/** INOUT result parameters inferred from `return { ... }` sites; empty = void. */
	returns: OutParamIR[];
	/**
	 * The single hoisted DECLARE block (spec invariant 5). Locals are
	 * declared here without defaults; their initializers are ordinary
	 * assignments at their original position in the body.
	 */
	decls: VarDecl[];
	body: Stmt[];
}

export interface ParamIR {
	/** Emitted name, e.g. `p_from`. */
	emitted: string;
	type: PgScalarType;
	/** Pre-rendered SQL literal for `DEFAULT`: `20`, `-1.5`, `'eur'`, `TRUE`, `NULL`. */
	default?: string;
}

/**
 * A result parameter — the compiled form of a `return { key: ... }` record:
 * `INOUT "<key>" <type> DEFAULT NULL`. `emitted` is the quoted key, so the
 * CALL result row's column names are exactly the source-level keys.
 */
export interface OutParamIR {
	key: string;
	emitted: string;
	type: PgScalarType;
}

export interface VarDecl {
	/** Emitted name, e.g. `v_debit__count`. */
	emitted: string;
	type: PgDeclType;
}

/** A drizzle schema reference: pre-quoted table/column name(s). */
export interface SqlNameExpr {
	kind: 'sql-name';
	/** e.g. `"accounts"`, `"tenant"."users"`, `"owner_name"` */
	sql: string;
}

/**
 * A sql`...` template after lowering: literal parts interleaved with
 * interpolated arguments. Invariant 3: every arg is a bare renamed
 * identifier or a quoted schema name — never an arbitrary expression,
 * never string concatenation.
 */
export interface SqlText {
	/** parts.length === args.length + 1 */
	parts: string[];
	args: (IdentExpr | SqlNameExpr)[];
}

export type Stmt =
	| AssignStmt
	| SqlStmt
	| SqlOneStmt
	| SqlMaybeOneStmt
	| ForManyStmt
	| LockRowsStmt
	| IfStmt
	| WhileStmt
	| RaiseStmt
	| ReturnStmt
	| NoticeStmt
	| LoopControlStmt
	| TxnStmt
	| TryStmt;

export interface AssignStmt {
	kind: 'assign';
	/** Emitted target name. */
	target: string;
	expr: Expr;
}

/**
 * A bare sql statement, optionally binding its row count. INVARIANT 1:
 * the statement and its GET DIAGNOSTICS are one inseparable IR node —
 * ROW_COUNT is clobbered by any intervening statement, so nothing may ever
 * be scheduled between them.
 */
export interface SqlStmt {
	kind: 'sql';
	sql: SqlText;
	/** Present when the result was bound: `const debit = sql\`...\`` */
	result?: { countVar: string };
}

/** sql`...`.one<T>() → `... INTO STRICT v_x;` (inseparable by construction). */
export interface SqlOneStmt {
	kind: 'sql-one';
	sql: SqlText;
	into: string;
}

/** sql`...`.maybeOne<T>() → `... INTO v_x;` + GET DIAGNOSTICS (one node). */
export interface SqlMaybeOneStmt {
	kind: 'sql-maybe-one';
	sql: SqlText;
	into: string;
	countVar: string;
}

/** for..of over sql`...`.many<T>() → FOR v_rec IN ... LOOP (cursor semantics). */
export interface ForManyStmt {
	kind: 'for-many';
	sql: SqlText;
	/** Declared as `record` in the DECLARE block (query FOR does not auto-declare). */
	recordVar: string;
	body: Stmt[];
}

export interface LockRowsStmt {
	kind: 'lock-rows';
	table: string;
	ids: IdentExpr[];
}

export interface IfStmt {
	kind: 'if';
	/** First branch is IF, the rest are ELSIF. */
	branches: { cond: Expr; body: Stmt[] }[];
	elseBody?: Stmt[];
}

export interface WhileStmt {
	kind: 'while';
	cond: Expr;
	body: Stmt[];
}

/**
 * A RAISE-style message: literal text interleaved with expressions
 * (`parts.length === args.length + 1`). Parts are UNESCAPED source text —
 * the emitter escapes `'` and `%` and inserts `%` placeholders.
 */
export interface FormatText {
	parts: string[];
	args: Expr[];
}

export interface RaiseStmt {
	kind: 'raise';
	/** 5-character SQLSTATE, validated by the visitor. */
	errcode: string;
	message: FormatText;
	/** `USING DETAIL = ...` / `USING HINT = ...`. */
	detail?: FormatText;
	hint?: FormatText;
}

export interface ReturnStmt {
	kind: 'return';
}

export interface NoticeStmt {
	kind: 'notice';
	level: 'NOTICE' | 'WARNING';
	/** `notice(x)` is `{ parts: ['', ''], args: [x] }` → `RAISE NOTICE '%', x`. */
	message: FormatText;
}

/** `break` → `EXIT;`, `continue` → `CONTINUE;` (innermost loop, like JS). */
export interface LoopControlStmt {
	kind: 'exit' | 'continue';
}

/**
 * `ctx.commit()` / `ctx.rollback()` → `COMMIT;` / `ROLLBACK;` (PG 11+
 * procedure transaction control; a new transaction starts immediately).
 */
export interface TxnStmt {
	kind: 'commit' | 'rollback';
}

/** A GET STACKED DIAGNOSTICS item ctx.try() exposes on `err`. */
export type DiagItem =
	| 'RETURNED_SQLSTATE'
	| 'MESSAGE_TEXT'
	| 'PG_EXCEPTION_DETAIL'
	| 'PG_EXCEPTION_HINT'
	| 'CONSTRAINT_NAME'
	| 'TABLE_NAME'
	| 'COLUMN_NAME';

/**
 * `ctx.try(() => { ... }, ['unique_violation', 'P0409'])` →
 * BEGIN <body> EXCEPTION WHEN <cond> THEN ... END; — one handler per
 * condition (source order; Postgres takes the first match), each recording
 * which condition matched in `err.codeVar` plus the read diagnostics items.
 */
export interface TryStmt {
	kind: 'try';
	body: Stmt[];
	/** Condition names, or 5-character SQLSTATE codes. */
	conditions: string[];
	/** Present when `err` is bound. `items` lists only fields the body reads. */
	err?: { name: string; codeVar: string; items: { variable: string; item: DiagItem }[] };
	/**
	 * Present when `res` is bound and the body returns a record: the trailing
	 * assignments of `body` set these. (Printer metadata — not emitted.)
	 */
	res?: { name: string; fields: { key: string; emitted: string }[] };
}

export type BinOp = '=' | '<>' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | '%' | '||' | 'AND' | 'OR';

export type Expr =
	| IdentExpr
	| FieldExpr
	| LiteralExpr
	| BinaryExpr
	| NotExpr
	| NegExpr
	| CaseWhenExpr
	| IsNullExpr
	| CoalesceExpr;

export interface IdentExpr {
	kind: 'ident';
	/** Emitted (renamed) name. */
	emitted: string;
}

/** `v_rec.balance` — field of a record variable. */
export interface FieldExpr {
	kind: 'field';
	record: string;
	field: string;
}

/** Pre-rendered SQL literal: `0`, `'it''s'`, `TRUE`, `NULL`. */
export interface LiteralExpr {
	kind: 'literal';
	sql: string;
}

export interface BinaryExpr {
	kind: 'binary';
	op: BinOp;
	left: Expr;
	right: Expr;
}

export interface NotExpr {
	kind: 'not';
	operand: Expr;
}

export interface NegExpr {
	kind: 'neg';
	operand: Expr;
}

export interface CaseWhenExpr {
	kind: 'case-when';
	cond: Expr;
	then: Expr;
	else: Expr;
}

export interface IsNullExpr {
	kind: 'is-null';
	operand: Expr;
}

export interface CoalesceExpr {
	kind: 'coalesce';
	args: Expr[];
}
