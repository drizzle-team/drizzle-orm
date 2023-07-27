import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

export default defineConfig([
	{
		input: 'src/index.ts',
		output: {
			format: 'cjs',
			dir: 'dist.new',
			entryFileNames: '[name].cjs',
			chunkFileNames: '[name]-[hash].cjs',
			sourcemap: true,
		},
		external: [
			/^drizzle-orm\/?/,
			'zod',
		],
		plugins: [
			typescript({
				tsconfig: 'tsconfig.cjs.json',
			}),
			terser(),
		],
	},
]);
