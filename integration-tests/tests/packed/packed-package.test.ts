import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';

const exec = promisify(execFile);

const ormDist = resolve(import.meta.dirname, '../../../drizzle-orm/dist');
const ormPackageJson = resolve(import.meta.dirname, '../../../drizzle-orm/package.json');

const envHints = {
	PG_CONNECTION_STRING:
		'Bring DBs up with `bash compose/dockers.sh up postgres` and export the connection string before running tests.',
};

// Outside CI, a missing variable skips the tests that need it. CI must run every test, so there it fails the run.
function hasEnv(...names: (keyof typeof envHints)[]): boolean {
	const missing = names.filter((name) => !process.env[name]);
	if (missing.length > 0 && process.env['CI']) {
		throw new Error(missing.map((name) => `${name} is not set. ${envHints[name]}`).join('\n'));
	}
	return missing.length === 0;
}

const hasPostgres = hasEnv('PG_CONNECTION_STRING');
const connectionString = process.env['PG_CONNECTION_STRING'];

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

describe.skipIf(!hasPostgres)('packed drizzle-orm with standalone @drizzle-team/minipg', () => {
	const consumer = useConsumer('consumer', async (dir) => {
		const minipgVersion = JSON.parse(readFileSync(ormPackageJson, 'utf8')).devDependencies['@drizzle-team/minipg'];
		return [await pack(ormDist, dir), `@drizzle-team/minipg@${minipgVersion}`];
	});

	test.for(Object.keys(runtimes))('drizzle-orm/postgres runs a query under %s', async (runtime) => {
		const output = await runtimes[runtime]!(consumer());
		expect(JSON.parse(output)).toEqual([{ value: 'ok' }]);
	});
});
