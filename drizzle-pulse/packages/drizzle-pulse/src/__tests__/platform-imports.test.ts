import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

// Static import-graph audit: every module reachable via a VALUE import from the
// platform-agnostic entrypoints must stay free of server/node-only runtime deps.
// `import type` edges are erased at compile time and never execute, so they're
// excluded from traversal. Mirrors drizzle-orm's own platform-imports test philosophy.

const SRC_ROOT = resolve(import.meta.dir, '..');
const CLIENT_ROOT = join(SRC_ROOT, 'client/index.ts');
const REACT_ROOT = join(SRC_ROOT, 'client/react/index.ts');
const EMBEDDED_ROOT = join(SRC_ROOT, 'client/embedded/index.ts');
const EVENTS_ROOT = join(SRC_ROOT, 'client/embedded/events.ts');
const ROOT_BARREL = join(SRC_ROOT, 'index.ts');

const ENTRY_POINTS = [CLIENT_ROOT, REACT_ROOT, EMBEDDED_ROOT, ROOT_BARREL];

// The schema-definition surface: reached only from the root entrypoint and consumed
// server-side — never browser bundles — so this module alone may value-import
// drizzle-orm/pg-core (pulse-table.ts needs getTableConfig). Every other banned specifier
// still applies, and client/react/embedded reach none of it.
const PG_CORE_ALLOWED = new Set([join(SRC_ROOT, 'pulse-table.ts')]);

// The root barrel is consumed server-side (schema files import `pulse`/`PulseTable`) and
// carries the pulse-table.ts pg-core exemption above — it is the one root exempt from the
// src/server/* path ban below. Every other root walked by this file is a client-bundle
// surface and must never value-reach src/server/*.
const SERVER_DIR_PREFIX = `${SRC_ROOT}/server/`;

// Covers every bare (non-`node:`-prefixed) builtin specifier, including subpaths
// like `fs/promises`; `node:`-prefixed specifiers are caught separately below.
const NODE_BUILTINS = new Set(builtinModules);

function bannedReason(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('node:') || NODE_BUILTINS.has(specifier)) {
    return 'node builtin';
  }
  if (specifier === '@drizzle-team/minipg' || specifier.startsWith('@drizzle-team/minipg/')) {
    return '@drizzle-team/minipg (server-only replication/store driver)';
  }
  if (specifier === 'hono' || specifier.startsWith('hono/')) {
    return 'hono (server-only HTTP framework)';
  }
  // Bare `drizzle-orm` (query-building/metadata utils) is dialect-agnostic and allowed.
  // Any subpath (`drizzle-orm/pg-core`, `drizzle-orm/postgres`, ...) binds to a specific
  // dialect/driver and is treated as server-only runtime surface.
  if (specifier.startsWith('drizzle-orm/')) {
    return 'drizzle-orm/* runtime driver subpath';
  }
  return null;
}

function resolveFirstPartyModule(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = base.endsWith('.js')
    ? [`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`]
    : [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`platform-imports test: could not resolve "${specifier}" from ${fromFile}`);
}

type NamedBindingsLike = { elements: ReadonlyArray<{ isTypeOnly: boolean }> } | undefined;

function namedElementsHaveValueBinding(bindings: NamedBindingsLike): boolean {
  return bindings ? bindings.elements.some((el) => !el.isTypeOnly) : false;
}

function importHasValueBinding(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true; // side-effect import: `import 'x';`
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return false;
  if (clause.name) return true; // default import
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  if (ts.isNamedImports(bindings)) {
    return namedElementsHaveValueBinding(bindings);
  }
  return false;
}

function exportFromHasValueBinding(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (!node.exportClause) return true; // `export * from 'x'`
  if (ts.isNamespaceExport(node.exportClause)) return true;
  if (ts.isNamedExports(node.exportClause)) {
    return namedElementsHaveValueBinding(node.exportClause);
  }
  return false;
}

interface Violation {
  file: string;
  specifier: string;
  reason: string;
}

interface ImportEdge {
  specifier: string;
  isValueImport: boolean;
}

