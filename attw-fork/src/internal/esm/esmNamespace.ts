import type { Package } from '../../createPackage.ts';
import { getCjsModuleNamespace } from './cjsNamespace.ts';
import { getEsmModuleBindings } from './esmBindings.ts';
import { esmResolve } from './resolve.ts';

// Note: this doesn't handle ambiguous indirect exports which probably isn't worth the
// implementation complexity.

export function getEsmModuleNamespace(
	fs: Package,
	specifier: string,
	parentURL = new URL('file:///'),
	seen = new Set<string>(),
): string[] {
	// Resolve specifier
	const { format, url } = esmResolve(fs, specifier, parentURL);

	// Don't recurse for circular indirect exports
	if (seen.has(url.pathname)) {
		return [];
	}
	seen.add(url.pathname);

	if (format === 'commonjs') {
		return [...getCjsModuleNamespace(fs, url)];
	}

	// Parse module bindings
	const bindings = (format ?? 'module') === 'module'
		? getEsmModuleBindings(fs.readFile(url.pathname))
		// Maybe JSON, WASM, etc
		: { exports: ['default'], reexports: [] };

	// Concat indirect exports
	const indirect = bindings.reexports
		.flatMap((specifier) => getEsmModuleNamespace(fs, specifier, url, seen))
		.filter((name) => name !== 'default');
	return [...new Set([...bindings.exports, ...indirect])];
}
