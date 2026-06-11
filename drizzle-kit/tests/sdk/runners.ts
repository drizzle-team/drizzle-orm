import { spawnSync } from 'child_process';
import type { GenerateOptions, PushOptions } from '../../src/cli/contract';
import type { generate, push } from '../../src/sdk';

export type ConformanceResponse = Awaited<ReturnType<typeof generate>> | Awaited<ReturnType<typeof push>>;

export type RunCliResult = { envelope: ConformanceResponse; exitCode: number | null };

const parseJsonEnvelope = (
	stdout: string,
	argv: string[],
	status: number | null,
	stderr: string,
): ConformanceResponse => {
	const lines = stdout.split('\n').filter((line) => line.trim().length > 0);
	const jsonLines = lines.filter((l) => l.trimStart().startsWith('{'));
	if (jsonLines.length === 0) {
		throw new Error(
			`runCli: no JSON envelope on stdout for argv=${
				JSON.stringify(argv)
			} (exit ${status}); stderr=${stderr}; stdout=${stdout}`,
		);
	}
	if (jsonLines.length !== 1) {
		throw new Error(
			`runCli: expected exactly 1 JSON envelope, got ${jsonLines.length} for argv=${
				JSON.stringify(argv)
			} (exit ${status}); stdout=${stdout}`,
		);
	}
	return JSON.parse(jsonLines[0]) as ConformanceResponse;
};

export const runCli = (argv: string[], env: NodeJS.ProcessEnv = {}): RunCliResult => {
	const script = [
		'(async () => {',
		`process.argv = ${JSON.stringify(['node', 'drizzle-kit', ...argv])};`,
		"await import('./src/cli/index.ts');",
		'})().catch((err) => { console.error(err); process.exit(1); });',
	].join(' ');

	// Scenarios that do not opt in to TEST_CONFIG_PATH_PREFIX must not inherit a
	// stale value from the parent vitest process or a previous scenario.
	const result = spawnSync('pnpm', ['exec', 'tsx', '-e', script], {
		cwd: process.cwd(),
		encoding: 'utf8',
		env: { ...process.env, TEST_CONFIG_PATH_PREFIX: '', ...env },
	});

	return {
		envelope: parseJsonEnvelope(result.stdout, argv, result.status, result.stderr),
		exitCode: result.status,
	};
};

const scenarioEnvKeys = ['TEST_CONFIG_PATH_PREFIX'] as const;

const withScenarioEnv = async <T>(env: NodeJS.ProcessEnv, fn: () => Promise<T>): Promise<T> => {
	const saved = new Map<string, string | undefined>();
	for (const key of scenarioEnvKeys) {
		saved.set(key, process.env[key]);
	}
	try {
		for (const key of scenarioEnvKeys) {
			if (key in env && typeof env[key] === 'string') {
				process.env[key] = env[key] as string;
			} else {
				delete process.env[key];
			}
		}
		return await fn();
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
};

export const runSdk = async (
	command: 'generate' | 'push',
	opts: GenerateOptions | PushOptions,
	env: NodeJS.ProcessEnv = {},
): Promise<ConformanceResponse> => {
	const sdk = await import('../../src/sdk');
	return withScenarioEnv(env, async () => {
		if (command === 'generate') {
			return sdk.generate(opts as GenerateOptions) as Promise<ConformanceResponse>;
		}
		if (command === 'push') {
			return sdk.push(opts as PushOptions) as Promise<ConformanceResponse>;
		}
		throw new Error(`runSdk: unknown command "${command}"`);
	});
};
