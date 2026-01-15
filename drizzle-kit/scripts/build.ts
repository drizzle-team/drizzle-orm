#!/usr/bin/env bun
import { existsSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { rolldown } from 'rolldown';
import { build as tsdown } from 'tsdown';
import pkg from '../package.json';

const driversPackages = [
	// postgres drivers
	'pg',
	'postgres',
	'@vercel/postgres',
	'@neondatabase/serverless',
	'@electric-sql/pglite',
	// mysql drivers
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

const external = [
	'esbuild',
	'tsx',
	/^tsx\//,
	/^drizzle-orm\/?/,
	...driversPackages,
];

async function buildBundle(options: {
	name: string;
	input: string;
	outputName: string;
	format: 'cjs' | 'esm';
	banner?: string;
}) {
	const build = await rolldown({
		input: options.input,
		platform: 'node',
		external,
		tsconfig: 'tsconfig.json',
	});

	await build.write({
		dir: 'dist',
		format: options.format,
		entryFileNames: options.outputName,
		inlineDynamicImports: true,
		banner: options.banner,
	});

	await build.close();
	console.log(`  Built ${options.outputName}`);
}

async function buildCli() {
	const build = await rolldown({
		input: './src/cli/index.ts',
		platform: 'node',
		external,
		tsconfig: 'tsconfig.json',
	});

	await build.write({
		dir: 'dist',
		format: 'cjs',
		entryFileNames: 'bin.cjs',
		banner: '#!/usr/bin/env node',
		inlineDynamicImports: true,
	});

	await build.close();

	const binContent = await fs.readFile('dist/bin.cjs', 'utf8');
	await fs.writeFile(
		'dist/bin.cjs',
		binContent.replace(
			/process\.env\.DRIZZLE_KIT_VERSION/g,
			JSON.stringify(pkg.version),
		),
	);

	console.log('  Built bin.cjs');
}

async function buildDeclarations() {
	// Use tsdown for declaration bundling - it handles path resolution and creates bundled .d.ts files
	await tsdown({
		entry: ['./src/index.ts'],
		outDir: './dist',
		external: [...driversPackages, /^drizzle-orm\/?/],
		dts: { emitDtsOnly: true },
		format: ['cjs', 'es'],
		logLevel: 'silent',
		clean: false,
		outExtensions: (ctx) => {
			if (ctx.format === 'cjs') {
				return { dts: '.d.ts', js: '.js' };
			}
			return { dts: '.d.mts', js: '.mjs' };
		},
	});

	await tsdown({
		entry: ['./src/ext/api-postgres.ts', './src/ext/api-mysql.ts', './src/ext/api-sqlite.ts'],
		outDir: './dist',
		external: ['esbuild', 'drizzle-orm', ...driversPackages, /^drizzle-orm\/?/],
		dts: { emitDtsOnly: true },
		format: ['cjs', 'es'],
		logLevel: 'silent',
		clean: false,
		outExtensions: (ctx) => {
			if (ctx.format === 'cjs') {
				return { dts: '.d.ts', js: '.js' };
			}
			return { dts: '.d.mts', js: '.mjs' };
		},
	});

	console.log('  Built declarations');
}

async function postProcessApiFiles() {
	const apiFiles = ['dist/api-postgres.js', 'dist/api-mysql.js', 'dist/api-sqlite.js'];
	await Promise.all(
		apiFiles.map(async (file) => {
			if (existsSync(file)) {
				const content = await fs.readFile(file, 'utf8');
				await fs.writeFile(file, content.replace(/await import\(/g, 'require('));
			}
		}),
	);
}

async function main() {
	const startTime = Date.now();
	rmSync('dist', { recursive: true, force: true });

	await Promise.all([
		buildCli(),
		buildBundle({
			name: 'index-cjs',
			input: './src/index.ts',
			outputName: 'index.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'index-esm',
			input: './src/index.ts',
			outputName: 'index.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'api-postgres-cjs',
			input: './src/ext/api-postgres.ts',
			outputName: 'api-postgres.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'api-postgres-esm',
			input: './src/ext/api-postgres.ts',
			outputName: 'api-postgres.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'api-mysql-cjs',
			input: './src/ext/api-mysql.ts',
			outputName: 'api-mysql.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'api-mysql-esm',
			input: './src/ext/api-mysql.ts',
			outputName: 'api-mysql.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'api-sqlite-cjs',
			input: './src/ext/api-sqlite.ts',
			outputName: 'api-sqlite.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'api-sqlite-esm',
			input: './src/ext/api-sqlite.ts',
			outputName: 'api-sqlite.mjs',
			format: 'esm',
		}),
		buildDeclarations(),
	]);

	await Promise.all([
		postProcessApiFiles(),
		fs.copyFile('package.json', 'dist/package.json'),
	]);

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`Build completed successfully in ${elapsed}s`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
