import { collectTypeAliases, DecompileError, decompileSql, type ParsedParam, parseParamList } from './decompile';
import { emitProcedure } from './emit';
import type { ProcedureIR } from './ir';

/**
 * Pure helpers only: Studio and the mover bundle this module (via the diff convertor), so it must not reach
 * Node-only code. Compiling schema files lives in ./compile-schema.
 *
 * The procedure model drizzle-kit diffs. Both sides — compiled from source and introspected from
 * `pg_proc` — reduce to the same canonical fields, so equality is exact:
 *
 *   - identity is (schema, name): the DSL has one signature per procedure name;
 *   - `params` is the parameter list in canonical spelling (IN names folded, results quoted,
 *     defaults normalized), which is what decides DROP + CREATE versus CREATE OR REPLACE —
 *     CREATE OR REPLACE cannot rename parameters or change result parameters, and changing an IN
 *     type would silently create an overload instead of replacing;
 *   - `body` is the text between the dollar quotes, which Postgres stores verbatim (`prosrc`).
 */
export interface ProcedureDef {
	schema: string;
	name: string;
	params: string;
	body: string;
	language: string;
}

function renderParam(p: ParsedParam): string {
	if (p.mode === 'inout') return `INOUT "${p.name.replaceAll('"', '""')}" ${p.type} DEFAULT NULL`;
	return `${p.name.toLowerCase()} ${p.type}${p.default !== undefined ? ` DEFAULT ${p.default}` : ''}`;
}

/** Canonical spelling of a parameter list — the emitter's, or `pg_get_function_arguments()`'s. Throws on lists outside the DSL. */
export function canonicalParams(raw: string): string {
	return parseParamList(raw).map(renderParam).join(', ');
}

/** The argument types that identify the procedure for DROP (IN and INOUT; result parameters count). */
export function signatureTypes(params: string): string[] {
	return parseParamList(params).map((p) => p.type);
}

const EMITTED =
	/^CREATE OR REPLACE PROCEDURE (?:"(?:[^"]|"")+"\.)?([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*?)\)\nLANGUAGE (\w+)\nAS (\$[A-Za-z0-9_]*\$)([\s\S]*)\4;$/;

/** A compiled procedure, read back from its emitted SQL (single source of truth). */
export function procedureFromIR(ir: ProcedureIR, fallbackSchema = 'public'): ProcedureDef {
	const schema = ir.schema ?? fallbackSchema;
	const m = emitProcedure(ir).match(EMITTED);
	if (!m) throw new Error(`internal: unexpected emitted shape for procedure '${ir.name}'`);
	// Procedure names are emitted unquoted, so the catalog holds them folded.
	return { schema, name: ir.name.toLowerCase(), params: canonicalParams(m[2]), body: m[5], language: m[3] };
}

const qualified = (schema: string, name: string) => schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

function dollarQuote(body: string): string {
	let tag = '$$';
	for (let i = 1; body.includes(tag); i++) tag = `$drizzle${i === 1 ? '' : i}$`;
	return tag;
}

export function createProcedureSql(def: ProcedureDef): string {
	const quote = dollarQuote(def.body);
	return `CREATE OR REPLACE PROCEDURE ${
		qualified(def.schema, def.name)
	}(${def.params})\nLANGUAGE ${def.language}\nAS ${quote}${def.body}${quote};`;
}

export function dropProcedureSql(def: ProcedureDef): string {
	return `DROP PROCEDURE ${qualified(def.schema, def.name)}(${signatureTypes(def.params).join(', ')});`;
}

/** The body the decompiler and the re-emit check see: the procedure as the emitter would print it. */
function emittedForm(def: ProcedureDef): string {
	return `CREATE OR REPLACE PROCEDURE ${def.name}(${def.params})\nLANGUAGE ${def.language}\nAS $$${def.body}$$;`;
}

// ── unsupported procedures ───────────────────────────────────────────────────

/** A procedure drizzle-kit cannot represent as `procedure(...)` source; pulled as `procedure.unsupported(...)`. */
export interface UnsupportedProcedure {
	schema: string;
	name: string;
	/** A full CREATE PROCEDURE statement. */
	definition: string;
	/** What exactly is not supported — printed above the pulled declaration. */
	reason: string;
}

