import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: ['src/index.ts'],
		outDir: 'dist',
		format: ['esm'],
		dts: true,
		sourcemap: true,
		clean: true,
		external: [/^drizzle-orm\/?/, 'pure-rand'],
		outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
	},
	{
		entry: ['src/index.ts'],
		outDir: 'dist',
		format: ['cjs'],
		dts: true,
		sourcemap: true,
		clean: false,
		external: [/^drizzle-orm\/?/, 'pure-rand'],
		outExtensions: () => ({ js: '.cjs', dts: '.d.cts' }),
	},
]);
