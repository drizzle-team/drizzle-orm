import * as esbuild from 'esbuild';
import { cpSync } from 'node:fs';

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
];

esbuild.buildSync({
	entryPoints: ['./src/cli/index.ts'],
	bundle: true,
	outfile: 'dist/index.cjs',
	format: 'cjs',
	target: 'node16',
	platform: 'node',
	external: [
		'commander',
		'json-diff',
		'glob',
		'esbuild',
		'drizzle-orm',
		...driversPackages,
	],
	banner: {
		js: `#!/usr/bin/env -S node --loader ./dist/loader.mjs --no-warnings`,
	},
});

cpSync('./src/loader.mjs', 'dist/loader.mjs');
