import json from '@rollup/plugin-json';
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
			format: 'esm',
			dir: 'dist.new',
			entryFileNames: '[name].mjs',
			chunkFileNames: '[name]-[hash].mjs',
			sourcemap: true,
		},
		external,
		plugins: [
			json({
				preferConst: true,
			}),
			typescript({
				tsconfig: 'tsconfig.esm.json',
				outputToFilesystem: true,
			}),
		],
	},
]);
