import { composeHint, optionalEnv } from '@drizzle-team/test-utils';
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
const kitDist = resolve(import.meta.dirname, '../../../drizzle-kit/dist');
const postgresDir = resolve(import.meta.dirname, '../../../postgres');
const instanceofScript = resolve(import.meta.dirname, 'instanceof.js');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
// The consumer projects have no `@types/node` of their own, so tsc reads the one installed here.
const nodeTypeRoots = resolve(import.meta.dirname, '../../node_modules/@types');

const connectionString = optionalEnv('PG_CONNECTION_STRING', composeHint('postgres'));

// Node can require() ESM without a flag from 20.19 and 22.12, the oldest versions in the ORM's engines range.
const requireNodeBinaries: Record<string, string | undefined> = {
	'20.19': optionalEnv('NODE_20_19_BINARY', 'Export the path to a Node 20.19 binary before running tests.'),
	'22.12': optionalEnv('NODE_22_12_BINARY', 'Export the path to a Node 22.12 binary before running tests.'),
};
const hasRequireNodeBinaries = Object.values(requireNodeBinaries).every(Boolean);

const bothDirections = { firstIsSecond: true, secondIsFirst: true };
const instanceofInBothDirections = {
	isSameClass: false,
	Pool: bothDirections,
	Connection: bothDirections,
	PgError: bothDirections,
	MyPool: { isFirstPool: true, isSecondPool: true, poolIsMyPool: false },
	unbranded: [],
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

function requirePostgresBuild() {
	if (!existsSync(join(postgresDir, 'dist/index.js'))) {
		throw new Error(
			'Drizzle Postgres is not built. Run `pnpm --filter @drizzle-team/postgres build` before this test.',
		);
	}
}

describe.skipIf(!connectionString)('packed drizzle-orm with its bundled copy of postgres', () => {
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

	test('drizzle-orm/postgres/client and its subpaths expose the bundled copy', async () => {
		const output = await runScript('node', ['postgres.js'], consumer());
		expect(JSON.parse(output)).toEqual({
			isPgError: true,
			code: '22012',
			point: { type: 'Point', coordinates: [1, 2] },
		});
	});

	test('drizzle-orm/postgres/client/package.json gives the version of the bundled copy', async () => {
		const { version } = JSON.parse(readFileSync(join(postgresDir, 'package.json'), 'utf8'));
		const required = await runScript(
			'node',
			['-p', `require('drizzle-orm/postgres/client/package.json').version`],
			consumer(),
		);
		const imported = await runScript('node', [
			'--input-type=module',
			'-e',
			`import manifest from 'drizzle-orm/postgres/client/package.json' with { type: 'json' }; console.log(manifest.version);`,
		], consumer());
		expect({ required: required.trim(), imported: imported.trim() }).toEqual({ required: version, imported: version });
	});
});

async function pushAndPull(cwd: string, node: string, config = 'drizzle.config.ts') {
	const kit = join(cwd, 'node_modules/drizzle-kit/bin.cjs');
	await runScript(node, ['reset.js'], cwd);
	rmSync(join(cwd, 'drizzle'), { recursive: true, force: true });
	const push = await runScript(node, [kit, 'push', '--config', config], cwd);
	const pull = await runScript(node, [kit, 'pull', '--config', config], cwd);
	return { push, pull, pulledSchema: readFileSync(join(cwd, 'drizzle/schema.ts'), 'utf8') };
}

describe.skipIf(!connectionString)('packed drizzle-kit with packed drizzle-orm and no other driver', () => {
	const consumer = useConsumer('kit-consumer', async (dir) => [await pack(ormDist, dir), await pack(kitDist, dir)]);

	function expectPostgresPushAndPull({ push, pull, pulledSchema }: Awaited<ReturnType<typeof pushAndPull>>) {
		expect(push).toContain(`Using 'drizzle-orm/postgres/client' driver`);
		expect(pull).toContain(`Using 'drizzle-orm/postgres/client' driver`);
		expect(pulledSchema).toContain('packed_kit');
		expect(pulledSchema).toContain('users');
	}

	test('the standalone @drizzle-team/postgres is not installed', () => {
		expect(existsSync(join(consumer(), 'node_modules/@drizzle-team/postgres'))).toBe(false);
	});

	test('drizzle-kit push and pull connect through drizzle-orm/postgres/client', async () => {
		expectPostgresPushAndPull(await pushAndPull(consumer(), 'node'));
	});

	describe.skipIf(!hasRequireNodeBinaries)('require()', () => {
		test.for(Object.keys(requireNodeBinaries))('drizzle-kit push and pull run under Node %s', async (version) => {
			expectPostgresPushAndPull(await pushAndPull(consumer(), requireNodeBinaries[version]!));
		});
	});
});

describe.skipIf(!connectionString)(
	'packed drizzle-kit with a standalone Drizzle Postgres pool as dbCredentials.client',
	() => {
		const consumer = useConsumer('kit-consumer', async (dir) => {
			requirePostgresBuild();
			return [await pack(ormDist, dir), await pack(kitDist, dir), await pack(postgresDir, dir)];
		});

		test('drizzle-kit push and pull query through the pool from dbCredentials.client', async () => {
			const { push, pull, pulledSchema } = await pushAndPull(consumer(), 'node', 'client.config.ts');
			expect(push).toContain('Using the Drizzle Postgres pool from dbCredentials.client');
			expect(pull).toContain('Using the Drizzle Postgres pool from dbCredentials.client');
			expect(push).not.toContain(`Using 'drizzle-orm/postgres/client' driver`);
			expect(pulledSchema).toContain('packed_kit');
			expect(pulledSchema).toContain('users');
		});
	},
);

describe.skipIf(!connectionString)('packed drizzle-orm with the standalone @drizzle-team/postgres as client', () => {
	const consumer = useConsumer(
		'standalone-consumer',
		async (dir) => {
			requirePostgresBuild();
			cpSync(instanceofScript, join(dir, 'instanceof.js'));
			return [await pack(ormDist, dir), await pack(postgresDir, dir)];
		},
		// A user installs the standalone package to get a newer release than the bundled copy.
		{ '@drizzle-team/postgres': '999.0.0' },
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
		const output = await runScript(
			'node',
			['instanceof.js', 'drizzle-orm/postgres/client', '@drizzle-team/postgres'],
			consumer(),
		);
		expect(JSON.parse(output)).toEqual(instanceofInBothDirections);
	});
});

describe.skipIf(!connectionString)('two packed copies of @drizzle-team/postgres', () => {
	const consumer = useConsumer(
		'two-postgres-copies',
		async (dir) => {
			requirePostgresBuild();
			cpSync(instanceofScript, join(dir, 'instanceof.js'));
			const postgres = await pack(postgresDir, dir);
			return [postgres, `postgres-copy@file:${postgres}`];
		},
		// TypeScript treats two packages with the same name and version as one package,
		// so the copy gets another version, as a copy from another release would have.
		{ 'postgres-copy': '0.0.0' },
	);

	test('instanceof works in both directions for every exported class', async () => {
		const output = await runScript('node', ['instanceof.js', '@drizzle-team/postgres', 'postgres-copy'], consumer());
		const { exportedClasses, ...result } = JSON.parse(output);
		expect(result).toEqual(instanceofInBothDirections);
		expect(exportedClasses).toBeGreaterThanOrEqual(22);
	});

	test('a Pool and a Connection from one copy type-check as the other copy', async () => {
		expect(await typeCheck('types.ts', consumer())).toBe('');
	});
});
