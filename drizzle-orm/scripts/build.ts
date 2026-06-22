#!/usr/bin/env bun
import { $ } from 'bun';
import { globSync } from 'glob';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { build as tsdown } from 'tsdown';

const entries = globSync('src/**/*.ts', { ignore: ['src/**/*.test.ts'] });

async function updateAndCopyPackageJson() {
	const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));

	pkg.exports = {
		'.': {
			import: { types: './index.d.ts', default: './index.js' },
			require: { types: './index.d.cts', default: './index.cjs' },
		},
		'./*': {
			import: { types: './*.d.ts', default: './*.js' },
			require: { types: './*.d.cts', default: './*.cjs' },
		},
	};

	await fs.writeFile('dist.new/package.json', JSON.stringify(pkg, null, 2));
}

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

		await fs.writeFile(target, `export * from './${baseName}/index.js';${dflt}`);
		await fs.writeFile(`${outDir}/${x}.cjs`, `module.exports = require('./${baseName}/index.cjs');`);
		await fs.writeFile(`${outDir}/${x}.d.ts`, `export * from './${baseName}/index.js';${dflt}`);
		await fs.writeFile(`${outDir}/${x}.d.cts`, `export * from './${baseName}/index.cjs';`);
	}
}

async function main() {
	const startTime = Date.now();

	rmSync('dist.new', { recursive: true, force: true });
	mkdirSync('dist.new', { recursive: true });

	await tsdown({
		entry: entries,
		outDir: './dist.new',
		format: ['cjs', 'es'],
		unbundle: true,
		platform: 'node',
		external: [/^[^./]/], // everything?
		tsconfig: 'tsconfig.json',
		sourcemap: true,
		dts: true,
		clean: false,
		alias: {
			'~': './src',
		},
		outExtensions: (ctx) => {
			if (ctx.format === 'cjs') {
				return { js: '.cjs', dts: '.d.cts' };
			}
			return { js: '.js', dts: '.d.ts' };
		},
	});

	await $`bun scripts/fix-imports.ts`.quiet();
	await Promise.all([
		fs.copyFile('../README.md', 'dist.new/README.md'),
		updateAndCopyPackageJson(),
	]);
	await emitDirIndexShims(entries, 'dist.new');

	rmSync('dist', { recursive: true, force: true });
	renameSync('dist.new', 'dist');

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`Build complete ${elapsed}s`);
}

if (import.meta.main) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	}).then(() => process.exit(0));
}
