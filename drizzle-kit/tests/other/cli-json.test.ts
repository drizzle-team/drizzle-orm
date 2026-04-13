import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, expect, test, vi } from 'vitest';

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

test('explainJsonOutput sanitizes hints: strips ANSI, preserves bullet prefix, excludes statement', async () => {
	const chalk = await import('chalk');
	const { explainJsonOutput } = await import('../../src/cli/views');

	const hints = [
		{
			hint: `· You're about to delete non-empty ${chalk.default.underline('users')} table`,
			statement: 'DROP TABLE "users" CASCADE;',
		},
		{
			hint: `· You're about to add not-null ${
				chalk.default.underline('email')
			} column without default value to a non-empty ${chalk.default.underline('users')} table`,
		},
	];

	const output = explainJsonOutput('postgres', [], hints);

	expect(output.status).toBe('ok');
	expect(output.dialect).toBe('postgres');
	expect(output.hints).toHaveLength(2);

	// Verify ANSI codes are stripped and bullet prefix is preserved
	expect(output.hints[0]).toStrictEqual({
		hint: "· You're about to delete non-empty users table",
	});
	expect(output.hints[1]).toStrictEqual({
		hint: "· You're about to add not-null email column without default value to a non-empty users table",
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

test('push sqlite explain emits structured json payload in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-sqlite', () => ({
		introspect: vi.fn(async () => ({
			ddl: { from: 'db' },
		})),
	}));

	vi.doMock('../../src/dialects/sqlite/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({
			tables: [],
			views: [],
		})),
		fromDrizzleSchema: vi.fn(() => ({
			schema: { to: 'schema' },
		})),
	}));

	vi.doMock('../../src/dialects/drizzle', () => ({
		extractSqliteExisting: vi.fn(() => ({})),
	}));

	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => ({})),
	}));

	vi.doMock('../../src/dialects/sqlite/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));

	vi.doMock('../../src/dialects/sqlite/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['ALTER TABLE "items" ADD COLUMN "qty" integer NOT NULL DEFAULT 0;'],
			statements: [
				{
					type: 'add_column',
					column: { table: 'items', name: 'qty', type: 'integer', notNull: true, default: '0' },
				},
			],
			groupedStatements: [
				{
					jsonStatement: {
						type: 'add_column',
						column: { table: 'items', name: 'qty', type: 'integer', notNull: true, default: '0' },
					},
					sqlStatements: ['ALTER TABLE "items" ADD COLUMN "qty" integer NOT NULL DEFAULT 0;'],
				},
			],
		})),
	}));

	const { setJsonMode } = await import('../../src/cli/mode');
	const pushSqlite = await import('../../src/cli/commands/push-sqlite');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	setJsonMode(true);

	const mockDb = {
		query: vi.fn(async () => []),
		batch: vi.fn(async () => {}),
	};

	await pushSqlite.handle(
		mockDb as never,
		['schema.ts'],
		false,
		{} as never,
		[] as never,
		false,
		undefined,
		true,
		{ table: '__drizzle_migrations', schema: '' },
	);

	const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
	const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(stdout);

	expect(parsed).toMatchObject({
		status: 'ok',
		dialect: 'sqlite',
		hints: [],
	});
	expect(parsed.statements).toHaveLength(1);
	expect(parsed.statements[0]).toMatchObject({
		type: 'add_column',
	});
	expect(stderr).toBe('');
	setJsonMode(false);
});

test('generate --custom --json stdout stays parseable JSON only (no success banner)', async () => {
	vi.doMock('../../src/utils/utils-node', async () => {
		const actual = await vi.importActual<typeof import('../../src/utils/utils-node')>('../../src/utils/utils-node');
		return {
			...actual,
			prepareOutFolder: vi.fn(() => ({ snapshots: [] })),
		};
	});

	vi.doMock('../../src/dialects/sqlite/serializer', () => ({
		prepareSqliteSnapshot: vi.fn(async () => ({
			ddlCur: {},
			ddlPrev: {},
			snapshot: { version: '6', dialect: 'sqlite', id: 'snap' },
			custom: { version: '6', dialect: 'sqlite', id: 'custom', renames: [] },
		})),
	}));

	vi.doMock('../../src/dialects/sqlite/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/ddl')>(
			'../../src/dialects/sqlite/ddl',
		);
		return actual;
	});

	const { setJsonMode } = await import('../../src/cli/mode');
	const generateSqlite = await import('../../src/cli/commands/generate-sqlite');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	setJsonMode(true);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-custom-json-'));
	await generateSqlite.handle({
		out: tempDir,
		filenames: ['schema.ts'],
		casing: undefined,
		custom: true,
		name: undefined,
		breakpoints: false,
	} as never);

	const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
	const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
	const parsed = JSON.parse(stdout);

	expect(parsed).toStrictEqual({
		status: 'ok',
		message: 'Prepared empty file for your custom SQL migration',
	});
	// No human success banner leaked
	expect(stdout).not.toContain('Your SQL migration');
	expect(stdout).not.toContain('\u2713');
	expect(stderr).toBe('');
	setJsonMode(false);
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
