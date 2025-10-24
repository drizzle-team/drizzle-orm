import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json';

const dialects = [
	'cockroach',
	'gel',
	'mssql',
	'mysql',
	'pg',
	'singlestore',
	'sqlite',
];

const drivers = [
	'aws-data-api/pg',
	'better-sqlite3',
	'bun-sql',
	'bun-sql/mysql',
	'bun-sql/postgres',
	'bun-sql/sqlite',
	'bun-sqlite',
	'cockroach',
	'd1',
	'durable-sqlite',
	'expo-sqlite',
	'gel',
	'libsql',
	'mysql-proxy',
	'mysql2',
	'neon-http',
	'neon-serverless',
	'node-mssql',
	'node-postgres',
	'op-sqlite',
	'pg-proxy',
	'pglite',
	'planetscale-serverless',
	'postgres-js',
	'singlestore',
	'singlestore-proxy',
	'sql-js',
	'sqlite-proxy',
	'tidb-serverless',
	'tursodatabase',
	'vercel-postgres',
	'xata-http',
];

const misc = [
	'cache/core',
	'cache/upstash',
	'libsql/http',
	'libsql/node',
	'libsql/sqlite3',
	'libsql/wasm',
	'libsql/web',
	'libsql/ws',
	'neon',
	'prisma/mysql',
	'prisma/pg',
	'prisma/sqlite',
	'supabase',
];

const input = {
	index: 'src/index.ts',
	_relations: 'src/_relations.ts',
	relations: 'src/relations.ts',
	migrator: 'src/migrator.ts',
	version: 'src/version.temp.ts',
	...dialects.reduce((acc, dialect) => {
		acc[`${dialect}-core/index`] = `src/${dialect}-core/index.ts`;
		return acc;
	}, {} as Record<string, string>),
	...drivers.reduce((acc, driver) => {
		acc[`${driver}/index`] = `src/${driver}/index.ts`;
		acc[`${driver}/migrator`] = `src/${driver}/migrator.ts`;
		return acc;
	}, {} as Record<string, string>),
	...misc.reduce((acc, item) => {
		acc[`${item}/index`] = `src/${item}/index.ts`;
		return acc;
	}, {} as Record<string, string>),
};

const external = [
	...Object.keys(pkg.peerDependencies),
	...Object.keys(pkg.devDependencies),
	'bun',
	'bun:sqlite',
	'fs',
	'child_process',
	'path',
	'node:events',
	'node:crypto',
	'node:fs',
	'node:buffer',
];

export default defineConfig([
	{
		input,
		external,
		output: [
			{
				format: 'esm',
				dir: 'dist',
				entryFileNames: '[name].mjs',
				chunkFileNames: '[name]-[hash].mjs',
				sourcemap: true,
			},
		],
		tsconfig: 'tsconfig.build.json',
		plugins: [dts({
			tsconfig: 'tsconfig.dts.json',
		})],
	},
	{
		input,
		external,
		output: [
			{
				format: 'cjs',
				dir: 'dist',
				entryFileNames: '[name].cjs',
				chunkFileNames: '[name]-[hash].cjs',
				sourcemap: true,
			},
		],
		tsconfig: 'tsconfig.build.json',
	},
]);
