#!/usr/bin/env node
// `tsc7`: TypeScript 7's tsc, the native compiler. It type-checks the packages in a third of TypeScript 6's CPU time
// and a quarter of its wall time, so the test:types scripts use it. It has its own command because `tsc` stays
// typescript@6: that package also carries the TypeScript API and tsserver, which the editor (.vscode/settings.json),
// drizzle-kit's tests, attw-fork and the builds' d.ts emit use, and typescript@7 ships neither.
//
// On a self-hosted runner it checks single-threaded: the parallel checkers finish sooner but redo work between them,
// and that machine runs a dozen jobs at once, so the CPU time is what counts there (orm's type tests: 10.4 s of CPU
// across threads, 5.3 s on one). A GitHub-hosted runner has its CPUs to itself.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env['RUNNER_ENVIRONMENT'] === 'self-hosted' && !process.argv.includes('--singleThreaded')) {
	process.argv.push('--singleThreaded');
}

const typescript = dirname(createRequire(import.meta.url).resolve('typescript/package.json'));
await import(pathToFileURL(join(typescript, 'lib/tsc.js')).href);
