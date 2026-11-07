import * as fs from 'node:fs';
import * as path from 'node:path';
import { Codes, type Diagnostic, Diagnostics } from './diagnostics';
import { emitProcedure } from './emit';
import { ImportTable } from './imports';
import type { ProcedureIR } from './ir';
import { loadSchemaRegistry, type ModuleLoader, type ParseFn } from './schema-registry';
export type { ModuleLoader } from './schema-registry';
import { SourceScript } from './source';
import { WhitelistVisitor } from './visitor';

export interface PhaseTiming {
	phase: string;
	ms: number;
}

export interface CompileOptions {
	/** How schema modules are executed for table introspection (drizzle-kit passes its jiti loader). */
	loadModule?: ModuleLoader;
	/** The entry file's exports, when the caller already executed it. */
	entryExports?: Record<string, unknown>;
}

/**
 * oxc-parser is a native module: drizzle-kit loads it only when a schema
 * actually declares procedures, and asks the user to install it otherwise.
 */
let parser: ParseFn | undefined;
export async function loadParser(): Promise<ParseFn> {
	if (parser) return parser;
	try {
		parser = (await import('oxc-parser')).parseSync;
	} catch (error) {
		throw new Error(
			"Compiling procedure() declarations requires the 'oxc-parser' package — install it as a dev dependency: npm i -D oxc-parser",
			{ cause: error },
		);
	}
	return parser;
}

export interface CompileResult {
	/** Emitted PL/pgSQL, or null when there were errors. */
	sql: string | null;
	procedures: ProcedureIR[];
	/** All errors, collected across the whole file before failing. */
	diagnostics: Diagnostic[];
	/** Wall-clock per pipeline phase, in execution order. */
	timings: PhaseTiming[];
}

class PhaseTimer {
	readonly timings: PhaseTiming[] = [];
	run<T>(phase: string, fn: () => T): T {
		const t0 = performance.now();
		const result = fn();
		this.timings.push({ phase, ms: performance.now() - t0 });
		return result;
	}
}

/**
 * parse (oxc) → import table → schema registry (drizzle introspection) →
 * whitelist visitor → IR → emitter. Async because drizzle schema modules
 * are dynamically imported at compile time (like drizzle-kit does).
 */
export async function compileFile(entryPath: string, options: CompileOptions = {}): Promise<CompileResult> {
	const resolved = path.resolve(entryPath);
	const parse = await loadParser(); // outside the guard: a missing package is not a compile diagnostic
	const timer = new PhaseTimer();
	return guarded(resolved, timer, async () => {
		const text = timer.run('read entry', () => fs.readFileSync(resolved, 'utf8'));
		return compile(new SourceScript(resolved, text), timer, parse, options);
	});
}

/** In-memory variant for unit tests and tooling. */
export async function compileSource(
	source: string,
	fileName = '__inline__.ts',
	options: CompileOptions = {},
): Promise<CompileResult> {
	const virtualPath = path.resolve(fileName);
	const parse = await loadParser();
	const timer = new PhaseTimer();
	return guarded(virtualPath, timer, async () => compile(new SourceScript(virtualPath, source), timer, parse, options));
}

/**
 * The compiler must NEVER throw — every failure is a diagnostic. This
 * backstop catches what no visitor check can (e.g. the parser itself
 * hitting a limit on pathological input).
 */
async function guarded(file: string, timer: PhaseTimer, run: () => Promise<CompileResult>): Promise<CompileResult> {
	try {
		return await run();
	} catch (error) {
		const diagnostics = new Diagnostics();
		diagnostics.fileError(
			file,
			Codes.InternalError,
			`the compiler hit an internal limit: ${error instanceof Error ? error.message : String(error)}`,
			'simplify the input — e.g. flatten deeply nested or extremely long expressions',
		);
		return { sql: null, procedures: [], diagnostics: diagnostics.all, timings: timer.timings };
	}
}

async function compile(
	script: SourceScript,
	timer: PhaseTimer,
	parseSync: ParseFn,
	options: CompileOptions,
): Promise<CompileResult> {
	const diagnostics = new Diagnostics();
	const reporter = diagnostics.forFile(script);

	const parsed = timer.run('parse (oxc)', () => parseSync(script.filePath, script.text));

	// Malformed TypeScript must fail HERE: an error-recovery AST would
	// otherwise flow through the visitor and emit garbage SQL.
	if (parsed.errors.length > 0) {
		for (const parseError of parsed.errors) {
			const label = (parseError as { labels?: { start: number; end: number }[] }).labels?.[0];
			reporter.parseError(label ?? { start: 0, end: 1 }, parseError.message);
		}
		return { sql: null, procedures: [], diagnostics: diagnostics.all, timings: timer.timings };
	}

	const imports = timer.run('resolve imports', () => new ImportTable(parsed.program, script.filePath));

	const t0Schema = performance.now();
	const schema = await loadSchemaRegistry(imports, reporter, {
		entryPath: script.filePath,
		parse: parseSync,
		loadModule: options.loadModule,
		entryExports: options.entryExports,
	});
	timer.timings.push({ phase: 'schema registry (drizzle import + introspection)', ms: performance.now() - t0Schema });
	if (diagnostics.hasErrors) {
		return { sql: null, procedures: [], diagnostics: diagnostics.all, timings: timer.timings };
	}

	const procedures = timer.run('whitelist visitor', () => {
		const visitor = new WhitelistVisitor(imports, reporter, schema, script);
		return visitor.visitSourceFile(parsed.program);
	});
	if (diagnostics.hasErrors) {
		return { sql: null, procedures, diagnostics: diagnostics.all, timings: timer.timings };
	}
	const sql = timer.run('emit', () => procedures.map(emitProcedure).join('\n\n'));
	return { sql, procedures, diagnostics: [], timings: timer.timings };
}
