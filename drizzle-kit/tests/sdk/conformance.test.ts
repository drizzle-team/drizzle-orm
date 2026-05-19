import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { statusToExitCode } from '../../src/cli/schema';
import { runCli, runSdk } from './runners';
import { scenarios } from './scenarios';

type SupportedDialect = 'postgresql' | 'mysql' | 'sqlite' | 'turso' | 'singlestore' | 'mssql' | 'cockroach';

// push-sqlite.ts handles both 'sqlite' and 'turso'; generate-libsql.ts handles
// 'turso' for codegen. All other dialects map to <suffix>-{command}.ts uniformly.
const mapDialect = (
	command: 'generate' | 'push',
	dialect: SupportedDialect,
): string => {
	switch (dialect) {
		case 'postgresql':
			return 'postgres';
		case 'mysql':
			return 'mysql';
		case 'sqlite':
			return 'sqlite';
		case 'turso':
			return command === 'generate' ? 'libsql' : 'sqlite';
		case 'singlestore':
			return 'singlestore';
		case 'mssql':
			return 'mssql';
		case 'cockroach':
			return 'cockroach';
	}
};

describe.each(scenarios)('$name', (scenario) => {
	beforeEach(async () => {
		if (scenario.setup) await scenario.setup();
	});

	afterEach(async () => {
		if (scenario.teardown) await scenario.teardown();
	});

	test('cli emits the expected envelope', () => {
		const { envelope, exitCode } = runCli(scenario.argv, scenario.env);
		if (scenario.expectedShape) {
			expect(envelope.status).toBe(scenario.expectedShape);
		}
		expect(exitCode).toBe(statusToExitCode(envelope.status));
	});

	test('sdk emits the expected envelope', async () => {
		const result = await runSdk(scenario.command, scenario.sdkOpts, scenario.env);
		if (scenario.expectedShape) {
			expect(result.status).toBe(scenario.expectedShape);
		}
	});

	test('parity (cli ≡ sdk)', async () => {
		const { envelope: cliResult, exitCode } = runCli(scenario.argv, scenario.env);
		const sdkResult = await runSdk(scenario.command, scenario.sdkOpts, scenario.env);
		expect(sdkResult).toEqual(cliResult);
		expect(JSON.stringify(sdkResult)).toEqual(JSON.stringify(cliResult));
		expect(exitCode).toBe(statusToExitCode(cliResult.status));
	});

	test('per-dialect handle called exactly once', async () => {
		const modulePath = `../../src/cli/commands/${scenario.command}-${
			mapDialect(scenario.command, scenario.sdkOpts.dialect as SupportedDialect)
		}`;
		let callCount = 0;
		vi.resetModules();
		vi.doMock(modulePath, async (importOriginal) => {
			const actual = (await importOriginal()) as Record<string, unknown>;
			const originalHandle = actual.handle as (...args: unknown[]) => unknown;
			return {
				...actual,
				handle: async (...args: unknown[]) => {
					callCount += 1;
					return await originalHandle(...args);
				},
			};
		});
		try {
			const result = await runSdk(scenario.command, scenario.sdkOpts, scenario.env);
			// Error envelopes raised during config preparation (e.g. missing-schema) short-circuit
			// before dispatch, so the dialect handle is correctly never reached. For every other
			// status the dispatch chain must invoke handle exactly once.
			if (result.status === 'error') {
				expect(callCount).toBeLessThanOrEqual(1);
			} else {
				expect(callCount).toBe(1);
			}
		} finally {
			vi.doUnmock(modulePath);
			vi.resetModules();
		}
	});
});
