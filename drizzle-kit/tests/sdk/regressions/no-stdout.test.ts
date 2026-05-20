import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { generate, push } from '../../../src/sdk';

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

	test('generate (no_changes smoke) does not call process.stdout.write or process.exit', async () => {
		const stdoutCalls: unknown[][] = [];
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((...args: unknown[]) => {
			stdoutCalls.push(args);
			return true;
		}) as unknown as typeof process.stdout.write);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => {}) as unknown) as never);

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
			if (stdoutCalls.length > 0) {
				// eslint-disable-next-line no-console
				console.error('Unexpected stdout writes:', stdoutCalls.map((c) => String(c[0]).slice(0, 200)));
			}
			expect(result.status).toBe('no_changes');
			expect(stdoutSpy).toHaveBeenCalledTimes(0);
			expect(exitSpy).toHaveBeenCalledTimes(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('push (missing-schema error smoke) does not call process.stdout.write or process.exit', async () => {
		const stdoutCalls: unknown[][] = [];
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((...args: unknown[]) => {
			stdoutCalls.push(args);
			return true;
		}) as unknown as typeof process.stdout.write);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => {}) as unknown) as never);

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
			if (stdoutCalls.length > 0) {
				// eslint-disable-next-line no-console
				console.error('Unexpected stdout writes:', stdoutCalls.map((c) => String(c[0]).slice(0, 200)));
			}
			expect(result.status).toBe('error');
			expect(stdoutSpy).toHaveBeenCalledTimes(0);
			expect(exitSpy).toHaveBeenCalledTimes(0);
		} catch (err) {
			stdoutSpy.mockRestore();
			exitSpy.mockRestore();
			throw err;
		}
	});
});
