import { $ } from 'bun';
import { rm } from 'node:fs/promises';
import { build } from '~build';

await rm('dist', { recursive: true, force: true });
await $`rolldown --config rolldown.cli.config.ts`;
await build({
	readme: 'README.md',
	skip: {
		distDelete: true,
		resolveTsPaths: true,
	},
});
