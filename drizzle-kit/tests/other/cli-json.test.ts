import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { JsonModeUnsupportedCliError } from '../../src/cli/errors';
import { HintsHandler } from '../../src/cli/hints';
import { setJsonMode } from '../../src/cli/mode';

class ExitCalled extends Error {
	constructor(readonly code: string | number | null | undefined) {
		super(`process.exit:${String(code)}`);
	}
}

const mockNoopProgressView = () => {
	vi.doMock('../../src/cli/views', async () => {
		const actual = await vi.importActual<typeof import('../../src/cli/views')>('../../src/cli/views');

		class NoopProgressView {
			constructor(..._args: unknown[]) {}

			update(..._args: unknown[]) {}

			stop() {}
		}

		return {
			...actual,
			ProgressView: NoopProgressView,
		};
	});
};

const captureJsonModeRun = async <T>(fn: () => Promise<T>) => {
	const chunks: string[] = [];
	const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(
		((chunk: string | Uint8Array) => {
			chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
			return true;
		}) as unknown as typeof process.stdout.write,
	);
	const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
		((code?: string | number | null) => {
			throw new ExitCalled(code);
		}) as unknown as typeof process.exit,
	);
	let exitCode: string | number | null | undefined;
	let result: T | undefined;
	try {
		result = await fn();
	} catch (err) {
		if (!(err instanceof ExitCalled)) throw err;
		exitCode = err.code;
	} finally {
		writeSpy.mockRestore();
		exitSpy.mockRestore();
	}
	return { output: chunks.join(''), exitCode, result };
};

beforeEach(() => {
	mockNoopProgressView();
	setJsonMode(false);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

test('json version output uses root special case payload', () => {
	const script = [
		'(async () => {',
		"process.argv = ['node','drizzle-kit','--json','--version'];",
		"await import('./src/cli/index.ts');",
		'})().catch((err) => {',
		'console.error(err);',
		'process.exit(1);',
		'});',
	].join(' ');

	const result = spawnSync('pnpm', ['exec', 'tsx', '-e', script], {
		cwd: process.cwd(),
		encoding: 'utf8',
	});

	expect(result.status).not.toBeNull();
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toHaveProperty('kitVersion');
	expect(parsed).toHaveProperty('ormVersion');
});

test('json error output includes structured cli error fields', () => {
	const script = [
		'(async () => {',
		"process.argv = ['node','drizzle-kit','up','--json','--config=foo.ts','--dialect=postgresql'];",
		"await import('./src/cli/index.ts');",
		'})().catch((err) => {',
		'console.error(err);',
		'process.exit(1);',
		'});',
	].join(' ');

	const result = spawnSync('pnpm', ['exec', 'tsx', '-e', script], {
		cwd: process.cwd(),
		encoding: 'utf8',
	});

	expect(result.status).not.toBeNull();
	expect(result.stderr).toContain("You can't use both --config and other cli options for check command");
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toStrictEqual({
		status: 'error',
		error: {
			code: 'ambiguous_params_error',
			command: 'check',
			configOption: 'config',
		},
	});
});

test('up handler emits json summary and upgrades snapshot files', async () => {
	vi.doMock('../../src/cli/utils', async () => {
		const actual = await vi.importActual<typeof import('../../src/cli/utils')>('../../src/cli/utils');
		return {
			...actual,
			assertOrmCoreVersion: vi.fn(async () => {}),
			assertPackages: vi.fn(async () => {}),
		};
	});

	const { setJsonMode } = await import('../../src/cli/mode');
	const { up } = await import('../../src/cli/schema');
	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-up-json-'));
	const migrationDir = join(tempDir, '1700000000000_init');
	mkdirSync(migrationDir, { recursive: true });

	const fixturePath = join(process.cwd(), 'tests/postgres/snapshots/snapshot05-0.23.2.json');
	const snapshotTarget = join(migrationDir, 'snapshot.json');
	writeFileSync(snapshotTarget, readFileSync(fixturePath, 'utf8'));

	const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const originalCwd = process.cwd();
	setJsonMode(true);

	process.chdir(tempDir);
	try {
		await up.handler?.({ out: '.', dialect: 'postgresql' });
	} finally {
		process.chdir(originalCwd);
	}

	const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(output);
	const upgradedSnapshot = JSON.parse(readFileSync(snapshotTarget, 'utf8'));

	expect(parsed).toStrictEqual({
		status: 'ok',
		upgradedFiles: ['1700000000000_init/snapshot.json'],
	});
	expect(upgradedSnapshot.version).toBe('8');
	expect(upgradedSnapshot.dialect).toBe('postgres');
});

test('push postgres explain emits structured json payload in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({
			schema: { from: 'db' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({
			schemas: [],
			views: [],
			matViews: [],
		})),
		fromDrizzleSchema: vi.fn(() => ({
			schema: { to: 'schema' },
			errors: [],
			warnings: [],
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;'],
			statements: [
				{
					type: 'alter_column',
					to: { schema: 'public', table: 'users', name: 'name' },
					diff: {
						notNull: { from: false, to: true },
					},
				},
			],
			groupedStatements: [
				{
					jsonStatement: {
						type: 'alter_column',
						to: { schema: 'public', table: 'users', name: 'name' },
						diff: {
							notNull: { from: false, to: true },
						},
					},
					sqlStatements: ['ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;'],
				},
			],
		})),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({
			query: vi.fn(async () => []),
		})),
	}));

	const { setJsonMode } = await import('../../src/cli/mode');
	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	setJsonMode(true);

	await pushPostgres.handle(
		['schema.ts'],
		false,
		{} as never,
		[] as never,
		false,
		undefined,
		true,
		{ table: '__drizzle_migrations', schema: 'public' },
		new HintsHandler(),
	);

	const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
	const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(stdout);

	expect(parsed).toMatchObject({
		status: 'ok',
		dialect: 'postgres',
		hints: [],
	});
	expect(parsed.statements).toHaveLength(1);
	expect(parsed.statements[0]).toMatchObject({
		type: 'alter_column',
		to: { schema: 'public', table: 'users', name: 'name' },
		diff: {
			notNull: { from: false, to: true },
		},
	});
	expect(stderr).toBe('');
	expect(stdout).not.toContain('Generated migration statements');
	setJsonMode(false);
});

