import type { Package } from '../../createPackage.ts';
import { getCjsModuleBindings } from './cjsBindings.ts';
import { cjsResolve } from './resolve.ts';

export function getCjsModuleNamespace(fs: Package, file: URL, seen = new Set<string>()): Set<string> {
	seen.add(file.pathname);
	const exports = new Set<string>();
	const bindings = getCjsModuleBindings(fs.readFile(file.pathname));
	for (const name of bindings.exports) exports.add(name);

	// CJS always exports `default`
	if (!exports.has('default')) {
		exports.add('default');
	}

	// Additionally, resolve facade reexports

	for (const source of bindings.reexports.reverse()) {
		try {
			const { format, url } = cjsResolve(fs, source, file);
			if (format === 'commonjs' && !seen.has(url.pathname)) {
				const reexported = getCjsModuleNamespace(fs, url, seen);
				for (const name of reexported) exports.add(name);
			}
		} catch {}
	}

	return exports;
}
