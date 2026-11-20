import { execFile } from 'child_process';
import { globSync } from 'glob';
import os from 'os';
import path from 'path';
import { expect, it } from 'vitest';

// The published `exports` map collapsed to a `"./*"` wildcard, so the importable public subpaths
// are no longer enumerable from it — re-derive them from the same source globs the build keys off.
const exportSubpaths = [
	...new Set(
		globSync('../drizzle-orm/src/**/*.ts', { ignore: ['**/*.test.ts'] })
			.map((f) => f.match(/src\/(.*)\.ts$/)![1]!)
			.map((e) => (e === 'index' ? '.' : './' + e.replace(/\/index$/, ''))),
	),
];

type ImportCheck = { name: string; args: string[] };

// Resolves with an error message, or with undefined when the process exits with code 0.
// The limit catches an import that hangs, for example one that keeps the event loop open. 30 s, not less: on a busy
// CI machine, entry points that compile WebAssembly (effect-sqlite-wasm) took over 5 s to load.
const TIMEOUT_MS = 30_000;
function runNode(args: string[]): Promise<string | undefined> {
	return new Promise((resolve) => {
		execFile('node', args, { timeout: TIMEOUT_MS }, (error, _stdout, stderr) => {
			if (!error) return resolve(undefined);
			resolve(error.killed ? `timed out after ${TIMEOUT_MS} ms (killed)` : `${error.message}\n${stderr}`);
		});
	});
}

// Runs one process per CPU at a time. More processes than CPUs slow each other down until
// healthy imports hit the 5s limit.
async function findFailedImports(checks: ImportCheck[]): Promise<string[]> {
	const failures: string[] = [];
	let next = 0;
	const worker = async () => {
		while (next < checks.length) {
			const { name, args } = checks[next++]!;
			const error = await runNode(args);
			if (error) failures.push(`${name}: ${error}`);
		}
	};
	await Promise.all(new Array(os.availableParallelism()).fill(undefined).map(worker));
	return failures;
}

const checksCJS: ImportCheck[] = [];
for (const key of exportSubpaths) {
	const o1 = path.join('drizzle-orm', key);
	if (
		o1.startsWith('drizzle-orm/bun-sqlite') || o1.startsWith('drizzle-orm/pglite')
		|| o1.startsWith('drizzle-orm/expo-sqlite') || o1.startsWith('drizzle-orm/libsql/wasm')
		|| o1.startsWith('drizzle-orm/bun-sql') || o1.startsWith('drizzle-orm/tursodatabase/wasm')
		|| o1.startsWith('drizzle-orm/prisma') || o1.startsWith('drizzle-orm/node-sqlite')
		|| o1.startsWith('drizzle-orm/effect-sqlite-bun')
		|| o1 === 'drizzle-orm/postgres' || o1.startsWith('drizzle-orm/postgres/')
	) {
		continue;
	}
	checksCJS.push({ name: o1, args: ['--input-type=commonjs', '-e', `require(${JSON.stringify(o1)})`] });
}

it('every entry point loads with require()', async () => {
	expect(await findFailedImports(checksCJS)).toEqual([]);
});

const checksESM: ImportCheck[] = [];
for (const key of exportSubpaths) {
	const o1 = path.join('drizzle-orm', key);
	if (
		o1.startsWith('drizzle-orm/bun-sqlite') || o1.startsWith('drizzle-orm/expo-sqlite')
		|| o1.startsWith('drizzle-orm/bun-sql') || o1.startsWith('drizzle-orm/tursodatabase/wasm')
		|| o1.startsWith('drizzle-orm/prisma') || o1.startsWith('drizzle-orm/node-sqlite')
		|| o1.startsWith('drizzle-orm/effect-sqlite-bun')
		|| o1 === 'drizzle-orm/postgres/cf'
	) {
		continue;
	}
	const source = `import ${JSON.stringify(o1)}`;
	checksESM.push(
		{ name: o1, args: ['--input-type=module', '-e', source] },
		{
			name: `${o1} with import-in-the-middle`,
			args: ['--import', 'import-in-the-middle/hook.mjs', '--input-type=module', '-e', source],
		},
	);
}

it('every entry point loads with import', async () => {
	expect(await findFailedImports(checksESM)).toEqual([]);
});
