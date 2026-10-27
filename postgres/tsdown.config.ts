// Library build: TRANSPILE only (unbundle) — each src/*.ts becomes dist/*.js 1:1, preserving the module
// structure (no bundling, no hashed shared chunks). Relative `.ts` imports are rewritten to `.js`; bare
// imports (node:*, cloudflare:sockets) stay as-is. Emits a .d.ts alongside each file. Drizzle Postgres has no
// runtime deps, so there is nothing to bundle regardless.
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/**/*.ts'],
	unbundle: true, // 1:1 file mapping, keep source structure
	format: 'esm',
	dts: true,
	// `type: module` -> plain .js is ESM; emit .js/.d.ts rather than tsdown's default .mjs/.d.mts
	outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
	outDir: 'dist',
	clean: true,
	hooks: {
		// TypeScript compares classes with private or protected members by declaration, not by shape,
		// so a Pool from a standalone package would not fit the Pool type of the copy bundled in
		// drizzle-orm. Declaration emit writes each such member as one untyped line.
		'build:done': ({ options }) => {
			for (const file of globSync('**/*.d.ts', { cwd: options.outDir })) {
				const path = join(options.outDir, file);
				writeFileSync(path, readFileSync(path, 'utf8').replace(/^[ \t]*(?:private|protected)\s.*\n/gm, ''));
			}
		},
	},
});
