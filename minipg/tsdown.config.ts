// Library build: TRANSPILE only (unbundle) — each src/*.ts becomes dist/*.js 1:1, preserving the module
// structure (no bundling, no hashed shared chunks). Relative `.ts` imports are rewritten to `.js`; bare
// imports (node:*, cloudflare:sockets) stay as-is. Emits a .d.ts alongside each file. minipg has no
// runtime deps, so there is nothing to bundle regardless.
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/**/*.ts'],
  unbundle: true, // 1:1 file mapping, keep source structure
  format: 'esm',
  dts: true,
  // `type: module` -> plain .js is ESM; emit .js/.d.ts rather than tsdown's default .mjs/.d.mts
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  outDir: 'dist',
  clean: true,
})