function collectEdges(node: ts.Node): ImportEdge[] {
  const edges: ImportEdge[] = [];

  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      edges.push({ specifier: n.moduleSpecifier.text, isValueImport: importHasValueBinding(n) });
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      edges.push({
        specifier: n.moduleSpecifier.text,
        isValueImport: exportFromHasValueBinding(n),
      });
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      // dynamic import() always executes the target module
      edges.push({ specifier: n.arguments[0].text, isValueImport: true });
    } else if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'require' &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      edges.push({ specifier: n.arguments[0].text, isValueImport: true });
    }
    ts.forEachChild(n, visit);
  };

  visit(node);
  return edges;
}

// Walks the value-import graph from a single root, keeping one visited set + violation list
// scoped to that root — so inclusion/exclusion can be asserted per entrypoint instead of
// against a single combined graph that can't attribute a module to any one root.
function walkImportGraphFrom(root: string): { visited: string[]; violations: Violation[] } {
  const visited = new Set<string>();
  const violations: Violation[] = [];
  const queue = [root];
  const serverPathBanned = root !== ROOT_BARREL;

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );

    for (const edge of collectEdges(source)) {
      if (!edge.isValueImport) continue;

      if (edge.specifier.startsWith('.') || edge.specifier.startsWith('/')) {
        const resolved = resolveFirstPartyModule(file, edge.specifier);
        if (serverPathBanned && resolved.startsWith(SERVER_DIR_PREFIX)) {
          violations.push({
            file,
            specifier: resolved,
            reason: 'src/server/* runtime path (banned for client entrypoints)',
          });
        }
        if (!visited.has(resolved)) queue.push(resolved);
        continue;
      }

      const reason = bannedReason(edge.specifier);
      if (reason) {
        if (PG_CORE_ALLOWED.has(file) && edge.specifier.startsWith('drizzle-orm/pg-core')) continue;
        violations.push({ file, specifier: edge.specifier, reason });
      }
    }
  }

  return { visited: [...visited], violations };
}

// Unions per-root walks across every entrypoint — equivalent to the old single combined
// traversal for the purposes of the vacuous-traversal sanity checks below, while still
// running the per-root server-path ban against each root individually.
function walkImportGraph(entryPoints: string[]): { visited: string[]; violations: Violation[] } {
  const visited = new Set<string>();
  const violations: Violation[] = [];

  for (const entry of entryPoints) {
    const result = walkImportGraphFrom(entry);
    for (const file of result.visited) visited.add(file);
    violations.push(...result.violations);
  }

  return { visited: [...visited], violations };
}

