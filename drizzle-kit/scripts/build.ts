#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import { rolldown } from 'rolldown';
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
	'esbuild-register',
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
	try {
		await $`tsc -p tsconfig.build.json`;
	} catch {
		console.log(
			'  Warning: TypeScript declaration generation had errors (this may be expected if drizzle-orm is not built)',
		);
	}

	const dtsFiles = await glob('dist/**/*.d.ts');
	await Promise.all(
		dtsFiles.map(async (file) => {
			const content = await fs.readFile(file, 'utf8');
			await fs.writeFile(file.replace(/\.d\.ts$/, '.d.mts'), content);
		}),
	);

	console.log('  Built declarations');
}

async function postProcessApiFiles() {
	const apiFiles = ['dist/api-postgres.js', 'dist/api-mysql.js', 'dist/api-sqlite.js'];
	await Promise.all(
		apiFiles.map(async (file) => {
			if (await fs.pathExists(file)) {
				const content = await fs.readFile(file, 'utf8');
				await fs.writeFile(file, content.replace(/await import\(/g, 'require('));
			}
		}),
	);
}

async function main() {
	const startTime = Date.now();
	await fs.remove('dist');

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
			banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
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
			banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
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
			banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
		}),
		buildDeclarations(),
	]);

	await Promise.all([
		postProcessApiFiles(),
		fs.copy('package.json', 'dist/package.json'),
	]);

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`Build completed successfully in ${elapsed}s`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
