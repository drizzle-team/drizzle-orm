#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import cpy from 'cpy';

await fs.remove('dist');
await $`tsdown`;
// Create .d.ts fallback for the `types` field in exports
await cpy('dist/**/*.d.mts', 'dist', {
	rename: (basename) => basename.replace(/\.d\.mts$/, '.d.ts'),
});
await fs.copy('README.md', 'dist/README.md');
await fs.copy('package.json', 'dist/package.json');
