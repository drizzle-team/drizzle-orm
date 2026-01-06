import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: ['src/index.ts'],
		outDir: 'dist',
		format: ['esm'],
		dts: true,
		sourcemap: true,
		clean: true,
		external: [/^drizzle-orm\/?/, 'valibot'],
		outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
	},
	{
		entry: ['src/index.ts'],
		outDir: 'dist',
		format: ['cjs'],
		dts: true,
		sourcemap: true,
		clean: false,
		external: [/^drizzle-orm\/?/, 'valibot'],
		outExtensions: () => ({ js: '.cjs', dts: '.d.cts' }),
	},
]);
