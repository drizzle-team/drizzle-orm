import { compileFile, type ModuleLoader } from './compile';
import { type Diagnostic, formatDiagnostics } from './diagnostics';
import { type ProcedureDef, procedureFromIR } from './model';

/** Node-only: compiles `procedure()` declarations from schema files (drizzle-kit's schema loading). */

export interface ProcedureSourceFile {
	path: string;
	/** The module's exports, already loaded by drizzle-kit. */
	exports: Record<string, unknown>;
	/** The procedures the module exports — only those are part of the schema. */
	exported: { schema: string | undefined; name: string }[];
}

export interface CompiledProcedures {
	procedures: ProcedureDef[];
	/** Formatted compile diagnostics and cross-file errors; empty on success. */
	errors: string[];
}

/** Compiles every schema file that exports procedures. Names must be unique across files (after folding). */
export async function compileProcedureFiles(
	files: ProcedureSourceFile[],
	loadModule: ModuleLoader,
): Promise<CompiledProcedures> {
	const result: CompiledProcedures = { procedures: [], errors: [] };
	const diagnostics: Diagnostic[] = [];
	const seen = new Map<string, string>();
	for (const file of files) {
		const compiled = await compileFile(file.path, { loadModule, entryExports: file.exports });
		diagnostics.push(...compiled.diagnostics);
		if (compiled.diagnostics.length > 0) continue;
		const exported = new Set(file.exported.map((it) => procedureKey(it.schema, it.name)));
		for (const ir of compiled.procedures) {
			const def = procedureFromIR(ir);
			const key = procedureKey(def.schema, def.name);
			if (!exported.has(key)) continue;
			const prior = seen.get(key);
			if (prior) {
				result.errors.push(`procedure '${key}' is declared in both ${prior} and ${file.path}`);
				continue;
			}
			seen.set(key, file.path);
			result.procedures.push(def);
		}
	}
	if (diagnostics.length > 0) result.errors.unshift(formatDiagnostics(diagnostics, { relativeTo: process.cwd() }));
	result.procedures.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

/** Unquoted procedure names fold to lowercase, so the declared name matches the compiled one folded. */
const procedureKey = (schema: string | undefined, name: string) => `${schema ?? 'public'}.${name.toLowerCase()}`;
