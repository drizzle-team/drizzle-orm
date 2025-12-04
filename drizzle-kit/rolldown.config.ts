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
			index: './src/index.ts',
			'api-postgres': './src/ext/api-postgres.ts',
			'api-mysql': './src/ext/api-mysql.ts',
			'api-sqlite': './src/ext/api-sqlite.ts',
		},
		external,
		output: [
			{
				format: 'esm',
				dir: 'dist',
				entryFileNames: '[name].js',
				chunkFileNames: '[name]-[hash].js',
				preserveModules: true,
				sourcemap: true,
				banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
			},
		],
		tsconfig: 'tsconfig.build.json',
		plugins: [dts({
			tsconfig: 'tsconfig.build.json',
		})],
	},
	{
		input: {
			index: './src/index.ts',
			'api-postgres': './src/ext/api-postgres.ts',
			'api-mysql': './src/ext/api-mysql.ts',
			'api-sqlite': './src/ext/api-sqlite.ts',
		},
		external,
		output: [
			{
				format: 'cjs',
				dir: 'dist',
				entryFileNames: '[name].cjs',
				chunkFileNames: '[name]-[hash].cjs',
				preserveModules: true,
				sourcemap: true,
			},
		],
		tsconfig: 'tsconfig.build.json',
	},
]);