describe('platform-agnostic entrypoint import purity', () => {
  test('client and embedded entrypoints stay free of server/node-only value imports', () => {
    for (const entry of ENTRY_POINTS) {
      expect(existsSync(entry)).toBe(true);
    }

    const { visited, violations } = walkImportGraph(ENTRY_POINTS);

    // Sanity check: the traversal must actually walk a real subgraph, not just the
    // four entry files, or this test would pass vacuously. Assert one known-reachable
    // module per layer (client, react, shared) so a partially broken traversal can't
    // hide behind a raw count. The embedded client reaches the server only through
    // `import type` edges (the runtime is passed in, never imported), so no server
    // module is value-reachable — exactly the purity this test guards.
    expect(visited.length).toBeGreaterThan(10);
    const KNOWN_REACHABLE = [
      join(SRC_ROOT, 'client/pulse-query.ts'),
      join(SRC_ROOT, 'client/react/use-pulse-query.ts'),
      join(SRC_ROOT, 'shared/pulse-merge-core.ts'),
      join(SRC_ROOT, 'shared/superjson.ts'),
    ];
    for (const file of KNOWN_REACHABLE) {
      expect(visited).toContain(file);
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}\n    imports "${v.specifier}" (${v.reason})`)
        .join('\n');
      throw new Error(
        `Found server/node-only value imports reachable from client/embedded:\n${report}`,
      );
    }
  });
});

// Per-root positive/negative reachability: the contract is that each client
// entrypoint's value graph excludes what it doesn't need and includes what it does — an
// exclusion-only guard can pass vacuously if the traversal itself silently breaks (e.g. a
// resolver bug that stops walking early), so every excluded root also carries a positive
// inclusion list (extends the KNOWN_REACHABLE sanity-check philosophy above, per-root).
interface StructureViolation {
  root: string;
  path: string;
  rule: 'exclusion' | 'inclusion';
}

function checkRootStructure(
  root: string,
  visited: ReadonlySet<string>,
  deny: readonly string[],
  requireList: readonly string[],
): StructureViolation[] {
  const violations: StructureViolation[] = [];
  for (const path of deny) {
    if (visited.has(path)) violations.push({ root, path, rule: 'exclusion' });
  }
  for (const path of requireList) {
    if (!visited.has(path)) violations.push({ root, path, rule: 'inclusion' });
  }
  return violations;
}

describe('embedded/events per-root inclusion and exclusion contract', () => {
  test('embedded root excludes the HTTP/wire-protocol/ranged-merge surface and includes the tap-direct primitives; the events-module root additionally excludes the merge core', () => {
    // Explicit denylist entries mirror what Task 1's generic src/server/* path ban already
    // catches for these two roots — spelled out here so a violation names the exact expected
    // module in the report, rather than only the first server path the traversal happens to
    // hit first.
    const denyByRoot = new Map<string, readonly string[]>([
      [
        EMBEDDED_ROOT,
        [
          join(SRC_ROOT, 'client/pulse-query.ts'),
          join(SRC_ROOT, 'client/transport.ts'),
          join(SRC_ROOT, 'client/create-client.ts'),
          join(SRC_ROOT, 'client/superjson.ts'),
          join(SRC_ROOT, 'shared/ranged-merge-core.ts'),
          join(SRC_ROOT, 'server/sdk.ts'),
          join(SRC_ROOT, 'server/pulse-store.ts'),
          join(SRC_ROOT, 'server/cursor.ts'),
          join(SRC_ROOT, 'server/pulse-sql.ts'),
          // The runtime value-imports drizzle-orm/postgres/shape (which pulls in minipg's postgres
          // codecs) — must never become client-reachable.
          join(SRC_ROOT, 'server/pulse-runtime.ts'),
        ],
      ],
      [
        EVENTS_ROOT,
        [
          join(SRC_ROOT, 'shared/pulse-merge-core.ts'),
          join(SRC_ROOT, 'shared/ranged-merge-core.ts'),
          join(SRC_ROOT, 'client/embedded/index.ts'),
          join(SRC_ROOT, 'client/pulse-query.ts'),
          join(SRC_ROOT, 'client/transport.ts'),
          join(SRC_ROOT, 'client/create-client.ts'),
          join(SRC_ROOT, 'server/sdk.ts'),
          join(SRC_ROOT, 'server/pulse-store.ts'),
          join(SRC_ROOT, 'server/cursor.ts'),
          join(SRC_ROOT, 'server/pulse-sql.ts'),
          join(SRC_ROOT, 'server/pulse-runtime.ts'),
        ],
      ],
    ]);

    const requireByRoot = new Map<string, readonly string[]>([
      [
        EMBEDDED_ROOT,
        [
          join(SRC_ROOT, 'shared/pulse-merge-core.ts'),
          join(SRC_ROOT, 'shared/filter-ast.ts'),
          join(SRC_ROOT, 'shared/lsn.ts'),
          join(SRC_ROOT, 'shared/event-normalization.ts'),
          join(SRC_ROOT, 'shared/projection.ts'),
          join(SRC_ROOT, 'shared/column-filter.ts'),
          join(SRC_ROOT, 'client/embedded/tap-events.ts'),
        ],
      ],
      [
        EVENTS_ROOT,
        [
          join(SRC_ROOT, 'shared/filter-ast.ts'),
          join(SRC_ROOT, 'shared/event-normalization.ts'),
          join(SRC_ROOT, 'client/embedded/tap-events.ts'),
        ],
      ],
    ]);

    const violations: StructureViolation[] = [];
    for (const root of [EMBEDDED_ROOT, EVENTS_ROOT]) {
      const { visited } = walkImportGraphFrom(root);
      violations.push(
        ...checkRootStructure(
          root,
          new Set(visited),
          denyByRoot.get(root) ?? [],
          requireByRoot.get(root) ?? [],
        ),
      );
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  root ${v.root}\n    ${v.rule} violation: ${v.path}`)
        .join('\n');
      throw new Error(`Per-root structural contract violated:\n${report}`);
    }
  });
});