const IDENT_PART = String.raw`(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))`;
const DEFINITION_HEADER = new RegExp(
	String.raw`^\s*CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+(?:${IDENT_PART}\s*\.\s*)?${IDENT_PART}\s*\(`,
	'i',
);

/**
 * The (schema, name) a `procedure.unsupported(definition)` declares, read from its CREATE PROCEDURE header.
 * Unquoted names fold to lowercase; an unqualified name is in public. Undefined when the header is unreadable.
 */
export function unsupportedProcedureKey(definition: string): { schema: string; name: string } | undefined {
	const m = definition.match(DEFINITION_HEADER);
	if (!m) return undefined;
	const ident = (quoted: string | undefined, bare: string | undefined) =>
		quoted !== undefined ? quoted.replaceAll('""', '"') : bare?.toLowerCase();
	return { schema: ident(m[1], m[2]) ?? 'public', name: ident(m[3], m[4])! };
}

/**
 * What pull does with introspected procedures: the ones that decompile exactly become `procedure(...)` source;
 * the rest join the already-unsupported ones (overloads, foreign parameter lists) as `procedure.unsupported(...)`.
 */
export function splitPulledProcedures<T extends ProcedureDef>(
	procedures: T[],
	unsupported: UnsupportedProcedure[] = [],
	/** The database's own definitions (`schema.name` → `pg_get_functiondef()`), shown for unsupported ones. */
	definitions: Record<string, string> = {},
): { supported: T[]; unsupported: UnsupportedProcedure[] } {
	const supported: T[] = [];
	const all = [...unsupported];
	for (const it of procedures) {
		const pulled = pullProcedure(it);
		if (pulled.ok) supported.push(it);
		else {
			const definition = definitions[`${it.schema}.${it.name}`] ?? createProcedureSql(it);
			all.push({ schema: it.schema, name: it.name, definition, reason: pulled.reason });
		}
	}
	all.sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name));
	return { supported, unsupported: all };
}

// ── pull ─────────────────────────────────────────────────────────────────────

export type PulledProcedure =
	| { ok: true; def: ProcedureDef; ts: string; usesPgError: boolean; typeAliases: string[] }
	| { ok: false; def: ProcedureDef; reason: string };

/**
 * Lifts an introspected procedure back into `procedure(...)` source. Only correct if pushing the pulled
 * source would be a no-op: the decompiled IR must re-emit to the same header and a byte-identical body.
 *
 * TODO: map quoted names in pulled bodies back to schema references (`"accounts"` → `${accounts}`,
 * `"balance"` → `${accounts.balance}`). Pulled bodies currently keep the raw quoted SQL text: it compiles to
 * identical SQL, but loses rename tracking, autocomplete and the `dependsOn` manifest. Tables map unambiguously;
 * columns are emitted unqualified, so attributing them needs name resolution (aliases, CTEs, output aliases),
 * and a wrong column link is invisible to the byte-identical check above (`${a.x}` and `${b.x}` both emit
 * `"x"`). Revisit on top of the Postgres DSL lexer/grammar instead of an ad-hoc lexical pass.
 */
export function pullProcedure(def: ProcedureDef): PulledProcedure {
	if (def.language !== 'plpgsql') {
		return { ok: false, def, reason: `LANGUAGE ${def.language} — only plpgsql is supported` };
	}
	try {
		const decompiled = decompileSql(emittedForm(def));
		const proc = decompiled.procedures.length === 1 ? decompiled.procedures[0] : undefined;
		const lifted = proc ? procedureFromIR(proc.ir, def.schema) : undefined;
		if (!proc || !lifted || lifted.params !== def.params || lifted.body !== def.body) {
			return { ok: false, def, reason: 'the decompiled procedure would not compile back to the database definition' };
		}
		const typeAliases = new Set<string>();
		collectTypeAliases(proc.ts, typeAliases);
		return { ok: true, def, ts: proc.ts, usesPgError: /\bnew PgError\(/.test(proc.ts), typeAliases: [...typeAliases] };
	} catch (error) {
		if (!(error instanceof DecompileError)) throw error;
		return { ok: false, def, reason: error.message.split('\n')[0] };
	}
}
