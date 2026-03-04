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

import { Table } from 'drizzle-orm';
import * as ts from 'typescript';

const options = {
	noEmit: true,
	skipLibCheck: true,
	target: ts.ScriptTarget.ES2020,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
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
