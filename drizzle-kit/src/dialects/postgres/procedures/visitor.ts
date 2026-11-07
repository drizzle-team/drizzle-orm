import type { Program } from 'oxc-parser';
import { Codes, type FileReporter } from './diagnostics';
import { PG_CONDITIONS } from './errcodes';
import type { DslName, ImportTable } from './imports';
import type {
	DiagItem,
	Expr,
	FormatText,
	IdentExpr,
	OutParamIR,
	ParamIR,
	PgScalarType,
	ProcedureIR,
	SqlNameExpr,
	SqlStmt,
	SqlText,
	Stmt,
	TryStmt,
	VarDecl,
} from './ir';
import { ALL_KEYWORDS, INVALID_ROUTINE_NAME_KEYWORDS, INVALID_TABLE_NAME_KEYWORDS } from './keywords';
import { quoteIdent, type SchemaRegistry, type TableMeta } from './schema-registry';
import type { SourceScript } from './source';

/**
 * Whitelist visitor: oxc AST → IR. Everything not explicitly allowed is a
 * compile error with a hint; errors are collected, not thrown. All naming
 * (p_ and v_ prefixes, __count suffixes) happens HERE so the emitter stays
 * purely mechanical.
 *
 * The front end is oxc-parser (estree-shaped AST, UTF-16 spans). There is
 * deliberately no TS binder: the whitelist forces every body-level binding
 * through the visitor's own Scope, so the only cross-file question left is
 * the import graph — answered by the ImportTable (aliased imports work;
 * an in-scope binding always shadows an import). Typing is the visitor's
 * own ScalarType system, recovered from parameter type names, annotation
 * nodes and row-type arguments.
 */

/** Minimal structural view of oxc AST nodes — behavior is pinned by the fixture suite. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ONode = { type: string; start: number; end: number } & Record<string, any>;

/** Internal scalar type: the SQL type plus nullability (spec invariant 4). */
interface ScalarType {
	pg: PgScalarType | 'null';
	nullable: boolean;
}

type Fields = Map<string, ScalarType>;

interface ParamVar {
	kind: 'param';
	name: string;
	emitted: string;
	type: ScalarType;
}

/**
 * `const rows = sql`...`.many<T>()` — a deferred cursor. Emits NOTHING at
 * the binding; the consuming for..of emits `FOR v_x IN <query> LOOP` there.
 * Single-pass: consumed by exactly one loop, and it must be consumed.
 */
interface CursorVar {
	kind: 'cursor';
	name: string;
	emitted: string;
	sql: SqlText;
	/** undefined = row type not declared — field access on rows will error. */
	fields: Fields | undefined;
	consumed: boolean;
	declNode: ONode;
}

type VarInfo =
	| ParamVar
	| CursorVar
	| { kind: 'local'; name: string; emitted: string; type: ScalarType; mutable: boolean }
	| { kind: 'sql-result'; name: string; emitted: string; countVar: string }
	| { kind: 'record'; name: string; emitted: string; fields: Fields | undefined }
	| { kind: 'maybe-one'; name: string; emitted: string; countVar: string; fields: Fields }
	/** A binding of ctx.args (destructured or via ctx) — params read as args.<name>. */
	| { kind: 'args'; name: string; emitted: string; params: Map<string, ParamVar> }
	/** `(ctx) => ...` — the procedure context: ctx.args + the DSL members. */
	| { kind: 'ctx'; name: string; emitted: string; params: Map<string, ParamVar> }
	/** A destructured DSL member: `const { sql, notice } = ctx`. */
	| { kind: 'dsl'; name: string; emitted: string; fn: DslFn }
	| TryResVar
	| TryErrVar;

/** `res` of ctx.try(): readable only where `err === null` is established. */
interface TryResVar {
	kind: 'try-res';
	name: string;
	emitted: string;
	/** undefined = the body returns nothing. */
	fields: Map<string, { emitted: string; type: ScalarType }> | undefined;
	/** Guard token: in `guarded` ⇔ err is known null here. */
}

/** `err` of ctx.try(): `err === null` tests it; fields readable where it is known non-null. */
interface TryErrVar {
	kind: 'try-err';
	name: string;
	emitted: string;
	stmt: TryStmt;
	/** The res var of the same try (narrowed by tests on err), if bound. */
	res: TryResVar | undefined;
}

/** err.<field> → GET STACKED DIAGNOSTICS item. `code` is the matched condition. */
const ERR_FIELDS: ReadonlyMap<string, DiagItem | 'code'> = new Map<string, DiagItem | 'code'>([
	['code', 'code'],
	['sqlstate', 'RETURNED_SQLSTATE'],
	['message', 'MESSAGE_TEXT'],
	['detail', 'PG_EXCEPTION_DETAIL'],
	['hint', 'PG_EXCEPTION_HINT'],
	['constraint', 'CONSTRAINT_NAME'],
	['table', 'TABLE_NAME'],
	['column', 'COLUMN_NAME'],
]);

interface ExprResult {
	expr: Expr;
	type: ScalarType;
	/** Guards that hold where this condition is TRUE (e.g. `x.found`, `err === null`). */
	foundOf?: VarInfo[];
	/** Guards that hold where this condition is FALSE (e.g. `!x.found`, `err !== null`). */
	elseOf?: VarInfo[];
}

/** An enclosing ctx.try() body — the rules Postgres imposes on exception blocks. */
interface TryFrame {
	/** Locals declared inside this body (the only assignable ones). */
	declared: Set<VarInfo>;
	/** The body's trailing `return` (handled by visitTry, never by visitReturn). */
	trailingReturn: ONode | undefined;
}

/** Per-procedure state: the single hoisted DECLARE block and name registries. */
class ProcContext {
	readonly decls: VarDecl[] = [];
	/** Source-level names → declaring node. One namespace per procedure (invariant 5). */
	readonly declared = new Map<string, ONode>();
	/** Lowercase-folded emitted name → original spelling (unquoted PG identifiers fold to lowercase). */
	readonly emittedLower = new Map<string, string>();
	/** maybe-one vars currently guarded by an enclosing `if (x.found)`. */
	readonly guarded = new Set<VarInfo>();
	/** Bound cursors not yet consumed by a for..of (must be empty at the end). */
	readonly pendingCursors = new Set<CursorVar>();
	/** Qualified names of drizzle tables referenced in this procedure. */
	readonly dependsOn = new Set<string>();
	/** Inferred return shape — defined by the first `return { ... }` site. */
	returnShape: Map<string, { emitted: string; type: ScalarType }> | undefined = undefined;
	/** First bare `return;` seen — valued and bare returns cannot mix. */
	firstBareReturn: ONode | undefined = undefined;
	/** Number of enclosing loops (while / for..of) — gates break/continue. */
	loopDepth = 0;
	/** Enclosing ctx.try() bodies, innermost last. */
	readonly tryFrames: TryFrame[] = [];
	/** Counter for unbound try statements' synthesized names. */
	tryCount = 0;
	/** The procedure's body AST — used for use-before-declare detection. */
	bodyNode: ONode | undefined = undefined;
}

class Scope {
	private readonly vars = new Map<string, VarInfo>();
	constructor(
		readonly ctx: ProcContext,
		private readonly parent?: Scope,
	) {}

	lookup(name: string): VarInfo | undefined {
		return this.vars.get(name) ?? this.parent?.lookup(name);
	}

	set(info: VarInfo): void {
		this.vars.set(info.name, info);
	}

	child(): Scope {
		return new Scope(this.ctx, this);
	}
}

const DSL_HINT =
	'the DSL lives on the ctx parameter: ctx.sql`...`, ctx.lockRowsOrdered(), ctx.notice(), ctx.warning(), ctx.commit(), ctx.rollback(), ctx.try(), ctx.isNull(), ctx.coalesce() (destructure it: const { sql } = ctx); plus throw new PgError()';

/** The callable DSL members of ProcedureCtx. */
type DslFn = 'sql' | 'lockRowsOrdered' | 'notice' | 'warning' | 'commit' | 'rollback' | 'try' | 'isNull' | 'coalesce';

const CTX_DSL_MEMBERS: ReadonlySet<string> = new Set([
	'sql',
	'lockRowsOrdered',
	'notice',
	'warning',
	'commit',
	'rollback',
	'try',
	'isNull',
	'coalesce',
]);
const CTX_MEMBER_HINT =
	'ctx members: args, sql, lockRowsOrdered, notice, warning, commit, rollback, try, isNull, coalesce';

function family(t: ScalarType): 'num' | 'text' | 'boolean' | 'null' {
	switch (t.pg) {
		case 'integer':
		case 'bigint':
		case 'numeric':
			return 'num';
		case 'text':
			return 'text';
		case 'boolean':
			return 'boolean';
		case 'null':
			return 'null';
	}
}

function compatible(a: ScalarType, b: ScalarType): boolean {
	const fa = family(a);
	const fb = family(b);
	return fa === fb || fa === 'null' || fb === 'null';
}

/** numeric ⊃ bigint ⊃ integer — pick the wider side. */
function unifyNum(a: ScalarType, b: ScalarType): PgScalarType {
	const rank = { integer: 0, bigint: 1, numeric: 2 } as Record<string, number>;
	const pa = a.pg === 'null' ? 'integer' : a.pg;
	const pb = b.pg === 'null' ? 'integer' : b.pg;
	return (rank[pa] ?? 0) >= (rank[pb] ?? 0) ? (pa as PgScalarType) : (pb as PgScalarType);
}

function escapeSqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

// Type ALIASES usable in annotation/row-type positions (import-resolved).
// bigint_ (number-mode) and bigint64 (bigint-mode) differ only on the TS
// side — both emit SQL bigint; the visitor types them identically.
const MARKER_TO_PG: Record<string, PgScalarType> = {
	int: 'integer',
	numeric: 'numeric',
	bigint_: 'bigint',
	bigint64: 'bigint',
	text: 'text',
};

// Param type NAMES for procedure({ from: 'bigint' }) — plain data anchored
// by the import-resolved procedure() call, so text matching is sound here.
const PARAM_TYPE_NAMES: Record<string, PgScalarType> = {
	int: 'integer',
	bigint: 'bigint',
	bigint64: 'bigint',
	numeric: 'numeric',
	text: 'text',
	boolean: 'boolean',
};

const PARAM_TYPE_HINT = "one of 'int' | 'bigint' | 'bigint64' | 'numeric' | 'text' | 'boolean'";

// ── small AST helpers ────────────────────────────────────────────────────────

type IdentNode = ONode & { type: 'Identifier'; name: string };

function isIdent(n: ONode | null | undefined): n is IdentNode {
	return !!n && n.type === 'Identifier';
}

/**
 * An Identifier's span includes its type annotation in oxc (`x: int`);
 * diagnostics should put the caret on the bare name only.
 */
function bareName(id: IdentNode): ONode {
	return { type: 'Identifier', start: id.start, end: id.start + id.name.length, name: id.name } as ONode;
}

function isLiteralOfType(n: ONode | null | undefined, kind: 'string' | 'number' | 'boolean'): boolean {
	return !!n && n.type === 'Literal' && typeof n.value === kind;
}

function isNullLiteral(n: ONode): boolean {
	return n.type === 'Literal' && n.value === null && n.raw === 'null';
}

function isBigIntLiteral(n: ONode): boolean {
	return n.type === 'Literal' && typeof n.value === 'bigint';
}

/** Non-computed member name, or undefined for computed/private members. */
function memberName(n: ONode): string | undefined {
	if (n.computed || !isIdent(n.property)) return undefined;
	return n.property.name as string;
}

export class WhitelistVisitor {
	constructor(
		private readonly imports: ImportTable,
		private readonly diags: FileReporter,
		private readonly schema: SchemaRegistry,
		private readonly script: SourceScript,
	) {}

	private getText(node: ONode): string {
		return this.script.getText(node);
	}

	/** A local name resolves to a runtime import only when nothing shadows it. */
	private resolveRuntimeImport(name: string, scope?: Scope): DslName | undefined {
		if (scope?.lookup(name)) return undefined;
		return this.imports.resolveRuntime(name);
	}

	// ── top level ────────────────────────────────────────────────────────────

