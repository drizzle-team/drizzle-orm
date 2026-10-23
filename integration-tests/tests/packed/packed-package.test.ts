import { composeHint, optionalEnv } from '@drizzle-team/test-utils';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';

const exec = promisify(execFile);

const ormDist = resolve(import.meta.dirname, '../../../drizzle-orm/dist');
const postgresDir = resolve(import.meta.dirname, '../../../postgres');

const connectionString = optionalEnv('PG_CONNECTION_STRING', composeHint('postgres'));

// Node can require() ESM without a flag from 20.19 and 22.12, the oldest versions in the ORM's engines range.
const requireNodeBinaries: Record<string, string | undefined> = {
	'20.19': optionalEnv('NODE_20_19_BINARY', 'Export the path to a Node 20.19 binary before running tests.'),
	'22.12': optionalEnv('NODE_22_12_BINARY', 'Export the path to a Node 22.12 binary before running tests.'),
};
const hasRequireNodeBinaries = Object.values(requireNodeBinaries).every(Boolean);

async function pack(packageDir: string, destination: string): Promise<string> {
	const { stdout } = await exec('npm', ['pack', packageDir, '--json', '--pack-destination', destination]);
	// npm 12 prints an object keyed by package name, older npm prints an array.
	const [packed] = Object.values<{ filename: string }>(JSON.parse(stdout));
	return join(destination, packed!.filename);
}

// Copies a template to a temporary dir and installs the packages that `install` returns into it.
// Returns a getter, because the dir exists only after `beforeAll` has run.
function useConsumer(template: string, install: (consumer: string) => Promise<string[]>): () => string {
	let consumer: string | undefined;

	beforeAll(async () => {
		consumer = mkdtempSync(join(tmpdir(), `drizzle-${template}-`));
		cpSync(resolve(import.meta.dirname, template), consumer, { recursive: true });
		await exec('npm', ['install', '--no-audit', '--no-fund', ...await install(consumer)], { cwd: consumer });
	}, 300_000);

	afterAll(() => {
		if (consumer) rmSync(consumer, { recursive: true, force: true });
	});

	return () => consumer!;
}

async function runScript(command: string, args: string[], cwd: string): Promise<string> {
	const { stdout } = await exec(command, args, {
		cwd,
		env: { ...process.env, PG_CONNECTION_STRING: connectionString },
	});
	return stdout;
}

async function runWorker(cwd: string): Promise<string> {
	const server = createTestHarness({
		root: cwd,
		workers: [{ configPath: 'wrangler.json', vars: { PG_CONNECTION_STRING: connectionString! } }],
	});
	try {
		await server.listen();
		const response = await server.fetch('/');
		const body = await response.text();
		if (!response.ok) throw new Error(`Worker responded with ${response.status}: ${body}`);
		return body;
	} finally {
		await server.close();
	}
}

const runtimes: Record<string, (cwd: string) => Promise<string>> = {
	node: (cwd) => runScript('node', ['main.js'], cwd),
	bun: (cwd) => runScript('bun', ['main.js'], cwd),
	deno: (cwd) => runScript('deno', ['run', '--allow-all', 'main.js'], cwd),
	workerd: runWorker,
};

function requirePostgresBuild() {
	if (!existsSync(join(postgresDir, 'dist/index.js'))) {
		throw new Error(
			'Drizzle Postgres is not built. Run `pnpm --filter @drizzle-team/postgres build` before this test.',
		);
	}
}

describe.skipIf(!connectionString)('packed drizzle-orm with standalone @drizzle-team/postgres', () => {
	const consumer = useConsumer('consumer', async (dir) => {
		requirePostgresBuild();
		return [await pack(ormDist, dir), await pack(postgresDir, dir)];
	});

	test.for(Object.keys(runtimes))('drizzle-orm/postgres runs a query under %s', async (runtime) => {
		const output = await runtimes[runtime]!(consumer());
		expect(JSON.parse(output)).toEqual([{ value: 'ok' }]);
	});

	describe.skipIf(!hasRequireNodeBinaries)('require()', () => {
		test.for(Object.keys(requireNodeBinaries))('loads drizzle-orm and runs a query under Node %s', async (version) => {
			const output = await runScript(requireNodeBinaries[version]!, ['require.cjs'], consumer());
			expect(JSON.parse(output)).toEqual([{ value: 'ok' }]);
		});
	});
});