test('generate postgres explain emits structured json payload in json mode', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/postgres/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'postgres', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgres', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return {
			...actual,
			createDDL: vi.fn(() => ({ kind: 'ddl' })),
		};
	});

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return {
			...actual,
			createDDL: vi.fn(() => ({ kind: 'ddl' })),
		};
	});

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return {
			...actual,
			createDDL: vi.fn(() => ({ kind: 'ddl' })),
		};
	});

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;'],
				renames: [],
				statements: [
					{
						type: 'alter_column',
						to: { schema: 'public', table: 'users', name: 'name' },
						diff: {
							notNull: { from: false, to: true },
						},
					},
				],
				groupedStatements: [
					{
						jsonStatement: {
							type: 'alter_column',
							to: { schema: 'public', table: 'users', name: 'name' },
							diff: {
								notNull: { from: false, to: true },
							},
						},
						sqlStatements: ['ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;'],
					},
				],
			})),
		};
	});

	const { setJsonMode } = await import('../../src/cli/mode');
	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-json-'));
	await generatePostgres.handle({
		out: tempDir,
		filenames: ['schema.ts'],
		casing: undefined,
		custom: false,
		name: undefined,
		breakpoints: false,
		explain: true,
		hints: new HintsHandler(),
	} as never);

	const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
	const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(stdout);

	expect(parsed).toMatchObject({
		status: 'ok',
		dialect: 'postgres',
		hints: [],
	});
	expect(parsed.statements).toHaveLength(1);
	expect(parsed.statements[0]).toMatchObject({
		type: 'alter_column',
		to: { schema: 'public', table: 'users', name: 'name' },
		diff: {
			notNull: { from: false, to: true },
		},
	});
	expect(stderr).toBe('');
	expect(stdout).not.toContain('Your SQL migration');
	setJsonMode(false);
});

test('explainJsonOutput sanitizes hints: strips ANSI, excludes statement', async () => {
	const chalk = await import('chalk');
	const { explainJsonOutput } = await import('../../src/cli/views');

	const hints = [
		{
			hint: `You're about to delete non-empty ${chalk.default.underline('users')} table`,
			statement: 'DROP TABLE "users" CASCADE;',
		},
		{
			hint: `You're about to add not-null ${
				chalk.default.underline('email')
			} column without default value to a non-empty ${chalk.default.underline('users')} table`,
		},
	];

	const output = explainJsonOutput('postgres', [], hints);

	expect(output.status).toBe('ok');
	expect(output.dialect).toBe('postgres');
	if (output.status !== 'ok') {
		throw new Error('Expected ok explain output');
	}
	expect(output.hints).toHaveLength(2);

	// Verify ANSI codes are stripped from JSON output
	expect(output.hints[0]).toStrictEqual({
		hint: "You're about to delete non-empty users table",
	});
	expect(output.hints[1]).toStrictEqual({
		hint: "You're about to add not-null email column without default value to a non-empty users table",
	});

	// Verify statement field is excluded from all hints
	for (const h of output.hints) {
		expect(h).not.toHaveProperty('statement');
	}
});

