import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

export default defineConfig([
	{
		input: 'src/index.ts',
		output: [
			{
				format: 'esm',
				dir: 'dist',
				entryFileNames: '[name].mjs',
				chunkFileNames: '[name]-[hash].mjs',
				sourcemap: true,
			},
			{
				format: 'cjs',
				dir: 'dist',
				entryFileNames: '[name].cjs',
				chunkFileNames: '[name]-[hash].cjs',
				sourcemap: true,
			},
		],
		external: [/^drizzle-orm\/?/, 'pure-rand'],
		plugins: [
			typescript({
				tsconfig: 'tsconfig.build.json',
			}),
		],
	},
]);