	/**
	 * EXTRACTION, not whitelisting, at the file level: the compiler owns
	 * procedure(...) scopes and leaves the rest of the file alone — procedure
	 * definitions live alongside ordinary application code (which may import
	 * and call them via the typed client). The strict whitelist applies
	 * INSIDE procedure bodies only.
	 */
	visitSourceFile(program: Program): ProcedureIR[] {
		const procs: ProcedureIR[] = [];
		// Procedure names are emitted unquoted, and PostgreSQL folds unquoted
		// identifiers to lowercase — a fold collision means the later
		// CREATE OR REPLACE silently replaces the earlier procedure.
		const seenNames = new Map<string, string>();
		// Local names bound to the runtime's `procedure` export.
		const procedureLocals = new Set<string>();
		for (const stmt of (program as unknown as ONode).body as ONode[]) {
			if (stmt.type !== 'ImportDeclaration') continue;
			for (const spec of (stmt.specifiers ?? []) as ONode[]) {
				if (spec.type === 'ImportSpecifier' && this.imports.resolveRuntime(spec.local.name) === 'procedure') {
					procedureLocals.add(spec.local.name as string);
				}
			}
		}

		// `tenant.procedure(...)` declares a procedure in a schema. `tenant` is a top-level
		// `const tenant = pgSchema('tenant')` here, or an imported/exported pgSchema (via the registry).
		const schemaOfCall = (node: ONode): string | undefined => {
			if (node.type !== 'CallExpression' || !isIdent(node.callee)) return undefined;
			if (!this.imports.isRuntimeExport(node.callee.name, 'pgSchema')) return undefined;
			const [arg] = (node.arguments ?? []) as ONode[];
			return arg && isLiteralOfType(arg, 'string') ? (arg.value as string) : undefined;
		};
		const localSchemas = new Map<string, string>();
		for (const stmt of (program as unknown as ONode).body as ONode[]) {
			const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration as ONode | null : stmt;
			if (decl?.type !== 'VariableDeclaration') continue;
			for (const d of decl.declarations as ONode[]) {
				const schema = isIdent(d.id) && d.init ? schemaOfCall(d.init) : undefined;
				if (schema !== undefined) localSchemas.set(d.id.name, schema);
			}
		}
		const schemaOf = (object: ONode, shadowed: ReadonlySet<string>): string | undefined => {
			if (!isIdent(object)) return schemaOfCall(object);
			if (shadowed.has(object.name)) return undefined;
			return localSchemas.get(object.name) ?? this.schema.resolveSchema(this.imports, object.name);
		};

		// Walk the whole file for procedure(...) calls, tracking bindings that
		// shadow the import (app code may rebind anything). A procedure() inside
		// another procedure's body is reported as 'procedures cannot be nested'
		// by the body visitor — the walk does not descend into matched calls.
		const collectBindings = (node: ONode, into: Set<string>): void => {
			if (node.type === 'VariableDeclaration') {
				for (const d of node.declarations as ONode[]) collectPatternNames(d.id, into);
			} else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
				if (isIdent(node.id)) into.add(node.id.name);
			}
		};
		const walk = (node: ONode, shadowed: ReadonlySet<string>): void => {
			if (
				node.type === 'CallExpression'
				&& isIdent(node.callee)
				&& procedureLocals.has(node.callee.name)
				&& !shadowed.has(node.callee.name)
			) {
				const ir = this.visitProcedure(node, seenNames, undefined);
				if (ir) procs.push(ir);
				return;
			}
			if (
				node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
				&& memberName(node.callee) === 'procedure'
			) {
				const schema = schemaOf(node.callee.object as ONode, shadowed);
				if (schema !== undefined) {
					const ir = this.visitProcedure(node, seenNames, schema);
					if (ir) procs.push(ir);
					return;
				}
			}
			let inner = shadowed;
			if (
				node.type === 'FunctionDeclaration'
				|| node.type === 'FunctionExpression'
				|| node.type === 'ArrowFunctionExpression'
			) {
				const next = new Set(shadowed);
				for (const p of (node.params ?? []) as ONode[]) collectPatternNames(p, next);
				forEachChildNode(node, (c) => collectBindings(c, next));
				inner = next;
			}
			forEachChildNode(node, (c) => walk(c, inner));
		};
		const topShadowed = new Set<string>();
		for (const stmt of (program as unknown as ONode).body as ONode[]) collectBindings(stmt, topShadowed);
		for (const name of procedureLocals) topShadowed.delete(name); // the import itself is not a shadow
		for (const name of localSchemas.keys()) topShadowed.delete(name); // nor is the schema binding
		for (const stmt of (program as unknown as ONode).body as ONode[]) walk(stmt, topShadowed);
		return procs;
	}

	// ── procedure ────────────────────────────────────────────────────────────

	private visitProcedure(
		call: ONode,
		seenNames: Map<string, string>,
		schema: string | undefined,
	): ProcedureIR | undefined {
		const callArgs = (call.arguments ?? []) as ONode[];
		if (callArgs.length !== 3) {
			this.diags.error(
				call,
				Codes.BadProcedureShape,
				'procedure() takes exactly three arguments: (name, params, body)',
			);
			return undefined;
		}
		const [nameArg, paramsArg, bodyArg] = callArgs;
		if (!isLiteralOfType(nameArg, 'string')) {
			this.diags.error(
				nameArg,
				Codes.BadProcedureShape,
				'the procedure name must be a string literal',
				"e.g. procedure('transfer', { ... }, (ctx) => { ... })",
			);
			return undefined;
		}
		const nameNode = nameArg;
		const name = nameArg.value as string;
		// Params/locals get p_/v_ prefixes, but the procedure name is emitted
		// verbatim: it must be a safe unquoted PostgreSQL identifier (TS allows
		// $, PG does not — a leading $ even corrupts the script's dollar
		// quoting), it must not be a keyword that is invalid in routine-name
		// position (pg_get_keywords() catcodes R and C — spec invariant 2), and
		// it must not fold-collide with another procedure in the file.
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
			this.diags.error(
				nameNode,
				Codes.InvalidName,
				`procedure name '${name}' is not a valid unquoted PostgreSQL identifier`,
				'PostgreSQL identifiers start with a letter or underscore and contain only letters, digits and underscores',
			);
		} else if (INVALID_ROUTINE_NAME_KEYWORDS.has(name.toLowerCase())) {
			this.diags.error(
				nameNode,
				Codes.ReservedName,
				`procedure name '${name}' is a reserved SQL keyword`,
				'rename the procedure — PostgreSQL rejects it as a bare routine name',
			);
		} else {
			// Names are unique per schema.
			const folded = `${schema ?? ''}.${name.toLowerCase()}`;
			const prior = seenNames.get(folded);
			if (prior !== undefined) {
				this.diags.error(
					nameNode,
					Codes.NameCollision,
					`procedure name '${name}' collides with '${prior}' — unquoted PostgreSQL identifiers fold to lowercase`,
					'the later CREATE OR REPLACE would silently replace the earlier procedure; rename one of them',
				);
			} else {
				seenNames.set(folded, name);
			}
		}

		const ctx = new ProcContext();
		const scope = new Scope(ctx);
		const params: ParamIR[] = [];
		// Params reserve their emitted p_* names here, but become name-visible
		// only through args bindings: ctx.args.<name>, or destructured names
		// from `const { from } = ctx.args` / `({ args }) => ... args.from`.
		const paramInfos = new Map<string, ParamVar>();

		if (paramsArg.type !== 'ObjectExpression') {
			this.diags.error(
				paramsArg,
				Codes.BadProcedureShape,
				'the params argument must be an inline object literal',
				"e.g. { from: 'bigint', to: 'bigint', amount: 'numeric' }",
			);
		} else {
			let sawDefault = false;
			for (const prop of paramsArg.properties as ONode[]) {
				if (prop.type !== 'Property' || prop.shorthand || prop.method || prop.kind !== 'init') {
					this.diags.error(
						prop,
						Codes.BadProcedureShape,
						"params must be `name: '<sql type>'` pairs",
						'shorthand, spread and methods are not supported',
					);
					continue;
				}
				const pNameNode = prop.key as ONode;
				const pName = isIdent(pNameNode) ? (pNameNode.name as string) : undefined;
				if (prop.computed || !pName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(pName)) {
					this.diags.error(pNameNode, Codes.BadProcedureShape, 'parameter names must be plain identifiers');
					continue;
				}
				let typeNode = prop.value as ONode;
				let defaultNode: ONode | undefined;
				if (typeNode.type === 'ObjectExpression') {
					const spec = this.parseParamSpec(typeNode);
					if (!spec) continue;
					typeNode = spec.type;
					defaultNode = spec.default;
				}
				if (!isLiteralOfType(typeNode, 'string')) {
					this.diags.error(
						typeNode,
						Codes.BadProcedureShape,
						'parameter types are string literals',
						`e.g. { from: 'bigint', amount: 'numeric' } — ${PARAM_TYPE_HINT}`,
					);
					continue;
				}
				const pg = PARAM_TYPE_NAMES[typeNode.value as string];
				if (!pg) {
					this.diags.error(
						typeNode,
						Codes.BadProcedureShape,
						`'${typeNode.value}' is not a SQL type name`,
						PARAM_TYPE_HINT,
					);
					continue;
				}
				if (paramInfos.has(pName)) {
					this.diags.error(pNameNode, Codes.Redeclaration, `duplicate parameter '${pName}'`);
					continue;
				}
				let defaultSql: string | undefined;
				if (defaultNode) {
					defaultSql = this.renderParamDefault(defaultNode, typeNode.value as string);
					if (defaultSql === undefined) continue;
				} else if (sawDefault) {
					// Postgres: input parameters after one with a default value must
					// also have defaults. Object key order IS the parameter order.
					this.diags.error(
						prop,
						Codes.BadProcedureShape,
						`parameter '${pName}' needs a default: it follows a parameter that has one`,
						'move parameters with defaults to the end of the params object',
					);
					continue;
				}
				if (defaultSql !== undefined) sawDefault = true;
				const info: ParamVar = {
					kind: 'param',
					name: pName,
					emitted: `p_${pName}`,
					// `default: null` is the only way a parameter becomes nullable.
					type: { pg, nullable: defaultSql === 'NULL' },
				};
				if (this.reserveEmitted(ctx, pNameNode, pName, [info.emitted])) {
					paramInfos.set(pName, info);
					params.push({
						emitted: info.emitted,
						type: pg,
						...(defaultSql !== undefined ? { default: defaultSql } : {}),
					});
				}
			}
		}

		if (bodyArg.type !== 'ArrowFunctionExpression') {
			this.diags.error(bodyArg, Codes.BadProcedureShape, 'the body must be an inline arrow function');
			return undefined;
		}
		this.bindBodyParams(bodyArg, scope, paramInfos);

		const bodyNode = bodyArg.body as ONode;
		if (bodyNode.type !== 'BlockStatement' && bodyNode.type !== 'FunctionBody') {
			this.diags.error(bodyNode, Codes.BadProcedureShape, 'the body must be a block', 'write (args) => { ... }');
			return undefined;
		}
		ctx.bodyNode = bodyNode;

		const body = this.visitStatements((bodyNode.body ?? bodyNode.statements) as ONode[], scope);
		// A bound cursor that is never iterated means its query silently never
		// runs — that is always a bug in the source.
		for (const cursor of ctx.pendingCursors) {
			this.diags.error(
				cursor.declNode,
				Codes.BadSqlUse,
				`cursor '${cursor.name}' is never iterated — its query would never run`,
				`iterate it: for (const row of ${cursor.name}) { ... }`,
			);
		}
		const returns: OutParamIR[] = [];
		if (ctx.returnShape) {
			for (const [key, slot] of ctx.returnShape) {
				returns.push({ key, emitted: slot.emitted, type: slot.type.pg as PgScalarType });
			}
			// Once any site returns a value, plpgsql's silent NULL-default for
			// unassigned OUT params is exactly what we must rule out: every path
			// must end in a valued return or a raise.
			if (!this.stmtsTerminate(body)) {
				this.diags.error(
					nameNode,
					Codes.BadProcedureShape,
					`not every code path in '${name}' returns a value`,
					'end every branch with return { ... } or throw new PgError(...)',
				);
			}
		}
		return {
			name,
			...(schema !== undefined ? { schema } : {}),
			dependsOn: [...ctx.dependsOn].sort(),
			params,
			returns,
			decls: ctx.decls,
			body,
		};
	}

	/** `(ctx) => ...` or `({ args, sql, notice }) => ...`. */
	private bindBodyParams(arrow: ONode, scope: Scope, paramInfos: Map<string, ParamVar>): void {
		if (arrow.async) {
			this.diags.error(arrow, Codes.UnsupportedSyntax, 'async procedures are not supported', 'PL/pgSQL is synchronous');
		}
		const parameters = (arrow.params ?? []) as ONode[];
		if (parameters.length === 0) return;
		if (parameters.length > 1) {
			this.diags.error(parameters[1], Codes.BadProcedureShape, 'the body takes a single ctx parameter');
			return;
		}
		let binding = parameters[0];
		if (binding.type === 'AssignmentPattern') {
			this.diags.error(
				binding.right,
				Codes.BadProcedureShape,
				'destructure without renaming, defaults or rest',
				'the ctx is always supplied by the compiler — parameter defaults are not supported',
			);
			return;
		}
		if (binding.optional) {
			this.diags.error(binding, Codes.BadProcedureShape, 'the ctx parameter cannot be optional');
			return;
		}
		if (isIdent(binding)) {
			// (ctx) => { ... } — members read as ctx.sql`...`, ctx.args.<name>,
			// or destructured later: const { args, sql } = ctx.
			this.declareName(scope, binding, { kind: 'ctx', name: binding.name, emitted: '', params: paramInfos }, []);
			return;
		}
		if (binding.type !== 'ObjectPattern') {
			this.diags.error(
				binding,
				Codes.BadProcedureShape,
				'the ctx parameter must be a plain identifier or a destructuring pattern',
				'write (ctx) => { ... ctx.sql`...` ... } or ({ args, sql }) => { ... }',
			);
			return;
		}
		this.bindCtxPattern(binding, paramInfos, scope);
	}

	/** `{ args, sql, notice }` — plain shorthand elements naming ctx members. */
	private bindCtxPattern(pattern: ONode, paramInfos: Map<string, ParamVar>, scope: Scope): void {
		for (const element of pattern.properties as ONode[]) {
			const eName = element.type === 'Property' ? (element.value as ONode) : undefined;
			if (element.type !== 'Property' || !element.shorthand || !isIdent(eName)) {
				this.diags.error(element, Codes.BadProcedureShape, 'destructure without renaming, defaults or rest');
				continue;
			}
			const memberNameText = eName.name as string;
			if (memberNameText === 'args') {
				this.declareName(scope, eName, { kind: 'args', name: 'args', emitted: '', params: paramInfos }, []);
				continue;
			}
			if (CTX_DSL_MEMBERS.has(memberNameText)) {
				this.declareName(
					scope,
					eName,
					{ kind: 'dsl', name: memberNameText, emitted: '', fn: memberNameText as DslFn },
					[],
				);
				continue;
			}
			this.diags.error(eName, Codes.BadProcedureShape, `'${memberNameText}' is not a ctx member`, CTX_MEMBER_HINT);
		}
	}

	/** `{ from, to }` — plain shorthand elements naming declared params. */
	private bindArgsPattern(pattern: ONode, paramInfos: Map<string, ParamVar>, scope: Scope): void {
		for (const element of pattern.properties as ONode[]) {
			const eName = element.type === 'Property' ? (element.value as ONode) : undefined;
			if (element.type !== 'Property' || !element.shorthand || !isIdent(eName)) {
				this.diags.error(element, Codes.BadProcedureShape, 'destructure without renaming, defaults or rest');
				continue;
			}
			const info = paramInfos.get(eName.name as string);
			if (!info) {
				this.diags.error(eName, Codes.BadProcedureShape, `'${eName.name}' is not a declared parameter`);
				continue;
			}
			// p_<name> was reserved when the params object was read — this only
			// makes the NAME visible in scope (and guards against redeclaration).
			this.declareName(scope, eName, info, []);
		}
	}

	/** `{ type: 'int', default: 20 }` — exactly these two plain keys. */
	private parseParamSpec(obj: ONode): { type: ONode; default: ONode } | undefined {
		const found = new Map<string, ONode>();
		for (const prop of obj.properties as ONode[]) {
			const key = prop.type === 'Property' && !prop.computed && !prop.shorthand && isIdent(prop.key)
				? prop.key.name
				: undefined;
			if (!key || (key !== 'type' && key !== 'default') || found.has(key)) {
				this.diags.error(
					prop,
					Codes.BadProcedureShape,
					"a parameter spec is { type: '<sql type>', default: <literal> }",
					"e.g. { limit: { type: 'int', default: 20 } }",
				);
				return undefined;
			}
			found.set(key, prop.value as ONode);
		}
		const type = found.get('type');
		const dflt = found.get('default');
		if (!type || !dflt) {
			this.diags.error(
				obj,
				Codes.BadProcedureShape,
				'a parameter spec needs both `type` and `default`',
				"parameters without a default are written as plain strings: { amount: 'numeric' }",
			);
			return undefined;
		}
		return { type, default: dflt };
	}

	/**
	 * Default values are literals of the parameter's type (or null, which
	 * makes the parameter nullable). Rendered to SQL text here.
	 */
	private renderParamDefault(node: ONode, typeName: string): string | undefined {
		let neg = '';
		let lit = node;
		if (node.type === 'UnaryExpression' && node.operator === '-') {
			neg = '-';
			lit = node.argument as ONode;
		}
		const bad = (): undefined => {
			this.diags.error(
				node,
				Codes.TypeMismatch,
				`the default must be ${/^[aeiou]/.test(typeName) ? 'an' : 'a'} ${typeName} literal or null`,
				'defaults are emitted into the procedure signature — expressions are not supported',
			);
			return undefined;
		};
		if (lit.type !== 'Literal') return bad();
		if (isNullLiteral(lit)) return neg ? bad() : 'NULL';
		const raw = String(lit.raw ?? '').replaceAll('_', '');
		switch (typeName) {
			case 'int':
			case 'bigint':
				return typeof lit.value === 'number' && /^[0-9]+$/.test(raw) ? neg + raw : bad();
			case 'bigint64':
				return isBigIntLiteral(lit) && /^[0-9]+n$/.test(raw) ? neg + raw.slice(0, -1) : bad();
			case 'numeric':
				return typeof lit.value === 'number' && /^[0-9]+(\.[0-9]+)?$/.test(raw) ? neg + raw : bad();
			case 'text':
				return !neg && typeof lit.value === 'string' ? escapeSqlString(lit.value) : bad();
			case 'boolean':
				return !neg && typeof lit.value === 'boolean' ? (lit.value ? 'TRUE' : 'FALSE') : bad();
			default:
				return bad();
		}
	}

	// ── statements ───────────────────────────────────────────────────────────

	private visitStatements(stmts: readonly ONode[], scope: Scope): Stmt[] {
		const out: Stmt[] = [];
		// Early-exit narrowing: after `if (err !== null) { throw ... }` (no else,
		// then-branch always leaves the block), the condition is known FALSE for
		// the rest of this block — its elseOf guards apply until the block ends.
		const added: VarInfo[] = [];
		try {
			for (const stmt of stmts) {
				if (stmt.type === 'IfStatement') {
					const after: VarInfo[] = [];
					out.push(...this.visitIf(stmt, scope, after));
					for (const g of after) {
						if (!scope.ctx.guarded.has(g)) {
							scope.ctx.guarded.add(g);
							added.push(g);
						}
					}
					continue;
				}
				out.push(...this.visitStatement(stmt, scope));
			}
		} finally {
			for (const g of added) scope.ctx.guarded.delete(g);
		}
		return out;
	}

	/** Does control never fall off the end of these statements? (return/throw/break/continue) */
	private leavesBlock(stmts: Stmt[]): boolean {
		const last = stmts[stmts.length - 1];
		if (!last) return false;
		if (last.kind === 'return' || last.kind === 'raise' || last.kind === 'exit' || last.kind === 'continue') {
			return true;
		}
		if (last.kind === 'if') {
			return (
				last.branches.every((b) => this.leavesBlock(b.body))
				&& last.elseBody !== undefined
				&& this.leavesBlock(last.elseBody)
			);
		}
		return false;
	}

	private visitBlockOrStatement(stmt: ONode, scope: Scope): Stmt[] {
		if (stmt.type === 'BlockStatement') return this.visitStatements(stmt.body as ONode[], scope);
		return this.visitStatement(stmt, scope);
	}

	private visitStatement(stmt: ONode, scope: Scope): Stmt[] {
		switch (stmt.type) {
			case 'VariableDeclaration':
				return this.visitVariableStatement(stmt, scope);
			case 'ExpressionStatement':
				return this.visitExpressionStatement(stmt, scope);
			case 'IfStatement':
				return this.visitIf(stmt, scope);
			case 'WhileStatement': {
				const cond = this.visitCondition(stmt.test, scope);
				scope.ctx.loopDepth++;
				const body = this.visitBlockOrStatement(stmt.body, scope.child());
				scope.ctx.loopDepth--;
				return cond ? [{ kind: 'while', cond: cond.expr, body }] : [];
			}
			case 'BreakStatement':
			case 'ContinueStatement':
				return this.visitLoopControl(stmt, scope);
			case 'ForOfStatement':
				return this.visitForOf(stmt, scope);
			case 'ThrowStatement':
				return this.visitThrow(stmt, scope);
			case 'ReturnStatement':
				return this.visitReturn(stmt, scope);
		}
		this.diags.error(
			stmt,
			Codes.UnsupportedSyntax,
			`unsupported statement: ${stmt.type}`,
			this.statementHint(stmt),
		);
		return [];
	}

	/**
	 * `return { key: expr }` — the return type is INFERRED: the first valued
	 * return defines the shape; every other site must unify with it (same
	 * keys, compatible types — numeric family widens, nullability ORs). The
	 * record compiles to OUT parameters assigned just before RETURN, and
	 * visitProcedure enforces that every path terminates once any site
	 * returns a value.
	 */
	private visitReturn(stmt: ONode, scope: Scope): Stmt[] {
		const ctx = scope.ctx;
		const expr = stmt.argument as ONode | null;
		if (ctx.tryFrames.length > 0) {
			this.diags.error(
				stmt,
				Codes.BadProcedureShape,
				'inside ctx.try(), `return` may only be the last statement of the body',
				'restructure with if/else so the body ends in a single return { ... }',
			);
			return [];
		}

		if (!expr) {
			if (ctx.returnShape) {
				this.diags.error(
					stmt,
					Codes.BadProcedureShape,
					'bare `return` cannot mix with valued returns',
					`this procedure returns { ${[...ctx.returnShape.keys()].join(', ')} }`,
				);
				return [];
			}
			ctx.firstBareReturn ??= stmt;
			return [{ kind: 'return' }];
		}

		if (ctx.firstBareReturn) {
			this.diags.error(stmt, Codes.BadProcedureShape, 'valued returns cannot mix with bare `return`');
			return [];
		}
		if (expr.type !== 'ObjectExpression') {
			this.diags.error(
				expr,
				Codes.BadProcedureShape,
				'procedures return a flat object of scalars',
				'wrap the value: return { newBalance: row.balance } — it compiles to INOUT parameters',
			);
			return [];
		}

		const site = new Map<string, { node: ONode; res: ExprResult }>();
		let failed = false;
		for (const prop of expr.properties as ONode[]) {
			let keyNode: ONode | undefined;
			let valueExpr: ONode | undefined;
			if (prop.type === 'Property' && !prop.computed && prop.kind === 'init' && !prop.method) {
				keyNode = prop.key as ONode;
				valueExpr = prop.value as ONode;
			}
			if (!keyNode || !valueExpr || !isIdent(keyNode) || valueExpr.type === 'AssignmentPattern') {
				this.diags.error(prop, Codes.BadProcedureShape, 'return fields must be plain `key: expression` pairs');
				failed = true;
				continue;
			}
			const key = keyNode.name as string;
			if (site.has(key)) {
				this.diags.error(keyNode, Codes.BadProcedureShape, `duplicate return field '${key}'`);
				failed = true;
				continue;
			}
			const res = this.visitExpr(valueExpr, scope);
			if (!res) {
				failed = true;
				continue;
			}
			if (res.type.pg === 'null') {
				this.diags.error(
					valueExpr,
					Codes.TypeMismatch,
					`cannot infer a SQL type for return field '${key}'`,
					'a bare null has no type — wrap it with coalesce(...) or return a typed expression',
				);
				failed = true;
				continue;
			}
			site.set(key, { node: valueExpr, res });
		}
		if (failed) return [];
		if (site.size === 0) {
			this.diags.error(expr, Codes.BadProcedureShape, 'return an empty object? use a bare `return;` instead');
			return [];
		}

		if (!ctx.returnShape) {
			// First valued return defines the shape and the OUT parameter order.
			const shape = new Map<string, { emitted: string; type: ScalarType }>();
			for (const [key, { node, res }] of site) {
				// Quoted, case-preserving and unprefixed: the INOUT parameter's name is
				// the CALL result column, so `db.call()` gets back exactly these keys.
				const emitted = quoteIdent(key);
				if (!this.reserveEmitted(ctx, node, key, [emitted])) return [];
				shape.set(key, { emitted, type: { ...res.type } });
			}
			ctx.returnShape = shape;
		} else {
			const expected = ctx.returnShape;
			if ([...expected.keys()].sort().join(',') !== [...site.keys()].sort().join(',')) {
				this.diags.error(
					expr,
					Codes.BadProcedureShape,
					`return shape mismatch: expected { ${[...expected.keys()].join(', ')} }, got { ${
						[...site.keys()].join(', ')
					} }`,
					'every return site must produce the same fields',
				);
				return [];
			}
			for (const [key, slot] of expected) {
				const { node, res } = site.get(key)!;
				if (!compatible(slot.type, res.type)) {
					this.diags.error(node, Codes.TypeMismatch, `return field '${key}' has a different type at this return site`);
					return [];
				}
				// Widen across sites: numeric family unifies, nullability ORs.
				const pg = family(slot.type) === 'num' && family(res.type) === 'num'
					? unifyNum(slot.type, res.type)
					: slot.type.pg;
				slot.type = { pg, nullable: slot.type.nullable || res.type.nullable };
			}
		}

		// Lower to OUT assignments (in shape order) + RETURN.
		const out: Stmt[] = [];
		for (const [key, slot] of ctx.returnShape) {
			out.push({ kind: 'assign', target: slot.emitted, expr: site.get(key)!.res.expr });
		}
		out.push({ kind: 'return' });
		return out;
	}

	/**
	 * `break` → EXIT, `continue` → CONTINUE. Both target the innermost loop in
	 * JS and PL/pgSQL alike, so unlabeled forms map 1:1. Labels are rejected
	 * (LabeledStatement is not whitelisted). Neither counts as a terminator
	 * for return-path analysis: control continues after/at the loop.
	 */
	private visitLoopControl(stmt: ONode, scope: Scope): Stmt[] {
		const word = stmt.type === 'BreakStatement' ? 'break' : 'continue';
		if (stmt.label) {
			this.diags.error(
				stmt,
				Codes.UnsupportedSyntax,
				`labeled ${word} is not supported`,
				`use an unlabeled ${word} (it targets the innermost loop)`,
			);
			return [];
		}
		if (scope.ctx.loopDepth === 0) {
			if (scope.ctx.tryFrames.length > 0) {
				this.diags.error(
					stmt,
					Codes.UnsupportedSyntax,
					`${word} cannot leave a ctx.try() body`,
					`test err after the try instead: if (err !== null) { ${word} }`,
				);
			} else {
				this.diags.error(stmt, Codes.UnsupportedSyntax, `${word} outside a loop`);
			}
			return [];
		}
		return [{ kind: stmt.type === 'BreakStatement' ? 'exit' : 'continue' }];
	}

	/** Conservative terminator analysis over lowered statements. */
	private stmtsTerminate(stmts: Stmt[]): boolean {
		const last = stmts[stmts.length - 1];
		if (!last) return false;
		if (last.kind === 'return' || last.kind === 'raise') return true;
		if (last.kind === 'if') {
			return (
				last.branches.every((b) => this.stmtsTerminate(b.body))
				&& last.elseBody !== undefined
				&& this.stmtsTerminate(last.elseBody)
			);
		}
		return false;
	}

	private statementHint(stmt: ONode): string | undefined {
		switch (stmt.type) {
			case 'ForStatement':
			case 'ForInStatement':
				return 'use while, or for..of over sql`...`.many<T>()';
			case 'SwitchStatement':
				return 'use if / else if';
			case 'DoWhileStatement':
				return 'use while';
			case 'TryStatement':
				return 'exception handling is not supported; throw new PgError(code, message) to abort';
			case 'FunctionDeclaration':
			case 'ClassDeclaration':
				return 'nested declarations are not supported';
			case 'BlockStatement':
				return 'bare blocks have no PL/pgSQL equivalent (there is a single hoisted DECLARE block)';
			default:
				return undefined;
		}
	}

	private visitVariableStatement(stmt: ONode, scope: Scope): Stmt[] {
		const kind = stmt.kind as string;
		if (kind !== 'const' && kind !== 'let') {
			this.diags.error(stmt, Codes.UnsupportedSyntax, `'${kind}' declarations are not supported`, 'use const or let');
			return [];
		}
		const out: Stmt[] = [];
		for (const decl of stmt.declarations as ONode[]) {
			const init = decl.init as ONode | null;
			if (
				init?.type === 'CallExpression'
				&& this.resolveDslFn(init.callee as ONode, scope) === 'try'
			) {
				out.push(...this.visitTryDeclarator(decl, kind === 'let', scope));
				continue;
			}
			const s = this.visitDeclarator(decl, kind === 'let', scope);
			if (s) out.push(s);
		}
		return out;
	}

	/** `const { res, err } = ctx.try(...)` — renames allowed: `{ res: booking, err: e }`. */
	private visitTryDeclarator(decl: ONode, mutable: boolean, scope: Scope): Stmt[] {
		const pattern = decl.id as ONode;
		const usage = 'const { res, err } = ctx.try(() => { ... }, [...conditions])';
		if (mutable || pattern.type !== 'ObjectPattern' || pattern.typeAnnotation) {
			this.diags.error(decl, Codes.UnsupportedSyntax, 'destructure the ctx.try() result with const', usage);
			return [];
		}
		const names: { res?: IdentNode; err?: IdentNode } = {};
		for (const prop of pattern.properties as ONode[]) {
			const key = prop.type === 'Property' && !prop.computed && isIdent(prop.key) ? prop.key.name : undefined;
			const value = prop.value as ONode | undefined;
			if ((key !== 'res' && key !== 'err') || !isIdent(value) || names[key]) {
				this.diags.error(
					prop,
					Codes.UnsupportedSyntax,
					'the ctx.try() result has exactly two members: res and err',
					usage,
				);
				return [];
			}
			names[key] = value;
		}
		return this.visitTry(decl.init as ONode, scope, names);
	}

	/**
	 * ctx.try(() => { ... }, ['unique_violation', 'P0409']) — see TryStmt.
	 * The body runs in its own frame: loops do not continue through it,
	 * commit()/rollback() and outer assignments are rejected, and its only
	 * `return` is the trailing one (lowered to res assignments).
	 */
	private visitTry(call: ONode, scope: Scope, names: { res?: IdentNode; err?: IdentNode } | undefined): Stmt[] {
		const ctx = scope.ctx;
		const usage = 'ctx.try(() => { ... }, [...conditions])';
		const args = (call.arguments ?? []) as ONode[];
		if (args.length !== 2) {
			this.diags.error(call, Codes.UnsupportedCall, 'ctx.try() takes (body, conditions)', usage);
			return [];
		}
		const [fn, list] = args;
		if (
			fn.type !== 'ArrowFunctionExpression' || fn.async || (fn.params ?? []).length > 0
			|| fn.body?.type !== 'BlockStatement' && fn.body?.type !== 'FunctionBody'
		) {
			this.diags.error(
				fn,
				Codes.UnsupportedCall,
				'the ctx.try() body must be an inline `() => { ... }` arrow function',
				usage,
			);
			return [];
		}

		// ── the condition list ──
		const conditions: string[] = [];
		if (list.type !== 'ArrayExpression' || (list.elements as ONode[]).length === 0) {
			this.diags.error(
				list,
				Codes.UnsupportedCall,
				'ctx.try() needs a non-empty inline list of conditions to catch',
				"e.g. ['unique_violation', 'P0409'] — a catch-all would also swallow deadlocks and bugs",
			);
			return [];
		}
		let failed = false;
		for (const el of list.elements as (ONode | null)[]) {
			if (!el || !isLiteralOfType(el, 'string')) {
				this.diags.error(
					el ?? list,
					Codes.UnsupportedCall,
					'conditions are string literals',
					"a condition name ('unique_violation') or a SQLSTATE ('23505')",
				);
				failed = true;
				continue;
			}
			const c = el.value as string;
			if (c === 'others') {
				this.diags.error(
					el,
					Codes.UnsupportedCall,
					"'others' cannot be caught",
					'list the conditions you handle — a catch-all would also swallow deadlocks and bugs',
				);
				failed = true;
			} else if (!PG_CONDITIONS.has(c) && !/^[0-9A-Z]{5}$/.test(c)) {
				this.diags.error(
					el,
					Codes.UnsupportedCall,
					`unknown condition '${c}'`,
					'use a PL/pgSQL condition name (unique_violation, foreign_key_violation, ...) or a 5-character SQLSTATE',
				);
				failed = true;
			} else if (/^[0-9A-Z]{5}$/.test(c) && /^0[0-2]/.test(c)) {
				this.diags.error(
					el,
					Codes.UnsupportedCall,
					`SQLSTATE '${c}' is not an error (classes 00–02 are success/warning/no-data)`,
				);
				failed = true;
			} else if (conditions.includes(c)) {
				this.diags.error(el, Codes.UnsupportedCall, `duplicate condition '${c}'`);
				failed = true;
			} else {
				conditions.push(c);
			}
		}
		if (failed) return [];

		// ── the body, in its own frame ──
		const bodyNodes = ((fn.body.body ?? fn.body.statements) as ONode[]).slice();
		const lastNode = bodyNodes[bodyNodes.length - 1];
		const trailingReturn = lastNode?.type === 'ReturnStatement' ? bodyNodes.pop() : undefined;
		const frame: TryFrame = { declared: new Set(), trailingReturn };
		const savedLoopDepth = ctx.loopDepth;
		ctx.loopDepth = 0;
		ctx.tryFrames.push(frame);
		const inner = scope.child();
		let body: Stmt[];
		let returned: Map<string, ExprResult> | undefined;
		try {
			body = this.visitStatements(bodyNodes, inner);
			if (trailingReturn?.argument) returned = this.visitTryReturn(trailingReturn, inner);
		} finally {
			ctx.tryFrames.pop();
			ctx.loopDepth = savedLoopDepth;
		}
		if (trailingReturn?.argument && !returned) return [];

		const stmt: TryStmt = { kind: 'try', body, conditions };
		const out: Stmt[] = [];

		// res: one scalar local per returned field.
		let resVar: TryResVar | undefined;
		if (names?.res) {
			const resName = names.res.name as string;
			const fields = returned ? new Map<string, { emitted: string; type: ScalarType }>() : undefined;
			if (returned && fields) {
				for (const [key, r] of returned) fields.set(key, { emitted: `v_${resName}__${key}`, type: { ...r.type } });
			}
			resVar = { kind: 'try-res', name: resName, emitted: '', fields };
			if (!this.declareName(scope, names.res, resVar, [...(fields?.values() ?? [])].map((f) => f.emitted))) return [];
			if (fields) {
				for (const f of fields.values()) ctx.decls.push({ emitted: f.emitted, type: f.type.pg as PgScalarType });
				stmt.res = { name: resName, fields: [...fields].map(([key, f]) => ({ key, emitted: f.emitted })) };
				for (const [key, f] of fields) body.push({ kind: 'assign', target: f.emitted, expr: returned!.get(key)!.expr });
			}
		}

		// err: the matched-condition variable; diagnostics items are added as read.
		if (names?.err) {
			const errName = names.err.name as string;
			const codeVar = `v_${errName}__code`;
			const errVar: TryErrVar = { kind: 'try-err', name: errName, emitted: '', stmt, res: resVar };
			const reserved = [...ERR_FIELDS.keys()].map((f) => `v_${errName}__${f}`);
			if (!this.declareName(scope, names.err, errVar, reserved)) return [];
			ctx.decls.push({ emitted: codeVar, type: 'text' });
			stmt.err = { name: errName, codeVar, items: [] };
			// Reset first: in a loop, a previous iteration's error must not leak.
			out.push({ kind: 'assign', target: codeVar, expr: { kind: 'literal', sql: 'NULL' } });
		}
		out.push(stmt);
		return out;
	}

	/** The trailing `return { ... }` of a ctx.try() body: flat scalar fields. */
	private visitTryReturn(ret: ONode, scope: Scope): Map<string, ExprResult> | undefined {
		const expr = ret.argument as ONode;
		if (expr.type !== 'ObjectExpression') {
			this.diags.error(
				expr,
				Codes.BadProcedureShape,
				'ctx.try() bodies return a flat object of scalars',
				'return { id: row.id }',
			);
			return undefined;
		}
		const out = new Map<string, ExprResult>();
		for (const prop of expr.properties as ONode[]) {
			const ok = prop.type === 'Property' && !prop.computed && prop.kind === 'init' && !prop.method
				&& isIdent(prop.key);
			if (!ok) {
				this.diags.error(prop, Codes.BadProcedureShape, 'return fields must be plain `key: expression` pairs');
				return undefined;
			}
			const key = prop.key.name as string;
			if (!/^[a-z_][a-z0-9_]*$/.test(key) || out.has(key)) {
				this.diags.error(
					prop.key,
					Codes.BadProcedureShape,
					`return field '${key}' must be a unique lowercase identifier`,
				);
				return undefined;
			}
			const res = this.visitExpr(prop.value as ONode, scope);
			if (!res) return undefined;
			if (res.type.pg === 'null') {
				this.diags.error(prop.value, Codes.TypeMismatch, `cannot infer a SQL type for return field '${key}'`);
				return undefined;
			}
			out.set(key, res);
		}
		return out;
	}

	private visitDeclarator(decl: ONode, mutable: boolean, scope: Scope): Stmt | undefined {
		const nameNode = decl.id as ONode;
		const typeAnnotationNode = (nameNode.typeAnnotation as ONode | undefined)?.typeAnnotation as ONode | undefined;
		if (nameNode.type === 'ObjectPattern') {
			// const { args, sql } = ctx / const { from } = ctx.args / const { from } = args
			// — pure aliasing of compiler-tracked bindings; emits nothing.
			const init = decl.init as ONode | null;
			let source: { kind: 'ctx' | 'args'; params: Map<string, ParamVar> } | undefined;
			if (init && isIdent(init)) {
				const info = scope.lookup(init.name);
				if (info?.kind === 'ctx' || info?.kind === 'args') source = { kind: info.kind, params: info.params };
			} else if (init && init.type === 'MemberExpression' && isIdent(init.object)) {
				const info = scope.lookup(init.object.name);
				if (info?.kind === 'ctx' && memberName(init) === 'args' && !this.rejectOptionalChain(init)) {
					source = { kind: 'args', params: info.params };
				}
			}
			if (source) {
				if (mutable) {
					this.diags.error(decl, Codes.UnsupportedSyntax, `destructure the ${source.kind} object with const`);
				} else if (typeAnnotationNode) {
					this.diags.error(
						typeAnnotationNode,
						Codes.UnsupportedSyntax,
						`omit the type annotation when destructuring the ${source.kind} object`,
					);
				} else if (source.kind === 'ctx') {
					this.bindCtxPattern(nameNode, source.params, scope);
				} else {
					this.bindArgsPattern(nameNode, source.params, scope);
				}
				return undefined;
			}
		}
		if (!isIdent(nameNode)) {
			this.diags.error(
				nameNode,
				Codes.UnsupportedSyntax,
				'destructuring declarations are not supported',
				'only `const { ... } = <args>` is supported — read row fields individually: const balance = row.balance',
			);
			return undefined;
		}
		const name = nameNode.name as string;
		const init = decl.init as ONode | null;
		if (!init) {
			this.diags.error(
				decl,
				Codes.MissingInitializer,
				`'${name}' must be initialized`,
				'locals are declared in the hoisted DECLARE block and assigned here; an unassigned local would be NULL',
			);
			return undefined;
		}

		// const debit = sql`...`
		if (init.type === 'TaggedTemplateExpression' && this.isSqlTag(init.tag, scope)) {
			return this.bindSqlResult(decl, nameNode, init, mutable, scope, typeAnnotationNode);
		}

		// const row = sql`...`.one<T>() / .maybeOne<T>() / .many<T>()
		const chained = this.asSqlChain(init, scope);
		if (chained) {
			return this.bindSqlChain(
				decl,
				nameNode,
				chained.method,
				chained.call,
				chained.template,
				mutable,
				scope,
				typeAnnotationNode,
			);
		}

		// plain scalar: const x: int = ...
		const exprRes = this.visitExpr(init, scope);
		const annotated = typeAnnotationNode ? this.resolveTypeAnnotation(typeAnnotationNode) : undefined;
		if (!exprRes) return undefined;
		let type: ScalarType;
		if (annotated) {
			if (!compatible(annotated, exprRes.type)) {
				this.diags.error(
					init,
					Codes.TypeMismatch,
					`initializer type does not match the declared type of '${name}'`,
				);
			}
			// Invariant 4: an annotation must not launder nullability away — a
			// nullable initializer needs a `T | null` annotation (or coalesce).
			if (exprRes.type.nullable && !annotated.nullable) {
				this.diags.error(
					init,
					Codes.TypeMismatch,
					`initializer of '${name}' may be NULL but its declared type is not nullable`,
					'declare it as `T | null`, or wrap the initializer with coalesce(...)',
				);
				return undefined;
			}
			type = annotated;
		} else if (typeAnnotationNode) {
			return undefined; // annotation errored; already reported
		} else {
			if (isNumericLiteralish(init)) {
				this.diags.error(
					init,
					Codes.BareNumber,
					'a bare numeric literal is ambiguous — is it int or numeric?',
					`annotate the declaration: const ${name}: int = ${this.getText(init)} (or numeric)`,
				);
				return undefined;
			}
			if (exprRes.type.pg === 'null') {
				this.diags.error(init, Codes.UnsupportedSyntax, 'null literals are only supported inside coalesce(...)');
				return undefined;
			}
			type = exprRes.type;
		}

		const info: VarInfo = { kind: 'local', name, emitted: `v_${name}`, type, mutable };
		if (!this.declareName(scope, bareName(nameNode), info, [info.emitted])) return undefined;
		scope.ctx.decls.push({ emitted: info.emitted, type: type.pg as PgScalarType });
		return { kind: 'assign', target: info.emitted, expr: exprRes.expr };
	}

	/** const debit = sql`...` → statement + GET DIAGNOSTICS, ONE node (invariant 1). */
	private bindSqlResult(
		decl: ONode,
		nameNode: ONode,
		tagged: ONode,
		mutable: boolean,
		scope: Scope,
		typeAnnotationNode: ONode | undefined,
	): Stmt | undefined {
		if (mutable) {
			this.diags.error(decl, Codes.BadSqlUse, 'bind sql results with const', 'the bound row count is captured once');
			return undefined;
		}
		if (typeAnnotationNode) {
			this.diags.error(typeAnnotationNode, Codes.BadSqlUse, 'omit the type annotation on sql bindings');
		}
		const sql = this.visitSqlTemplate(tagged, scope);
		if (!sql) return undefined;
		const name = nameNode.name as string;
		const info: VarInfo = {
			kind: 'sql-result',
			name,
			emitted: `v_${name}`,
			countVar: `v_${name}__count`,
		};
		if (!this.declareName(scope, nameNode, info, [info.emitted, info.countVar])) return undefined;
		scope.ctx.decls.push({ emitted: info.countVar, type: 'bigint' });
		const stmt: SqlStmt = { kind: 'sql', sql, result: { countVar: info.countVar } };
		return stmt;
	}

	/** Recognizes sql`...`.one/.maybeOne/.many — chained DIRECTLY on the template. */
	private asSqlChain(
		node: ONode,
		scope: Scope,
	): { method: 'one' | 'maybeOne' | 'many'; call: ONode; template: ONode } | undefined {
		if (node.type !== 'CallExpression') return undefined;
		const callee = node.callee as ONode;
		if (callee.type !== 'MemberExpression') return undefined;
		const object = callee.object as ONode;
		if (object.type !== 'TaggedTemplateExpression' || !this.isSqlTag(object.tag, scope)) return undefined;
		// The receiver is an import-anchored sql`...`, so its type is SqlResult
		// by construction; the member name alone is unambiguous here.
		const method = memberName(callee);
		if (method !== 'one' && method !== 'maybeOne' && method !== 'many') return undefined;
		return { method, call: node, template: object };
	}

	private bindSqlChain(
		decl: ONode,
		nameNode: ONode,
		method: 'one' | 'maybeOne' | 'many',
		call: ONode,
		template: ONode,
		mutable: boolean,
		scope: Scope,
		typeAnnotationNode: ONode | undefined,
	): Stmt | undefined {
		if (this.rejectOptionalChain(call) || this.rejectOptionalChain(call.callee)) return undefined;
		if (method === 'many') {
			// const rows = sql`...`.many<T>() — a deferred cursor: nothing is
			// emitted here; the consuming for..of emits FOR ... IN <query> LOOP.
			if (mutable) {
				this.diags.error(decl, Codes.BadSqlUse, 'bind cursors with const');
				return undefined;
			}
			if (typeAnnotationNode) {
				this.diags.error(typeAnnotationNode, Codes.BadSqlUse, 'omit the type annotation on cursor bindings');
				return undefined;
			}
			const cursorFields = this.parseOptionalRowType(call);
			if (cursorFields === null) return undefined;
			const cursorSql = this.visitSqlTemplate(template, scope);
			if (!cursorSql || !this.requireRowReturning(template, cursorSql)) return undefined;
			const cursorName = nameNode.name as string;
			const cursor: CursorVar = {
				kind: 'cursor',
				name: cursorName,
				emitted: `v_${cursorName}`,
				sql: cursorSql,
				fields: cursorFields,
				consumed: false,
				declNode: nameNode,
			};
			// Nothing is emitted for the binding itself, so no name reservation.
			if (!this.declareName(scope, nameNode, cursor, [])) return undefined;
			scope.ctx.pendingCursors.add(cursor);
			return undefined;
		}
		if (mutable) {
			this.diags.error(decl, Codes.BadSqlUse, 'bind sql results with const');
			return undefined;
		}
		const fields = this.parseRowTypeArgument(call);
		const sql = this.visitSqlTemplate(template, scope);
		if (!fields || !sql) return undefined;
		const name = nameNode.name as string;
		if (method === 'one') {
			const info: VarInfo = { kind: 'record', name, emitted: `v_${name}`, fields };
			if (!this.declareName(scope, nameNode, info, [info.emitted])) return undefined;
			scope.ctx.decls.push({ emitted: info.emitted, type: 'record' });
			return { kind: 'sql-one', sql, into: info.emitted };
		}
		const info: VarInfo = {
			kind: 'maybe-one',
			name,
			emitted: `v_${name}`,
			countVar: `v_${name}__count`,
			fields,
		};
		if (!this.declareName(scope, nameNode, info, [info.emitted, info.countVar])) return undefined;
		scope.ctx.decls.push({ emitted: info.emitted, type: 'record' });
		scope.ctx.decls.push({ emitted: info.countVar, type: 'bigint' });
		return { kind: 'sql-maybe-one', sql, into: info.emitted, countVar: info.countVar };
	}

	private visitExpressionStatement(stmt: ONode, scope: Scope): Stmt[] {
		const expr = stmt.expression as ONode;

		if (expr.type === 'TaggedTemplateExpression') {
			if (!this.isSqlTag(expr.tag, scope)) {
				this.diags.error(expr.tag, Codes.UnsupportedCall, 'unsupported template tag', DSL_HINT);
				return [];
			}
			const sql = this.visitSqlTemplate(expr, scope);
			return sql ? [{ kind: 'sql', sql }] : [];
		}

		if (expr.type === 'CallExpression') return this.visitCallStatement(expr, scope);
		if (expr.type === 'ChainExpression') {
			this.rejectOptionalChain(expr);
			return [];
		}

		if (expr.type === 'AssignmentExpression') {
			const compound: Record<string, '+' | '-' | '*' | '/'> = {
				'+=': '+',
				'-=': '-',
				'*=': '*',
				'/=': '/',
			};
			if (expr.operator === '=' || compound[expr.operator]) {
				return this.visitAssignment(expr, compound[expr.operator], scope);
			}
		}

		if (expr.type === 'UpdateExpression') {
			this.diags.error(expr, Codes.UnsupportedSyntax, 'increment/decrement is not supported', 'use x = x + 1');
			return [];
		}

		this.diags.error(stmt, Codes.UnsupportedSyntax, `unsupported statement: ${expr.type}`);
		return [];
	}

	private visitCallStatement(call: ONode, scope: Scope): Stmt[] {
		const callee = call.callee as ONode;
		if (this.rejectOptionalChain(call) || this.rejectOptionalChain(callee)) return [];
		const dsl = this.resolveDslFn(callee, scope);

		if (dsl === 'lockRowsOrdered') return this.visitLockRows(call, scope);
		if (dsl === 'notice' || dsl === 'warning') return this.visitNotice(call, scope, dsl);
		if (dsl === 'try') return this.visitTry(call, scope, undefined);
		if (dsl === 'commit' || dsl === 'rollback') {
			if (scope.ctx.tryFrames.length > 0) {
				this.diags.error(
					call,
					Codes.UnsupportedCall,
					`${dsl}() is not allowed inside ctx.try()`,
					'Postgres cannot end a transaction inside an exception block (it runs as a subtransaction) — commit after the try',
				);
				return [];
			}
			if ((call.arguments ?? []).length !== 0) {
				this.diags.error(call, Codes.UnsupportedCall, `${dsl}() takes no arguments`);
				return [];
			}
			return [{ kind: dsl }];
		}
		if (dsl === 'sql') {
			this.diags.error(call, Codes.BadSqlUse, 'sql is a template tag', 'write sql`...`, not sql(...)');
			return [];
		}
		if (dsl === 'isNull' || dsl === 'coalesce') {
			this.diags.error(call, Codes.UnsupportedSyntax, `${dsl}() is an expression and has no effect as a statement`);
			return [];
		}
		if (isIdent(callee) && this.resolveRuntimeImport(callee.name, scope) === 'procedure') {
			this.diags.error(call, Codes.BadProcedureShape, 'procedures cannot be nested');
			return [];
		}

		if (callee.type === 'MemberExpression') {
			const objText = this.getText(callee.object);
			const method = memberName(callee) ?? this.getText(callee.property);
			// Text-based match purely to sharpen the message — the rejection itself
			// is whitelist-driven (any non-DSL call is an error regardless).
			if (objText === 'console') {
				this.diags.error(
					callee,
					Codes.ConsoleNotSupported,
					`console.${method} is not supported`,
					'use notice() → RAISE NOTICE',
				);
				return [];
			}
			if (method === 'many' && this.chainsOnSql(callee.object, scope)) {
				this.diags.error(call, Codes.ManyOutsideForOf, '.many() is only legal as a for..of target');
				return [];
			}
			if ((method === 'one' || method === 'maybeOne') && this.chainsOnSql(callee.object, scope)) {
				this.diags.error(call, Codes.BadSqlUse, `bind the result: const row = sql\`...\`.${method}<{...}>()`);
				return [];
			}
		}

		this.diags.error(
			call,
			Codes.UnsupportedCall,
			`'${this.getText(callee)}' does not resolve to a DSL primitive — arbitrary calls are not supported`,
			DSL_HINT,
		);
		return [];
	}

	/**
	 * Resolves a callable DSL member for BOTH spellings — `sql` (a binding
	 * destructured from ctx, tracked in scope) and `ctx.sql` (member access
	 * on the tracked ctx object). Either way the name is anchored: ctx is the
	 * parameter of an import-resolved procedure() call, so member matching by
	 * text is sound (same footing as .one/.maybeOne).
	 */
	private resolveDslFn(node: ONode, scope: Scope): DslFn | undefined {
		if (isIdent(node)) {
			const info = scope.lookup(node.name);
			return info?.kind === 'dsl' ? info.fn : undefined;
		}
		if (node.type === 'MemberExpression' && !node.optional) {
			const object = node.object as ONode;
			if (isIdent(object)) {
				const info = scope.lookup(object.name);
				const member = memberName(node);
				if (info?.kind === 'ctx' && member && CTX_DSL_MEMBERS.has(member)) return member as DslFn;
			}
		}
		return undefined;
	}

	private isSqlTag(tag: ONode, scope: Scope): boolean {
		return this.resolveDslFn(tag, scope) === 'sql';
	}

	private chainsOnSql(node: ONode, scope: Scope): boolean {
		return node.type === 'TaggedTemplateExpression' && this.isSqlTag(node.tag, scope);
	}

	/** ?. parses into ChainExpression/optional-flagged nodes — reject it explicitly. */
	private rejectOptionalChain(node: ONode): boolean {
		if (node.type === 'ChainExpression' || node.optional === true) {
			this.diags.error(
				node,
				Codes.UnsupportedSyntax,
				'optional chaining (?.) is not supported',
				'DSL values are never nullish — use plain `.`; use isNull()/coalesce() for NULL handling',
			);
			return true;
		}
		return false;
	}

	private visitLockRows(call: ONode, scope: Scope): Stmt[] {
		const args = (call.arguments ?? []) as ONode[];
		if (args.length !== 2) {
			this.diags.error(call, Codes.BadLockRows, 'lockRowsOrdered() takes exactly (table, ids)');
			return [];
		}
		const [tableArg, idsArg] = args;
		if (
			!isLiteralOfType(tableArg, 'string')
			|| !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(tableArg.value)
		) {
			this.diags.error(
				tableArg,
				Codes.BadLockRows,
				'the table must be a plain string literal identifier',
				"e.g. lockRowsOrdered('accounts', [from, to])",
			);
			return [];
		}
		// The table is emitted verbatim into FROM position: reserved and
		// type_func_name keywords either fail to parse ('order') or silently
		// bind to something else entirely ('user' → session_user function).
		const keywordSegment = (tableArg.value as string)
			.split('.')
			.find((segment) => INVALID_TABLE_NAME_KEYWORDS.has(segment.toLowerCase()));
		if (keywordSegment) {
			this.diags.error(
				tableArg,
				Codes.BadLockRows,
				`'${keywordSegment}' is a reserved SQL keyword and cannot be used as a table name`,
				'rename the table, or add a quoting-aware schema qualification to the DSL first',
			);
			return [];
		}
		if (idsArg.type !== 'ArrayExpression') {
			this.diags.error(idsArg, Codes.BadLockRows, 'the ids must be an inline array literal of identifiers');
			return [];
		}
		const elements = (idsArg.elements ?? []) as (ONode | null)[];
		if (elements.length === 0) {
			this.diags.error(
				idsArg,
				Codes.BadLockRows,
				'the ids array must contain at least one identifier — IN () is not valid SQL',
				"e.g. lockRowsOrdered('accounts', [from, to])",
			);
			return [];
		}
		const ids: IdentExpr[] = [];
		for (const element of elements) {
			if (!element) continue;
			const res = this.visitExpr(element, scope);
			if (!res) continue;
			if (res.expr.kind !== 'ident' || (res.type.pg !== 'integer' && res.type.pg !== 'bigint')) {
				this.diags.error(
					element,
					Codes.BadLockRows,
					'lock ids must be in-scope int or bigint identifiers',
					'numeric/text values cannot address integer row ids',
				);
				continue;
			}
			ids.push(res.expr);
		}
		return [{ kind: 'lock-rows', table: tableArg.value as string, ids }];
	}

	/** notice(x) / warning(x): a string/template message, or any single scalar expression. */
	private visitNotice(call: ONode, scope: Scope, fn: 'notice' | 'warning'): Stmt[] {
		const level = fn === 'notice' ? 'NOTICE' : 'WARNING';
		const args = (call.arguments ?? []) as ONode[];
		if (args.length !== 1) {
			this.diags.error(call, Codes.UnsupportedCall, `${fn}() takes exactly one argument`);
			return [];
		}
		const arg = args[0];
		if (isLiteralOfType(arg, 'string') || arg.type === 'TemplateLiteral') {
			const message = this.visitFormatText(arg, scope, 'the message');
			return message ? [{ kind: 'notice', level, message }] : [];
		}
		const res = this.visitExpr(arg, scope);
		if (!res) return [];
		return [{ kind: 'notice', level, message: { parts: ['', ''], args: [res.expr] } }];
	}

	private visitAssignment(expr: ONode, compoundOp: '+' | '-' | '*' | '/' | undefined, scope: Scope): Stmt[] {
		const left = expr.left as ONode;
		if (left.type === 'MemberExpression') {
			const obj = left.object as ONode;
			const objInfo = isIdent(obj) ? scope.lookup(obj.name) : undefined;
			// args.x = ... / ctx.args.x = ... / ctx.<member> = ...
			if (objInfo?.kind === 'args') {
				this.diags.error(left, Codes.AssignToImmutable, 'parameters are read-only', 'copy into a local: let x = ...');
				return [];
			}
			if (objInfo?.kind === 'ctx') {
				this.diags.error(left, Codes.AssignToImmutable, 'ctx members are read-only', 'copy into a local: let x = ...');
				return [];
			}
			if (obj.type === 'MemberExpression') {
				const inner = obj.object as ONode;
				const innerInfo = isIdent(inner) ? scope.lookup(inner.name) : undefined;
				if (innerInfo?.kind === 'ctx' && memberName(obj) === 'args') {
					this.diags.error(left, Codes.AssignToImmutable, 'parameters are read-only', 'copy into a local: let x = ...');
					return [];
				}
			}
		}
		if (!isIdent(left)) {
			this.diags.error(left, Codes.UnsupportedSyntax, 'only plain locals can be assigned');
			return [];
		}
		const info = scope.lookup(left.name);
		if (!info) {
			this.diags.error(left, Codes.UnknownIdentifier, `unknown identifier '${left.name}'`);
			return [];
		}
		if (info.kind === 'param') {
			this.diags.error(left, Codes.AssignToImmutable, 'parameters are read-only', 'copy into a local: let x = ...');
			return [];
		}
		if (info.kind !== 'local' || !info.mutable) {
			this.diags.error(left, Codes.AssignToImmutable, `'${info.name}' is not assignable`, 'declare it with let');
			return [];
		}
		const frame = scope.ctx.tryFrames[scope.ctx.tryFrames.length - 1];
		if (frame && !frame.declared.has(info)) {
			this.diags.error(
				left,
				Codes.AssignToImmutable,
				`'${info.name}' is declared outside this ctx.try() and cannot be assigned inside it`,
				'on a caught error the database changes roll back but variables keep their values — return the value instead: return { x }',
			);
			return [];
		}
		// A pending cursor's query reads its interpolated values when the LOOP
		// runs — reassigning one first would silently change what the query
		// sees vs. the JS reading (template values evaluate at the tag call).
		for (const cursor of scope.ctx.pendingCursors) {
			if (cursor.sql.args.some((a) => a.kind === 'ident' && a.emitted === info.emitted)) {
				this.diags.error(
					left,
					Codes.BadSqlUse,
					`cannot reassign '${info.name}' — it is interpolated into the pending cursor '${cursor.name}'`,
					'the query reads the value when the loop runs; iterate the cursor first, or reorder the assignment',
				);
				return [];
			}
		}
		const right = this.visitExpr(expr.right, scope);
		if (!right) return [];
		if (!compatible(info.type, right.type)) {
			this.diags.error(expr.right, Codes.TypeMismatch, `type mismatch assigning to '${info.name}'`);
			return [];
		}
		// Invariant 4: assignment must not launder nullability into a
		// non-nullable local (that would unlock forbidden comparisons).
		if (right.type.nullable && !info.type.nullable) {
			this.diags.error(
				expr.right,
				Codes.TypeMismatch,
				`'${info.name}' is not nullable and cannot be assigned a possibly-NULL value`,
				'wrap the value with coalesce(...), or declare the local as `T | null`',
			);
			return [];
		}
		const target: IdentExpr = { kind: 'ident', emitted: info.emitted };
		let value: Expr = right.expr;
		if (compoundOp) {
			// Mirror visitBinary's arithmetic typing: `+` on text is SQL `||`,
			// and the other compound ops require numeric operands.
			let op: '+' | '-' | '*' | '/' | '||' = compoundOp;
			if (compoundOp === '+' && family(info.type) === 'text' && family(right.type) === 'text') {
				op = '||';
			} else if (family(info.type) !== 'num' || family(right.type) !== 'num') {
				this.diags.error(
					expr,
					Codes.TypeMismatch,
					`operands of '${compoundOp}=' must both be numeric (or both text for +=)`,
				);
				return [];
			}
			value = { kind: 'binary', op, left: target, right: right.expr };
		}
		return [{ kind: 'assign', target: info.emitted, expr: value }];
	}

	/**
	 * Guard tracking: a branch sees the guards its own condition establishes
	 * (foundOf), and every later branch / the else sees the guards of the
	 * preceding conditions being FALSE (elseOf). With no else and a single
	 * branch that always leaves the block, the elseOf guards are reported in
	 * `fallthrough` for the rest of the enclosing block.
	 */
	private visitIf(stmt: ONode, scope: Scope, fallthrough?: VarInfo[]): Stmt[] {
		const branches: { cond: Expr; body: Stmt[] }[] = [];
		let elseBody: Stmt[] | undefined;
		let node: ONode | undefined = stmt;
		const negated: VarInfo[] = [];
		let firstElseOf: VarInfo[] = [];
		const withGuards = <T>(gs: VarInfo[], f: () => T): T => {
			const fresh = gs.filter((g) => !scope.ctx.guarded.has(g));
			fresh.forEach((g) => scope.ctx.guarded.add(g));
			try {
				return f();
			} finally {
				fresh.forEach((g) => scope.ctx.guarded.delete(g));
			}
		};
		while (node) {
			const current: ONode = node;
			const cond = withGuards(negated, () => this.visitCondition(current.test, scope));
			if (branches.length === 0) firstElseOf = cond?.elseOf ?? [];
			const body = withGuards(
				[...negated, ...(cond?.foundOf ?? [])],
				() => this.visitBlockOrStatement(current.consequent, scope.child()),
			);
			if (cond) branches.push({ cond: cond.expr, body });
			negated.push(...(cond?.elseOf ?? []));
			const els = current.alternate as ONode | null;
			if (!els) break;
			if (els.type === 'IfStatement') {
				node = els;
				continue;
			}
			elseBody = withGuards(negated, () => this.visitBlockOrStatement(els, scope.child()));
			break;
		}
		if (branches.length === 0) return [];
		if (fallthrough && branches.length === 1 && !elseBody && this.leavesBlock(branches[0].body)) {
			fallthrough.push(...firstElseOf);
		}
		return [{ kind: 'if', branches, elseBody }];
	}

	private visitForOf(stmt: ONode, scope: Scope): Stmt[] {
		if (stmt.await) {
			this.diags.error(
				stmt,
				Codes.UnsupportedSyntax,
				'for await is not supported',
				'PL/pgSQL is synchronous — drop the await',
			);
			return [];
		}
		const iterated = stmt.right as ONode;

		// for (const it of rows) — a bound cursor, consumed exactly once.
		if (isIdent(iterated)) {
			const info = scope.lookup(iterated.name);
			if (info?.kind === 'cursor') {
				if (info.consumed) {
					this.diags.error(
						iterated,
						Codes.ManyOutsideForOf,
						`cursor '${info.name}' has already been iterated`,
						'a cursor is single-pass — bind a second sql`...`.many() if you need to scan again',
					);
					return [];
				}
				info.consumed = true;
				scope.ctx.pendingCursors.delete(info);
				return this.emitForMany(stmt, info.sql, info.fields, scope);
			}
		}

		const chain = this.asSqlChain(iterated, scope);
		if (chain && this.rejectOptionalChain(chain.call)) return [];
		if (!chain || chain.method !== 'many') {
			this.diags.error(
				iterated,
				Codes.UnsupportedSyntax,
				'for..of is only supported over sql`...`.many<T>() (inline or bound to a const)',
				'it compiles to FOR rec IN <query> LOOP — a cursor, not an array',
			);
			return [];
		}
		const fields = this.parseOptionalRowType(chain.call);
		const sql = this.visitSqlTemplate(chain.template, scope);
		if (fields === null || !sql || !this.requireRowReturning(chain.template, sql)) return [];
		return this.emitForMany(stmt, sql, fields, scope);
	}

	/** Shared tail of both for..of forms: loop variable + body → ForManyStmt. */
	private emitForMany(stmt: ONode, sql: SqlText, fields: Fields | undefined, scope: Scope): Stmt[] {
		const initializer = stmt.left as ONode;
		if (initializer.type !== 'VariableDeclaration' || initializer.kind !== 'const') {
			this.diags.error(initializer, Codes.UnsupportedSyntax, 'the loop variable must be declared with const');
			return [];
		}
		const decls = initializer.declarations as ONode[];
		const nameNode = decls.length === 1 ? (decls[0].id as ONode) : undefined;
		if (!nameNode || !isIdent(nameNode)) {
			this.diags.error(
				initializer,
				Codes.UnsupportedSyntax,
				'the loop variable must be a plain identifier',
				'read fields off the record: for (const row of ...) { ... row.balance ... }',
			);
			return [];
		}
		const name = nameNode.name as string;
		const info: VarInfo = { kind: 'record', name, emitted: `v_${name}`, fields };
		// Declare INTO the child scope: the loop variable is block-scoped in TS
		// and must not leak past END LOOP (its DECLARE entry still hoists —
		// unlike integer-range FOR loops, query FOR loops do not auto-declare).
		const inner = scope.child();
		if (!this.declareName(inner, nameNode, info, [info.emitted])) return [];
		scope.ctx.decls.push({ emitted: info.emitted, type: 'record' });
		scope.ctx.loopDepth++;
		const body = this.visitBlockOrStatement(stmt.body, inner);
		scope.ctx.loopDepth--;
		return [{ kind: 'for-many', sql, recordVar: info.emitted, body }];
	}

	/**
	 * PL/pgSQL query FOR loops open the query as a cursor, and Postgres
	 * refuses DML (even with RETURNING) in cursor position — reject it at
	 * compile time instead of emitting DDL that fails at CREATE.
	 */
	private requireRowReturning(tagged: ONode, sql: SqlText): boolean {
		if (!/^(select|with|values|table)\b/i.test(sql.parts[0].trimStart())) {
			this.diags.error(
				tagged,
				Codes.BadSqlUse,
				'only row-returning queries can be iterated with .many()',
				'PL/pgSQL cannot open UPDATE/INSERT/DELETE (even with RETURNING) as a cursor — use SELECT/WITH/VALUES, or .one()/.maybeOne() for DML RETURNING',
			);
			return false;
		}
		return true;
	}

	/**
	 * `${accounts}` → the table's quoted qualified name; `${accounts.balance}`
	 * → the column's quoted SQL name (unqualified — correct in SET/INSERT
	 * lists and single-table WHERE; qualify compositionally when needed:
	 * `${accounts}.${accounts.id}`). Resolution is scope-first (a local
	 * shadowing the import wins, mirroring TS) and then via the import table
	 * against the schema registry, so aliased imports work. Returns undefined
	 * when the expression is not schema-related, 'error' when it is but is
	 * invalid.
	 */
	private resolveSchemaInterpolation(
		expr: ONode,
		scope: Scope,
	): { sql: string; table: TableMeta } | 'error' | undefined {
		if (isIdent(expr)) {
			if (scope.lookup(expr.name)) return undefined;
			const table = this.schema.resolveTable(this.imports, expr.name);
			return table ? { sql: table.qualified, table } : undefined;
		}
		if (expr.type === 'MemberExpression') {
			const object = expr.object as ONode;
			if (!isIdent(object) || scope.lookup(object.name)) return undefined;
			const table = this.schema.resolveTable(this.imports, object.name);
			if (!table) return undefined;
			if (this.rejectOptionalChain(expr)) return 'error';
			const member = memberName(expr) ?? this.getText(expr.property);
			const column = table.columns.get(member);
			if (!column) {
				this.diags.error(
					expr,
					Codes.UnknownIdentifier,
					`table '${table.exportName}' has no column '${member}'`,
					`columns: ${[...table.columns.keys()].join(', ') || '(none)'}`,
				);
				return 'error';
			}
			return { sql: quoteIdent(column.sqlName), table };
		}
		return undefined;
	}

	/** Row type for .many(): optional. Returns null on a hard error. */
	private parseOptionalRowType(call: ONode): Fields | undefined | null {
		if (!(call.typeArguments?.params?.length > 0)) return undefined;
		const fields = this.parseRowTypeArgument(call);
		return fields ?? null;
	}

	private visitThrow(stmt: ONode, scope: Scope): Stmt[] {
		const expr = stmt.argument as ONode;
		const isPgError = expr.type === 'NewExpression'
			&& isIdent(expr.callee)
			&& this.resolveRuntimeImport(expr.callee.name, scope) === 'PgError';
		if (!isPgError) {
			this.diags.error(
				stmt,
				Codes.UnsupportedSyntax,
				'only `throw new PgError(code, message)` is supported',
				"it compiles to RAISE EXCEPTION ... USING ERRCODE; e.g. throw new PgError('P0001', 'insufficient funds')",
			);
			return [];
		}
		const args = (expr.arguments ?? []) as ONode[];
		if (args.length !== 2 && args.length !== 3) {
			this.diags.error(expr, Codes.BadPgError, 'PgError takes (code, message) or (code, message, { detail, hint })');
			return [];
		}
		const [codeArg, messageArg, optionsArg] = args;
		if (!isLiteralOfType(codeArg, 'string') || !/^[0-9A-Z]{5}$/.test(codeArg.value)) {
			this.diags.error(
				codeArg,
				Codes.BadPgError,
				'the code must be a 5-character SQLSTATE string literal',
				"e.g. 'P0001'",
			);
			return [];
		}
		const message = this.visitFormatText(messageArg, scope, 'the message');
		if (!message) return [];
		const raise: Stmt = { kind: 'raise', errcode: codeArg.value as string, message };
		if (optionsArg) {
			if (optionsArg.type !== 'ObjectExpression') {
				this.diags.error(optionsArg, Codes.BadPgError, 'PgError options must be an inline { detail, hint } object');
				return [];
			}
			for (const prop of optionsArg.properties as ONode[]) {
				const key = prop.type === 'Property' && !prop.computed && !prop.shorthand && isIdent(prop.key)
					? prop.key.name
					: undefined;
				if ((key !== 'detail' && key !== 'hint') || raise[key]) {
					this.diags.error(
						prop,
						Codes.BadPgError,
						'PgError options are { detail?, hint? }',
						"e.g. { hint: 'top up the account' }",
					);
					return [];
				}
				const text = this.visitFormatText(prop.value as ONode, scope, key);
				if (!text) return [];
				raise[key] = text;
			}
		}
		return [raise];
	}

	/**
	 * A message: a string literal, or an untagged template literal whose
	 * holes are arbitrary scalar expressions (they become RAISE `%` /
	 * format() arguments — real parameters, never string-spliced). Single
	 * line only.
	 */
	private visitFormatText(node: ONode, scope: Scope, what: string): FormatText | undefined {
		let parts: string[];
		let holes: ONode[] = [];
		if (isLiteralOfType(node, 'string')) {
			parts = [node.value as string];
		} else if (node.type === 'TemplateLiteral') {
			parts = (node.quasis as ONode[]).map((q) => q.value.cooked as string);
			holes = node.expressions as ONode[];
		} else {
			// Any other scalar expression: the whole message is that value
			// (`'%', x` in RAISE, `format('%s', x)` in USING — NULL-safe).
			const res = this.visitExpr(node, scope);
			if (!res) return undefined;
			if (res.type.pg === 'null') {
				this.diags.error(node, Codes.BadPgError, `${what} cannot be null`);
				return undefined;
			}
			return { parts: ['', ''], args: [res.expr] };
		}
		// Escapes are fine (the COOKED text is emitted, SQL-quoted); line breaks
		// are not — RAISE statements are emitted (and pulled back) one per line.
		if (parts.some((p) => /[\n\r]/.test(p))) {
			this.diags.error(node, Codes.BadPgError, `${what} must be a single line`);
			return undefined;
		}
		const args: Expr[] = [];
		for (const hole of holes) {
			const res = this.visitExpr(hole, scope);
			if (!res) return undefined;
			args.push(res.expr);
		}
		return { parts, args };
	}

	// ── expressions ──────────────────────────────────────────────────────────

	private visitCondition(node: ONode, scope: Scope): ExprResult | undefined {
		const res = this.visitExpr(node, scope);
		if (!res) return undefined;
		if (res.type.pg !== 'boolean') {
			this.diags.error(
				node,
				Codes.NonBooleanCondition,
				'conditions must be boolean expressions',
				'PL/pgSQL has no truthiness — compare explicitly (x !== 0, isNull(x), res.found, ...)',
			);
			return undefined;
		}
		if (res.type.nullable) {
			this.diags.error(
				node,
				Codes.NullableComparison,
				'this condition may be NULL (which is neither true nor false)',
				'wrap it with coalesce(cond, false)',
			);
			return undefined;
		}
		return res;
	}

	private visitExpr(node: ONode, scope: Scope): ExprResult | undefined {
		if (node.type === 'ParenthesizedExpression') return this.visitExpr(node.expression, scope);

		if (isIdent(node)) return this.visitIdentifier(node, scope);
		if (node.type === 'MemberExpression') return this.visitPropertyAccess(node, scope);
		if (node.type === 'ChainExpression') {
			this.rejectOptionalChain(node);
			return undefined;
		}

		if (node.type === 'Literal') {
			if (typeof node.value === 'number') {
				const text = (node.raw as string).replaceAll('_', '');
				if (!/^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(text)) {
					this.diags.error(node, Codes.UnsupportedSyntax, 'only decimal numeric literals are supported');
					return undefined;
				}
				const isIntegral = /^[0-9]+$/.test(text);
				return {
					expr: { kind: 'literal', sql: text },
					type: { pg: isIntegral ? 'integer' : 'numeric', nullable: false },
				};
			}
			if (isBigIntLiteral(node)) {
				const text = (node.raw as string).replaceAll('_', '').replace(/n$/, '');
				if (!/^[0-9]+$/.test(text)) {
					this.diags.error(node, Codes.UnsupportedSyntax, 'only decimal bigint literals are supported');
					return undefined;
				}
				return { expr: { kind: 'literal', sql: text }, type: { pg: 'bigint', nullable: false } };
			}
			if (typeof node.value === 'string') {
				return {
					expr: { kind: 'literal', sql: escapeSqlString(node.value) },
					type: { pg: 'text', nullable: false },
				};
			}
			if (node.value === true) {
				return { expr: { kind: 'literal', sql: 'TRUE' }, type: { pg: 'boolean', nullable: false } };
			}
			if (node.value === false) {
				return { expr: { kind: 'literal', sql: 'FALSE' }, type: { pg: 'boolean', nullable: false } };
			}
			if (isNullLiteral(node)) {
				// Only coalesce() consumes these; visitCoalesce calls visitExpr and
				// tolerates the 'null' type. Everywhere else it is rejected downstream.
				return { expr: { kind: 'literal', sql: 'NULL' }, type: { pg: 'null', nullable: true } };
			}
			// regex and other exotic literals fall through to the default rejection
		}
		if (node.type === 'TemplateLiteral' && (node.expressions ?? []).length === 0) {
			// `plain string` — same treatment as a string literal.
			const cooked = node.quasis?.[0]?.value?.cooked;
			if (typeof cooked === 'string') {
				return { expr: { kind: 'literal', sql: escapeSqlString(cooked) }, type: { pg: 'text', nullable: false } };
			}
		}

		if (node.type === 'UnaryExpression') return this.visitPrefixUnary(node, scope);
		if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') return this.visitBinary(node, scope);
		if (node.type === 'AssignmentExpression') {
			this.diags.error(node, Codes.UnsupportedSyntax, 'assignments are statements, not expressions');
			return undefined;
		}

		if (node.type === 'ConditionalExpression') {
			const cond = this.visitCondition(node.test, scope);
			const whenTrue = this.visitExpr(node.consequent, scope);
			const whenFalse = this.visitExpr(node.alternate, scope);
			if (!cond || !whenTrue || !whenFalse) return undefined;
			if (!compatible(whenTrue.type, whenFalse.type)) {
				this.diags.error(node, Codes.TypeMismatch, 'both branches of ?: must have the same SQL type');
				return undefined;
			}
			// A null-literal branch makes the result nullable of the OTHER branch's type.
			const tNull = whenTrue.type.pg === 'null';
			const fNull = whenFalse.type.pg === 'null';
			if (tNull && fNull) {
				this.diags.error(node, Codes.TypeMismatch, 'both branches of ?: cannot be null');
				return undefined;
			}
			const pg = tNull
				? whenFalse.type.pg
				: fNull
				? whenTrue.type.pg
				: family(whenTrue.type) === 'num'
				? unifyNum(whenTrue.type, whenFalse.type)
				: whenTrue.type.pg;
			return {
				expr: { kind: 'case-when', cond: cond.expr, then: whenTrue.expr, else: whenFalse.expr },
				type: { pg, nullable: tNull || fNull || whenTrue.type.nullable || whenFalse.type.nullable },
			};
		}

		if (node.type === 'CallExpression') return this.visitCallExpr(node, scope);

		if (node.type === 'TaggedTemplateExpression' && this.isSqlTag(node.tag, scope)) {
			this.diags.error(
				node,
				Codes.BadSqlUse,
				'a sql`...` statement cannot appear inside an expression',
				'bind it first: const res = sql`...`, then use res.count / res.found',
			);
			return undefined;
		}

		this.diags.error(node, Codes.UnsupportedSyntax, `unsupported expression: ${node.type}`, this.exprHint(node));
		return undefined;
	}

	private exprHint(node: ONode): string | undefined {
		switch (node.type) {
			case 'TemplateLiteral':
				return 'untagged templates are not supported; use sql`...` for queries or + for text concatenation';
			case 'ArrayExpression':
				return 'arrays are only supported as the ids argument of lockRowsOrdered()';
			case 'ArrowFunctionExpression':
			case 'FunctionExpression':
				return 'closures are not supported';
			case 'AwaitExpression':
				return 'PL/pgSQL is synchronous — drop the await';
			default:
				return undefined;
		}
	}

	private visitIdentifier(node: ONode, scope: Scope): ExprResult | undefined {
		const name = node.name as string;
		if (name === 'undefined') {
			this.diags.error(
				node,
				Codes.UnsupportedSyntax,
				'undefined does not exist in SQL',
				'use isNull()/coalesce() for NULL handling',
			);
			return undefined;
		}
		const info = scope.lookup(name);
		if (!info) {
			// A schema table used as a value (outside sql`...`).
			if (this.schema.resolveTable(this.imports, name)) {
				this.diags.error(
					node,
					Codes.BadSqlUse,
					`'${name}' is a drizzle table — it can only be referenced inside sql\`...\` templates`,
					'interpolate it: sql`SELECT ... FROM ${' + name + '} ...`',
				);
				return undefined;
			}
			// Distinguish a genuine typo from use-before-declare: scan the
			// procedure body for a later declaration with this name.
			if (this.declaredLaterInBody(name, node, scope)) {
				this.diags.error(
					node,
					Codes.UnknownIdentifier,
					`'${name}' is used before its declaration`,
					'declarations hoist into the DECLARE block, but tspgc keeps TypeScript order — move the declaration above this use',
				);
				return undefined;
			}
			this.diags.error(
				node,
				Codes.UnknownIdentifier,
				`unknown identifier '${name}'`,
				'only parameters and locals declared inside this procedure are in scope',
			);
			return undefined;
		}
		switch (info.kind) {
			case 'param':
			case 'local':
				return { expr: { kind: 'ident', emitted: info.emitted }, type: info.type };
			case 'sql-result':
				this.diags.error(node, Codes.BadSqlUse, `'${name}' is a sql result — read .count or .found`);
				return undefined;
			case 'maybe-one':
				this.diags.error(node, Codes.BadSqlUse, `'${name}' is a maybeOne result — read .found, .count or .row.<field>`);
				return undefined;
			case 'try-res':
				this.diags.error(node, Codes.BadSqlUse, `'${name}' is a ctx.try() result — read one of its fields`);
				return undefined;
			case 'try-err':
				this.diags.error(
					node,
					Codes.BadSqlUse,
					`'${name}' can only be tested with ${name} === null / ${name} !== null, or read via its fields`,
				);
				return undefined;
			case 'record':
				this.diags.error(node, Codes.BadSqlUse, `'${name}' is a record — read one of its fields`);
				return undefined;
			case 'cursor':
				this.diags.error(
					node,
					Codes.BadSqlUse,
					`'${name}' is a cursor — it can only be iterated`,
					`for (const row of ${name}) { ... }`,
				);
				return undefined;
			case 'args':
				this.diags.error(
					node,
					Codes.BadProcedureShape,
					`'${name}' is the args object — read a parameter instead`,
					`use ${name}.<param>, or destructure: const { ... } = ${name}`,
				);
				return undefined;
			case 'ctx':
				this.diags.error(
					node,
					Codes.BadProcedureShape,
					`'${name}' is the procedure context — read one of its members instead`,
					`use ${name}.sql\`...\` / ${name}.args.<param>, or destructure: const { args, sql } = ${name}`,
				);
				return undefined;
			case 'dsl':
				this.diags.error(
					node,
					Codes.BadProcedureShape,
					`'${name}' is a DSL primitive — call it, it is not a value`,
					info.fn === 'sql' ? 'use it as a template tag: sql`...`' : `call it: ${name}(...)`,
				);
				return undefined;
		}
	}

	/** Does the current procedure body declare `name` after `use`? */
	private declaredLaterInBody(name: string, use: ONode, scope: Scope): boolean {
		const body = scope.ctx.bodyNode;
		if (!body) return false;
		let found = false;
		const walk = (n: ONode): void => {
			if (found) return;
			if (n.type === 'VariableDeclarator' && isIdent(n.id) && n.id.name === name && n.start > use.start) {
				found = true;
				return;
			}
			forEachChildNode(n, walk);
		};
		walk(body);
		return found;
	}

	private visitPropertyAccess(node: ONode, scope: Scope): ExprResult | undefined {
		if (this.rejectOptionalChain(node)) return undefined;
		const object = node.object as ONode;
		const member = memberName(node) ?? this.getText(node.property);

		if (isIdent(object) && object.name === 'console') {
			this.diags.error(
				node,
				Codes.ConsoleNotSupported,
				`console.${member} is not supported`,
				'use notice() → RAISE NOTICE',
			);
			return undefined;
		}

		// Two-level accesses: res.row.field and ctx.args.param.
		if (object.type === 'MemberExpression') {
			const inner = object.object as ONode;
			const innerInfo = isIdent(inner) ? scope.lookup(inner.name) : undefined;
			if (innerInfo?.kind === 'maybe-one' && memberName(object) === 'row') {
				if (!scope.ctx.guarded.has(innerInfo)) {
					this.diags.error(
						node,
						Codes.UnguardedRowAccess,
						`'${inner.name}.row' is only readable inside if (${inner.name}.found)`,
						'when no row matched, the record is NULL — guard the access',
					);
					return undefined;
				}
				const type = innerInfo.fields.get(member);
				if (!type) {
					this.diags.error(node, Codes.UnknownIdentifier, `row type of '${inner.name}' has no field '${member}'`);
					return undefined;
				}
				return { expr: { kind: 'field', record: innerInfo.emitted, field: member }, type };
			}
			if (innerInfo?.kind === 'ctx' && memberName(object) === 'args' && !this.rejectOptionalChain(object)) {
				const param = innerInfo.params.get(member);
				if (!param) {
					this.diags.error(
						node,
						Codes.UnknownIdentifier,
						`'${inner.name}.args' has no parameter '${member}'`,
						`declared parameters: ${[...innerInfo.params.keys()].join(', ') || '(none)'}`,
					);
					return undefined;
				}
				return { expr: { kind: 'ident', emitted: param.emitted }, type: param.type };
			}
			this.diags.error(node, Codes.UnsupportedSyntax, 'unsupported property access');
			return undefined;
		}

		if (!isIdent(object)) {
			this.diags.error(node, Codes.UnsupportedSyntax, 'unsupported property access');
			return undefined;
		}
		const info = scope.lookup(object.name);
		if (!info) {
			if (this.schema.resolveTable(this.imports, object.name)) {
				this.diags.error(
					node,
					Codes.BadSqlUse,
					`'${object.name}.${member}' is a drizzle column reference — it can only appear inside sql\`...\` templates`,
					'interpolate it: sql`... WHERE ${' + object.name + '.' + member + '} = ...`',
				);
				return undefined;
			}
			this.diags.error(object, Codes.UnknownIdentifier, `unknown identifier '${object.name}'`);
			return undefined;
		}

		if (info.kind === 'try-res') return this.visitTryResField(node, info, member, scope);
		if (info.kind === 'try-err') return this.visitTryErrField(node, info, member, scope);

		// The receivers below were all typed by import-anchored construction
		// (sql`...` bindings / the ctx parameter), so plain member names are
		// unambiguous here.
		switch (info.kind) {
			case 'args': {
				// args.from reads the same renamed parameter a destructured `from`
				// would — both lower to the bare identifier p_from.
				const param = info.params.get(member);
				if (!param) {
					this.diags.error(
						node,
						Codes.UnknownIdentifier,
						`'${object.name}' has no parameter '${member}'`,
						`declared parameters: ${[...info.params.keys()].join(', ') || '(none)'}`,
					);
					return undefined;
				}
				return { expr: { kind: 'ident', emitted: param.emitted }, type: param.type };
			}
			case 'ctx': {
				if (member === 'args') {
					this.diags.error(node, Codes.BadProcedureShape, `read a parameter: ${object.name}.args.<name>`);
					return undefined;
				}
				if (CTX_DSL_MEMBERS.has(member)) {
					this.diags.error(
						node,
						Codes.BadProcedureShape,
						`'${object.name}.${member}' is a DSL primitive — call it, it is not a value`,
						member === 'sql' ? `use it as a template tag: ${object.name}.sql\`...\`` : undefined,
					);
					return undefined;
				}
				this.diags.error(
					node,
					Codes.UnknownIdentifier,
					`the procedure context has no member '${member}'`,
					CTX_MEMBER_HINT,
				);
				return undefined;
			}
			case 'dsl':
				this.diags.error(node, Codes.BadProcedureShape, `'${object.name}' is a DSL primitive — it has no members`);
				return undefined;
			case 'sql-result':
			case 'maybe-one': {
				if (member === 'count') {
					return { expr: { kind: 'ident', emitted: info.countVar }, type: { pg: 'bigint', nullable: false } };
				}
				if (member === 'found') {
					// found ≡ count > 0: derived from the atomically-captured count, so
					// it stays valid however late it is read (invariant 1).
					const res: ExprResult = {
						expr: {
							kind: 'binary',
							op: '>',
							left: { kind: 'ident', emitted: info.countVar },
							right: { kind: 'literal', sql: '0' },
						},
						type: { pg: 'boolean', nullable: false },
					};
					if (info.kind === 'maybe-one') res.foundOf = [info];
					return res;
				}
				if (info.kind === 'maybe-one' && member === 'row') {
					this.diags.error(node, Codes.BadSqlUse, `read a field: ${object.name}.row.<field>`);
					return undefined;
				}
				if (member === 'one' || member === 'maybeOne' || member === 'many') {
					this.diags.error(node, Codes.BadSqlUse, `.${member}() must be chained directly on the sql\`...\` template`);
					return undefined;
				}
				this.diags.error(node, Codes.UnknownIdentifier, `'${object.name}' has no member '${member}'`);
				return undefined;
			}
			case 'record': {
				if (!info.fields) {
					this.diags.error(
						node,
						Codes.BadRowType,
						`the row type of '${object.name}' is not declared`,
						'declare it on the cursor: .many<{ ' + member + ': ... }>()',
					);
					return undefined;
				}
				const type = info.fields.get(member);
				if (!type) {
					this.diags.error(node, Codes.UnknownIdentifier, `record '${object.name}' has no field '${member}'`);
					return undefined;
				}
				return { expr: { kind: 'field', record: info.emitted, field: member }, type };
			}
			case 'cursor':
				this.diags.error(
					node,
					Codes.BadSqlUse,
					`'${object.name}' is a cursor — it has no members, it can only be iterated`,
					'cursor semantics: no .length, no indexing, no .count — use a bound sql`...` result for counts',
				);
				return undefined;
			case 'param':
			case 'local':
				this.diags.error(node, Codes.UnsupportedSyntax, 'property access on scalar values is not supported');
				return undefined;
		}
	}

	private visitPrefixUnary(node: ONode, scope: Scope): ExprResult | undefined {
		const op = node.operator as string;
		if (op === '!') {
			const operand = this.visitExpr(node.argument, scope);
			if (!operand) return undefined;
			if (operand.type.pg !== 'boolean') {
				this.diags.error(node.argument, Codes.NonBooleanCondition, 'operand of ! must be a boolean expression');
				return undefined;
			}
			// `!c` holds exactly where c is false: swap the guard sets.
			return {
				expr: { kind: 'not', operand: operand.expr },
				type: operand.type,
				...(operand.elseOf ? { foundOf: operand.elseOf } : {}),
				...(operand.foundOf ? { elseOf: operand.foundOf } : {}),
			};
		}
		if (op === '-') {
			const operandNode = node.argument as ONode;
			if (isLiteralOfType(operandNode, 'number') || isBigIntLiteral(operandNode)) {
				const inner = this.visitExpr(operandNode, scope);
				if (!inner || inner.expr.kind !== 'literal') return undefined;
				return { expr: { kind: 'literal', sql: `-${inner.expr.sql}` }, type: inner.type };
			}
			const operand = this.visitExpr(operandNode, scope);
			if (!operand) return undefined;
			if (family(operand.type) !== 'num') {
				this.diags.error(operandNode, Codes.TypeMismatch, 'operand of unary - must be numeric');
				return undefined;
			}
			return { expr: { kind: 'neg', operand: operand.expr }, type: operand.type };
		}
		this.diags.error(node, Codes.UnsupportedSyntax, 'unsupported unary operator');
		return undefined;
	}

	/** The span of the operator token between the operands (estree has no token nodes). */
	private operatorSpan(node: ONode): ONode {
		const op = node.operator as string;
		const idx = this.script.text.indexOf(op, (node.left as ONode).end);
		if (idx === -1 || idx >= (node.right as ONode).start) return node;
		return { type: 'OperatorToken', start: idx, end: idx + op.length };
	}

	private visitTryResField(node: ONode, info: TryResVar, member: string, scope: Scope): ExprResult | undefined {
		if (!info.fields) {
			this.diags.error(node, Codes.BadSqlUse, `the ctx.try() body returns nothing — '${info.name}' has no fields`);
			return undefined;
		}
		const field = info.fields.get(member);
		if (!field) {
			this.diags.error(
				node,
				Codes.UnknownIdentifier,
				`'${info.name}' has no field '${member}'`,
				`fields: ${[...info.fields.keys()].join(', ')}`,
			);
			return undefined;
		}
		if (!scope.ctx.guarded.has(info)) {
			this.diags.error(
				node,
				Codes.UnguardedRowAccess,
				`'${info.name}.${member}' is only readable where the try is known to have succeeded`,
				'test the error first: if (err === null) { ... } — or exit early: if (err !== null) { throw ... }',
			);
			return undefined;
		}
		return { expr: { kind: 'ident', emitted: field.emitted }, type: field.type };
	}

	private visitTryErrField(node: ONode, info: TryErrVar, member: string, scope: Scope): ExprResult | undefined {
		const item = ERR_FIELDS.get(member);
		if (!item) {
			this.diags.error(
				node,
				Codes.UnknownIdentifier,
				`'${info.name}' has no field '${member}'`,
				`fields: ${[...ERR_FIELDS.keys()].join(', ')}`,
			);
			return undefined;
		}
		if (!scope.ctx.guarded.has(info)) {
			this.diags.error(
				node,
				Codes.UnguardedRowAccess,
				`'${info.name}.${member}' is only readable where an error is known to have been caught`,
				`test it first: if (${info.name} !== null) { ... }`,
			);
			return undefined;
		}
		const err = info.stmt.err!;
		if (item === 'code') {
			return { expr: { kind: 'ident', emitted: err.codeVar }, type: { pg: 'text', nullable: false } };
		}
		const variable = `v_${info.name}__${member}`;
		if (!err.items.some((i) => i.variable === variable)) {
			// Declared and fetched only once read; GET items in canonical order.
			err.items.push({ variable, item });
			const order = [...ERR_FIELDS.values()];
			err.items.sort((a, b) => order.indexOf(a.item) - order.indexOf(b.item));
			scope.ctx.decls.push({ emitted: variable, type: 'text' });
		}
		return { expr: { kind: 'ident', emitted: variable }, type: { pg: 'text', nullable: false } };
	}

	/**
	 * `err === null` / `err !== null` on a ctx.try() error binding →
	 * `v_err__code IS NULL` (negated for !==). The TRUE side of `=== null`
	 * makes res readable; the FALSE side makes err's fields readable.
	 */
	private visitTryErrTest(node: ONode, scope: Scope): ExprResult | undefined | false {
		const op = node.operator as string;
		if (op !== '===' && op !== '!==') return false;
		const l = node.left as ONode;
		const r = node.right as ONode;
		const errNode = isIdent(l) && isNullLiteral(r) ? l : isIdent(r) && isNullLiteral(l) ? r : undefined;
		if (!errNode) return false;
		const info = scope.lookup(errNode.name);
		if (info?.kind !== 'try-err') return false;
		const isNullExpr: Expr = { kind: 'is-null', operand: { kind: 'ident', emitted: info.stmt.err!.codeVar } };
		const ok = info.res ? [info.res] : [];
		const failed = [info];
		if (op === '===') {
			return { expr: isNullExpr, type: { pg: 'boolean', nullable: false }, foundOf: ok, elseOf: failed };
		}
		return {
			expr: { kind: 'not', operand: isNullExpr },
			type: { pg: 'boolean', nullable: false },
			foundOf: failed,
			elseOf: ok,
		};
	}

	private visitBinary(node: ONode, scope: Scope): ExprResult | undefined {
		const op = node.operator as string;
		const tryTest = this.visitTryErrTest(node, scope);
		if (tryTest !== false) return tryTest;

		if (op === '==' || op === '!=') {
			this.diags.error(
				this.operatorSpan(node),
				Codes.LooseEquality,
				'loose equality (==, !=) is not supported',
				'use === / !==',
			);
			return undefined;
		}
		if (op === '??') {
			this.diags.error(this.operatorSpan(node), Codes.UnsupportedSyntax, '?? is not supported', 'use coalesce(a, b)');
			return undefined;
		}

		const left = this.visitExpr(node.left, scope);
		const right = this.visitExpr(node.right, scope);
		if (!left || !right) return undefined;

		const comparisons: Record<string, '=' | '<>' | '<' | '<=' | '>' | '>='> = {
			'===': '=',
			'!==': '<>',
			'<': '<',
			'<=': '<=',
			'>': '>',
			'>=': '>=',
		};
		const comparison = comparisons[op];
		if (comparison) {
			// Invariant 4: SQL NULL comparisons yield NULL, not false — forbid
			// comparing anything nullable unless routed through isNull()/coalesce().
			for (
				const [side, sideNode] of [
					[left, node.left],
					[right, node.right],
				] as const
			) {
				if (side.type.pg === 'null') {
					this.diags.error(
						sideNode,
						Codes.NullableComparison,
						'comparing against a null literal is not supported',
						'use isNull(x)',
					);
					return undefined;
				}
				if (side.type.nullable) {
					this.diags.error(
						sideNode,
						Codes.NullableComparison,
						'cannot compare a nullable value',
						'NULL comparisons yield NULL, not false — wrap with coalesce(...) or branch on isNull(...) first',
					);
					return undefined;
				}
			}
			if (!compatible(left.type, right.type)) {
				this.diags.error(node, Codes.TypeMismatch, `'${comparison}' requires operands of the same SQL type family`);
				return undefined;
			}
			return {
				expr: { kind: 'binary', op: comparison, left: left.expr, right: right.expr },
				type: { pg: 'boolean', nullable: false },
			};
		}

		if (op === '&&' || op === '||') {
			const sqlOp = op === '&&' ? 'AND' : 'OR';
			for (
				const [side, sideNode] of [
					[left, node.left],
					[right, node.right],
				] as const
			) {
				if (side.type.pg !== 'boolean') {
					this.diags.error(
						sideNode,
						Codes.NonBooleanCondition,
						`operands of ${op} must be boolean expressions`,
						'PL/pgSQL has no truthiness — compare explicitly',
					);
					return undefined;
				}
			}
			const res: ExprResult = {
				expr: { kind: 'binary', op: sqlOp, left: left.expr, right: right.expr },
				type: { pg: 'boolean', nullable: left.type.nullable || right.type.nullable },
			};
			// Both conjuncts' guards hold inside the then-branch of `a.found && b.found`.
			if (sqlOp === 'AND') res.foundOf = [...(left.foundOf ?? []), ...(right.foundOf ?? [])];
			// Both disjuncts are false in the else-branch of `a || b`.
			if (sqlOp === 'OR') res.elseOf = [...(left.elseOf ?? []), ...(right.elseOf ?? [])];
			return res;
		}

		const arithmetic: Record<string, '+' | '-' | '*' | '/' | '%'> = {
			'+': '+',
			'-': '-',
			'*': '*',
			'/': '/',
			'%': '%',
		};
		const arith = arithmetic[op];
		if (arith) {
			if (arith === '+' && family(left.type) === 'text' && family(right.type) === 'text') {
				return {
					expr: { kind: 'binary', op: '||', left: left.expr, right: right.expr },
					type: { pg: 'text', nullable: left.type.nullable || right.type.nullable },
				};
			}
			if (family(left.type) !== 'num' || family(right.type) !== 'num') {
				this.diags.error(node, Codes.TypeMismatch, `operands of '${arith}' must both be numeric (or both text for +)`);
				return undefined;
			}
			return {
				expr: { kind: 'binary', op: arith, left: left.expr, right: right.expr },
				type: { pg: unifyNum(left.type, right.type), nullable: left.type.nullable || right.type.nullable },
			};
		}

		this.diags.error(this.operatorSpan(node), Codes.UnsupportedSyntax, `unsupported operator '${op}'`);
		return undefined;
	}

	private visitCallExpr(call: ONode, scope: Scope): ExprResult | undefined {
		const callee = call.callee as ONode;
		if (this.rejectOptionalChain(call) || this.rejectOptionalChain(callee)) return undefined;
		const dsl = this.resolveDslFn(callee, scope);

		if (dsl === 'isNull') {
			const args = (call.arguments ?? []) as ONode[];
			if (args.length !== 1) {
				this.diags.error(call, Codes.UnsupportedCall, 'isNull() takes exactly one argument');
				return undefined;
			}
			const operand = this.visitExpr(args[0], scope);
			if (!operand) return undefined;
			return { expr: { kind: 'is-null', operand: operand.expr }, type: { pg: 'boolean', nullable: false } };
		}

		if (dsl === 'coalesce') {
			const args = (call.arguments ?? []) as ONode[];
			if (args.length < 2) {
				this.diags.error(call, Codes.UnsupportedCall, 'coalesce() takes at least two arguments');
				return undefined;
			}
			const results = args.map((a) => this.visitExpr(a, scope));
			if (results.some((r) => !r)) return undefined;
			const exprs = results as ExprResult[];
			let pg: PgScalarType | 'null' = 'null';
			for (const r of exprs) {
				if (r.type.pg === 'null') continue;
				if (pg === 'null') pg = r.type.pg;
				else if (!compatible({ pg, nullable: false }, r.type)) {
					this.diags.error(call, Codes.TypeMismatch, 'coalesce() arguments must share one SQL type family');
					return undefined;
				} else if (family(r.type) === 'num') pg = unifyNum({ pg, nullable: false }, r.type);
			}
			if (pg === 'null') {
				this.diags.error(call, Codes.TypeMismatch, 'coalesce() needs at least one non-null argument');
				return undefined;
			}
			// COALESCE returns the first non-NULL argument: the result can only
			// be NULL when EVERY argument can (a null literal counts as nullable).
			return {
				expr: { kind: 'coalesce', args: exprs.map((r) => r.expr) },
				type: { pg, nullable: exprs.every((r) => r.type.nullable) },
			};
		}

		if (dsl === 'sql') {
			this.diags.error(call, Codes.BadSqlUse, 'sql is a template tag', 'write sql`...`, not sql(...)');
			return undefined;
		}
		if (dsl === 'try') {
			this.diags.error(
				call,
				Codes.UnsupportedCall,
				'bind the ctx.try() result by destructuring',
				'const { res, err } = ctx.try(() => { ... }, [...conditions])',
			);
			return undefined;
		}
		if (dsl === 'notice' || dsl === 'warning' || dsl === 'lockRowsOrdered' || dsl === 'commit' || dsl === 'rollback') {
			this.diags.error(call, Codes.UnsupportedCall, `${dsl}() is a statement, not an expression`);
			return undefined;
		}

		if (callee.type === 'MemberExpression') {
			const method = memberName(callee) ?? this.getText(callee.property);
			if (this.chainsOnSql(callee.object, scope)) {
				if (method === 'many') {
					this.diags.error(call, Codes.ManyOutsideForOf, '.many() is only legal as a for..of target');
					return undefined;
				}
				if (method === 'one' || method === 'maybeOne') {
					this.diags.error(call, Codes.BadSqlUse, `bind the result first: const row = sql\`...\`.${method}<{...}>()`);
					return undefined;
				}
			}
			if (this.getText(callee.object) === 'console') {
				this.diags.error(
					callee,
					Codes.ConsoleNotSupported,
					`console.${method} is not supported`,
					'use notice() → RAISE NOTICE',
				);
				return undefined;
			}
		}

		this.diags.error(
			call,
			Codes.UnsupportedCall,
			`'${this.getText(callee)}' does not resolve to a DSL primitive — arbitrary calls are not supported`,
			DSL_HINT,
		);
		return undefined;
	}

	// ── sql templates & types ────────────────────────────────────────────────

	/**
	 * Lowers sql`...` to parts + interpolated identifiers. Invariant 3: an
	 * interpolation must be an in-scope scalar identifier — it becomes a bare
	 * renamed identifier in the emitted statement, never string concatenation.
	 */
	private visitSqlTemplate(tagged: ONode, scope: Scope): SqlText | undefined {
		const template = tagged.quasi as ONode;
		const parts: string[] = [];
		const args: (IdentExpr | SqlNameExpr)[] = [];
		let failed = false;

		const quasis = template.quasis as ONode[];
		const expressions = (template.expressions ?? []) as ONode[];
		parts.push((quasis[0].value.cooked as string | null) ?? (quasis[0].value.raw as string));
		for (let i = 0; i < expressions.length; i++) {
			const expr = expressions[i];
			// Three interpolation classes, all lowering to plain identifiers
			// (invariant 3): values (in-scope scalars, args members, .count),
			// drizzle TABLES (→ quoted qualified name), and drizzle COLUMNS
			// (→ quoted column name). Anything else stays rejected.
			const schemaRef = this.resolveSchemaInterpolation(expr, scope);
			const tail = (quasis[i + 1].value.cooked as string | null) ?? (quasis[i + 1].value.raw as string);
			if (schemaRef === 'error') {
				failed = true;
				parts.push(tail);
				continue;
			}
			if (schemaRef) {
				args.push({ kind: 'sql-name', sql: schemaRef.sql });
				scope.ctx.dependsOn.add(schemaRef.table.qualified);
				parts.push(tail);
				continue;
			}
			let res: ExprResult | undefined;
			let candidate = true;
			if (isIdent(expr)) {
				res = this.visitIdentifier(expr, scope);
			} else if (expr.type === 'MemberExpression') {
				res = this.visitPropertyAccess(expr, scope);
			} else {
				candidate = false;
				this.diags.error(
					expr,
					Codes.BadInterpolation,
					'only in-scope identifiers may be interpolated into sql`...`',
					'bind the expression to a const first — interpolations lower to bare identifiers, never string concatenation',
				);
				failed = true;
			}
			if (candidate) {
				if (!res) {
					failed = true;
				} else if (res.expr.kind !== 'ident') {
					this.diags.error(
						expr,
						Codes.BadInterpolation,
						'only scalar parameters and locals may be interpolated',
						'bind the expression to a const first',
					);
					failed = true;
				} else {
					args.push(res.expr);
				}
			}
			parts.push(tail);
		}

		parts[0] = parts[0].trimStart();
		parts[parts.length - 1] = parts[parts.length - 1].trimEnd();

		// Template parts are COOKED text — a \t in the source would be silently
		// emitted as a tab byte. Whitelist stance: no escapes at all.
		if (this.getText(tagged).includes('\\')) {
			this.diags.error(
				tagged,
				Codes.BadSqlUse,
				'backslash escape sequences are not supported in sql`...`',
				'template text is emitted verbatim — write the character directly',
			);
			failed = true;
		}
		if (parts.every((p) => p.trim() === '')) {
			this.diags.error(
				tagged,
				Codes.BadSqlUse,
				'empty sql`...` template',
				'interpolations lower to bare identifiers and cannot form a statement alone',
			);
			failed = true;
		}
		if (this.scanSqlParts(tagged, parts)) failed = true;
		if (!failed && this.rejectTransactionCommand(tagged, parts[0])) failed = true;
		return failed ? undefined : { parts, args };
	}

	/**
	 * Transaction commands inside sql`...`: COMMIT/ROLLBACK have dedicated ctx
	 * members (so they are visible to the compiler as statements, not opaque
	 * text); the rest (BEGIN/START/END/ABORT/SAVEPOINT/RELEASE/PREPARE
	 * TRANSACTION/ROLLBACK TO) are unsupported in PL/pgSQL — they compile but
	 * fail at run time ("unsupported transaction command in PL/pgSQL") or
	 * break the block structure (BEGIN/END). Reject all of them here.
	 */
	private rejectTransactionCommand(tagged: ONode, head: string): boolean {
		const m = /^([A-Za-z]+)(?:\s+([A-Za-z]+))?/.exec(head);
		if (!m) return false;
		const word = m[1].toLowerCase();
		const next = m[2]?.toLowerCase();
		let hint: string | undefined;
		if ((word === 'commit' || word === 'rollback') && next !== 'prepared' && !(word === 'rollback' && next === 'to')) {
			hint = `use ctx.${word}()`;
		} else if (word === 'savepoint' || word === 'release' || (word === 'rollback' && next === 'to')) {
			hint = 'savepoints are not available in PL/pgSQL (subtransactions come from EXCEPTION blocks)';
		} else if (word === 'begin' || word === 'start' || word === 'end' || word === 'abort') {
			hint =
				'a procedure already runs inside a transaction; use ctx.commit() / ctx.rollback() to end it — the next one starts automatically';
		} else if (
			(word === 'prepare' && next === 'transaction')
			|| ((word === 'commit' || word === 'rollback') && next === 'prepared')
		) {
			hint = 'two-phase commit is not available in PL/pgSQL';
		} else {
			return false;
		}
		this.diags.error(
			tagged,
			Codes.BadSqlUse,
			`transaction command ${word.toUpperCase()} is not allowed in sql\`...\``,
			hint,
		);
		return true;
	}

	/**
	 * Lexical scan over the template's literal parts, carrying string state
	 * across interpolation holes. Rejects everything that would break the
	 * emitted statement's structure:
	 *   - SQL comments (a trailing `--` would swallow the `;`/INTO/LOOP the
	 *     emitter appends — destroying invariant 1's statement+GET DIAGNOSTICS
	 *     unit at the textual level);
	 *   - top-level `;` (multiple statements) — `;` inside '...'/"..." is fine;
	 *   - `$` outside strings (dollar-quoting / positional params);
	 *   - interpolation holes inside string literals ('${x}' would emit the
	 *     TEXT p_x, silently ignoring the value — invariant 3);
	 *   - holes touching identifier characters (`${a}b` would glue into the
	 *     unrelated identifier p_ab; `${a}${b}` would fuse into p_ap_b);
	 *   - unterminated strings (would swallow the appended terminator).
	 * Returns true if anything was rejected.
	 */
	private scanSqlParts(tagged: ONode, parts: string[]): boolean {
		let inSingle = false;
		let inDouble = false;
		let errored = false;
		const err = (message: string, hint?: string): true => {
			this.diags.error(tagged, Codes.BadSqlUse, message, hint);
			errored = true;
			return true;
		};

		for (let pi = 0; pi < parts.length; pi++) {
			const part = parts[pi];
			for (let i = 0; i < part.length; i++) {
				const c = part[i];
				const n = part[i + 1];
				if (inSingle) {
					if (c === "'") {
						if (n === "'") i++;
						else inSingle = false;
					}
					continue;
				}
				if (inDouble) {
					if (c === '"') {
						if (n === '"') i++;
						else inDouble = false;
					}
					continue;
				}
				if (c === "'") inSingle = true;
				else if (c === '"') inDouble = true;
				else if (c === '-' && n === '-') {
					return err(
						'SQL comments are not supported in sql`...`',
						'a comment would swallow the statement terminator the compiler appends',
					);
				} else if (c === '/' && n === '*') {
					return err(
						'SQL comments are not supported in sql`...`',
						'a comment would swallow the statement terminator the compiler appends',
					);
				} else if (c === ';') {
					return err('sql`...` must contain a single statement without a trailing ;');
				} else if (c === '$') {
					return err(
						'dollar-quoting and positional parameters ($) are not supported in sql`...`',
						'use ${x} interpolation instead',
					);
				}
			}

			const holeFollows = pi < parts.length - 1;
			if (holeFollows) {
				if (inSingle || inDouble) {
					return err(
						'interpolations inside SQL string literals are not supported',
						"'${x}' would emit the text p_x, not the value — interpolations lower to bare identifiers (invariant 3)",
					);
				}
				if (parts[pi + 1] === '' && pi + 1 < parts.length - 1) {
					return err('adjacent interpolations would fuse into a single identifier', 'separate them with SQL text');
				}
				const before = part[part.length - 1];
				const after = parts[pi + 1][0];
				if (
					(before !== undefined && /[A-Za-z0-9_$]/.test(before)) || (after !== undefined && /[A-Za-z0-9_$]/.test(after))
				) {
					return err(
						'an interpolation must not touch identifier characters',
						'the renamed identifier would glue onto the surrounding SQL — add whitespace or punctuation around ${...}',
					);
				}
			}
		}
		if (inSingle || inDouble) {
			return err('unterminated string literal in sql`...`');
		}
		return errored;
	}

	/** .one<{ id: bigint_, balance: numeric | null }>() — inline literal only. */
	private parseRowTypeArgument(call: ONode): Fields | undefined {
		const typeArgs = (call.typeArguments?.params ?? []) as ONode[];
		if (typeArgs.length !== 1) {
			this.diags.error(
				call,
				Codes.BadRowType,
				'provide the row type explicitly',
				'e.g. .one<{ id: bigint_, balance: numeric }>()',
			);
			return undefined;
		}
		const literal = typeArgs[0];
		if (literal.type !== 'TSTypeLiteral') {
			this.diags.error(literal, Codes.BadRowType, 'the row type must be an inline object type literal');
			return undefined;
		}
		const fields: Fields = new Map();
		let failed = false;
		for (const member of literal.members as ONode[]) {
			if (member.type !== 'TSPropertySignature' || member.computed || !isIdent(member.key)) {
				this.diags.error(member, Codes.BadRowType, 'row types may only contain plain properties');
				failed = true;
				continue;
			}
			if (member.optional) {
				this.diags.error(member, Codes.BadRowType, 'optional fields are not supported', 'use `field: T | null`');
				failed = true;
				continue;
			}
			// Field accesses are emitted unquoted (v_rec.field): the name must be
			// a lowercase identifier (PG folds unquoted identifiers, so mixed case
			// would alias or miss the runtime field) and must not be a keyword.
			const fieldName = member.key.name as string;
			if (!/^[a-z_][a-z0-9_]*$/.test(fieldName)) {
				this.diags.error(
					member,
					Codes.BadRowType,
					`row field '${fieldName}' must be a lowercase identifier`,
					'unquoted PostgreSQL identifiers fold to lowercase — alias the column in the query if needed',
				);
				failed = true;
				continue;
			}
			if (ALL_KEYWORDS.has(fieldName)) {
				this.diags.error(
					member,
					Codes.BadRowType,
					`row field '${fieldName}' is a SQL keyword`,
					'alias the column in the query (SELECT x AS x_value) and rename the field',
				);
				failed = true;
				continue;
			}
			const typeNode = (member.typeAnnotation as ONode | undefined)?.typeAnnotation as ONode | undefined;
			const type = typeNode ? this.resolveTypeAnnotation(typeNode) : undefined;
			if (!type) {
				if (!typeNode) this.diags.error(member, Codes.BadRowType, 'row fields need explicit types');
				failed = true;
				continue;
			}
			fields.set(fieldName, type);
		}
		return failed ? undefined : fields;
	}

	/** int / numeric / bigint_ / text / boolean / string / bigint, optionally `| null`. */
	private resolveTypeAnnotation(typeNode: ONode): ScalarType | undefined {
		if (typeNode.type === 'TSParenthesizedType') return this.resolveTypeAnnotation(typeNode.typeAnnotation);

		if (typeNode.type === 'TSUnionType') {
			const members = typeNode.types as ONode[];
			const nullMembers = members.filter((m) => m.type === 'TSNullKeyword');
			const rest = members.filter((m) => m.type !== 'TSNullKeyword');
			if (nullMembers.length !== 1 || rest.length !== 1) {
				this.diags.error(typeNode, Codes.UnsupportedSyntax, 'only `T | null` unions are supported');
				return undefined;
			}
			const inner = this.resolveTypeAnnotation(rest[0]);
			return inner ? { ...inner, nullable: true } : undefined;
		}

		switch (typeNode.type) {
			case 'TSNumberKeyword':
				this.diags.error(
					typeNode,
					Codes.BareNumber,
					'bare `number` is not supported',
					'use a SQL type from drizzle-orm/pg-core: int, bigint_ or numeric',
				);
				return undefined;
			case 'TSStringKeyword':
				return { pg: 'text', nullable: false };
			case 'TSBooleanKeyword':
				return { pg: 'boolean', nullable: false };
			case 'TSBigIntKeyword':
				return { pg: 'bigint', nullable: false };
		}

		if (typeNode.type === 'TSTypeReference' && isIdent(typeNode.typeName)) {
			// Type-alias imports resolve through the import table; TS keeps type
			// and value namespaces separate, so value bindings do not shadow here.
			const dsl = this.imports.resolveRuntime(typeNode.typeName.name);
			const pg = dsl ? MARKER_TO_PG[dsl] : undefined;
			if (pg) return { pg, nullable: false };
		}

		this.diags.error(
			typeNode,
			Codes.UnsupportedSyntax,
			`unsupported type: ${this.getText(typeNode)}`,
			'supported: int, bigint_, bigint64, numeric, text (from drizzle-orm/pg-core), boolean, and `T | null`',
		);
		return undefined;
	}

	// ── naming ───────────────────────────────────────────────────────────────

	/**
	 * Registers a variable. One flat namespace per procedure — PL/pgSQL gets a
	 * single hoisted DECLARE block (invariant 5), so shadowing/redeclaration is
	 * rejected rather than renamed. Emitted names are checked lowercase-folded,
	 * because unquoted PostgreSQL identifiers fold to lowercase.
	 */
	private declareName(scope: Scope, nameNode: ONode, info: VarInfo, emittedNames: string[]): boolean {
		const prior = scope.ctx.declared.get(info.name);
		if (prior) {
			this.diags.error(
				nameNode,
				Codes.Redeclaration,
				`'${info.name}' is already declared in this procedure`,
				'PL/pgSQL has a single hoisted DECLARE block — shadowing and redeclaration are not supported; rename one of them',
			);
			return false;
		}
		if (!this.reserveEmitted(scope.ctx, nameNode, info.name, emittedNames)) return false;
		scope.ctx.declared.set(info.name, nameNode);
		scope.set(info);
		scope.ctx.tryFrames[scope.ctx.tryFrames.length - 1]?.declared.add(info);
		return true;
	}

	/** Reserves lowercase-folded emitted names without introducing a source name. */
	private reserveEmitted(ctx: ProcContext, nameNode: ONode, displayName: string, emittedNames: string[]): boolean {
		for (const emitted of emittedNames) {
			const folded = identityOf(emitted);
			const prior = ctx.emittedLower.get(folded);
			if (prior !== undefined) {
				// Collisions involving a synthesized <name>__count variable are not
				// about case folding — say what actually clashed.
				if (folded.endsWith('__count')) {
					this.diags.error(
						nameNode,
						Codes.NameCollision,
						`'${displayName}' collides with the compiler-generated variable '${prior}'`,
						'the compiler reserves `<name>__count` for `const <name> = sql`...`` bindings — rename one of them',
					);
				} else {
					this.diags.error(
						nameNode,
						Codes.NameCollision,
						`'${displayName}' collides with '${prior}' once lowercased`,
						'unquoted PostgreSQL identifiers fold to lowercase — rename one of them',
					);
				}
				return false;
			}
		}
		for (const emitted of emittedNames) ctx.emittedLower.set(identityOf(emitted), emitted);
		return true;
	}
}

