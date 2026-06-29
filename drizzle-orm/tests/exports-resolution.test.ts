import { globSync } from 'glob';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
