import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';

/**
 * Regression tests for https://github.com/drizzle-team/drizzle-orm/issues/6156
 *
 * ESM `import()` ignores `NODE_PATH` and resolves bare specifiers only through
 * the standard node_modules lookup. drizzle-kit's package probes in
 * `src/cli/utils.ts` relied on it alone, so a correctly installed `drizzle-orm`
 * that is only reachable through a non-standard node_modules layout was
 * reported as "Please install latest version of drizzle-orm".
 *
 * `NODE_PATH` is read into `module.globalPaths` once at process startup, so the
 * probes have to be exercised in a child process to test this faithfully.
 */

// spawn tsx's JS entry through node directly - the `.bin` shim is not
// executable via execFile on Windows
const tsxCli = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
const utilsModule = resolve(__dirname, '../src/cli/utils.ts').split('\\').join('/');

let workdir: string;

/** A package that exists on disk but is not inside the project's node_modules. */
const writeFixturePackage = (dir: string, name: string) => {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({
			name,
			version: '1.0.0',
			type: 'module',
			exports: { './version': './version.js' },
		}),
	);
	writeFileSync(join(dir, 'version.js'), `export const npmVersion = '1.2.3';\n`);
};

/**
 * Runs the real `importPackage`/`checkPackage` probes from `src/cli/utils.ts` in
 * a child process, so `NODE_PATH` is picked up, and reports how a plain
 * `import()` fares against them for the same specifier.
 */
const probe = (specifier: string, env: NodeJS.ProcessEnv) => {
	const script = join(workdir, 'probe.ts');
	writeFileSync(
		script,
		`import { checkPackage, importPackage } from ${JSON.stringify(utilsModule)};

async function main() {
	const specifier = ${JSON.stringify(specifier)};
	const plainImport = await import(specifier).then(() => true).catch(() => false);
	const viaProbe = await checkPackage(specifier);
	const mod = viaProbe ? await importPackage(specifier) : undefined;
	console.log(JSON.stringify({ plainImport, viaProbe, npmVersion: mod?.npmVersion ?? null }));
}

main();
`,
	);

	const stdout = execFileSync(process.execPath, [tsxCli, script], {
		cwd: workdir,
		env: { ...process.env, ...env },
		encoding: 'utf8',
	});

	return JSON.parse(stdout.trim().split('\n').at(-1)!) as {
		plainImport: boolean;
		viaProbe: boolean;
		npmVersion: string | null;
	};
};

beforeAll(() => {
	workdir = mkdtempSync(join(tmpdir(), 'dk-resolution-'));
});

afterAll(() => {
	rmSync(workdir, { recursive: true, force: true });
});

test('resolves a package reachable only through NODE_PATH', () => {
	const store = join(workdir, 'global-store');
	writeFixturePackage(join(store, 'node-path-pkg'), 'node-path-pkg');

	const result = probe('node-path-pkg/version', { NODE_PATH: store });

	// plain `import()` cannot see it - this is the bug being guarded against
	expect(result.plainImport).toBe(false);
	// the require-based fallback resolves it, and the module really loads
	expect(result.viaProbe).toBe(true);
	expect(result.npmVersion).toBe('1.2.3');
});

test('resolves a package symlinked into node_modules from outside the project', () => {
	const projectRoot = join(workdir, 'symlink-project');
	const external = join(workdir, 'outside', 'symlinked-pkg');
	writeFixturePackage(external, 'symlinked-pkg');

	const nodeModules = join(projectRoot, 'node_modules');
	mkdirSync(nodeModules, { recursive: true });
	symlinkSync(external, join(nodeModules, 'symlinked-pkg'), 'junction');

	const result = probe('symlinked-pkg/version', { NODE_PATH: join(workdir, 'outside') });

	expect(result.viaProbe).toBe(true);
	expect(result.npmVersion).toBe('1.2.3');
});

test('reports a genuinely missing package as missing', () => {
	// no NODE_PATH, nothing on disk - neither strategy must produce a false positive
	const result = probe('definitely-not-installed-pkg/version', {});

	expect(result.plainImport).toBe(false);
	expect(result.viaProbe).toBe(false);
	expect(result.npmVersion).toBe(null);
});