test('generate writeResult emits json for no-op when json mode is active', async () => {
	const { setJsonMode } = await import('../../src/cli/mode');
	const { writeResult } = await import('../../src/cli/commands/generate-common');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	setJsonMode(true);

	writeResult({
		snapshot: {} as never,
		sqlStatements: [],
		outFolder: '',
		breakpoints: false,
		renames: [],
		snapshots: [],
	});

	const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(stdout);

	expect(parsed).toStrictEqual({
		status: 'ok',
		message: 'No schema changes, nothing to migrate',
	});
	setJsonMode(false);
});

test('generate sqlite in json mode throws JsonModeUnsupportedCliError', async () => {
	const { setJsonMode } = await import('../../src/cli/mode');
	const { JsonModeUnsupportedCliError: JsonModeUnsupportedCliErrorDyn } = await import('../../src/cli/errors');
	const generateSqlite = await import('../../src/cli/commands/generate-sqlite');
	setJsonMode(true);
	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-custom-json-'));
	await expect(
		generateSqlite.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: true,
			name: undefined,
			breakpoints: false,
		} as never),
	).rejects.toBeInstanceOf(JsonModeUnsupportedCliErrorDyn);
});

test('push postgres schema warnings do not leak to stdout in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({
			schema: { from: 'db' },
		})),
	}));

	vi.doMock('../../src/dialects/drizzle', () => ({
		extractPostgresExisting: vi.fn(() => ({})),
	}));

	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({
			schemas: [],
			views: [],
			matViews: [],
		})),
		fromDrizzleSchema: vi.fn(() => ({
			schema: { to: 'schema' },
			errors: [],
			warnings: [{ type: 'policy_not_linked', policy: 'test_policy' }],
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [],
			statements: [],
			groupedStatements: [],
		})),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({
			query: vi.fn(async () => []),
		})),
	}));

	const { setJsonMode } = await import('../../src/cli/mode');
	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	setJsonMode(true);

	await pushPostgres.handle(
		['schema.ts'],
		false,
		{} as never,
		[] as never,
		false,
		undefined,
		false,
		{ table: '__drizzle_migrations', schema: 'public' },
		new HintsHandler(),
	);

	const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
	const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(stdout);

	// Should get clean JSON: no-op result since sqlStatements is empty
	expect(parsed).toStrictEqual({
		status: 'ok',
		dialect: 'postgres',
		message: 'No changes detected',
	});
	// Warning text must NOT appear on stdout
	expect(stdout).not.toContain('policy_not_linked');
	expect(stdout).not.toContain('Policy');
	// stderr should also be clean (warnings go through humanLog which suppresses in JSON mode)
	expect(stderr).toBe('');
	setJsonMode(false);
});

test('push postgres emits missing_hints for unresolved schema rename in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async (...args: unknown[]) => {
			const schemaResolver = args[2] as (
				it: { created: { name: string }[]; deleted: { name: string }[] },
			) => Promise<unknown>;
			await schemaResolver({
				created: [{ name: 'next_schema' }],
				deleted: [{ name: 'prev_schema' }],
			});
			return {
				sqlStatements: ['CREATE SCHEMA "next_schema";'],
				statements: [],
				groupedStatements: [],
			};
		}),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({
			query: vi.fn(async () => []),
		})),
	}));

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const { setJsonMode } = await import('../../src/cli/mode');
	const hints = new HintsHandler();
	setJsonMode(true);

	const { output, exitCode } = await captureJsonModeRun(() =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			undefined,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		)
	);

	expect(exitCode).toBe(2);
	const parsed = JSON.parse(output.trim());
	expect(parsed).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema'] },
		],
	});
});

test('push postgres emits missing_hints for schema rename and table drop in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async (...args: unknown[]) => {
			const schemaResolver = args[2] as (
				it: { created: { name: string }[]; deleted: { name: string }[] },
			) => Promise<unknown>;
			await schemaResolver({
				created: [{ name: 'next_schema' }],
				deleted: [{ name: 'prev_schema' }],
			});
			return {
				sqlStatements: ['DROP TABLE "public"."users";'],
				statements: [{ type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' }],
				groupedStatements: [],
			};
		}),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({
			query: vi.fn(async () => [1]),
		})),
	}));

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const { setJsonMode } = await import('../../src/cli/mode');
	const hints = new HintsHandler();
	setJsonMode(true);

	const { output, exitCode } = await captureJsonModeRun(() =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			undefined,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		)
	);

	expect(exitCode).toBe(2);
	const parsed = JSON.parse(output.trim());
	expect(parsed).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema'] },
		],
	});
});

