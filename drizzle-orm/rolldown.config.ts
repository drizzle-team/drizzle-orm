import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json';
import { entrypoints } from './scripts/build.common';

const input = {
	...entrypoints,
	version: 'src/version.temp.ts',
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
				entryFileNames: '[name].js',
				chunkFileNames: '[name]-[hash].js',
				preserveModules: true,
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
				preserveModules: true,
				sourcemap: true,
			},
		],
		tsconfig: 'tsconfig.build.json',
	},
]);
