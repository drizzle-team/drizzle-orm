import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const common: RolldownOptions = {
	input: 'src/index.ts',
	external: [
		/^drizzle-orm\/?/,
		'valibot',
	],
	tsconfig: 'tsconfig.build.json',
};

export default defineConfig([
	{
		...common,
		output: [
			{
				format: 'esm',
				dir: 'dist',
				entryFileNames: '[name].js',
				chunkFileNames: '[name]-[hash].js',
				sourcemap: true,
			},
		],
		plugins: [dts({
			tsconfig: 'tsconfig.build.json',
		})],
	},
	{
		...common,
		output: [
			{
				format: 'cjs',
				dir: 'dist',
				entryFileNames: '[name].cjs',
				chunkFileNames: '[name]-[hash].cjs',
				sourcemap: true,
			},
		],
	},
]);
