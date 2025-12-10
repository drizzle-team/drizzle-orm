import { $ } from 'bun';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await $`rolldown --config rolldown.cli.config.ts`;
await Bun.write('dist/package.json', Bun.file('package.json'));
