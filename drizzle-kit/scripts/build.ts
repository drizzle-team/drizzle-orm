#!/usr/bin/env bun
import { existsSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { rolldown } from 'rolldown';
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
	'esbuild',
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
		codeSplitting: false,
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
		codeSplitting: false,
	});

	await build.close();

	const binContent = await fs.readFile('dist/bin.cjs', 'utf8');
	const patched = binContent
		.replace(/process\.env\.DRIZZLE_KIT_VERSION/g, JSON.stringify(pkg.version))
		.replace(/process\.env\.DRIZZLE_KIT_SKILLS_REVISION/g, JSON.stringify(readSkillsRevisionFromDisk('./skills')));
	await fs.writeFile('dist/bin.cjs', patched);

	console.log('  Built bin.cjs');
}

// tsdown's `emitDtsOnly: true` still emits chunked .js files alongside the
// declarations. If tsdown writes to ./dist it overwrites rolldown's clean
// single-file bundles and produces a CJS entry that fails to load. Direct
// tsdown's output at a temp dir and copy only .d.ts / .d.mts back into ./dist.
const TSDOWN_TEMP_DIR = './dist/__dts-temp';

async function buildDeclarations() {
	// Use tsdown for declaration bundling - it handles path resolution and creates bundled .d.ts files
	await tsdown({
		entry: { index: './src/index.ts', cli: './src/cli-sdk/index.ts' },
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
		entry: {
			'api-postgres': './src/ext/api-postgres.ts',
			'api-mysql': './src/ext/api-mysql.ts',
			'api-sqlite': './src/ext/api-sqlite.ts',
			'payload-postgres': './src/payload/postgres.ts',
			'payload-mysql': './src/payload/mysql.ts',
			'payload-sqlite': './src/payload/sqlite.ts',
			'payload-mssql': './src/payload/mssql.ts',
		},
		outDir: TSDOWN_TEMP_DIR,
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

async function copyDeclarationsAndCleanTemp() {
	const entries = await fs.readdir(TSDOWN_TEMP_DIR);
	await Promise.all(
		entries
			.filter((f) => f.endsWith('.d.ts') || f.endsWith('.d.mts'))
			.map((f) => fs.copyFile(`${TSDOWN_TEMP_DIR}/${f}`, `dist/${f}`)),
	);
	rmSync(TSDOWN_TEMP_DIR, { recursive: true, force: true });
}

async function postProcessApiFiles() {
	const apiFiles = [
		'dist/api-postgres.js',
		'dist/api-mysql.js',
		'dist/api-sqlite.js',
		'dist/payload-postgres.js',
		'dist/payload-mysql.js',
		'dist/payload-sqlite.js',
		'dist/payload-mssql.js',
	];
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
		buildBundle({
			name: 'cli-cjs',
			input: './src/cli-sdk/index.ts',
			outputName: 'cli.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'cli-esm',
			input: './src/cli-sdk/index.ts',
			outputName: 'cli.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'payload-postgres-cjs',
			input: './src/payload/postgres.ts',
			outputName: 'payload-postgres.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'payload-postgres-esm',
			input: './src/payload/postgres.ts',
			outputName: 'payload-postgres.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'payload-mysql-cjs',
			input: './src/payload/mysql.ts',
			outputName: 'payload-mysql.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'payload-mysql-esm',
			input: './src/payload/mysql.ts',
			outputName: 'payload-mysql.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'payload-sqlite-cjs',
			input: './src/payload/sqlite.ts',
			outputName: 'payload-sqlite.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'payload-sqlite-esm',
			input: './src/payload/sqlite.ts',
			outputName: 'payload-sqlite.mjs',
			format: 'esm',
		}),
		buildBundle({
			name: 'payload-mssql-cjs',
			input: './src/payload/mssql.ts',
			outputName: 'payload-mssql.js',
			format: 'cjs',
		}),
		buildBundle({
			name: 'payload-mssql-esm',
			input: './src/payload/mssql.ts',
			outputName: 'payload-mssql.mjs',
			format: 'esm',
		}),
		buildDeclarations(),
	]);

	await copyDeclarationsAndCleanTemp();
	await Promise.all([
		postProcessApiFiles(),
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
