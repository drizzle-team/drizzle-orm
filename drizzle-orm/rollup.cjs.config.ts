import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { entries, external } from './rollup.common';

export default defineConfig([
	{
		input: entries.reduce<Record<string, string>>((acc, entry) => {
			const from = 'src/' + entry + '.ts';
			const to = entry;
			acc[to] = from;
			return acc;
		}, {}),
		output: {
			format: 'cjs',
			dir: 'dist.new',
			entryFileNames: '[name].cjs',
			chunkFileNames: '[name]-[hash].cjs',
			sourcemap: true,
		},
		external,
		plugins: [
			replace({
				'await import': 'require',
				preventAssignment: true,
			}),
			json({
				preferConst: true,
			}),
			typescript({
				tsconfig: 'tsconfig.cjs.json',
				outputToFilesystem: true,
			}),
		],
	},
]);
