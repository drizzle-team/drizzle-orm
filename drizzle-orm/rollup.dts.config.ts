import json from '@rollup/plugin-json';
import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';
import { entries, external } from './rollup.common';

export default defineConfig([
	{
		input: entries.reduce<Record<string, string>>((acc, entry) => {
			const from = 'dist-dts/' + entry + '.d.ts';
			const to = entry;
			acc[to] = from;
			return acc;
		}, {}),
		output: {
			dir: 'dist.new',
		},
		external,
		plugins: [
			json({
				preferConst: true,
			}),
			dts(),
		],
	},
]);
