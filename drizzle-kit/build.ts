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
	'@sqlitecloud/drivers',
	'@tursodatabase/database',
	'bun',
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
		entryPoints: ['./src/ext/api-postgres.ts', './src/ext/api-mysql.ts', './src/ext/api-sqlite.ts'],
		outDir: './dist',
		external: [
			'esbuild',
			'drizzle-orm',
			...driversPackages,
		],
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
			return;
		},
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

	writeFileSync(
		'./dist/api-postgres.js',
		readFileSync('./dist/api-postgres.js', 'utf8').replace(/await import\(/g, 'require('),
	);

	// await tsup.build({
	// 	entryPoints: [],
	// 	outDir: './dist',
	// 	external: ['bun:sqlite'],
	// 	splitting: false,
	// 	dts: true,
	// 	format: ['cjs', 'esm'],
	// 	banner: (ctx) => {
	// 		/**
	// 		 * fix dynamic require in ESM ("glob" -> "fs.realpath" requires 'fs' module)
	// 		 * @link https://github.com/drizzle-team/drizzle-orm/issues/2853
	// 		 */
	// 		if (ctx.format === 'esm') {
	// 			return {
	// 				js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
	// 			};
	// 		}
	// 		return;
	// 	},
	// 	outExtension: (ctx) => {
	// 		if (ctx.format === 'cjs') {
	// 			return {
	// 				dts: '.d.ts',
	// 				js: '.js',
	// 			};
	// 		}
	// 		return {
	// 			dts: '.d.mts',
	// 			js: '.mjs',
	// 		};
	// 	},
	// });

	writeFileSync(
		'./dist/api-mysql.js',
		readFileSync('./dist/api-mysql.js', 'utf8').replace(/await import\(/g, 'require('),
	);

	// await tsup.build({
	// 	entryPoints: [],
	// 	outDir: './dist',
	// 	external: ['bun:sqlite'],
	// 	splitting: false,
	// 	dts: true,
	// 	format: ['cjs', 'esm'],
	// 	banner: (ctx) => {
	// 		/**
	// 		 * fix dynamic require in ESM ("glob" -> "fs.realpath" requires 'fs' module)
	// 		 * @link https://github.com/drizzle-team/drizzle-orm/issues/2853
	// 		 */
	// 		if (ctx.format === 'esm') {
	// 			return {
	// 				js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
	// 			};
	// 		}
	// 		return;
	// 	},
	// 	outExtension: (ctx) => {
	// 		if (ctx.format === 'cjs') {
	// 			return {
	// 				dts: '.d.ts',
	// 				js: '.js',
	// 			};
	// 		}
	// 		return {
	// 			dts: '.d.mts',
	// 			js: '.mjs',
	// 		};
	// 	},
	// });

	writeFileSync(
		'./dist/api-sqlite.js',
		readFileSync('./dist/api-sqlite.js', 'utf8').replace(/await import\(/g, 'require('),
	);

	// await tsup.build({
	// 	entryPoints: ['./src/ext/api-singlestore.ts'],
	// 	outDir: './dist',
	// 	external: ['bun:sqlite'],
	// 	splitting: false,
	// 	dts: true,
	// 	format: ['cjs', 'esm'],
	// 	banner: (ctx) => {
	// 		/**
	// 		 * fix dynamic require in ESM ("glob" -> "fs.realpath" requires 'fs' module)
	// 		 * @link https://github.com/drizzle-team/drizzle-orm/issues/2853
	// 		 */
	// 		if (ctx.format === 'esm') {
	// 			return {
	// 				js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
	// 			};
	// 		}
	// 		return;
	// 	},
	// 	outExtension: (ctx) => {
	// 		if (ctx.format === 'cjs') {
	// 			return {
	// 				dts: '.d.ts',
	// 				js: '.js',
	// 			};
	// 		}
	// 		return {
	// 			dts: '.d.mts',
	// 			js: '.mjs',
	// 		};
	// 	},
	// });

	// writeFileSync(
	// 	'./dist/api-singlestore.js',
	// 	readFileSync('./dist/api-singlestore.js', 'utf8').replace(/await import\(/g, 'require('),
	// );
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
