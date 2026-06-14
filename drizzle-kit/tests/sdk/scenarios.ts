import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import type { GenerateOptions, PushOptions } from '../../src/cli/contract';

export type Scenario =
	| {
		name: string;
		command: 'generate';
		argv: string[];
		sdkOpts: GenerateOptions;
		env?: NodeJS.ProcessEnv;
		setup?: () => Promise<void>;
		teardown?: () => Promise<void>;
		expectedShape?: 'ok' | 'no_changes' | 'missing_hints' | 'error';
	}
	| {
		name: string;
		command: 'push';
		argv: string[];
		sdkOpts: PushOptions;
		env?: NodeJS.ProcessEnv;
		setup?: () => Promise<void>;
		teardown?: () => Promise<void>;
		expectedShape?: 'ok' | 'no_changes' | 'missing_hints' | 'error';
	};

const tmpRoot = resolve(tmpdir(), 'drizzle-kit-sdk-conformance');

const outDir = (name: string, runner: 'cli' | 'sdk') =>
	resolve(tmpRoot, `${name.replace(/[^a-z0-9-]/gi, '-')}-${runner}`);

const cleanOut = async (name: string) => {
	rmSync(outDir(name, 'cli'), { recursive: true, force: true });
	rmSync(outDir(name, 'sdk'), { recursive: true, force: true });
};

// Empty schema fixture lives at tests/cli/schema.ts (`// mock` — no exports). With
// TEST_CONFIG_PATH_PREFIX=./tests/cli/, the CLI resolves './schema.ts' → 'tests/cli/schema.ts'.
// An empty schema produces `no_changes` directly (no tables to diff against).
const noChangesScenarios = (
	['postgresql', 'mysql', 'sqlite', 'mssql', 'cockroach', 'singlestore'] as const
).map((dialect): Scenario => ({
	name: `generate ${dialect} no_changes`,
	command: 'generate',
	argv: [
		'generate',
		'--dialect',
		dialect,
		'--schema',
		'./schema.ts',
		'--out',
		outDir(`generate-${dialect}-no-changes`, 'cli'),
		'--output',
		'json',
	],
	sdkOpts: {
		dialect,
		schema: './schema.ts',
		out: outDir(`generate-${dialect}-no-changes`, 'sdk'),
	},
	env: { TEST_CONFIG_PATH_PREFIX: './tests/cli/' },
	setup: async () => {
		await cleanOut(`generate-${dialect}-no-changes`);
	},
	teardown: async () => {
		await cleanOut(`generate-${dialect}-no-changes`);
	},
	expectedShape: 'no_changes',
}));

// Push DB-free error scenarios: missing-schema-path resolves to a schema_files_not_found_error
// envelope inside preparePushConfig — BEFORE any DB connection attempt — so these scenarios
// are reproducible across all six dialects without a docker container.
const pushMissingSchemaScenarios = (
	['postgresql', 'mysql', 'sqlite', 'mssql', 'cockroach', 'singlestore'] as const
).map((dialect): Scenario => ({
	name: `push ${dialect} missing-schema-path error`,
	command: 'push',
	argv: [
		'push',
		'--dialect',
		dialect,
		'--schema',
		'tests/definitely-missing-schema.ts',
		'--url',
		'postgresql://invalid:invalid@127.0.0.1:1/none',
		'--output',
		'json',
	],
	sdkOpts: {
		dialect,
		schema: 'tests/definitely-missing-schema.ts',
		url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
	},
	expectedShape: 'error',
}));

export const scenarios: Scenario[] = [
	...noChangesScenarios,
	{
		name: 'generate postgres missing-schema-path error',
		command: 'generate',
		argv: [
			'generate',
			'--dialect',
			'postgresql',
			'--schema',
			'tests/definitely-missing-schema.ts',
			'--output',
			'json',
		],
		sdkOpts: {
			dialect: 'postgresql',
			schema: 'tests/definitely-missing-schema.ts',
		},
		expectedShape: 'error',
	},
	...pushMissingSchemaScenarios,
];
