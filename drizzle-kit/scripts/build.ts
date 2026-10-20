#!/usr/bin/env bun
import { rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { type OutputOptions, rolldown } from 'rolldown';
import { build as tsdown } from 'tsdown';
import pkg from '../package.json';
import { readSkillsRevisionFromDisk } from './lib/read-skills-revision';

const driversPackages = [
	// postgres drivers
	'pg',
	'postgres',
	'@vercel/postgres',
	'@neondatabase/serverless',
	'@electric-sql/pglite',
	'@aws/aurora-dsql-node-postgres-connector',
	'@aws/aurora-dsql-postgresjs-connector',
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
	// mssql drivers
	'mssql',
	// duckdb drivers
	'duckdb',
	'@duckdb/node-api',
];

const external = [
	/^drizzle-orm\/?/,
	...driversPackages,
];

const libraryEntries = {
	index: './src/index.ts',
	cli: './src/cli-sdk/index.ts',
};

const apiEntries = {
	'api-postgres': './src/ext/api-postgres.ts',
	'api-mysql': './src/ext/api-mysql.ts',
	'api-sqlite': './src/ext/api-sqlite.ts',
	'payload-postgres': './src/payload/postgres.ts',
	'payload-mysql': './src/payload/mysql.ts',
	'payload-sqlite': './src/payload/sqlite.ts',
	'payload-mssql': './src/payload/mssql.ts',
};

async function buildBundles(options: {
	name: string;
	input: Record<string, string>;
	format: 'cjs' | 'esm';
	entryFileNames: OutputOptions['entryFileNames'];
	chunkFileNames: string;
	banner?: OutputOptions['banner'];
	define?: Record<string, string>;
}) {
	const build = await rolldown({
		input: options.input,
		platform: 'node',
		external,
		tsconfig: 'tsconfig.json',
		transform: { define: options.define },
	});

	const { output } = await build.write({
		dir: 'dist',
		format: options.format,
		entryFileNames: options.entryFileNames,
		chunkFileNames: options.chunkFileNames,
		banner: options.banner,
	});

	await build.close();
	console.log(`  Built ${options.name}`);

	return output.map((it) => `dist/${it.fileName}`);
}

async function patchFiles(files: string[], patch: (content: string) => string) {
	await Promise.all(
		files.map(async (file) => {
			const content = await fs.readFile(file, 'utf8');
			const patched = patch(content);
			if (patched !== content) await fs.writeFile(file, patched);
		}),
	);
}

async function buildCjsCli() {
	await buildBundles({
		name: 'bin.cjs, cli.js',
		input: { bin: './src/cli/index.ts', cli: libraryEntries.cli },
		format: 'cjs',
		entryFileNames: (chunk) => chunk.name === 'bin' ? 'bin.cjs' : '[name].js',
		chunkFileNames: 'chunks/cli/[name]-[hash].js',
		banner: (chunk) => chunk.isEntry && chunk.name === 'bin' ? '#!/usr/bin/env node' : '',
		define: {
			'process.env.DRIZZLE_KIT_VERSION': JSON.stringify(pkg.version),
			'process.env.DRIZZLE_KIT_SKILLS_REVISION': JSON.stringify(readSkillsRevisionFromDisk('./skills')),
		},
	});
}

async function buildCjsIndex() {
	await buildBundles({
		name: 'index.js',
		input: { index: libraryEntries.index },
		format: 'cjs',
		entryFileNames: '[name].js',
		chunkFileNames: 'chunks/index/[name]-[hash].js',
	});
}

async function buildCjsApi() {
	const files = await buildBundles({
		name: 'api-*.js, payload-*.js',
		input: apiEntries,
		format: 'cjs',
		entryFileNames: '[name].js',
		chunkFileNames: 'chunks/api/[name]-[hash].js',
	});

	await patchFiles(files, (content) => content.replace(/await import\(/g, 'require('));
}

async function buildEsm() {
	await buildBundles({
		name: '*.mjs',
		input: { ...libraryEntries, ...apiEntries },
		format: 'esm',
		entryFileNames: '[name].mjs',
		chunkFileNames: 'chunks/esm/[name]-[hash].mjs',
	});
}

// tsdown's `emitDtsOnly: true` still emits chunked .js files alongside the
// declarations. If tsdown writes to ./dist it overwrites rolldown's clean
// single-file bundles and produces a CJS entry that fails to load. Direct
// tsdown's output at a temp dir and copy only .d.ts / .d.mts back into ./dist.
const TSDOWN_TEMP_DIR = './dist/__dts-temp';

async function buildDeclarations() {
	// Use tsdown for declaration bundling - it handles path resolution and creates bundled .d.ts files
	await tsdown({
		entry: libraryEntries,
		outDir: TSDOWN_TEMP_DIR,
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
		entry: apiEntries,
		outDir: TSDOWN_TEMP_DIR,
		external: ['drizzle-orm', ...driversPackages, /^drizzle-orm\/?/],
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

async function copyDeclarationsAndCleanTemp() {
	const entries = await fs.readdir(TSDOWN_TEMP_DIR);
	await Promise.all(
		entries
			.filter((f) => f.endsWith('.d.ts') || f.endsWith('.d.mts'))
			.map((f) => fs.copyFile(`${TSDOWN_TEMP_DIR}/${f}`, `dist/${f}`)),
	);
	rmSync(TSDOWN_TEMP_DIR, { recursive: true, force: true });
}

async function main() {
	const startTime = Date.now();
	rmSync('dist', { recursive: true, force: true });

	await Promise.all([
		buildCjsCli(),
		buildCjsIndex(),
		buildCjsApi(),
		buildEsm(),
		buildDeclarations(),
	]);

	await copyDeclarationsAndCleanTemp();
	await Promise.all([
		fs.copyFile('package.json', 'dist/package.json'),
		fs.cp('skills', 'dist/skills', { recursive: true }),
	]);

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`Build completed successfully in ${elapsed}s`);
}

await main().catch((e) => {
	console.error(e);
	process.exit(1);
}).then(() => process.exit(0));
