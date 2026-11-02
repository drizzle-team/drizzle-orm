#!/usr/bin/env bun
import { rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
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
	// dsql drivers
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

// The key of each entry is its export subpath, so `drizzle-kit/payload/postgres` resolves to
// `./payload/postgres.js` through the `./payload/*` pattern in package.json.
const entries = {
	index: './src/index.ts',
	cli: './src/cli-sdk/index.ts',
	'api-postgres': './src/ext/api-postgres.ts',
	'api-mysql': './src/ext/api-mysql.ts',
	'api-sqlite': './src/ext/api-sqlite.ts',
	'payload/postgres': './src/payload/postgres.ts',
	'payload/mysql': './src/payload/mysql.ts',
	'payload/sqlite': './src/payload/sqlite.ts',
	'payload/mssql': './src/payload/mssql.ts',
};

const commonOptions = {
	outDir: 'dist',
	format: 'esm',
	platform: 'node',
	fixedExtension: false,
	clean: false,
	deps: { neverBundle: [/^drizzle-orm\/?/, ...driversPackages] },
	outputOptions: { chunkFileNames: 'chunks/[name]-[hash].js' },
} satisfies Parameters<typeof tsdown>[0];

async function main() {
	const startTime = Date.now();
	rmSync('dist', { recursive: true, force: true });

	await Promise.all([
		tsdown({
			...commonOptions,
			entry: { bin: './src/cli/index.ts', ...entries },
			// Bundled CommonJS dependencies read `__dirname` and `__filename`, which ESM does not define.
			shims: true,
			// The ESM entry of jiti loads its Babel transform through `createRequire`, which the bundler cannot
			// follow. The CommonJS entry uses a plain `require`, so the transform is bundled.
			alias: { jiti: createRequire(import.meta.url).resolve('jiti') },
			define: {
				'process.env.DRIZZLE_KIT_VERSION': JSON.stringify(pkg.version),
				'process.env.DRIZZLE_KIT_NODE_RANGE': JSON.stringify(pkg.engines.node),
				'process.env.DRIZZLE_KIT_SKILLS_REVISION': JSON.stringify(readSkillsRevisionFromDisk('./skills')),
			},
			banner: ({ fileName }) => fileName === 'bin.js' ? '#!/usr/bin/env node' : undefined,
			dts: false,
		}),
		// Declarations are built for the public entries only. Building them together with `bin` adds a
		// declaration for every module that only `bin` reaches, and no export points to `bin`.
		tsdown({
			...commonOptions,
			entry: entries,
			dts: { emitDtsOnly: true },
		}),
	]);

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
