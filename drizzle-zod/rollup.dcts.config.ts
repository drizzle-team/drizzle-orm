import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';

export default defineConfig([
	{
		input: 'src/index.ts',
		output: {
			dir: 'dist.new',
			entryFileNames: '[name].d.cts',
		},
		external: [
			/^drizzle-orm\/?/,
			'zod',
		],
		plugins: [
			dts(),
		],
	},
]);
