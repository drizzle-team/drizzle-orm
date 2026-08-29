import { globSync } from 'glob';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, test } from 'vitest';
import { checkPackage } from '../../attw-fork/src/checkPackage.ts';
import { getExitCode } from '../../attw-fork/src/cli/getExitCode.ts';
import { createPackageFromTarballData, type Package } from '../../attw-fork/src/createPackage.ts';
import type { CheckResult, Problem } from '../../attw-fork/src/types.ts';
import { emitDirIndexShims } from '../scripts/emit-dir-index-shims.ts';

// `checkPackage` returns `Analysis | UntypedResult`; `.problems` exists only on the
// typed variant, so narrow on `types` (the same discriminant `getExitCode` uses).
function problemsOf(analysis: CheckResult): Problem[] {
	return analysis.types ? analysis.problems : [];
}

// `resolutionKind`/`entrypoint` live only on the entrypoint-resolution problem subtypes.
function isEntrypointProblem(
	p: Problem,
): p is Extract<Problem, { resolutionKind: unknown; entrypoint: string }> {
	return 'resolutionKind' in p;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tarballPath = join(root, 'package.tgz');

const RESOLUTION_MODES = ['node16-cjs', 'node16-esm', 'bundler'] as const;
const ALL_RESOLUTION_KINDS = ['node10', 'node16-cjs', 'node16-esm', 'bundler'] as const;

// Root / flat-leaf / directory-index / deep-leaf — one of each shape.
const REPRESENTATIVE_SUBPATHS = ['.', './alias', './pg-core', './pg-core/columns/all'];

const BUILD_PACK_HINT =
	`Missing built/packed artifact. Run \`bun --bun run scripts/build.ts && npm run pack\` in drizzle-orm/ first.`;

// CI provisions the packed tarball for this shard, so a missing artifact there is a real
// misconfiguration — fail loudly rather than silently skip. Locally, skip the artifact-backed
// suites so `pnpm test` works without a prior build + pack.
const ARTIFACTS_PRESENT = existsSync(tarballPath);
if (!ARTIFACTS_PRESENT) {
	if (process.env['CI']) {
		throw new Error(
			`${BUILD_PACK_HINT} (artifact missing under CI — the orm test shard must provide the packed tarball)`,
		);
	}
	console.warn(`[exports-resolution] skipping artifact-backed suites — ${BUILD_PACK_HINT}`);
}

// Replicates scripts/build.ts: the glob is the single source of truth for both the
// exports keys and the directory-index shim set. The test re-derives instead of
// hardcoding so it tracks the generator.
function globEntryNames(extraSources: string[] = []): string[] {
	const sources = [...globSync('src/**/*.ts', { ignore: ['src/**/*.test.ts'] }), ...extraSources];
	return sources.map((raw) => raw.match(/src\/(.*)\.ts/)![1]!);
}

function entryToExportKey(entry: string): string {
	return entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
}

function intendedSubpaths(): string[] {
	const seen = new Set<string>();
	for (const entry of globEntryNames()) {
		seen.add(entryToExportKey(entry));
	}
	return [...seen];
}

// Enabling a single mode still leaves the other modes producing `NoResolution`
// problems, so a single-mode green check must ignore the inactive resolution kinds.
function exitCodeForMode(analysis: CheckResult, mode: (typeof RESOLUTION_MODES)[number]): number {
	const ignoreResolutions = ALL_RESOLUTION_KINDS.filter((k) => k !== mode);
	return getExitCode(analysis, { ignoreResolutions });
}

function modesFor(mode: (typeof RESOLUTION_MODES)[number]) {
	return { node10: false, 'node16-cjs': false, 'node16-esm': false, bundler: false, [mode]: true };
}

let pkg: Package;

beforeAll(() => {
	if (!ARTIFACTS_PRESENT) return;
	pkg = createPackageFromTarballData(new Uint8Array(readFileSync(tarballPath)));
});

describe.skipIf(!ARTIFACTS_PRESENT)('driven attw probe across entry shapes', () => {
	for (const mode of RESOLUTION_MODES) {
		test(`representative subpaths resolve cleanly under ${mode}`, async () => {
			const analysis = await checkPackage(pkg, { entrypoints: REPRESENTATIVE_SUBPATHS, modes: modesFor(mode) });
			const failing = problemsOf(analysis).filter((p) => isEntrypointProblem(p) && p.resolutionKind === mode);
			expect(failing, failing.map((p) => `${p.kind}@${isEntrypointProblem(p) ? p.entrypoint : '?'}`).join(', '))
				.toEqual([]);
			expect(exitCodeForMode(analysis, mode)).toBe(0);
		});
	}
});

describe.skipIf(!ARTIFACTS_PRESENT)('no public subpath is dropped', () => {
	// The full ~700-entrypoint sweep is the slow part of the suite; one mode is a
	// sufficient coverage gate (every subpath must have a resolution), and the
	// per-shape multi-mode behaviour is already covered by the representative probe.
	test('every glob-derived entrypoint resolves under node16-cjs', async () => {
		const mode = 'node16-cjs';
		const analysis = await checkPackage(pkg, { entrypoints: intendedSubpaths(), modes: modesFor(mode) });
		const unresolved = problemsOf(analysis)
			.filter((p): p is Extract<Problem, { kind: 'NoResolution' }> => p.kind === 'NoResolution')
			.filter((p) => p.resolutionKind === mode)
			.map((p) => p.entrypoint);
		expect(unresolved, `unresolved: ${unresolved.slice(0, 20).join(', ')}`).toEqual([]);
	}, 120_000);
});

// Two physically distinct installs of the package produce two declaration sites for
// every class. TypeScript compares classes carrying `private`/`protected` members
// nominally, so any such member surviving into the emitted `.d.ts` makes that type
// non-portable: a value from copy A is not assignable to the same type from copy B.
// This is the failure a consumer hits whenever a transitive dep, a pnpm peer split
// or a linked tarball puts two copies of drizzle-orm on disk.
//
// The matrix below is the current, measured state of the public surface. `portable:
// false` entries are known leaks, not aspirations -- each is annotated with the member
// responsible. Fixing one is expected to flip its flag here; that is the point of
// asserting both directions.
interface PortabilityProbe {
	/** Exported type name. */
	name: string;
	/** Package subpath it is exported from. */
	subpath: string;
	/** Type arguments, when the type has no usable defaults. */
	typeArgs?: string;
	/** Whether a value of this type survives crossing between two installs. */
	portable: boolean;
	/** For known leaks: the member whose nominality blocks assignment. */
	blockedBy?: string;
}

// With every nominal member stripped, the dialects come to rest on `EmptyFilter`, which
// is `Symbol.for('drizzle:EmptyFilter')`. `Symbol.for` returns the same symbol in every
// copy on disk, so the value is portable at runtime -- but the inferred `unique symbol`
// type is nominal per declaration site, so the types disagree with the runtime. Fixing
// it is an API decision, not a marker, and is left to its own change.
const DIALECT_BLOCKER = 'EmptyFilter (unique symbol)';

const PORTABILITY_MATRIX: PortabilityProbe[] = [
	{ name: 'SQL', subpath: 'sql/sql', portable: true },
	{ name: 'Column', subpath: 'column', portable: true },
	{ name: 'Table', subpath: 'table', portable: true },
	{ name: 'Subquery', subpath: 'subquery', portable: true },
	{ name: 'View', subpath: 'sql/sql', portable: true },
	{ name: 'Placeholder', subpath: 'sql/sql', portable: true },
	{ name: 'QueryPromise', subpath: 'query-promise', typeArgs: '<number>', portable: true },
	{ name: 'MySqlTable', subpath: 'mysql-core', portable: true },
	{ name: 'MySqlColumn', subpath: 'mysql-core', portable: true },
	{ name: 'SQLiteTable', subpath: 'sqlite-core', portable: true },
	{ name: 'SQLiteColumn', subpath: 'sqlite-core', portable: true },
	{ name: 'PgView', subpath: 'pg-core', portable: true },
	{ name: 'MySqlView', subpath: 'mysql-core', portable: true },
	{ name: 'SQLiteView', subpath: 'sqlite-core', portable: true },

	{ name: 'Param', subpath: 'sql/sql', portable: true },
	{ name: 'Name', subpath: 'sql/sql', portable: true },
	{ name: 'CodecsCollection', subpath: 'codecs', portable: true },
	{ name: 'PgDialect', subpath: 'pg-core', portable: false, blockedBy: DIALECT_BLOCKER },
	{ name: 'MySqlDialect', subpath: 'mysql-core', portable: false, blockedBy: DIALECT_BLOCKER },
	{ name: 'SQLiteDialect', subpath: 'sqlite-core', portable: false, blockedBy: DIALECT_BLOCKER },
	{ name: 'PgTable', subpath: 'pg-core', portable: true },
	{ name: 'PgColumn', subpath: 'pg-core', portable: true },
	// The database object outlasts every marker. With the nominal members gone it fails on
	// `BuildQueryResult<..., TConfig, ...>` -- a mapped type deferred on an unresolved type
	// parameter from `findMany<TConfig>`. The compiler cannot relate `keyof X` from one
	// declaration site to `keyof X` from the other while X stays deferred, so it widens to
	// `string | number | symbol` and fails. That is a TypeScript comparison limit rather
	// than anything drizzle emits, and no marker or contained type change reaches it.
	{
		name: 'NodePgDatabase',
		subpath: 'node-postgres/driver',
		typeArgs: '<Record<string, never>>',
		portable: false,
		blockedBy: 'BuildQueryResult (mapped type deferred on an unresolved type parameter)',
	},
];

// Unpacks the built tarball's declarations twice, under two different package names,
// so the compiler sees two independent installs of the same types.
function materializeTwoInstalls(outDir: string): void {
	const sourcePrefix = `/node_modules/${pkg.packageName}/`;
	for (const packageName of ['drizzle-a', 'drizzle-b']) {
		for (const file of pkg.listFiles(sourcePrefix)) {
			if (file !== `${sourcePrefix}package.json` && !file.endsWith('.d.ts')) continue;

			const destination = join(outDir, 'node_modules', packageName, file.slice(sourcePrefix.length));
			mkdirSync(dirname(destination), { recursive: true });
			const contents = pkg.readFile(file);
			writeFileSync(
				destination,
				file === `${sourcePrefix}package.json`
					? JSON.stringify({ ...JSON.parse(contents), name: packageName })
					: contents,
			);
		}
	}
}

describe.skipIf(!ARTIFACTS_PRESENT)('types are portable across package instances', () => {
	test('the published surface matches the recorded portability matrix', () => {
		const outDir = mkdtempSync(join(tmpdir(), 'drizzle-duplicate-types-'));
		try {
			materializeTwoInstalls(outDir);

			// One program covering every probe: each assignment gets its own line so a
			// diagnostic's line number identifies which type failed.
			const lines: string[] = [];
			const lineToName = new Map<number, string>();
			for (const { name, subpath } of PORTABILITY_MATRIX) {
				lines.push(`import type { ${name} as ${name}_A } from 'drizzle-a/${subpath}';`);
				lines.push(`import type { ${name} as ${name}_B } from 'drizzle-b/${subpath}';`);
			}
			for (const { name, typeArgs = '' } of PORTABILITY_MATRIX) {
				lines.push(`declare const v_${name}: ${name}_B${typeArgs};`);
				lineToName.set(lines.length + 1, name);
				lines.push(`export const c_${name}: ${name}_A${typeArgs} = v_${name};`);
			}

			const entrypoint = join(outDir, 'index.mts');
			writeFileSync(entrypoint, lines.join('\n') + '\n');

			const program = ts.createProgram({
				rootNames: [entrypoint],
				options: {
					module: ts.ModuleKind.NodeNext,
					moduleResolution: ts.ModuleResolutionKind.NodeNext,
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: ts.ScriptTarget.ESNext,
				},
			});

			const failed = new Map<string, string>();
			const unattributed: string[] = [];
			for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
				const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
				if (!diagnostic.file || diagnostic.start === undefined) {
					unattributed.push(message);
					continue;
				}
				const line = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
				const name = lineToName.get(line);
				// A diagnostic on a non-assignment line means the probe itself is malformed
				// (bad subpath, wrong type arity) rather than a portability result.
				if (name === undefined) {
					unattributed.push(`line ${line}: ${message}`);
					continue;
				}
				if (!failed.has(name)) failed.set(name, message);
			}

			expect(unattributed, `malformed probes:\n${unattributed.join('\n')}`).toEqual([]);

			const actual = PORTABILITY_MATRIX.filter((p) => !failed.has(p.name)).map((p) => p.name).sort();
			const expected = PORTABILITY_MATRIX.filter((p) => p.portable).map((p) => p.name).sort();

			const regressed = expected.filter((n) => !actual.includes(n));
			const fixed = actual.filter((n) => !expected.includes(n));
			const hint = [
				...regressed.map((n) => `REGRESSED ${n} is no longer portable: ${failed.get(n)}`),
				...fixed.map((n) => `FIXED ${n} is now portable -- set portable: true in PORTABILITY_MATRIX`),
			].join('\n');

			expect(actual, hint).toEqual(expected);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});

describe('directory-index shim emitter refuses to shadow a source artifact', () => {
	test('throws a path-named error on a synthetic collision', async () => {
		const outDir = mkdtempSync(join(tmpdir(), 'shim-guard-'));
		try {
			mkdirSync(join(outDir, 'zz-dir'));
			writeFileSync(join(outDir, 'zz-dir', 'index.js'), 'export const real = 1;');
			// A real source-emitted artifact already occupies the shim target path.
			writeFileSync(join(outDir, 'zz-dir.js'), 'export const sourceEmitted = 1;');

			await expect(emitDirIndexShims(['src/zz-dir/index.ts'], outDir))
				.rejects.toThrow(/refusing to overwrite source-emitted artifact:[\s\S]*zz-dir\.js/);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});