// ── module-level AST utilities ───────────────────────────────────────────────

/** Visit every child node (arrays and single nodes) of an oxc AST node. */
function forEachChildNode(node: ONode, visit: (child: ONode) => void): void {
	for (const key in node) {
		if (key === 'type' || key === 'start' || key === 'end') continue;
		const value = (node as Record<string, unknown>)[key];
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item && typeof item === 'object' && typeof (item as ONode).type === 'string') visit(item as ONode);
			}
		} else if (value && typeof value === 'object' && typeof (value as ONode).type === 'string') {
			visit(value as ONode);
		}
	}
}

/** Collects the names bound by a binding pattern (params, declarators, ...). */
function collectPatternNames(pattern: ONode | null | undefined, into: Set<string>): void {
	if (!pattern || typeof pattern !== 'object') return;
	switch (pattern.type) {
		case 'Identifier':
			into.add(pattern.name as string);
			return;
		case 'ObjectPattern':
			for (const p of (pattern.properties ?? []) as ONode[]) {
				if (p.type === 'Property') collectPatternNames(p.value as ONode, into);
				else if (p.type === 'RestElement') collectPatternNames(p.argument as ONode, into);
			}
			return;
		case 'ArrayPattern':
			for (const e of (pattern.elements ?? []) as (ONode | null)[]) collectPatternNames(e, into);
			return;
		case 'AssignmentPattern':
			collectPatternNames(pattern.left as ONode, into);
			return;
		case 'RestElement':
			collectPatternNames(pattern.argument as ONode, into);
			return;
	}
}

function isNumericLiteralish(node: ONode): boolean {
	if (isLiteralOfType(node, 'number')) return true;
	if (node.type === 'UnaryExpression' && node.operator === '-') {
		return isLiteralOfType(node.argument, 'number');
	}
	return false;
}

/**
 * The identifier PostgreSQL actually sees: quoted names keep their case,
 * unquoted ones fold to lowercase. Collisions are checked on this.
 */
function identityOf(emitted: string): string {
	return emitted.startsWith('"') ? emitted.slice(1, -1).replaceAll('""', '"') : emitted.toLowerCase();
}
