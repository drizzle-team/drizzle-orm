import { composeHint, optionalEnv } from '@drizzle/test-utils';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';
import { readSkillsRevisionFromDisk } from '../../../drizzle-kit/scripts/lib/read-skills-revision';

const exec = promisify(execFile);

const ormDist = resolve(import.meta.dirname, '../../../drizzle-orm/dist');
const kitDist = resolve(import.meta.dirname, '../../../drizzle-kit/dist');
const postgresDir = resolve(import.meta.dirname, '../../../postgres');
const instanceofScript = resolve(import.meta.dirname, 'instanceof.js');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
// The consumer projects have no `@types/node` of their own, so tsc reads the one installed here.
const nodeTypeRoots = resolve(import.meta.dirname, '../../node_modules/@types');

const connectionString = optionalEnv('PG_CONNECTION_STRING', composeHint('postgres'));

// The Node that runs the consumer projects. CI sets it from the matrix of Node versions, because vitest
// needs a newer Node than the oldest versions in the engines range.
const consumerNode = process.env['CONSUMER_NODE'] || 'node';

const bothDirections = { firstIsSecond: true, secondIsFirst: true };
const instanceofInBothDirections = {
	isSameClass: false,
	Pool: bothDirections,
	Connection: bothDirections,
	PgError: bothDirections,
	MyPool: { isFirstPool: true, isSecondPool: true, poolIsMyPool: false },
	unbranded: [],
};

// Each package is packed once per run, into one dir, and every consumer installs that tarball: the consumers packed
// drizzle-orm five times, @drizzle-team/postgres three and drizzle-kit twice.
const packDir = mkdtempSync(join(tmpdir(), 'drizzle-packed-'));
const packs = new Map<string, Promise<string>>();
function pack(packageDir: string): Promise<string> {
	let packed = packs.get(packageDir);
	if (!packed) {
		packed = exec('npm', ['pack', packageDir, '--json', '--pack-destination', packDir]).then(({ stdout }) => {
			// npm 12 prints an object keyed by package name, older npm prints an array.
			const [file] = Object.values<{ filename: string }>(JSON.parse(stdout));
			return join(packDir, file!.filename);
		});
		packs.set(packageDir, packed);
	}
	return packed;
}
afterAll(() => rmSync(packDir, { recursive: true, force: true }));

// The consumers' setups start together when the file starts, and each describe waits for its own: one npm install
// after another took most of this file's time. Only with a database: without one, the describes that use a consumer
// skip, and each consumer is set up by its describe, if at all.
const setups: (() => Promise<void>)[] = [];
beforeAll(() => {
	if (connectionString) { for (const start of setups) void start(); }
});

// Copies a template to a temporary dir and installs the packages that `install` returns into it.
// `versions` rewrites the version in the manifests of installed packages.
// Returns a getter, because the dir exists only after `beforeAll` has run.
function useConsumer(
	template: string,
	install: (consumer: string) => Promise<string[]>,
	versions: Record<string, string> = {},
): () => string {
	let consumer: string | undefined;
	let ready: Promise<void> | undefined;

	const start = () => {
		ready ??= (async () => {
			consumer = mkdtempSync(join(tmpdir(), `drizzle-${template}-`));
			cpSync(resolve(import.meta.dirname, template), consumer, { recursive: true });
			await exec('npm', ['install', '--no-audit', '--no-fund', ...await install(consumer)], { cwd: consumer });

			for (const [name, version] of Object.entries(versions)) {
				const manifest = join(consumer, 'node_modules', name, 'package.json');
				writeFileSync(manifest, JSON.stringify({ ...JSON.parse(readFileSync(manifest, 'utf8')), version }));
			}
		})();
		// Its describe reports a failure; until then it is not an unhandled rejection.
		ready.catch(() => {});
		return ready;
	};
	setups.push(start);

	beforeAll(() => start(), 300_000);

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
	node: (cwd) => runScript(consumerNode, ['main.js'], cwd),
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
	const consumer = useConsumer('consumer', async () => [await pack(ormDist)]);

	test.for(Object.keys(runtimes))('drizzle-orm/postgres runs a query under %s', async (runtime) => {
		const output = await runtimes[runtime]!(consumer());
		expect(JSON.parse(output)).toEqual([{ value: 'ok' }]);
	});

	test('require() loads drizzle-orm and runs a query', async () => {
		const output = await runScript(consumerNode, ['require.cjs'], consumer());
		expect(JSON.parse(output)).toEqual([{ value: 'ok' }]);
	});

	test('drizzle-orm/postgres and drizzle-orm/postgres/client/geometry expose the bundled copy', async () => {
		const output = await runScript(consumerNode, ['postgres.js'], consumer());
		expect(JSON.parse(output)).toEqual({
			isPgError: true,
			code: '22012',
			point: { type: 'Point', coordinates: [1, 2] },
		});
	});
});

const kitBin = 'node_modules/drizzle-kit/bin.js';

