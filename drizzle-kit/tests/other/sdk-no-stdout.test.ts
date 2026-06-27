import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { check, exportSql, generate, pull, push, up } from '../../src/cli-sdk';
import { stageValid } from './check-fixtures';
import { stageUpNonLatest } from './up-fixtures';

const tmpRoot = resolve(tmpdir(), 'drizzle-kit-no-stdout');

let cleanups: Array<() => void> = [];

const stageEmptySchema = (name: string) => {
	const dir = resolve(tmpRoot, name);
	mkdirSync(dir, { recursive: true });
	const schemaPath = resolve(dir, 'schema.ts');
	writeFileSync(schemaPath, '// empty schema — produces a no_changes envelope for the SDK smoke\n');
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return { dir, schemaPath };
};

// Spy on process.stdout.write / process.exit, run the SDK call, then restore the spies.
// mockRestore() clears mock.calls, so we capture into our own arrays — asserting on the restored
// spy afterwards would be vacuous.
const captureStdoutAndExit = async <T extends { status: string }>(run: () => Promise<T>) => {
	const stdoutCalls: unknown[][] = [];
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(
		((...args: unknown[]) => {
			stdoutCalls.push(args);
			return true;
		}) as unknown as typeof process.stdout.write,
	);
	const exitCalls: unknown[] = [];
	const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
		(((code?: unknown) => {
			exitCalls.push(code);
		}) as unknown) as never,
	);
	try {
		const result = await run();
		return { result, stdoutCalls, exitCalls };
	} finally {
		stdoutSpy.mockRestore();
		exitSpy.mockRestore();
	}
};

const expectSilent = (stdoutCalls: unknown[][], exitCalls: unknown[]) => {
	expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
	expect(exitCalls).toEqual([]);
};

describe('SDK does not invoke process.stdout.write or process.exit', () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		// The `pnpm test` script sets TEST_CONFIG_PATH_PREFIX=./tests/cli/ for the whole run. These
		// tests pass absolute schema paths from tmpdir(), which the prefix would corrupt, so unset it.
		originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
		delete process.env.TEST_CONFIG_PATH_PREFIX;
		cleanups = [];
	});

	afterEach(() => {
		vi.restoreAllMocks();
		for (const fn of cleanups) fn();
		if (originalPrefix !== undefined) {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	});

	test('generate stays silent on a no_changes run', async () => {
		const { dir, schemaPath } = stageEmptySchema('generate-no-stdout');
		const { result, stdoutCalls, exitCalls } = await captureStdoutAndExit(() =>
			generate({ dialect: 'postgresql', schema: schemaPath, out: dir })
		);
		expect(result.status).toBe('no_changes');
		expectSilent(stdoutCalls, exitCalls);
	});

	test('push stays silent when the schema file is missing', async () => {
		// Missing schema path → a schema_files_not_found_error envelope from preparePushConfig, before
		// any DB connection. stdout must remain untouched.
		const { result, stdoutCalls, exitCalls } = await captureStdoutAndExit(() =>
			push({
				dialect: 'postgresql',
				schema: 'tests/definitely-missing-schema.ts',
				url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
			})
		);
		expect(result.status).toBe('error');
		expectSilent(stdoutCalls, exitCalls);
	});

	test('pull stays silent when the database is unreachable', async () => {
		// Unreachable URL → a database_driver_error at the connect span, before any introspection.
		const { dir } = stageEmptySchema('pull-no-stdout');
		const { result, stdoutCalls, exitCalls } = await captureStdoutAndExit(() =>
			pull({ dialect: 'postgresql', url: 'postgresql://invalid:invalid@127.0.0.1:1/none', out: dir })
		);
		expect(result.status).toBe('error');
		expectSilent(stdoutCalls, exitCalls);
	});

	test('check stays silent on an ok run', async () => {
		const out = stageValid();
		cleanups.push(() => rmSync(out, { recursive: true, force: true }));
		const { result, stdoutCalls, exitCalls } = await captureStdoutAndExit(() => check({ dialect: 'postgresql', out }));
		expect(result.status).toBe('ok');
		expectSilent(stdoutCalls, exitCalls);
	});

	test('exportSql stays silent on an ok run', async () => {
		// Empty schema diffs against empty state → ok with empty statements/warnings.
		const { schemaPath } = stageEmptySchema('export-no-stdout');
		const { result, stdoutCalls, exitCalls } = await captureStdoutAndExit(() =>
			exportSql({ dialect: 'postgresql', schema: schemaPath })
		);
		expect(result.status).toBe('ok');
		expectSilent(stdoutCalls, exitCalls);
	});

	test('up stays silent while still writing the upgraded snapshot to disk', async () => {
		const out = stageUpNonLatest();
		cleanups.push(() => rmSync(out, { recursive: true, force: true }));
		const { result, stdoutCalls, exitCalls } = await captureStdoutAndExit(() => up({ dialect: 'postgresql', out }));
		expect(result.status).toBe('ok');
		// up is the one verb whose file writes are the deliverable — the snapshot must be migrated to
		// the latest format on disk even though nothing escapes to stdout/exit.
		expect((result as { upgraded: string[] }).upgraded.length).toBeGreaterThan(0);
		const mutated = JSON.parse(readFileSync(join(out, '0000_init', 'snapshot.json'), 'utf8'));
		expect(mutated.version).toBe('8');
		expectSilent(stdoutCalls, exitCalls);
	});
});
