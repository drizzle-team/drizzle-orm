/// <reference types="bun-types" />
import * as esbuild from 'esbuild';
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
