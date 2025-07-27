/// <reference types="bun-types" />
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import * as tsup from 'tsup';
import pkg from './package.json';

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
	// duckdb drivers
	'duckdb',
	'@duckdb/node-api',
];

esbuild.buildSync({
	entryPoints: ['./src/cli/index.ts'],
	bundle: true,
	outfile: 'dist/bin.cjs',
	format: 'cjs',
	target: 'node16',
	platform: 'node',
	define: {
		'process.env.DRIZZLE_KIT_VERSION': `"${pkg.version}"`,
	},
	external: [
		'esbuild',
		'drizzle-orm',
		...driversPackages,
	],
	banner: {
		js: `#!/usr/bin/env node`,
	},
});

const main = async () => {
	await tsup.build({
		entryPoints: ['./src/index.ts'],
		outDir: './dist',
		external: driversPackages,
		splitting: false,
		dts: true,
		format: ['cjs', 'esm'],
		outExtension: (ctx) => {
			if (ctx.format === 'cjs') {
				return {
					dts: '.d.ts',
					js: '.js',
				};
			}
			return {
				dts: '.d.mts',
				js: '.mjs',
			};
		},
	});

	await tsup.build({
		entryPoints: ['./src/ext/api-postgres.ts'],
		outDir: './dist',
		external: driversPackages,
		splitting: false,
		dts: true,
		format: ['cjs', 'esm'],
		outExtension: (ctx) => {
			if (ctx.format === 'cjs') {
				return {
					dts: '.d.ts',
					js: '.js',
				};
			}
			return {
				dts: '.d.mts',
				js: '.mjs',
			};
		},
	});

	const apiCjs = readFileSync('./dist/api-postgres.js', 'utf8').replace(/await import\(/g, 'require(');
	writeFileSync('./dist/api-postgres.js', apiCjs);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
