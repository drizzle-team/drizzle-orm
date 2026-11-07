import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { parseSync } from 'oxc-parser';
import { Codes, type FileReporter } from './diagnostics';
import { type ImportTable, RUNTIME_PATH } from './imports';

/**
 * Drizzle schema support: procedure files may import tables from the
 * project's drizzle schema modules and interpolate them into sql`...`.
 *
 * Fidelity over reimplementation: the schema module is IMPORTED at compile
 * time (exactly what drizzle-kit does) and the resulting objects are
 * introspected via drizzle's own getTableConfig — so final SQL names
 * (including per-entity casing like snakeCase.table) come from drizzle
 * itself, never from a re-derivation. The registry is keyed by
 * (resolved module path, exported name); the visitor resolves references
 * through the import table (aliased imports work, shadowed names don't).
 *
 * Safety gate: a module is only executed if it statically imports from
 * drizzle-orm — anything else is rejected without running its code.
 */

export interface ColumnMeta {
	/** TS property key on the table object (e.g. ownerName). */
	key: string;
	/** Final SQL identifier (e.g. owner_name) — post-casing, from drizzle. */
	sqlName: string;
	notNull: boolean;
	/** drizzle's columnType, e.g. 'PgBigInt53' — reserved for type integration. */
	columnType: string;
}

export interface TableMeta {
	exportName: string;
	sqlName: string;
	schemaName: string | undefined;
	/** Keyed by TS property key. */
	columns: Map<string, ColumnMeta>;
	/** Quoted, qualified emission + dependency identity: `"tenant"."users"`. */
	qualified: string;
}