async function pushAndPull(cwd: string, config = 'drizzle.config.ts') {
	await runScript(consumerNode, ['reset.js'], cwd);
	rmSync(join(cwd, 'drizzle'), { recursive: true, force: true });
	const push = await runScript(consumerNode, [kitBin, 'push', '--config', config], cwd);
	const pull = await runScript(consumerNode, [kitBin, 'pull', '--config', config], cwd);
	return { push, pull, pulledSchema: readFileSync(join(cwd, 'drizzle/schema.ts'), 'utf8') };
}

describe.skipIf(!connectionString)('packed drizzle-kit with packed drizzle-orm and no other driver', () => {
	const consumer = useConsumer('kit-consumer', async () => [await pack(ormDist), await pack(kitDist)]);

	function expectPostgresPushAndPull({ push, pull, pulledSchema }: Awaited<ReturnType<typeof pushAndPull>>) {
		expect(push).toContain(`Using 'drizzle-orm/postgres' driver`);
		expect(pull).toContain(`Using 'drizzle-orm/postgres' driver`);
		expect(pulledSchema).toContain('packed_kit');
		expect(pulledSchema).toContain('users');
	}

	test('the standalone @drizzle-team/postgres is not installed', () => {
		expect(existsSync(join(consumer(), 'node_modules/@drizzle-team/postgres'))).toBe(false);
	});

	test('drizzle-kit push and pull connect through drizzle-orm/postgres', async () => {
		expectPostgresPushAndPull(await pushAndPull(consumer()));
	});

	test('require() loads drizzle-kit/api-postgres and generates a migration', async () => {
		const output = await runScript(consumerNode, ['require.cjs'], consumer());
		expect(JSON.parse(output)).toEqual([expect.stringContaining('CREATE TABLE "users"')]);
	});

	test('a CommonJS config that requires drizzle-orm reports the Node range without require(esm)', async () => {
		const failure = await exec(
			consumerNode,
			['--no-experimental-require-module', kitBin, 'generate', '--config', 'require-esm.config.cjs'],
			{ cwd: consumer() },
		).catch((error) => error);
		const kitPackage = JSON.parse(readFileSync(join(consumer(), 'node_modules/drizzle-kit/package.json'), 'utf8'));
		expect(`${failure.stdout ?? ''}${failure.stderr ?? ''}`).toContain(
			`drizzle-kit requires Node.js ${kitPackage.engines.node}`,
		);
	});

	test('drizzle-kit skills version prints the revision of the shipped skills', async () => {
		const revision = readSkillsRevisionFromDisk(join(consumer(), 'node_modules/drizzle-kit/skills'));
		expect(await runScript(consumerNode, [kitBin, 'skills', 'version'], consumer())).toBe(`${revision}\n`);
	});

	test('drizzle-kit skills installs the shipped skills', async () => {
		// Without a TTY, the skills CLI installs without a prompt only when it detects an agent.
		await exec(consumerNode, [kitBin, 'skills'], { cwd: consumer(), env: { ...process.env, AI_AGENT: 'opencode' } });
		expect(existsSync(join(consumer(), '.agents/skills/drizzle/SKILL.md'))).toBe(true);
	}, 180_000);
});

describe.skipIf(!connectionString)(
	'packed drizzle-kit with a standalone Drizzle Postgres pool as dbCredentials.client',
	() => {
		const consumer = useConsumer('kit-consumer', async () => {
			requirePostgresBuild();
			return [await pack(ormDist), await pack(kitDist), await pack(postgresDir)];
		});

		test('drizzle-kit push and pull query through the pool from dbCredentials.client', async () => {
			const { push, pull, pulledSchema } = await pushAndPull(consumer(), 'client.config.ts');
			expect(push).toContain('Using the Drizzle Postgres pool from dbCredentials.client');
			expect(pull).toContain('Using the Drizzle Postgres pool from dbCredentials.client');
			expect(push).not.toContain(`Using 'drizzle-orm/postgres' driver`);
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
			return [await pack(ormDist), await pack(postgresDir)];
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

	test('drizzle-orm/postgres/core loads no pool or connection of the bundled copy', async () => {
		const loaded: string[] = JSON.parse(await runScript('node', ['bundled-modules.js'], consumer()));
		expect(loaded.filter((url) => /\/(pool|connection)\.js$/.test(url))).toEqual([]);
	});

	test('instanceof works in both directions between the bundled copy and the standalone package', async () => {
		const output = await runScript(
			'node',
			['instanceof.js', 'drizzle-orm/postgres/client', '@drizzle-team/postgres'],
			consumer(),
		);
		const { exportedClasses, ...result } = JSON.parse(output);
		expect(result).toEqual(instanceofInBothDirections);
		expect(exportedClasses).toBeGreaterThanOrEqual(22);
	});
});

describe.skipIf(!connectionString)('two packed copies of @drizzle-team/postgres', () => {
	const consumer = useConsumer(
		'two-postgres-copies',
		async (dir) => {
			requirePostgresBuild();
			cpSync(instanceofScript, join(dir, 'instanceof.js'));
			const postgres = await pack(postgresDir);
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
