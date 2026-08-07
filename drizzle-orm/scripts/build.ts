#!/usr/bin/env bun
import { $ } from 'bun';
import { globSync } from 'glob';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { build as tsdown } from 'tsdown';
import { emitDirIndexShims } from './emit-dir-index-shims.ts';

const entries = globSync('src/**/*.ts', { ignore: ['src/**/*.test.ts'] });

async function copyPackageJson() {
	// The published `exports` map is static (root + `"./*"` wildcard) and lives in package.json
	// directly; this just carries it into the dist that gets packed. The wildcard's directory-index
	// shims are the only dynamic piece — see emitDirIndexShims.
	const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
	await fs.writeFile('dist.new/package.json', JSON.stringify(pkg, null, 2));
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
		copyPackageJson(),
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
