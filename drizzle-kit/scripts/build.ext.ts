import { $ } from 'bun';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
const cmds = [
	$`vitest run bin.test`,
	$`bunx vitest run ./tests/postgres/`,
	$`bunx vitest run ./tests/sqlite`,
	$`bunx vitest run ./tests/mysql`,
	$`rolldown --config rolldown.ext.config.ts`,
];
for (const cmd of cmds) {
	await cmd;
}