test('push postgres resolves schema rename hint and emits confirm missing_hint in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async (...args: unknown[]) => {
			const schemaResolver = args[2] as (
				it: { created: { name: string }[]; deleted: { name: string }[] },
			) => Promise<unknown>;
			await schemaResolver({
				created: [{ name: 'next_schema' }],
				deleted: [{ name: 'prev_schema' }],
			});
			return {
				sqlStatements: ['DROP TABLE "public"."users";'],
				statements: [{ type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' }],
				groupedStatements: [{
					jsonStatement: { type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' },
					sqlStatements: ['DROP TABLE "public"."users";'],
				}],
			};
		}),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({
			query: vi.fn(async () => [1]),
		})),
	}));

	const { setJsonMode } = await import('../../src/cli/mode');
	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'schema', from: ['prev_schema'], to: ['next_schema'] },
	]);
	setJsonMode(true);

	const { output, exitCode } = await captureJsonModeRun(() =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			undefined,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		)
	);

	expect(exitCode).toBe(2);
	const parsed = JSON.parse(output.trim());
	expect(parsed).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'], reason: 'non_empty' },
		],
	});
});

test('generate postgres emits missing_hints for unresolved schema rename in json mode', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/postgres/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'postgres', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgres', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return {
			...actual,
			createDDL: vi.fn(() => ({ kind: 'ddl' })),
		};
	});

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async (...args: unknown[]) => {
				const schemaResolver = args[2] as (
					it: { created: { name: string }[]; deleted: { name: string }[] },
				) => Promise<unknown>;
				await schemaResolver({ created: [{ name: 'next_schema' }], deleted: [{ name: 'prev_schema' }] });
				return { sqlStatements: [], renames: [], statements: [], groupedStatements: [] };
			}),
		};
	});

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const { setJsonMode } = await import('../../src/cli/mode');
	const hints = new HintsHandler();
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-missing-hints-'));
	const { output, exitCode } = await captureJsonModeRun(() =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never)
	);

	expect(exitCode).toBe(2);
	const parsed = JSON.parse(output.trim());
	expect(parsed).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema'] },
		],
	});
});

test('generate postgres emits missing_hints for each unresolved schema independently', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/postgres/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'postgres', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgres', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return {
			...actual,
			createDDL: vi.fn(() => ({ kind: 'ddl' })),
		};
	});

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async (...args: unknown[]) => {
				const schemaResolver = args[2] as (
					it: { created: { name: string }[]; deleted: { name: string }[] },
				) => Promise<unknown>;
				await schemaResolver({
					created: [{ name: 'next_schema_a' }, { name: 'next_schema_b' }],
					deleted: [{ name: 'prev_schema_a' }, { name: 'prev_schema_b' }],
				});
				return { sqlStatements: [], renames: [], statements: [], groupedStatements: [] };
			}),
		};
	});

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const { setJsonMode } = await import('../../src/cli/mode');
	const hints = new HintsHandler();
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-missing-hints-branching-'));
	const { output, exitCode } = await captureJsonModeRun(() =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never)
	);

	expect(exitCode).toBe(2);
	const parsed = JSON.parse(output.trim());
	expect(parsed).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema_a'] },
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema_b'] },
		],
	});
});

test('push sqlite in json mode throws JsonModeUnsupportedCliError', async () => {
	const { setJsonMode } = await import('../../src/cli/mode');
	const { JsonModeUnsupportedCliError: JsonModeUnsupportedCliErrorDyn } = await import('../../src/cli/errors');
	const pushSqlite = await import('../../src/cli/commands/push-sqlite');
	setJsonMode(true);
	const mockDb = { query: vi.fn(), batch: vi.fn() };
	await expect(
		pushSqlite.handle(
			mockDb as never,
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			undefined,
			true,
			{ table: '__drizzle_migrations', schema: '' },
		),
	).rejects.toBeInstanceOf(JsonModeUnsupportedCliErrorDyn);
});

test('push mysql in json mode throws JsonModeUnsupportedCliError', async () => {
	const { setJsonMode } = await import('../../src/cli/mode');
	const { JsonModeUnsupportedCliError: JsonModeUnsupportedCliErrorDyn } = await import('../../src/cli/errors');
	const pushMysql = await import('../../src/cli/commands/push-mysql');
	setJsonMode(true);
	await expect(
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			undefined,
			{} as never,
			true,
			{ table: '__drizzle_migrations', schema: '' },
		),
	).rejects.toBeInstanceOf(JsonModeUnsupportedCliErrorDyn);
});

