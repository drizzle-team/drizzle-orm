import { $ } from 'bun';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await $`rolldown --config rolldown.dev.config.ts`;
await $`chmod +x ./dist/index.cjs`;
