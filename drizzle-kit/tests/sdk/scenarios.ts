import { integer as pgInteger, pgTable } from 'drizzle-orm/pg-core';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import type { CheckOptions, ExportOptions, GenerateOptions, PushOptions, UpOptions } from '../../src/cli/contract';
import {
	makePgSnapshot,
	ORIGIN,
	stageConflict,
	stageMalformed,
	stageNonLatest,
	stageOut,
	stageUnsupported,
	stageValid,
	writeSnapshot,
} from './check-fixtures';
import { stageUpNonLatest } from './up-fixtures';

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
	}
	| {
		name: string;
		command: 'check';
		argv: string[];
		sdkOpts: CheckOptions;
		env?: NodeJS.ProcessEnv;
		setup?: () => Promise<void>;
		teardown?: () => Promise<void>;
		expectedShape?: 'ok' | 'error';
	}
	| {
		name: string;
		command: 'export';
		argv: string[];
		sdkOpts: ExportOptions;
		env?: NodeJS.ProcessEnv;
		setup?: () => Promise<void>;
		teardown?: () => Promise<void>;
		// export never returns no_changes/missing_hints — an empty schema is `ok` with empty arrays.
		expectedShape?: 'ok' | 'error';
	}
	| {
		name: string;
		command: 'up';
		argv: string[];
		sdkOpts: UpOptions;
		env?: NodeJS.ProcessEnv;
		setup?: () => Promise<void>;
		teardown?: () => Promise<void>;
		// up rewrites snapshots in place, so the parity test re-stages a fresh non-latest copy at
		// the same out path before each runner invocation.
		restage?: () => void;
		expectedShape?: 'ok' | 'error';
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

const makeCheckScenario = (
	name: string,
	stager: () => string,
	opts: { ignoreConflicts?: boolean; expectedShape: 'ok' | 'error' },
): Scenario => {
	let out: string;
	return {
		name,
		command: 'check',
		get argv(): string[] {
			return [
				'check',
				'--dialect=postgresql',
				`--out=${out}`,
				'--output',
				'json',
				...(opts.ignoreConflicts ? ['--ignore-conflicts'] : []),
			];
		},
		get sdkOpts(): CheckOptions {
			return {
				dialect: 'postgresql',
				out,
				...(opts.ignoreConflicts ? { ignoreConflicts: true } : {}),
			};
		},
		setup: async () => {
			out = stager();
		},
		teardown: async () => {
			rmSync(out, { recursive: true, force: true });
		},
		expectedShape: opts.expectedShape,
	};
};

const checkScenarios: Scenario[] = [
	makeCheckScenario('check postgresql ok', stageValid, { expectedShape: 'ok' }),
	makeCheckScenario('check postgresql unsupported', stageUnsupported, { expectedShape: 'error' }),
	makeCheckScenario('check postgresql non_latest', stageNonLatest, { expectedShape: 'error' }),
	makeCheckScenario('check postgresql malformed', stageMalformed, { expectedShape: 'error' }),
	makeCheckScenario('check postgresql conflicts', stageConflict, { expectedShape: 'error' }),
	makeCheckScenario('check postgresql ignore-conflicts ok', stageConflict, {
		ignoreConflicts: true,
		expectedShape: 'ok',
	}),
];

// export diffs against an empty state with no DB connection. The empty fixture schema at
// tests/cli/schema.ts produces `{ status:'ok', dialect, statements:[], warnings:[] }`. duckdb is
// unsupported (→ UnsupportedCommandDialectCliError); a missing schema path resolves to an error
// envelope inside config preparation before any dispatch.
const exportOkScenarios = (
	['postgresql', 'mysql', 'sqlite', 'mssql', 'cockroach', 'singlestore'] as const
).map((dialect): Scenario => ({
	name: `export ${dialect} ok`,
	command: 'export',
	argv: ['export', '--dialect', dialect, '--schema', './schema.ts', '--output', 'json'],
	sdkOpts: {
		dialect,
		schema: './schema.ts',
	},
	env: { TEST_CONFIG_PATH_PREFIX: './tests/cli/' },
	expectedShape: 'ok',
}));

const exportScenarios: Scenario[] = [
	...exportOkScenarios,
	{
		name: 'export duckdb error',
		command: 'export',
		argv: ['export', '--dialect', 'duckdb', '--schema', './schema.ts', '--output', 'json'],
		sdkOpts: {
			dialect: 'duckdb',
			schema: './schema.ts',
		},
		env: { TEST_CONFIG_PATH_PREFIX: './tests/cli/' },
		expectedShape: 'error',
	},
	{
		name: 'export postgres missing-schema-path error',
		command: 'export',
		argv: [
			'export',
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
];

// up mutates snapshot files in place, so CLI and SDK must stage at the SAME out path (D-02 emits
// the raw handler path, byte-identical only if both transports pass the same out) and the parity
// test must re-stage a fresh non-latest copy between the two runner calls (Pitfall 1).
const makeUpScenario = (
	name: string,
	stager: (out?: string) => string,
	opts: { expectedShape: 'ok' | 'error' },
): Scenario => {
	let out: string;
	return {
		name,
		command: 'up',
		get argv(): string[] {
			return ['up', '--dialect', 'postgresql', `--out=${out}`, '--output', 'json'];
		},
		get sdkOpts(): UpOptions {
			return { dialect: 'postgresql', out };
		},
		setup: async () => {
			out = stager();
		},
		restage: () => {
			stager(out);
		},
		teardown: async () => {
			rmSync(out, { recursive: true, force: true });
		},
		expectedShape: opts.expectedShape,
	};
};

// stageValid writes a latest (version:'8') snapshot — nothing to upgrade. Wrap it so it honors a
// caller-supplied out, letting the no-op scenario re-stage at the same path like the ok one.
const stageUpLatest = (out: string = stageOut()): string => {
	writeSnapshot(
		out,
		'0000_init',
		makePgSnapshot('p1', [ORIGIN], { users: pgTable('users', { id: pgInteger('id') }) }),
	);
	return out;
};

const upScenarios: Scenario[] = [
	makeUpScenario('up postgresql ok', stageUpNonLatest, { expectedShape: 'ok' }),
	makeUpScenario('up postgresql no-op', stageUpLatest, { expectedShape: 'ok' }),
	{
		name: 'up duckdb error',
		command: 'up',
		argv: ['up', '--dialect', 'duckdb', `--out=${outDir('up-duckdb', 'cli')}`, '--output', 'json'],
		sdkOpts: { dialect: 'duckdb', out: outDir('up-duckdb', 'sdk') },
		expectedShape: 'error',
	},
];

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
	...checkScenarios,
	...exportScenarios,
	...upScenarios,
];
