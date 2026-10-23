import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';

const exec = promisify(execFile);

const ormDist = resolve(import.meta.dirname, '../../../drizzle-orm/dist');
const minipgDir = resolve(import.meta.dirname, '../../../minipg');
const instanceofScript = resolve(import.meta.dirname, 'instanceof.js');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
// The consumer projects have no `@types/node` of their own, so tsc reads the one installed here.
const nodeTypeRoots = resolve(import.meta.dirname, '../../node_modules/@types');

const envHints = {
	PG_CONNECTION_STRING:
		'Bring DBs up with `bash compose/dockers.sh up postgres` and export the connection string before running tests.',
	NODE_20_19_BINARY: 'Export the path to a Node 20.19 binary before running tests.',
	NODE_22_12_BINARY: 'Export the path to a Node 22.12 binary before running tests.',
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
const hasRequireNodeBinaries = hasEnv('NODE_20_19_BINARY', 'NODE_22_12_BINARY');
const connectionString = process.env['PG_CONNECTION_STRING'];

// Node can require() ESM without a flag from 20.19 and 22.12, the oldest versions in the ORM's engines range.
const requireNodeBinaries: Record<string, string | undefined> = {
	'20.19': process.env['NODE_20_19_BINARY'],
	'22.12': process.env['NODE_22_12_BINARY'],
};

const bothDirections = { firstIsSecond: true, secondIsFirst: true };
const instanceofInBothDirections = {
	isSameClass: false,
	Pool: bothDirections,
	Connection: bothDirections,
	PgError: bothDirections,
	MyPool: { isFirstPool: true, isSecondPool: true, poolIsMyPool: false },
};

async function pack(packageDir: string, destination: string): Promise<string> {
	const { stdout } = await exec('npm', ['pack', packageDir, '--json', '--pack-destination', destination]);
	// npm 12 prints an object keyed by package name, older npm prints an array.
	const [packed] = Object.values<{ filename: string }>(JSON.parse(stdout));
	return join(destination, packed!.filename);
}

// Copies a template to a temporary dir and installs the packages that `install` returns into it.
// `versions` rewrites the version in the manifests of installed packages.
// Returns a getter, because the dir exists only after `beforeAll` has run.
function useConsumer(
	template: string,
	install: (consumer: string) => Promise<string[]>,
	versions: Record<string, string> = {},
): () => string {
	let consumer: string | undefined;

	beforeAll(async () => {
		consumer = mkdtempSync(join(tmpdir(), `drizzle-${template}-`));
		cpSync(resolve(import.meta.dirname, template), consumer, { recursive: true });
		await exec('npm', ['install', '--no-audit', '--no-fund', ...await install(consumer)], { cwd: consumer });

		for (const [name, version] of Object.entries(versions)) {
			const manifest = join(consumer, 'node_modules', name, 'package.json');
			writeFileSync(manifest, JSON.stringify({ ...JSON.parse(readFileSync(manifest, 'utf8')), version }));
		}
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

async function typeCheck(file: string, cwd: string): Promise<string> {
	const args = [
		'--noEmit',
		'--strict',
		'--skipLibCheck',
		'--module',
		'nodenext',
		'--target',
		'es2022',
		'--typeRoots',
		nodeTypeRoots,
		'--types',
		'node',
		file,
	];
	const { stdout } = await exec('node', [tsc, ...args], { cwd }).catch((error) => error);
	return stdout;
}

const runtimes: Record<string, (cwd: string) => Promise<string>> = {
	node: (cwd) => runScript('node', ['main.js'], cwd),
	bun: (cwd) => runScript('bun', ['main.js'], cwd),
	deno: (cwd) => runScript('deno', ['run', '--allow-all', 'main.js'], cwd),
	workerd: runWorker,
};

function requireMinipgBuild() {
	if (!existsSync(join(minipgDir, 'dist/index.js'))) {
		throw new Error('minipg is not built. Run `pnpm --filter @drizzle-team/minipg build` before this test.');
	}
}

describe.skipIf(!hasPostgres)('packed drizzle-orm with its bundled copy of minipg', () => {
	const consumer = useConsumer('consumer', async (dir) => [await pack(ormDist, dir)]);

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

	test('drizzle-orm/minipg and its subpaths expose the bundled copy', async () => {
		const output = await runScript('node', ['minipg.js'], consumer());
		expect(JSON.parse(output)).toEqual({
			isPgError: true,
			code: '22012',
			point: { type: 'Point', coordinates: [1, 2] },
		});
	});

	test('drizzle-orm/minipg/package.json gives the version of the bundled copy', async () => {
		const { version } = JSON.parse(readFileSync(join(minipgDir, 'package.json'), 'utf8'));
		const required = await runScript('node', ['-p', `require('drizzle-orm/minipg/package.json').version`], consumer());
		const imported = await runScript('node', [
			'--input-type=module',
			'-e',
			`import manifest from 'drizzle-orm/minipg/package.json' with { type: 'json' }; console.log(manifest.version);`,
		], consumer());
		expect({ required: required.trim(), imported: imported.trim() }).toEqual({ required: version, imported: version });
	});
});

describe.skipIf(!hasPostgres)('packed drizzle-orm with the standalone @drizzle-team/minipg as client', () => {
	const consumer = useConsumer(
		'standalone-consumer',
		async (dir) => {
			requireMinipgBuild();
			cpSync(instanceofScript, join(dir, 'instanceof.js'));
			return [await pack(ormDist, dir), await pack(minipgDir, dir)];
		},
		// A user installs the standalone package to get a newer release than the bundled copy.
		{ '@drizzle-team/minipg': '999.0.0' },
	);

	test('a standalone pool runs a query and a batch', async () => {
		const output = await runScript('node', ['standalone.ts'], consumer());
		expect(JSON.parse(output)).toEqual({
			query: [{ value: 'ok' }],
			batch: [[{ value: 1 }], [{ value: 2 }]],
		});
	});

	test('a standalone pool type-checks as client', async () => {
		expect(await typeCheck('standalone.ts', consumer())).toBe('');
	});

	test('instanceof works in both directions between the bundled copy and the standalone package', async () => {
		const output = await runScript('node', ['instanceof.js', 'drizzle-orm/minipg', '@drizzle-team/minipg'], consumer());
		expect(JSON.parse(output)).toEqual(instanceofInBothDirections);
	});
});

describe.skipIf(!hasPostgres)('two packed copies of @drizzle-team/minipg', () => {
	const consumer = useConsumer(
		'two-minipg-copies',
		async (dir) => {
			requireMinipgBuild();
			cpSync(instanceofScript, join(dir, 'instanceof.js'));
			const minipg = await pack(minipgDir, dir);
			return [minipg, `minipg-copy@file:${minipg}`];
		},
		// TypeScript treats two packages with the same name and version as one package,
		// so the copy gets another version, as a copy from another release would have.
		{ 'minipg-copy': '0.0.0' },
	);

	test('instanceof works in both directions for Pool, Connection and PgError', async () => {
		const output = await runScript('node', ['instanceof.js', '@drizzle-team/minipg', 'minipg-copy'], consumer());
		expect(JSON.parse(output)).toEqual(instanceofInBothDirections);
	});

	test('a Pool and a Connection from one copy type-check as the other copy', async () => {
		expect(await typeCheck('types.ts', consumer())).toBe('');
	});
});
