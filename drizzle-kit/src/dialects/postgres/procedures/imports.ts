import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { ImportDeclaration, Program } from 'oxc-parser';

/**
 * The DSL lives in drizzle-orm: `import { procedure, PgError, type numeric } from 'drizzle-orm/pg-core'`.
 * Every specifier of the DSL module resolves to this sentinel path, so DSL primitives are recognized by
 * the module they come from, never by identifier text alone.
 */
export const RUNTIME_PATH = '<drizzle-orm/pg-core>';
const RUNTIME_SPECIFIER = /^drizzle-orm\/pg-core(?:\/(?:index|procedure)(?:\.js|\.ts)?)?$/;

export function isRuntimeSpecifier(specifier: string): boolean {
	return RUNTIME_SPECIFIER.test(specifier);
}

/** Every DSL export call sites resolve, by its name in the compiler. */
export type DslName = 'procedure' | 'PgError' | 'int' | 'numeric' | 'bigint_' | 'bigint64' | 'text';

/** drizzle-orm export name → DSL name. Other pg-core exports (pgTable, columns, ...) are not DSL. */
const DSL_EXPORTS: Record<string, DslName> = {
	procedure: 'procedure',
	PgError: 'PgError',
	int: 'int',
	numeric: 'numeric',
	bigint_: 'bigint_',
	bigint64: 'bigint64',
	text: 'text',
};

/**
 * The import graph is all that remains of the TS binder in this compiler:
 * the whitelist forces every body-level binding through the visitor's own
 * Scope, so an identifier that is NOT in scope and matches an import
 * binding is fully determined by that binding. This table maps local
 * names to (module, exported name, resolved path) — aliasing included.
 */
export interface ImportBinding {
	local: string;
	/** The exported name in the source module (differs from local when aliased). */
	imported: string;
	specifier: string;
	/** Absolute file path, or null when unresolvable. */
	resolvedPath: string | null;
	node: ImportDeclaration;
}

export class ImportTable {
	private readonly byLocal = new Map<string, ImportBinding>();
	readonly declarations: ImportDeclaration[] = [];
	/** Resolved absolute path per import declaration (null = unresolvable). */
	readonly resolvedByDecl = new Map<ImportDeclaration, string | null>();

	constructor(program: Program, entryPath: string) {
		for (const stmt of program.body) {
			if (stmt.type !== 'ImportDeclaration') continue;
			this.declarations.push(stmt);
			const specifier = stmt.source.value;
			const resolvedPath = resolveSpecifier(specifier, entryPath);
			this.resolvedByDecl.set(stmt, resolvedPath);
			for (const spec of stmt.specifiers ?? []) {
				if (spec.type !== 'ImportSpecifier') continue; // default/namespace imports are not part of the DSL
				const imported = spec.imported.type === 'Identifier' ? spec.imported.name : String(spec.imported.value);
				this.byLocal.set(spec.local.name, { local: spec.local.name, imported, specifier, resolvedPath, node: stmt });
			}
		}
	}

	lookup(local: string): ImportBinding | undefined {
		return this.byLocal.get(local);
	}

	/** True when `local` is an import of `exportName` from the drizzle-orm DSL module (alias-aware). */
	isRuntimeExport(local: string, exportName: string): boolean {
		const binding = this.byLocal.get(local);
		return !!binding && binding.resolvedPath === RUNTIME_PATH && binding.imported === exportName;
	}

	/** Resolves a local name to a DSL export of drizzle-orm/pg-core (alias-aware). */
	resolveRuntime(local: string): DslName | undefined {
		const binding = this.byLocal.get(local);
		if (!binding || binding.resolvedPath !== RUNTIME_PATH) return undefined;
		return Object.hasOwn(DSL_EXPORTS, binding.imported) ? DSL_EXPORTS[binding.imported] : undefined;
	}
}

/**
 * Specifier → absolute path. The drizzle-orm DSL module is pinned; relative
 * specifiers probe TS-style extensions; bare specifiers go through node
 * resolution relative to the entry file.
 */
export function resolveSpecifier(specifier: string, entryPath: string): string | null {
	if (isRuntimeSpecifier(specifier)) return RUNTIME_PATH;
	if (specifier.startsWith('.')) {
		const base = path.resolve(path.dirname(entryPath), specifier);
		const candidates = [
			base,
			`${base}.ts`,
			`${base}.mts`,
			`${base}.tsx`,
			`${base}.js`,
			path.join(base, 'index.ts'),
			// TS-style: './x.js' specifier for an on-disk './x.ts'
			base.replace(/\.js$/, '.ts'),
		];
		for (const candidate of candidates) {
			if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
		}
		return null;
	}
	try {
		return createRequire(entryPath).resolve(specifier);
	} catch {
		return null;
	}
}
