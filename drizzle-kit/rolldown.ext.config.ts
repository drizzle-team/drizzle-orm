import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json';

const external = [
	...Object.keys(pkg.devDependencies),
	/^drizzle-orm\/?/,
	'bun:sqlite',
	'zlib',
	'crypto',
	'stream',
	'timers',
	'tty',
	'os',
	'fs',
	'path',
	'child_process',
	'tls',
	'net',
	'module',
	'url',
];

export default defineConfig([
	{
		input: {
			'studio-sqlite': './src/ext/studio-sqlite.ts',
			'studio-postgres': './src/ext/studio-postgres.ts',
			'studio-mysql': './src/ext/studio-mysql.ts',
		},
		platform: 'browser',
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
			tsconfig: 'tsconfig.build.json',
		})],
	},
]);
