import { globSync } from 'glob';
import { defineConfig } from 'tsup';

const entries = globSync('src/**/*.ts');

export default defineConfig({
	entry: entries,
	outDir: 'dist.new',
	format: ['cjs', 'esm'],
	bundle: false,
	splitting: false,
	sourcemap: true,
	outExtension({ format }) {
		return {
			js: format === 'cjs' ? '.cjs' : '.js',
		};
	},
	tsconfig: 'tsconfig.build.json',
});
