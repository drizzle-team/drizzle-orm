import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json';

export default defineConfig([
	{
		input: './src/cli/index.ts',
		platform: 'node',
		external: [
			...Object.keys(pkg.devDependencies),
			/^drizzle-orm\/?/,
			'bun:sqlite',
			'bun',
		],
		output: [
			{
				format: 'cjs',
				file: 'dist/index.cjs',
				banner: '#!/usr/bin/env -S node --loader ./dist/loader.mjs --no-warnings',
				inlineDynamicImports: true,
			},
		],
		transform: {
			target: 'node16',
		},
		tsconfig: 'tsconfig.build.json',
	},
	{
		input: './src/cli/index.ts',
		external: [
			...Object.keys(pkg.devDependencies),
			/^drizzle-orm\/?/,
			'bun:sqlite',
			'bun',
		],
		output: [
			{
				format: 'esm',
				dir: 'dist',
			},
		],
		plugins: [dts({
			tsconfig: 'tsconfig.cli-types.json',
			emitDtsOnly: true,
		})],
	},
]);
