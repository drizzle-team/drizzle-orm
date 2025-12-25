#!/usr/bin/env bun
import { $ } from 'bun';
import cpy from 'cpy';
import { globSync } from 'glob';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { build as tsdown } from 'tsdown';

const entries = globSync('src/**/*.ts', { ignore: ['src/**/*.test.ts'] });

async function updateAndCopyPackageJson() {
	const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));

	pkg.exports = entries.reduce<
		Record<string, {
			import: {
				types?: string;
				default: string;
			};
			require: {
				types: string;
				default: string;
			};
			default: string;
			types: string;
		}>
	>(
		(acc, rawEntry) => {
			const entry = rawEntry.match(/src\/(.*)\.ts/)![1]!;
			const exportsEntry = entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
			const importEntry = `./${entry}.js`;
			const requireEntry = `./${entry}.cjs`;
			acc[exportsEntry] = {
				import: {
					types: `./${entry}.d.ts`,
					default: importEntry,
				},
				require: {
					types: `./${entry}.d.cts`,
					default: requireEntry,
				},
				types: `./${entry}.d.ts`,
				default: importEntry,
			};
			return acc;
		},
		{},
	);

	await fs.writeFile('dist.new/package.json', JSON.stringify(pkg, null, 2));
}

async function buildJS() {
	// Use tsdown with unbundle mode for transpile-only
	// External: all dependencies (nothing should be bundled)
	await tsdown({
		entry: entries,
		outDir: './dist.new',
		format: ['cjs', 'es'],
		unbundle: true,
		platform: 'node',
		external: [/^[^./]/],
		tsconfig: 'tsconfig.json',
		sourcemap: true,
		dts: false,
		clean: false,
		silent: true,
		alias: {
			'~': './src',
		},
		outExtensions: (ctx) => {
			if (ctx.format === 'cjs') {
				return { js: '.cjs' };
			}
			return { js: '.js' };
		},
	});

	console.log(`  Built ${entries.length} JS files (ESM + CJS)`);
}

async function buildDeclarations() {
	// Use tsc for declaration generation (fast and reliable)
	await $`tsc -p tsconfig.dts.json`.quiet();

	// Copy .d.ts files and also create .d.cts copies
	await cpy('dist-dts/**/*.d.ts', 'dist.new', {
		rename: (basename) => basename.replace(/\.d\.ts$/, '.d.cts'),
	});
	await cpy('dist-dts/**/*.d.ts', 'dist.new');

	console.log('  Built declaration files (.d.ts + .d.cts)');
}

async function fixImports() {
	// Fix CJS imports to use .cjs extension
	await $`bun scripts/fix-imports.ts`.quiet();
	console.log('  Fixed import extensions');
}

async function fixVersionDeclarations() {
	// The version.ts file imports from '../package.json' which doesn't work in dist
	// We need to fix the declaration files to inline the version export
	const versionDts = `export declare const npmVersion: string;
export declare const compatibilityVersion = 12;
`;
	await fs.writeFile('dist.new/version.d.ts', versionDts);
	await fs.writeFile('dist.new/version.d.cts', versionDts);

	// Also create the virtual package module declarations that rolldown creates
	mkdirSync('dist.new/drizzle-orm', { recursive: true });
	const packageDts = `export declare const version: string;
`;
	await fs.writeFile('dist.new/drizzle-orm/package.d.ts', packageDts);
	await fs.writeFile('dist.new/drizzle-orm/package.d.cts', packageDts);
}

async function main() {
	const startTime = Date.now();

	// Run prisma generate first
	await $`pnpm p`.quiet();

	rmSync('dist.new', { recursive: true, force: true });
	mkdirSync('dist.new', { recursive: true });

	// Build JS and declarations in parallel
	await Promise.all([
		buildJS(),
		buildDeclarations(),
	]);

	// Fix imports after both builds complete
	await fixImports();

	// Fix version declarations (version.ts imports from package.json which needs special handling)
	await fixVersionDeclarations();

	// Copy README and update package.json
	await Promise.all([
		fs.copyFile('../README.md', 'dist.new/README.md'),
		updateAndCopyPackageJson(),
	]);

	// Swap dist folders
	rmSync('dist', { recursive: true, force: true });
	renameSync('dist.new', 'dist');

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`Build completed successfully in ${elapsed}s`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
