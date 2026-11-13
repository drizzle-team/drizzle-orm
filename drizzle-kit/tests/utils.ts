export const measure = <T>(prom: Promise<T>, label: string): Promise<T> => {
	return new Promise<T>(async (res, rej) => { // oxlint-disable-line no-async-promise-executor
		console.time(label);
		try {
			const result = await prom;
			console.timeEnd(label);
			res(result);
		} catch (e) {
			console.timeEnd(label);
			rej(e);
		}
	});
};

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

/**
 * Generated code that type-checked once type-checks again while nothing it depends on changes: a check costs 15–50 ms
 * of CPU, the suites run a couple of thousand per CI run, and nearly all are on code they have checked before. The
 * key names the content and everything the result depends on: the TypeScript version, the compiler options, the
 * committed trees of the packages the generated code imports (drizzle-orm, with the bundled Postgres client) and the
 * lockfile. A change to any of them re-checks everything; uncommitted changes to them turn the cache off, as does
 * KIT_TYPE_CHECK_CACHE=0. It lives in the CI cache folder every self-hosted runner mounts when there is one,
 * otherwise in the user's cache dir.
 */
const typeCheckCache = (() => {
	const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	let dependencies: string | undefined;
	try {
		if (
			process.env['KIT_TYPE_CHECK_CACHE'] !== '0'
			&& git('status', '--porcelain', '--', 'drizzle-orm', 'postgres', 'pnpm-lock.yaml') === ''
		) {
			dependencies = git('rev-parse', 'HEAD:drizzle-orm', 'HEAD:postgres', 'HEAD:pnpm-lock.yaml');
		}
	} catch {
		// not a git checkout: no cache
	}
	if (dependencies === undefined) return null;
	const ciCache = join(homedir(), '.cache', 'drizzle-ci');
	const dir = join(existsSync(ciCache) ? ciCache : join(homedir(), '.cache', 'drizzle-kit-tests'), 'type-checks');
	return {
		pathFor: (content: string, options: ts.CompilerOptions) =>
			join(
				dir,
				createHash('sha256').update(JSON.stringify([ts.version, options, dependencies, content])).digest('hex'),
			),
		store: (path: string) => {
			mkdirSync(dir, { recursive: true });
			writeFileSync(path, '');
		},
	};
})();

const options = {
	noEmit: true,
	skipLibCheck: true,
	target: ts.ScriptTarget.ES2020,
	// The generated relations import the schema without a file extension, which NodeNext rejects in an ESM package.
	module: ts.ModuleKind.Preserve,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	// typescript@6 no longer auto-includes `@types/*`
	types: ['node'],
};

type VFile = { text: string; version: number };

export function makeTSC2(options: ts.CompilerOptions, fileName = 'temp.ts') {
	const files = new Map<string, VFile>();
	const sys = ts.sys; // fall back to real FS for libs, node_modules, etc.

	const ensure = (fn: string) => {
		if (!files.has(fn)) files.set(fn, { text: '', version: 0 });
		return files.get(fn)!;
	};
	ensure(fileName);

	const host: ts.LanguageServiceHost = {
		getCompilationSettings: () => options,
		getScriptFileNames: () => Array.from(files.keys()),
		getScriptVersion: (fn) => (files.get(fn)?.version ?? 0).toString(),
		getScriptSnapshot: (fn) => {
			const mem = files.get(fn);
			if (mem) return ts.ScriptSnapshot.fromString(mem.text);
			// Defer to real FS for everything else
			if (sys.fileExists(fn)) return ts.ScriptSnapshot.fromString(sys.readFile(fn)!);
			return;
		},
		getCurrentDirectory: () => sys.getCurrentDirectory(),
		getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
		fileExists: sys.fileExists,
		readFile: sys.readFile,
		readDirectory: sys.readDirectory,
		directoryExists: sys.directoryExists?.bind(sys),
		getDirectories: sys.getDirectories?.bind(sys),
		useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames,
	};

	const registry = ts.createDocumentRegistry();
	const service = ts.createLanguageService(host, registry);

	const formatHost: ts.FormatDiagnosticsHost = {
		getCurrentDirectory: host.getCurrentDirectory,
		getCanonicalFileName: (f) => host.useCaseSensitiveFileNames?.() ? f : f.toLowerCase(),
		getNewLine: () => sys.newLine,
	};

	async function tsc2(content: string, fn: string = fileName): Promise<void> {
		const verified = typeCheckCache?.pathFor(content, options);
		if (verified && existsSync(verified)) return;

		const f = ensure(fn);
		f.text = content;
		f.version++;

		// Ask LS for diagnostics (incremental & fast)
		const syntactic = service.getSyntacticDiagnostics(fn);
		const semantic = service.getSemanticDiagnostics(fn);
		const optionsDiag = service.getCompilerOptionsDiagnostics();

		const diags = [...optionsDiag, ...syntactic, ...semantic];
		if (diags.length) {
			const message = ts.formatDiagnostics(diags, formatHost);
			console.log(content);
			console.log();
			console.error(message);
			throw new Error(message);
		}
		if (verified) typeCheckCache!.store(verified);
	}

	return { tsc2, service, update: tsc2 };
}

export const tsc = makeTSC2(options).tsc2;

// export const tsc = async (path: string) => {
// 	const typeCheckResult =
// 		await $`bun tsc --noEmit --skipLibCheck --target ES2020 --module NodeNext --moduleResolution NodeNext ${path}`
// 			// .quiet()
// 			.nothrow();
// 	if (typeCheckResult.exitCode !== 0) {
// 		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
// 	}
// };

export const needToPostpone = Date.now() < +new Date('2026-11-20');
