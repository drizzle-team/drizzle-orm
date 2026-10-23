#!/usr/bin/env bun
import { $ } from 'bun';
import { globSync } from 'glob';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { build as tsdown } from 'tsdown';
import { emitDirIndexShims } from './emit-dir-index-shims.ts';

// `--dual` adds the CommonJS output (`.cjs`, `.d.cts`) and source maps next to the ESM output.
const dual = process.argv.includes('--dual');
const entries = globSync('src/**/*.ts', { ignore: ['src/**/*.test.ts'] });
const minipgDir = '../minipg';

async function writeManifest() {
	// `--dual` swaps in the `import`/`require` exports. The `#minipg` imports and the `./minipg` exports
	// are built from minipg's `exports`.
	const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
	const minipg = JSON.parse(await fs.readFile(`${minipgDir}/package.json`, 'utf8'));
	// `npm pack` keeps `workspace:` ranges, and they do not resolve outside this monorepo.
	pkg.devDependencies = Object.fromEntries(
		Object.entries<string>(pkg.devDependencies).filter(([, range]) => !range.startsWith('workspace:')),
	);
	if (dual) {
		delete pkg.engines;
		pkg.main = './index.cjs';
		pkg.module = './index.js';
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
	}

	// Each entry keeps minipg's own conditions, so the runtime picks minipg's transport when it loads the ORM.
	const minipgEntries = Object.entries<Record<string, string>>(minipg.exports).map(([subpath, conditions]) =>
		[
			subpath.slice(1),
			Object.fromEntries(
				Object.entries(conditions).map(([condition, target]) => [condition, target.replace('./', './minipg/')]),
			),
		] as const
	);
	pkg.imports = Object.fromEntries(minipgEntries.map(([subpath, conditions]) => [`#minipg${subpath}`, conditions]));
	const { '.': root, ...rest } = pkg.exports;
	pkg.exports = {
		'.': root,
		...Object.fromEntries(minipgEntries.map(([subpath, conditions]) => [`./minipg${subpath}`, conditions])),
		// Without this entry, the `"./*"` wildcard maps it to `./minipg/package.json.js`.
		'./minipg/package.json': './minipg/package.json',
		...rest,
	};

	await fs.writeFile('dist.new/package.json', JSON.stringify(pkg, null, 2));
}

async function copyMinipg() {
	await fs.cp(`${minipgDir}/dist`, 'dist.new/minipg/dist', { recursive: true });
	await fs.copyFile(`${minipgDir}/package.json`, 'dist.new/minipg/package.json');
}

async function main() {
	const startTime = Date.now();

	if (!existsSync(`${minipgDir}/dist`)) {
		throw new Error('minipg is not built. Run `pnpm --filter @drizzle-team/minipg build`, then build the ORM again.');
	}

	rmSync('dist.new', { recursive: true, force: true });
	mkdirSync('dist.new', { recursive: true });

	await tsdown({
		entry: entries,
		outDir: './dist.new',
		format: dual ? ['cjs', 'es'] : ['es'],
		unbundle: true,
		platform: 'node',
		external: [/^[^./]/], // everything?
		tsconfig: 'tsconfig.json',
		sourcemap: dual,
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

	await $`bun scripts/fix-imports.ts ${dual ? ['--dual'] : []}`.quiet();
	await Promise.all([
		fs.copyFile('../README.md', 'dist.new/README.md'),
		writeManifest(),
		copyMinipg(),
	]);
	await emitDirIndexShims(entries, 'dist.new', dual);

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
