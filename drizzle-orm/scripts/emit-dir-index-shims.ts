import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';

async function moduleHasDefaultExport(modulePath: string): Promise<boolean> {
	if (!existsSync(modulePath)) return false;
	const src = await fs.readFile(modulePath, 'utf8');
	return /(^|\n)\s*export\s+default\b/.test(src) || /(^|\n)\s*export\s*\{[^}]*\bdefault\b[^}]*\}/.test(src);
}

export async function emitDirIndexShims(entries: string[], outDir: string) {
	const dirIndex = entries
		.map((raw) => raw.match(/src\/(.*)\.ts/)![1]!)
		.filter((e) => e.endsWith('/index') && e !== 'index')
		.map((e) => e.replace(/\/index$/, ''));

	for (const x of dirIndex) {
		const target = `${outDir}/${x}.js`;
		// A real tsdown-emitted artifact already at this path means a sibling leaf
		// src/${x}.ts collides with src/${x}/index.ts; shadowing it would ship a
		// broken or wrong subpath, so fail the build loudly instead.
		if (existsSync(target)) {
			throw new Error(
				`refusing to overwrite source-emitted artifact: ${target} with a directory-index shim — `
					+ `src/${x}.ts collides with src/${x}/index.ts. Resolve the collision at the source.`,
			);
		}

		// The shim sits beside the `x` directory (dist/<x>.js next to dist/<x>/), so its
		// re-export target is relative to the shim's OWN dir — use the basename, not the full
		// nested path, or a nested shim like dist/pg-core/async.js points at the nonexistent
		// dist/pg-core/pg-core/async/index.js.
		const baseName = x.slice(x.lastIndexOf('/') + 1);
		const hasDefault = await moduleHasDefaultExport(`${outDir}/${x}/index.js`);
		const dflt = hasDefault ? `\nexport { default } from './${baseName}/index.js';` : '';

		// Build the require() argument indirectly: a literal `require('…')` in this
		// emitter's own source gets picked up by CommonJS-interop scanners (e.g. the
		// importing test's bundler) that try to resolve it as a real dependency. The
		// emitted shim text is unchanged.
		const cjsArg = `'./${baseName}/index.cjs'`;
		await fs.writeFile(target, `export * from './${baseName}/index.js';${dflt}`);
		await fs.writeFile(`${outDir}/${x}.cjs`, `module.exports = require(${cjsArg});`);
		await fs.writeFile(`${outDir}/${x}.d.ts`, `export * from './${baseName}/index.js';${dflt}`);
		await fs.writeFile(`${outDir}/${x}.d.cts`, `export * from './${baseName}/index.cjs';`);
	}
}
