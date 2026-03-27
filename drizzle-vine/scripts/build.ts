#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import cpy from 'cpy';

await fs.remove('dist');
await $`rollup --config rollup.config.ts --configPlugin typescript`;
await $`resolve-tspaths`;
await fs.copy('README.md', 'dist/README.md');
await cpy('dist/**/*.d.ts', 'dist', {
	rename: (basename) => basename.replace(/\.d\.ts$/, '.d.mts'),
});
await cpy('dist/**/*.d.ts', 'dist', {
	rename: (basename) => basename.replace(/\.d\.ts$/, '.d.cts'),
});
await fs.copy('package.json', 'dist/package.json');
await $`scripts/fix-imports.ts`;
