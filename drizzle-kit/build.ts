/// <reference types="bun-types" />
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import * as tsup from 'tsup';
import pkg from './package.json';

const dev = process.argv.includes('--dev');

const driversPackages = [
	// postgres drivers
	'pg',
	'postgres',
	'@vercel/postgres',
	'@neondatabase/serverless',
	'@electric-sql/pglite',
	//  mysql drivers
	'mysql2',
	'@planetscale/database',
	// sqlite drivers
	'@libsql/client',
	'better-sqlite3',
	'bun:sqlite',
];

// Externals for shipped artifacts: only packages the consumer must provide
// themselves. package.json dependencies (tsx, brocli, esbuild) are
// externalized by tsup automatically.
const coreExternals = ['drizzle-orm', ...driversPackages];

// Local artifacts additionally externalize the devDependencies that the CLI
// imports at runtime (they are not installed for consumers, but a local
// build runs from this repo's node_modules).
const localCliExternals = ['commander', 'json-diff', 'glob', ...coreExternals];

const dualOut = (ctx: { format: string }): { dts?: string; js: string } =>
	ctx.format === 'cjs'
		? { dts: '.d.ts', js: '.js' }
		: { dts: '.d.mts', js: '.mjs' };

const run = async () => {
	if (dev) {
		// Dev CLI with the loader.mjs banner — a local-only artifact.
		await tsup.build({
			entry: { index: './src/cli/index.ts' },
			outDir: './dist',
			format: ['cjs'],
			external: localCliExternals,
			banner: { js: `#!/usr/bin/env -S node --loader ./dist/loader.mjs --no-warnings` },
			splitting: false,
			dts: false,
			outExtension: () => ({ js: '.cjs' }),
		});
		cpSync('./src/loader.mjs', 'dist/loader.mjs');
		return;
	}

	// CLI entry: same tsup setup as the library builds — package.json
	// dependencies (tsx, brocli, esbuild) are externalized automatically,
	// only the non-dependency externals are listed explicitly below.
	await tsup.build({
		entry: { bin: './src/cli/index.ts' },
		outDir: './dist',
		external: coreExternals,
		splitting: false,
		dts: false,
		format: ['cjs'],
		outExtension: () => ({ js: '.cjs' }),
		banner: { js: '#!/usr/bin/env node' },
		define: {
			'process.env.DRIZZLE_KIT_VERSION': JSON.stringify(pkg.version),
		},
	});
	await tsup.build({
		entry: ['./src/index.ts'],
		outDir: './dist',
		external: coreExternals,
		splitting: false,
		dts: true,
		format: ['cjs', 'esm'],
		outExtension: dualOut,
	});

	await tsup.build({
		entry: ['./src/api.ts'],
		outDir: './dist',
		external: coreExternals,
		splitting: false,
		dts: true,
		format: ['cjs', 'esm'],
		banner: (ctx) => {
			/**
			 * fix dynamic require in ESM ("glob" -> "fs.realpath" requires 'fs' module)
			 * @link https://github.com/drizzle-team/drizzle-orm/issues/2853
			 */
			if (ctx.format === 'esm') {
				return {
					js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
				};
			}
			return undefined;
		},
		outExtension: dualOut,
	});

	// Rewrite api.ts's dynamic imports (lazy loads and runtime-path probes,
	// which tsup leaves verbatim in the CJS artifact) to require(): dist/api.js
	// then uses a single module-loading mechanism — the CJS counterpart of the
	// ESM banner above. Text-level by design; if tsup's output format changes,
	// the pattern stops matching silently (symptom: leftover `await import(`
	// in dist/api.js).
	const apiCjs = readFileSync('./dist/api.js', 'utf8').replace(/await import\(/g, 'require(');
	writeFileSync('./dist/api.js', apiCjs);
};

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