test('push postgres orders rename hint resolves create_or_rename and applies changes in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async (...args: unknown[]) => {
			const tableResolver = args[8] as (
				it: { created: { schema: string; name: string }[]; deleted: { schema: string; name: string }[] },
			) => Promise<unknown>;
			await tableResolver({
				created: [{ schema: 'public', name: 'orders1' }],
				deleted: [{ schema: 'public', name: 'orders' }],
			});
			return {
				sqlStatements: ['ALTER TABLE "public"."orders" RENAME TO "orders1";'],
				statements: [{
					type: 'alter_table_rename',
					from: { schema: 'public', name: 'orders' },
					to: { schema: 'public', name: 'orders1' },
				}],
				groupedStatements: [],
			};
		}),
	}));

	const dbQuery = vi.fn(async (_sql: string) => [] as unknown[]);
	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({ query: dbQuery })),
	}));

	const { setJsonMode } = await import('../../src/cli/mode');
	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'table', from: ['public', 'orders'], to: ['public', 'orders1'] },
	]);
	setJsonMode(true);

	const { output, exitCode } = await captureJsonModeRun(() =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			undefined,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		)
	);

	expect(exitCode).toBeUndefined();
	const parsed = JSON.parse(output.trim());
	expect(parsed).toMatchObject({ status: 'ok', dialect: 'postgres' });
	const probeCalls = dbQuery.mock.calls.filter((call) => /select 1 from .*orders1/i.test(String(call[0])));
	expect(probeCalls).toHaveLength(0);
});

test('push postgres emits missing_hints when rename_or_create lacks a hint in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async (...args: unknown[]) => {
			const tableResolver = args[8] as (
				it: { created: { schema: string; name: string }[]; deleted: { schema: string; name: string }[] },
			) => Promise<unknown>;
			await tableResolver({
				created: [{ schema: 'public', name: 'orders1' }],
				deleted: [{ schema: 'public', name: 'orders' }],
			});
			return { sqlStatements: [], statements: [], groupedStatements: [] };
		}),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({ query: vi.fn(async () => []) })),
	}));

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const { setJsonMode } = await import('../../src/cli/mode');
	const hints = new HintsHandler();
	setJsonMode(true);

	const { output, exitCode } = await captureJsonModeRun(() =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			undefined,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		)
	);

	expect(exitCode).toBe(2);
	const parsed = JSON.parse(output.trim());
	expect(parsed).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders1'] },
		],
	});
});

test('generate postgres with matching rename hint emits sql without missing_hints in json mode', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/postgres/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'postgres', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgres', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return { ...actual, createDDL: vi.fn(() => ({ kind: 'ddl' })) };
	});

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async (...args: unknown[]) => {
				const schemaResolver = args[2] as (
					it: { created: { name: string }[]; deleted: { name: string }[] },
				) => Promise<unknown>;
				await schemaResolver({ created: [{ name: 'next_schema' }], deleted: [{ name: 'prev_schema' }] });
				return { sqlStatements: ['CREATE SCHEMA "next_schema";'], renames: [], statements: [], groupedStatements: [] };
			}),
		};
	});

	const { setJsonMode } = await import('../../src/cli/mode');
	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'schema', from: ['prev_schema'], to: ['next_schema'] },
	]);
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-with-hints-'));
	const { exitCode } = await captureJsonModeRun(() =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never)
	);

	expect(exitCode).toBeUndefined();
});

test('generate silently ignores confirm_data_loss hints', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/postgres/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'postgres', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgres', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return { ...actual, createDDL: vi.fn(() => ({ kind: 'ddl' })) };
	});

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async () => ({ sqlStatements: [], renames: [], statements: [], groupedStatements: [] })),
		};
	});

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const hints = new HintsHandler([
		{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
	]);
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-ignore-confirm-'));
	const { exitCode } = await captureJsonModeRun(() =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never)
	);

	expect(exitCode).toBeUndefined();
});

test('excess hints referencing non-existent entities are silently ignored', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/postgres/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'postgres', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgres', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/ddl')>(
			'../../src/dialects/postgres/ddl',
		);
		return { ...actual, createDDL: vi.fn(() => ({ kind: 'ddl' })) };
	});

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async () => ({ sqlStatements: [], renames: [], statements: [], groupedStatements: [] })),
		};
	});

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'table', from: ['public', 'ghost_from'], to: ['public', 'ghost_to'] },
		{ type: 'create', kind: 'schema', entity: ['phantom'] },
	]);
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-excess-hints-'));
	const { exitCode } = await captureJsonModeRun(() =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never)
	);

	expect(exitCode).toBeUndefined();
});
