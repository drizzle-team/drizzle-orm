import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { check, exportSql, generate, pull, push, up } from '../../../src/sdk';
import { stageValid } from '../check-fixtures';
import { stageUpNonLatest } from '../up-fixtures';

const tmpRoot = resolve(tmpdir(), 'drizzle-kit-no-stdout');

// The vitest config sets TEST_CONFIG_PATH_PREFIX=./tests/cli/ globally so config-relative paths
// resolve to fixtures. SDK regression tests pass absolute schema paths from tmpdir(); the prefix
// breaks absolute paths (./tests/cli//tmp/... is invalid). Unset for this file.

const setupFixture = (name: string) => {
	const dir = resolve(tmpRoot, name);
	mkdirSync(dir, { recursive: true });
	const schemaPath = resolve(dir, 'schema.ts');
	writeFileSync(schemaPath, '// empty schema — produces no_changes envelope for SDK smoke\n');
	return { dir, schemaPath };
};

describe('SDK does not invoke process.stdout.write or process.exit', () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
		delete process.env.TEST_CONFIG_PATH_PREFIX;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalPrefix !== undefined) {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	});

	// mockRestore() clears mock.calls, so assertions must target the manually captured arrays,
	// not the restored spies — `expect(spy).toHaveBeenCalledTimes(0)` after restore is vacuous.
	test('generate (no_changes smoke) does not call process.stdout.write or process.exit', async () => {
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

		const { dir, schemaPath } = setupFixture('generate-no-stdout');
		try {
			const result = await generate({
				dialect: 'postgresql',
				schema: schemaPath,
				out: dir,
			});

			expect(result).toBeDefined();
			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			expect(result.status).toBe('no_changes');
			expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
			expect(exitCalls).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('push (missing-schema error smoke) does not call process.stdout.write or process.exit', async () => {
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
			// Use a missing schema path — push surfaces a schema_files_not_found_error envelope from
			// preparePushConfig BEFORE any DB connection. The SDK boundary captures it via onResult;
			// stdout MUST remain untouched.
			const result = await push({
				dialect: 'postgresql',
				schema: 'tests/definitely-missing-schema.ts',
				url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
			});

			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			expect(result.status).toBe('error');
			expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
			expect(exitCalls).toEqual([]);
		} catch (err) {
			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			throw err;
		}
	});

	test('pull (unreachable-DB error smoke) does not call process.stdout.write or process.exit', async () => {
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

		const { dir } = setupFixture('pull-no-stdout');
		try {
			// Unreachable URL — pull fails at the connect span before any introspection, surfacing a
			// database_driver_error envelope. This pre-connection failure path stays pure without a real DB.
			const result = await pull({
				dialect: 'postgresql',
				url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
				out: dir,
			});

			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			expect(result.status).toBe('error');
			expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
			expect(exitCalls).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('check (ok smoke) does not call process.stdout.write or process.exit', async () => {
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

		const out = stageValid();
		try {
			const result = await check({ dialect: 'postgresql', out });

			expect(result).toBeDefined();
			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			expect(result.status).toBe('ok');
			expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
			expect(exitCalls).toEqual([]);
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	});

	test('up (ok smoke) does not call process.stdout.write or process.exit', async () => {
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

		const out = stageUpNonLatest();
		try {
			const result = await up({ dialect: 'postgresql', out });

			expect(result).toBeDefined();
			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			expect(result.status).toBe('ok');
			// up is the one verb whose file writes are the deliverable — the snapshot must be mutated
			// to the latest format on disk even though no stdout/exit side effect escapes.
			expect((result as { upgraded: string[] }).upgraded.length).toBeGreaterThan(0);
			const mutated = JSON.parse(readFileSync(join(out, '0000_init', 'snapshot.json'), 'utf8'));
			expect(mutated.version).toBe('8');
			expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
			expect(exitCalls).toEqual([]);
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	});

	test('exportSql (ok smoke) does not call process.stdout.write or process.exit', async () => {
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

		const { dir, schemaPath } = setupFixture('export-no-stdout');
		try {
			// Empty schema diffs against empty state → `ok` with empty statements/warnings.
			const result = await exportSql({ dialect: 'postgresql', schema: schemaPath });

			expect(result).toBeDefined();
			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			expect(result.status).toBe('ok');
			expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
			expect(exitCalls).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
