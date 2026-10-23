#!/usr/bin/env bun
import { $ } from 'bun';
import { globSync } from 'glob';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { build as tsdown } from 'tsdown';
import { emitDirIndexShims } from './emit-dir-index-shims.ts';

// `--dual` adds the CommonJS output (`.cjs`, `.d.cts`) and source maps next to the ESM output.
const dual = process.argv.includes('--dual');
const entries = globSync('src/**/*.ts', { ignore: ['src/**/*.test.ts'] });

async function writeManifest() {
	// `--dual` swaps in the `import`/`require` exports.
	const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
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
	await fs.writeFile('dist.new/package.json', JSON.stringify(pkg, null, 2));
}

async function main() {
	const startTime = Date.now();

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