export function quoteIdent(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

export class SchemaRegistry {
	private readonly tables = new Map<string, Map<string, TableMeta>>();
	/** `pgSchema(...)` exports: path → export name → schema name. */
	private readonly schemas = new Map<string, Map<string, string>>();

	/** The compiled file itself: its exported tables resolve by name without an import. */
	constructor(private readonly entryPath?: string) {}

	/** True when this file contributed at least one table. */
	hasFile(filePath: string): boolean {
		return this.tables.has(filePath);
	}

	register(filePath: string, exportName: string, meta: TableMeta): void {
		let byExport = this.tables.get(filePath);
		if (!byExport) {
			byExport = new Map();
			this.tables.set(filePath, byExport);
		}
		byExport.set(exportName, meta);
	}

	registerSchema(filePath: string, exportName: string, schemaName: string): void {
		let byExport = this.schemas.get(filePath);
		if (!byExport) {
			byExport = new Map();
			this.schemas.set(filePath, byExport);
		}
		byExport.set(exportName, schemaName);
	}

	/** Resolves a local name to an imported (or this file's exported) `pgSchema(...)`, by its schema name. */
	resolveSchema(imports: ImportTable, localName: string): string | undefined {
		const binding = imports.lookup(localName);
		if (!binding) return this.entryPath ? this.schemas.get(this.entryPath)?.get(localName) : undefined;
		if (!binding.resolvedPath) return undefined;
		return this.schemas.get(binding.resolvedPath)?.get(binding.imported);
	}

	/**
	 * Resolves a local identifier NAME to a schema table via the import
	 * table (alias-aware). The caller must have established the name is not
	 * shadowed by an in-scope binding.
	 */
	resolveTable(imports: ImportTable, localName: string): TableMeta | undefined {
		const binding = imports.lookup(localName);
		if (!binding) {
			// Declared in the compiled file itself (drizzle schemas keep tables and
			// procedures side by side). Only exported tables are registered.
			return this.entryPath ? this.tables.get(this.entryPath)?.get(localName) : undefined;
		}
		if (!binding.resolvedPath) return undefined;
		return this.tables.get(binding.resolvedPath)?.get(binding.imported);
	}
}

/** Duck-check for a drizzle column object without importing drizzle here. */
function isColumnLike(value: unknown): value is { name: string; notNull: boolean; columnType: string } {
	return (
		typeof value === 'object'
		&& value !== null
		&& 'columnType' in value
		&& typeof (value as { name?: unknown }).name === 'string'
	);
}

/** The module executes only if it statically imports from drizzle-orm. */
function looksLikeDrizzleModule(filePath: string, parse: ParseFn): boolean {
	let text: string;
	try {
		text = fs.readFileSync(filePath, 'utf8');
	} catch {
		return false;
	}
	const parsed = parse(filePath, text);
	return parsed.program.body.some(
		(stmt) => stmt.type === 'ImportDeclaration' && /^drizzle-orm(\/|$)/.test(stmt.source.value),
	);
}

/** Type-only: oxc-parser is a native module the compiler loads lazily (see loadParser). */
export type ParseFn = typeof parseSync;
export type ModuleLoader = (filePath: string) => Promise<Record<string, unknown>>;
type GetTableConfig = (t: unknown) => { name: string; schema: string | undefined };

export interface SchemaRegistryOptions {
	/** The compiled file: its own exported tables are registered too. */
	entryPath: string;
	parse: ParseFn;
	/** How modules are executed — drizzle-kit passes its own (jiti) loader. */
	loadModule?: ModuleLoader;
	/**
	 * The entry file's exports when the caller already executed it (drizzle-kit
	 * loads every schema file first). Otherwise the entry is loaded on a best-effort
	 * basis: a file the visitor is about to reject may not even be valid JS.
	 */
	entryExports?: Record<string, unknown>;
}

const defaultLoader: ModuleLoader = async (filePath) =>
	(await import(pathToFileURL(filePath).href)) as Record<string, unknown>;

/**
 * Loads the entry file and every non-runtime module it imports, and registers
 * their drizzle tables. Import failures become diagnostics on the import
 * declaration; non-drizzle modules are skipped without executing (the
 * visitor reports their use).
 */
export async function loadSchemaRegistry(
	imports: ImportTable,
	reporter: FileReporter,
	options: SchemaRegistryOptions,
): Promise<SchemaRegistry> {
	const { entryPath, parse, loadModule = defaultLoader, entryExports } = options;
	const registry = new SchemaRegistry(entryPath);
	const seen = new Set<string>([entryPath]);
	const { getTableConfig } = (await import('drizzle-orm/pg-core')) as unknown as { getTableConfig: GetTableConfig };

	if (entryExports) {
		registerTables(registry, entryPath, entryExports, getTableConfig);
	} else if (looksLikeDrizzleModule(entryPath, parse)) {
		try {
			registerTables(registry, entryPath, await loadModule(entryPath), getTableConfig);
		} catch {
			// Best effort: a file the visitor is about to reject may not even be valid JS.
		}
	}

	const candidates: { path: string; decl: (typeof imports.declarations)[number] }[] = [];
	for (const decl of imports.declarations) {
		const resolvedPath = imports.resolvedByDecl.get(decl) ?? null;
		if (resolvedPath && resolvedPath !== RUNTIME_PATH) candidates.push({ path: resolvedPath, decl });
	}

	for (const { path: resolvedPath, decl } of candidates) {
		if (seen.has(resolvedPath)) continue;
		seen.add(resolvedPath);
		if (!looksLikeDrizzleModule(resolvedPath, parse)) {
			// Refusing to execute non-drizzle modules is the safety property;
			// the visitor reports the import itself.
			continue;
		}
		let mod: Record<string, unknown>;
		try {
			mod = await loadModule(resolvedPath);
		} catch (error) {
			const message = `failed to load schema module: ${error instanceof Error ? error.message : String(error)}`;
			const hint =
				'the schema module is imported at compile time (like drizzle-kit does) — it must be side-effect-free and importable';
			reporter.error(decl, Codes.UnsupportedSyntax, message, hint);
			continue;
		}
		registerTables(registry, resolvedPath, mod, getTableConfig);
	}
	return registry;
}

function registerTables(
	registry: SchemaRegistry,
	resolvedPath: string,
	mod: Record<string, unknown>,
	getTableConfig: GetTableConfig,
): void {
	for (const [exportName, value] of Object.entries(mod)) {
		if (typeof value !== 'object' || value === null) continue;
		const kind = (value.constructor as unknown as { [key: symbol]: unknown } | undefined)
			?.[Symbol.for('drizzle:entityKind')];
		if (kind === 'PgSchema' && typeof (value as { schemaName?: unknown }).schemaName === 'string') {
			registry.registerSchema(resolvedPath, exportName, (value as { schemaName: string }).schemaName);
			continue;
		}
		if (!(Symbol.for('drizzle:Name') in value)) continue;
		let config: { name: string; schema: string | undefined };
		try {
			config = getTableConfig(value);
		} catch {
			continue; // a drizzle entity that is not a table (view, etc.)
		}
		const columns = new Map<string, ColumnMeta>();
		for (const [key, col] of Object.entries(value)) {
			if (!isColumnLike(col)) continue;
			columns.set(key, { key, sqlName: col.name, notNull: col.notNull, columnType: col.columnType });
		}
		const qualified = config.schema
			? `${quoteIdent(config.schema)}.${quoteIdent(config.name)}`
			: quoteIdent(config.name);
		registry.register(resolvedPath, exportName, {
			exportName,
			sqlName: config.name,
			schemaName: config.schema,
			columns,
			qualified,
		});
	}
}
