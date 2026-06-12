import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'child_process';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { stripAnsi } from 'hanji/utils';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HintsHandler } from '../../src/cli/hints';
import {
	makePgSnapshot as _makePgSnapshot,
	ORIGIN as _ORIGIN,
	stageConflict as _stageConflict,
	stageOut as _stageOut,
	stageValid as _stageValid,
	writeSnapshot as _writeSnapshot,
} from '../sdk/check-fixtures';

const runWithCliContext = async <T>(
	context: { output: 'text' | 'json'; interactive: boolean },
	callback: () => Promise<T> | T,
): Promise<T> => {
	const ctx = await import('../../src/cli/context');
	return ctx.runWithCliContext(context, callback);
};

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

const sqliteDbFrom = (client: BetterSqlite3.Database) => {
	return {
		query: async <T>(query: string, params: unknown[] = []) => {
			return client.prepare(query).bind(...params).all() as T[];
		},
		run: async (query: string) => {
			client.prepare(query).run();
		},
		batch: async (sqlStatements: string[]) => {
			for (const stmt of sqlStatements) {
				client.prepare(stmt).run();
			}
		},
	};
};

const mockSqliteViewsForLiveDb = () => {
	vi.doMock('../../src/cli/views', async () => {
		const actual = await vi.importActual<typeof import('../../src/cli/views')>('../../src/cli/views');
		return {
			...actual,
			ProgressView: actual.EmptyProgressView,
		};
	});
};

const runCli = (argv: string[], env: NodeJS.ProcessEnv = {}) => {
	const script = [
		'(async () => {',
		`process.argv = ${JSON.stringify(['node', 'drizzle-kit', ...argv])};`,
		"await import('./src/cli/index.ts');",
		'})().catch((err) => {',
		'console.error(err);',
		'process.exit(1);',
		'});',
	].join(' ');

	return spawnSync('pnpm', ['exec', 'tsx', '-e', script], {
		cwd: process.cwd(),
		encoding: 'utf8',
		env: { ...process.env, ...env },
	});
};

const resetMockedModules = () => {
	for (
		const modulePath of [
			'../../src/cli/views',
			'../../src/cli/utils',
			'../../src/cli/commands/pull-postgres',
			'../../src/cli/commands/pull-mysql',
			'../../src/cli/commands/pull-sqlite',
			'../../src/cli/commands/pull-cockroach',
			'../../src/cli/connections',
			'../../src/utils/utils-node',
			'../../src/dialects/drizzle',
			'../../src/dialects/pull-utils',
			'../../src/dialects/postgres/drizzle',
			'../../src/dialects/postgres/ddl',
			'../../src/dialects/postgres/diff',
			'../../src/dialects/postgres/serializer',
			'../../src/dialects/mysql/drizzle',
			'../../src/dialects/mysql/ddl',
			'../../src/dialects/mysql/diff',
			'../../src/dialects/sqlite/drizzle',
			'../../src/dialects/sqlite/ddl',
			'../../src/dialects/sqlite/diff',
			'../../src/dialects/sqlite/serializer',
			'../../src/dialects/cockroach/drizzle',
			'../../src/dialects/cockroach/ddl',
			'../../src/dialects/cockroach/diff',
			'../../src/cli/commands/pull-mssql',
			'../../src/dialects/mssql/drizzle',
			'../../src/dialects/mssql/ddl',
			'../../src/dialects/mssql/diff',
			'../../src/dialects/mysql/introspect',
			'../../src/dialects/singlestore/drizzle',
			'../../src/dialects/singlestore/diff',
		]
	) {
		vi.doUnmock(modulePath);
	}
};

beforeEach(() => {
	mockNoopProgressView();
});

afterEach(() => {
	vi.restoreAllMocks();
	resetMockedModules();
	vi.resetModules();
});

test('root --version prints human-readable output', () => {
	const result = runCli(['--version']);

	expect(result.status).toBe(0);
	expect(result.stdout).toContain('drizzle-kit:');
	expect(result.stdout).toContain('drizzle-orm:');
	expect(result.stdout).not.toContain('skills:');
	expect(() => JSON.parse(result.stdout.trim())).toThrow();
});

test('skills version prints the bundled revision on a single line', () => {
	const result = runCli(['skills', 'version'], { DRIZZLE_KIT_SKILLS_REVISION: '42' });

	expect(result.status).toBe(0);
	expect(stripAnsi(result.stdout).trim()).toBe('42');
});

test('json error output includes structured cli error fields', () => {
	const result = runCli(['generate', '--output', 'json', '--config=foo.ts', '--dialect=postgresql']);

	expect(result.status).not.toBeNull();
	expect(result.stderr).toContain("You can't use both --config and other cli options for generate command");
	expect(result.stdout.trim().startsWith('{')).toBe(true);
	expect(result.stdout.trim().endsWith('}')).toBe(true);
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toStrictEqual({
		status: 'error',
		error: {
			code: 'ambiguous_params_error',
			command: 'generate',
			configOption: 'config',
		},
	});
});

test('generate with config emits clean json stdout in json mode', () => {
	const result = runCli(
		['generate', '--output', 'json', '--config=drizzle.config.ts', '--explain'],
		{ TEST_CONFIG_PATH_PREFIX: './tests/cli/' },
	);

	expect(result.status).toBe(0);
	expect(result.stdout).not.toContain('Reading config file');
	expect(result.stdout).not.toContain('No config path provided');
	expect(result.stderr).not.toContain('Reading config file');
	expect(result.stderr).not.toContain('No config path provided');
	expect(JSON.parse(result.stdout.trim())).toStrictEqual({
		status: 'no_changes',
		dialect: 'postgresql',
	});
});

test('generate missing schema path emits structured json error', () => {
	const result = runCli([
		'generate',
		'--output',
		'json',
		'--dialect=postgresql',
		'--schema=tests/definitely-missing-schema.ts',
	]);

	expect(result.status).toBe(1);
	expect(result.stdout.trim().startsWith('{')).toBe(true);
	expect(result.stdout.trim().endsWith('}')).toBe(true);
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toMatchObject({
		status: 'error',
		error: {
			code: 'schema_files_not_found_error',
			paths: ['tests/definitely-missing-schema.ts'],
		},
	});
});

test('push missing schema path emits structured json error', () => {
	const result = runCli([
		'push',
		'--output',
		'json',
		'--dialect=postgresql',
		'--schema=tests/definitely-missing-schema.ts',
		'--url=postgres://postgres:postgres@127.0.0.1:5432/postgres',
	]);

	expect(result.status).toBe(1);
	expect(result.stdout.trim().startsWith('{')).toBe(true);
	expect(result.stdout.trim().endsWith('}')).toBe(true);
	const parsed = JSON.parse(result.stdout.trim());
	expect(parsed).toMatchObject({
		status: 'error',
		error: {
			code: 'schema_files_not_found_error',
			paths: ['tests/definitely-missing-schema.ts'],
		},
	});
});

test('push postgres schema errors throw structured cli errors in json mode', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({ query: vi.fn(async () => []) })),
	}));
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractPostgresExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({
			schema: { to: 'schema' },
			errors: [{ type: 'index_no_name', schema: 'public', table: 'users', sql: 'lower("name")' }],
			warnings: [],
		})),
	}));

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'command_output_error',
			meta: {
				command: 'push',
				stage: 'schema',
				dialect: 'postgresql',
			},
		});
});

test('push postgres ddl errors throw structured cli errors in json mode', async () => {
	const interimToDDL = vi.fn()
		.mockReturnValueOnce({ ddl: { from: 'db' }, errors: [] })
		.mockReturnValueOnce({ ddl: { to: 'schema' }, errors: [{ type: 'schema_name_duplicate', name: 'public' }] });

	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => ({ query: vi.fn(async () => []) })),
	}));
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractPostgresExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));
	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL,
	}));

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'command_output_error',
			meta: {
				command: 'push',
				stage: 'ddl',
				dialect: 'postgresql',
			},
		});
});

test('push mysql ddl errors throw structured cli errors in json mode', async () => {
	const interimToDDL = vi.fn()
		.mockReturnValueOnce({ ddl: { from: 'db' }, errors: [] })
		.mockReturnValueOnce({ ddl: { to: 'schema' }, errors: [{ type: 'table_name_conflict', name: 'users' }] });

	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
	}));
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', () => ({
		interimToDDL,
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			{} as never,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'command_output_error',
			meta: {
				command: 'push',
				stage: 'ddl',
				dialect: 'mysql',
			},
		});
});

test('push sqlite ddl errors throw structured cli errors in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-sqlite', () => ({
		introspect: vi.fn(async () => ({ ddl: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractSqliteExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/sqlite/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ tables: [], views: [] })),
	}));
	vi.doMock('../../src/dialects/sqlite/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [{ type: 'conflict_table', table: 'users' }] })),
	}));

	const pushSqlite = await import('../../src/cli/commands/push-sqlite');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushSqlite.handle(
			{ query: vi.fn(async () => []), batch: vi.fn(async () => []) } as never,
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			'sqlite',
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'command_output_error',
			meta: {
				command: 'push',
				stage: 'ddl',
				dialect: 'sqlite',
			},
		});
});

test('push cockroach schema errors throw structured cli errors in json mode', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
	}));
	vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractCrdbExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({
			schema: { to: 'schema' },
			errors: [{ type: 'index_no_name', schema: 'public', table: 'users', sql: 'lower("name")' }],
			warnings: [],
		})),
	}));

	const pushCockroach = await import('../../src/cli/commands/push-cockroach');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushCockroach.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'command_output_error',
			meta: {
				command: 'push',
				stage: 'schema',
				dialect: 'cockroach',
			},
		});
});

test('push cockroach ddl errors throw structured cli errors in json mode', async () => {
	const interimToDDL = vi.fn()
		.mockReturnValueOnce({ ddl: { from: 'db' }, errors: [] })
		.mockReturnValueOnce({ ddl: { to: 'schema' }, errors: [{ type: 'schema_name_duplicate', name: 'public' }] });

	vi.doMock('../../src/cli/connections', () => ({
		prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
	}));
	vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractCrdbExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));
	vi.doMock('../../src/dialects/cockroach/ddl', () => ({
		interimToDDL,
	}));

	const pushCockroach = await import('../../src/cli/commands/push-cockroach');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushCockroach.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'command_output_error',
			meta: {
				command: 'push',
				stage: 'ddl',
				dialect: 'cockroach',
			},
		});
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

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		));

	if (env.status !== 'ok' || !('statements' in env)) {
		throw new Error(`expected explain 'ok' envelope with statements, got '${env.status}'`);
	}
	expect(env).toMatchObject({
		status: 'ok',
		dialect: 'postgresql',
		hints: [],
	});
	expect(env.statements).toHaveLength(1);
	expect(env.statements[0]).toMatchObject({
		type: 'alter_column',
		to: { schema: 'public', table: 'users', name: 'name' },
		diff: {
			notNull: { from: false, to: true },
		},
	});
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
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

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-json-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints: new HintsHandler(),
		} as never));

	if (env.status !== 'ok' || !('statements' in env)) {
		throw new Error(`expected explain 'ok' envelope with statements, got '${env.status}'`);
	}
	expect(env).toMatchObject({
		status: 'ok',
		dialect: 'postgresql',
		hints: [],
	});
	expect(env.statements).toHaveLength(1);
	expect(env.statements[0]).toMatchObject({
		type: 'alter_column',
		to: { schema: 'public', table: 'users', name: 'name' },
		diff: {
			notNull: { from: false, to: true },
		},
	});
});

test('generate postgres explain emits no_changes for empty diff in json mode', async () => {
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
		})),
	}));

	vi.doMock('../../src/dialects/postgres/diff', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/postgres/diff')>(
			'../../src/dialects/postgres/diff',
		);
		return {
			...actual,
			ddlDiff: vi.fn(async () => ({
				sqlStatements: [],
				renames: [],
				statements: [],
				groupedStatements: [],
			})),
		};
	});

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-noop-json-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'postgresql',
	});
});

test('generate mysql explain emits no_changes for empty diff in json mode', async () => {
	vi.doMock('../../src/dialects/mysql/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'mysql', id: 'snapshot' },
			custom: { version: '8', dialect: 'mysql', id: 'custom' },
		})),
	}));
	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({ sqlStatements: [], renames: [], statements: [], groupedStatements: [] })),
	}));

	const generateMysql = await import('../../src/cli/commands/generate-mysql');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateMysql.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-mysql-noop-json-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({ status: 'no_changes', dialect: 'mysql' });
});

test('generate sqlite explain emits no_changes for empty diff in json mode', async () => {
	vi.doMock('../../src/dialects/sqlite/serializer', () => ({
		prepareSqliteSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'sqlite', id: 'snapshot' },
			custom: { version: '8', dialect: 'sqlite', id: 'custom' },
		})),
	}));
	vi.doMock('../../src/dialects/sqlite/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [],
			renames: [],
			warnings: [],
			statements: [],
			groupedStatements: [],
		})),
	}));

	const generateSqlite = await import('../../src/cli/commands/generate-sqlite');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateSqlite.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-sqlite-noop-json-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			dialect: 'sqlite',
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({ status: 'no_changes', dialect: 'sqlite' });
});

test('generate cockroach explain emits no_changes for empty diff in json mode', async () => {
	vi.doMock('../../src/dialects/cockroach/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'cockroach', id: 'snapshot' },
			custom: { version: '8', dialect: 'cockroach', id: 'custom' },
		})),
	}));
	vi.doMock('../../src/dialects/cockroach/diff', () => ({
		ddlDiff: vi.fn(async () => ({ sqlStatements: [], renames: [], statements: [], groupedStatements: [] })),
	}));

	const generateCockroach = await import('../../src/cli/commands/generate-cockroach');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateCockroach.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-cockroach-noop-json-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({ status: 'no_changes', dialect: 'cockroach' });
});

test('generate mssql explain emits no_changes for empty diff in json mode', async () => {
	vi.doMock('../../src/dialects/mssql/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'mssql', id: 'snapshot' },
			custom: { version: '8', dialect: 'mssql', id: 'custom' },
		})),
	}));
	vi.doMock('../../src/dialects/mssql/diff', () => ({
		ddlDiff: vi.fn(async () => ({ sqlStatements: [], renames: [], statements: [], groupedStatements: [] })),
	}));

	const generateMssql = await import('../../src/cli/commands/generate-mssql');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateMssql.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-mssql-noop-json-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({ status: 'no_changes', dialect: 'mssql' });
});

test('generate singlestore explain emits no_changes for empty diff in json mode', async () => {
	vi.doMock('../../src/dialects/singlestore/serializer', () => ({
		prepareSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'singlestore', id: 'snapshot' },
			custom: { version: '8', dialect: 'singlestore', id: 'custom' },
		})),
	}));
	vi.doMock('../../src/dialects/singlestore/diff', () => ({
		ddlDiff: vi.fn(async () => ({ sqlStatements: [], renames: [], statements: [], groupedStatements: [] })),
	}));

	const generateSinglestore = await import('../../src/cli/commands/generate-singlestore');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateSinglestore.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-singlestore-noop-json-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({ status: 'no_changes', dialect: 'singlestore' });
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
	const { writeResult } = await import('../../src/cli/commands/generate-common');

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		writeResult({
			snapshot: {} as never,
			sqlStatements: [],
			outFolder: '',
			breakpoints: false,
			dialect: 'postgresql',
			renames: [],
			snapshots: [],
		}));

	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'postgresql',
	});
});

test('generate writeResult emits json payload when a migration is written in json mode', async () => {
	const { writeResult } = await import('../../src/cli/commands/generate-common');
	const outFolder = mkdtempSync(join(tmpdir(), 'drizzle-kit-write-result-json-'));

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		writeResult({
			snapshot: {} as never,
			sqlStatements: ['CREATE TABLE "users" ("id" serial PRIMARY KEY);'],
			outFolder,
			breakpoints: false,
			name: 'test',
			dialect: 'postgresql',
			renames: [],
			snapshots: [],
		}));

	expect(env).toMatchObject({
		status: 'ok',
		migration_path: expect.stringContaining('migration.sql'),
	});
	expect(env).toMatchObject({ dialect: expect.anything() });
	expect(env).not.toHaveProperty('message');
	expect(env).not.toHaveProperty('path');
});

test('generate sqlite custom emits json payload in json mode', async () => {
	vi.doMock('../../src/dialects/sqlite/serializer', () => ({
		prepareSqliteSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'sqlite', id: 'snapshot' },
			custom: { version: '8', dialect: 'sqlite', id: 'custom' },
		})),
	}));
	const generateSqlite = await import('../../src/cli/commands/generate-sqlite');
	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-custom-json-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateSqlite.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: true,
			name: 'test',
			breakpoints: false,
		} as never));

	expect(env).toStrictEqual({
		status: 'ok',
		dialect: 'sqlite',
		migration_path: expect.stringContaining('migration.sql'),
	});
});

test('generate sqlite emits missing_hints for unresolved table rename in json mode', async () => {
	vi.doMock('../../src/dialects/sqlite/serializer', () => ({
		prepareSqliteSnapshot: vi.fn(async () => ({
			ddlCur: { cur: true },
			ddlPrev: { prev: true },
			snapshot: { version: '8', dialect: 'sqlite', id: 'snapshot' },
			custom: { version: '8', dialect: 'sqlite', id: 'custom' },
		})),
	}));
	vi.doMock('../../src/dialects/sqlite/diff', () => ({
		ddlDiff: vi.fn(async (...args: unknown[]) => {
			const tableResolver = args[2] as (
				it: { created: { name: string }[]; deleted: { name: string }[] },
			) => Promise<unknown>;
			await tableResolver({
				created: [{ name: 'users_new' }],
				deleted: [{ name: 'users' }],
			});
			return {
				sqlStatements: [],
				warnings: [],
				renames: [],
				groupedStatements: [],
				statements: [],
			};
		}),
	}));

	const generateSqlite = await import('../../src/cli/commands/generate-sqlite');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateSqlite.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-sqlite-missing-hints-')),
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			dialect: 'sqlite',
			hints: new HintsHandler(),
		} as never));

	expect(env).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'users_new'] },
		],
	});
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

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'postgresql',
	});
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
	const hints = new HintsHandler();

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));

	expect(env).toStrictEqual({
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
	const hints = new HintsHandler();

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));

	expect(env).toStrictEqual({
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

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'schema', from: ['prev_schema'], to: ['next_schema'] },
	]);

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));

	expect(env).toStrictEqual({
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
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
	const hints = new HintsHandler();

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-missing-hints-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never));

	expect(env).toStrictEqual({
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
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
	const hints = new HintsHandler();

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-missing-hints-branching-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never));

	expect(env).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema_a'] },
			{ type: 'rename_or_create', kind: 'schema', entity: ['next_schema_b'] },
		],
	});
});

test('push sqlite emits explain json payload in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-sqlite', () => ({
		introspect: vi.fn(async () => ({ ddl: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractSqliteExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/sqlite/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/sqlite/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));
	vi.doMock('../../src/dialects/sqlite/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [],
			statements: [],
			groupedStatements: [],
		})),
	}));
	const pushSqlite = await import('../../src/cli/commands/push-sqlite');
	const query = vi.fn(async () => [] as unknown[]);
	const batch = vi.fn(async () => [] as unknown[]);
	const mockDb = { query, batch };

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushSqlite.handle(
			mockDb as never,
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: '' },
			'sqlite',
			new HintsHandler(),
		));

	expect(query).not.toHaveBeenCalled();
	expect(batch).not.toHaveBeenCalled();
	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'sqlite',
	});
});

test('push mysql emits explain json payload in json mode', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({
			db: { query: vi.fn(async () => []) },
			database: 'db',
		})),
	}));
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>('../../src/dialects/mysql/ddl');
		return {
			...actual,
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		};
	});
	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['ALTER TABLE `users` ADD COLUMN `email` text;'],
			statements: [{
				type: 'add_column',
				column: { table: 'users', name: 'email', schema: 'public', notNull: false, default: null },
			}],
			groupedStatements: [{
				jsonStatement: {
					type: 'add_column',
					column: { table: 'users', name: 'email', schema: 'public', notNull: false, default: null },
				},
				sqlStatements: ['ALTER TABLE `users` ADD COLUMN `email` text;'],
			}],
		})),
	}));
	const pushMysql = await import('../../src/cli/commands/push-mysql');

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			[] as never,
			true,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({
		status: 'ok',
		dialect: 'mysql',
		hints: [],
	});
});

test('push mysql emits no_changes in json mode when diff is empty', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
	}));
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>('../../src/dialects/mysql/ddl');
		return {
			...actual,
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		};
	});
	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({ sqlStatements: [], statements: [], groupedStatements: [] })),
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			[] as never,
			true,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({ status: 'no_changes', dialect: 'mysql' });
});

test('push mysql emits missing_hints in json mode for unresolved type_change suggestion', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
	}));
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>('../../src/dialects/mysql/ddl');
		return {
			...actual,
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		};
	});
	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `name` bigint;'],
			statements: [{
				type: 'alter_column',
				origin: { table: 'users', column: 'name' },
				column: { table: 'users', name: 'name', schema: 'public', default: null, generated: undefined },
				diff: { type: { from: 'text', to: 'bigint' } },
			}],
			groupedStatements: [],
		})),
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			[] as never,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{
				type: 'confirm_data_loss',
				kind: 'column',
				entity: ['public', 'users', 'name'],
				reason: 'type_change',
				reason_details: { from: 'text', to: 'bigint' },
			},
		],
	});
});

test('push mssql throws rename_blocked_by_check_constraint error in json mode', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
	}));
	vi.doMock('../../src/cli/commands/pull-mssql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMssqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mssql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: { ...schema, checks: { one: vi.fn(() => true) } }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['EXEC sp_rename "dbo.users.old_name", "new_name", "COLUMN";'],
			statements: [{
				type: 'rename_column',
				from: { schema: 'dbo', table: 'users', name: 'old_name' },
				to: { schema: 'dbo', table: 'users', name: 'new_name' },
			}],
			groupedStatements: [],
		})),
	}));

	const pushMssql = await import('../../src/cli/commands/push-mssql');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMssql.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'dbo' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'unsupported_schema_change',
			meta: {
				kind: 'rename_blocked_by_check_constraint',
				schema: 'dbo',
				table: 'users',
				from: 'old_name',
				to: 'new_name',
			},
		});
});

test('push mysql with force still emits missing_hints in json mode for unresolved type_change', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
	}));
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>('../../src/dialects/mysql/ddl');
		return {
			...actual,
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		};
	});
	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `name` bigint;'],
			statements: [{
				type: 'alter_column',
				origin: { table: 'users', column: 'name' },
				column: { table: 'users', name: 'name', schema: 'public', default: null, generated: undefined },
				diff: { type: { from: 'text', to: 'bigint' } },
			}],
			groupedStatements: [],
		})),
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			true,
			[] as never,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{
				type: 'confirm_data_loss',
				kind: 'column',
				entity: ['public', 'users', 'name'],
				reason: 'type_change',
				reason_details: { from: 'text', to: 'bigint' },
			},
		],
	});
});

test('push cockroach emits no_changes in json mode when diff is empty', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
	}));
	vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractCrdbExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));
	vi.doMock('../../src/dialects/cockroach/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));
	vi.doMock('../../src/dialects/cockroach/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [],
			statements: [],
			groupedStatements: [],
		})),
	}));

	const pushCockroach = await import('../../src/cli/commands/push-cockroach');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushCockroach.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'cockroach',
	});
});

test('push mssql emits no_changes in json mode when diff is empty', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
	}));
	vi.doMock('../../src/cli/commands/pull-mssql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMssqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mssql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [],
			statements: [],
			groupedStatements: [],
		})),
	}));

	const pushMssql = await import('../../src/cli/commands/push-mssql');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMssql.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'dbo' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'mssql',
	});
});

test('push singlestore emits no_changes in json mode when diff is empty', async () => {
	vi.doMock('hanji', async () => {
		const actual = await vi.importActual<typeof import('hanji')>('hanji');
		return {
			...actual,
			renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
		};
	});
	vi.doMock('../../src/cli/connections', () => ({
		connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
	}));
	vi.doMock('../../src/dialects/mysql/introspect', () => ({
		fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
		fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>('../../src/dialects/mysql/ddl');
		return {
			...actual,
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		};
	});
	vi.doMock('../../src/dialects/singlestore/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [],
			statements: [],
			groupedStatements: [],
		})),
	}));

	const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushSinglestore.handle(
			['schema.ts'],
			{} as never,
			[] as never,
			false,
			false,
			true,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toStrictEqual({
		status: 'no_changes',
		dialect: 'singlestore',
	});
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

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'table', from: ['public', 'orders'], to: ['public', 'orders1'] },
	]);

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));

	expect(env).toMatchObject({ status: 'ok', dialect: 'postgresql' });
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
	const hints = new HintsHandler();

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			true,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));

	expect(env).toStrictEqual({
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
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

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'schema', from: ['prev_schema'], to: ['next_schema'] },
	]);

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-with-hints-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never));
	expect(env).toMatchObject({ status: 'ok', dialect: 'postgresql' });
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
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

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-ignore-confirm-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never));
	expect(env).toMatchObject({ status: 'no_changes', dialect: 'postgresql' });
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
			snapshot: { version: '8', dialect: 'postgresql', id: 'snapshot' },
			custom: { version: '8', dialect: 'postgresql', id: 'custom' },
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

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-excess-hints-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			casing: undefined,
			custom: false,
			name: undefined,
			breakpoints: false,
			explain: true,
			hints,
		} as never));
	expect(env).toMatchObject({ status: 'no_changes', dialect: 'postgresql' });
});

describe('push postgres confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE "public"."users";'],
				statements: [{ type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [1]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE "public"."users";'],
				statements: [{ type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push postgres confirm_data_loss[view] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP MATERIALIZED VIEW "public"."user_stats";'],
				statements: [{ type: 'drop_view', view: { schema: 'public', name: 'user_stats', materialized: true } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [1]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'user_stats'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP MATERIALIZED VIEW "public"."user_stats";'],
				statements: [{ type: 'drop_view', view: { schema: 'public', name: 'user_stats', materialized: true } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'user_stats'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push postgres confirm_data_loss[column] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP COLUMN "legacy_id";'],
				statements: [{ type: 'drop_column', column: { schema: 'public', table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [1]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP COLUMN "legacy_id";'],
				statements: [{ type: 'drop_column', column: { schema: 'public', table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push postgres confirm_data_loss[schema] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP SCHEMA "analytics";'],
				statements: [{ type: 'drop_schema', name: 'analytics' }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [{ count: 1 }]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP SCHEMA "analytics";'],
				statements: [{ type: 'drop_schema', name: 'analytics' }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push postgres confirm_data_loss[primary_key] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP CONSTRAINT "users_pkey";'],
				statements: [{
					type: 'drop_pk',
					pk: { schema: 'public', table: 'users', name: 'users_pkey', nameExplicit: true, columns: ['id'] },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [1]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'primary_key',
					entity: ['public', 'users', 'users_pkey'],
					reason: 'non_empty',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP CONSTRAINT "users_pkey";'],
				statements: [{
					type: 'drop_pk',
					pk: { schema: 'public', table: 'users', name: 'users_pkey', nameExplicit: true, columns: ['id'] },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['public', 'users', 'users_pkey'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push postgres confirm_data_loss[add_not_null] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" ADD COLUMN "email" text NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: {
						schema: 'public',
						table: 'users',
						name: 'email',
						notNull: true,
						default: null,
						generated: false,
						identity: null,
					},
					isPK: false,
					isCompositePK: false,
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [1]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['public', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" ADD COLUMN "email" text NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: {
						schema: 'public',
						table: 'users',
						name: 'email',
						notNull: true,
						default: null,
						generated: false,
						identity: null,
					},
					isPK: false,
					isCompositePK: false,
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push postgres confirm_data_loss[add_unique] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");'],
				statements: [{
					type: 'add_unique',
					unique: {
						schema: 'public',
						table: 'users',
						name: 'users_email_unique',
						columns: ['email'],
						nameExplicit: true,
						nullsNotDistinct: false,
					},
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => [1]),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_unique',
					entity: ['public', 'users', 'users_email_unique'],
					reason: 'duplicates_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
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
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");'],
				statements: [{
					type: 'add_unique',
					unique: {
						schema: 'public',
						table: 'users',
						name: 'users_email_unique',
						columns: ['email'],
						nameExplicit: true,
						nullsNotDistinct: false,
					},
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			preparePostgresDB: vi.fn(async () => ({
				query: vi.fn(async () => []),
			})),
		}));

		const pushPostgres = await import('../../src/cli/commands/push-postgres');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_unique', entity: ['public', 'users', 'users_email_unique'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushPostgres.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'postgresql',
		});
	});
});

describe('push mysql confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE `users`;'],
				statements: [{ type: 'drop_table', table: 'users' }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => [1]) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE `users`;'],
				statements: [{ type: 'drop_table', table: 'users' }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

describe('push mysql confirm_data_loss[column] non_empty in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` DROP COLUMN `legacy_id`;'],
				statements: [{ type: 'drop_column', column: { table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => [1]) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` DROP COLUMN `legacy_id`;'],
				statements: [{ type: 'drop_column', column: { table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

describe('push mysql confirm_data_loss[primary_key] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn(() => ({
				ddl: {
					fks: { list: () => [] },
					indexes: { list: () => [] },
					pks: { one: () => null },
				},
				errors: [],
			})),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` DROP PRIMARY KEY;'],
				statements: [{ type: 'drop_pk', pk: { table: 'users', name: 'PRIMARY', columns: ['id'] } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => [1]) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['public', 'users', 'PRIMARY'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn(() => ({
				ddl: {
					fks: { list: () => [] },
					indexes: { list: () => [] },
					pks: { one: () => null },
				},
				errors: [],
			})),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` DROP PRIMARY KEY;'],
				statements: [{ type: 'drop_pk', pk: { table: 'users', name: 'PRIMARY', columns: ['id'] } }],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['public', 'users', 'PRIMARY'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

describe('push mysql confirm_data_loss[add_not_null] add_column in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` ADD COLUMN `email` varchar(191) NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: { table: 'users', name: 'email', notNull: true, default: null, generated: false },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => [1]) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['public', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` ADD COLUMN `email` varchar(191) NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: { table: 'users', name: 'email', notNull: true, default: null, generated: false },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

describe('push mysql confirm_data_loss[add_not_null] alter_column in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `email` varchar(191) NOT NULL;'],
				statements: [{
					type: 'alter_column',
					diff: { notNull: { from: false, to: true } },
					column: { table: 'users', name: 'email', default: null, generated: false },
					isPK: false,
					wasPK: false,
					origin: { table: 'users', column: 'email' },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => [1]) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['public', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `email` varchar(191) NOT NULL;'],
				statements: [{
					type: 'alter_column',
					diff: { notNull: { from: false, to: true } },
					column: { table: 'users', name: 'email', default: null, generated: false },
					isPK: false,
					wasPK: false,
					origin: { table: 'users', column: 'email' },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

describe('push mysql confirm_data_loss[column] type_change in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `name` varchar(50);'],
				statements: [{
					type: 'alter_column',
					diff: { type: { from: 'varchar(100)', to: 'varchar(50)' } },
					column: {
						table: 'users',
						name: 'name',
						type: 'varchar(50)',
						notNull: false,
						default: null,
						generated: false,
					},
					isPK: false,
					wasPK: false,
					origin: { table: 'users', column: 'name' },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'column',
					entity: ['public', 'users', 'name'],
					reason: 'type_change',
					reason_details: { from: 'varchar(100)', to: 'varchar(50)' },
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `name` varchar(50);'],
				statements: [{
					type: 'alter_column',
					diff: { type: { from: 'varchar(100)', to: 'varchar(50)' } },
					column: {
						table: 'users',
						name: 'name',
						type: 'varchar(50)',
						notNull: false,
						default: null,
						generated: false,
					},
					isPK: false,
					wasPK: false,
					origin: { table: 'users', column: 'name' },
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'name'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

describe('push mysql confirm_data_loss[add_unique] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);'],
				statements: [{
					type: 'create_index',
					index: {
						table: 'users',
						columns: [{ value: 'email', isExpression: false }],
						isUnique: true,
						using: null,
						algorithm: null,
						lock: null,
						name: 'users_email_idx',
						nameExplicit: false,
					},
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => [1]) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_unique',
					entity: ['public', 'users', 'users_email_idx'],
					reason: 'duplicates_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/commands/pull-mysql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));

		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMysqlExisting: vi.fn(() => ({})),
		}));

		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));

		vi.doMock('../../src/dialects/mysql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
		}));

		vi.doMock('../../src/dialects/mysql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));

		vi.doMock('../../src/dialects/mysql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);'],
				statements: [{
					type: 'create_index',
					index: {
						table: 'users',
						columns: [{ value: 'email', isExpression: false }],
						isUnique: true,
						using: null,
						algorithm: null,
						lock: null,
						name: 'users_email_idx',
						nameExplicit: false,
					},
				}],
				groupedStatements: [],
			})),
		}));

		vi.doMock('../../src/cli/connections', () => ({
			connectToMySQL: vi.fn(async () => ({
				db: { query: vi.fn(async () => []) },
				database: 'db',
			})),
		}));

		const pushMysql = await import('../../src/cli/commands/push-mysql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_unique', entity: ['public', 'users', 'users_email_idx'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMysql.handle(
				['schema.ts'],
				{} as never,
				false,
				false,
				{} as never,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mysql',
		});
	});
});

test('push mysql throws drop_pk_dependency error in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));

	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));

	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));

	const ddl2 = {
		fks: {
			list: vi.fn(({ tableTo }: { tableTo: string }) =>
				tableTo === 'users'
					? [{ name: 'orders_user_id_fk', table: 'orders', tableTo: 'users', columns: ['user_id'], columnsTo: ['id'] }]
					: []
			),
		},
		indexes: { list: vi.fn(() => []) },
		pks: { one: vi.fn(() => null) },
	};

	vi.doMock('../../src/dialects/mysql/ddl', () => ({
		interimToDDL: vi.fn()
			.mockReturnValueOnce({
				ddl: { fks: { list: () => [] }, indexes: { list: () => [] }, pks: { one: () => null } },
				errors: [],
			})
			.mockReturnValueOnce({ ddl: ddl2, errors: [] }),
	}));

	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['ALTER TABLE `users` DROP PRIMARY KEY;'],
			statements: [{
				type: 'drop_pk',
				pk: { table: 'users', name: 'PRIMARY', columns: ['id'] },
			}],
			groupedStatements: [],
		})),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({
			db: { query: vi.fn(async () => [1]) },
			database: 'db',
		})),
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			{} as never,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'unsupported_schema_change',
			meta: {
				kind: 'drop_pk_dependency',
				table: 'users',
				columns: ['id'],
				blocking_fks: ['orders_user_id_fk'],
			},
		});
});

test('push mysql throws fk_target_not_unique error in json mode', async () => {
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));

	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMysqlExisting: vi.fn(() => ({})),
	}));

	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));

	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));

	const ddl2 = {
		fks: { list: vi.fn(() => []) },
		indexes: { list: vi.fn(() => []) },
		pks: { one: vi.fn(() => null) },
	};

	vi.doMock('../../src/dialects/mysql/ddl', () => ({
		interimToDDL: vi.fn()
			.mockReturnValueOnce({
				ddl: { fks: { list: () => [] }, indexes: { list: () => [] }, pks: { one: () => null } },
				errors: [],
			})
			.mockReturnValueOnce({ ddl: ddl2, errors: [] }),
	}));

	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [
				'ALTER TABLE `orders` ADD CONSTRAINT `orders_user_email_users_email_fk` FOREIGN KEY (`user_email`) REFERENCES `users` (`email`);',
			],
			statements: [{
				type: 'create_fk',
				cause: 'create',
				fk: {
					table: 'orders',
					columns: ['user_email'],
					tableTo: 'users',
					columnsTo: ['email'],
				},
			}],
			groupedStatements: [],
		})),
	}));

	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({
			db: { query: vi.fn(async () => []) },
			database: 'db',
		})),
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			{} as never,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'unsupported_schema_change',
			meta: {
				kind: 'fk_target_not_unique',
				table: 'orders',
				columns: ['user_email'],
				table_to: 'users',
				columns_to: ['email'],
			},
		});
});

describe('push sqlite confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY);');
		sqlite.prepare('INSERT INTO users (id) VALUES (1)').run();
		const db = sqliteDbFrom(sqlite);

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'], reason: 'non_empty' },
			],
		});

		sqlite.close();
	});

	test('applies matching hint and runs to ok', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY);');
		sqlite.prepare('INSERT INTO users (id) VALUES (1)').run();
		const db = sqliteDbFrom(sqlite);

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'sqlite',
		});

		const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
		expect(tables).toStrictEqual([]);

		sqlite.close();
	});
});

describe('push sqlite confirm_data_loss[column-drop] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, legacy_id INTEGER);');
		sqlite.prepare('INSERT INTO users (id, legacy_id) VALUES (1, 100)').run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable('users', { id: integer().primaryKey() });

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'], reason: 'non_empty' },
			],
		});

		sqlite.close();
	});

	test('applies matching hint and runs to ok', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, legacy_id INTEGER);');
		sqlite.prepare('INSERT INTO users (id, legacy_id) VALUES (1, 100)').run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable('users', { id: integer().primaryKey() });

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'sqlite',
		});

		const cols = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
		expect(cols.map((c) => c.name)).toStrictEqual(['id']);

		sqlite.close();
	});
});

describe('push sqlite confirm_data_loss[add_not_null] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY);');
		sqlite.prepare('INSERT INTO users (id) VALUES (1)').run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable('users', {
			id: integer().primaryKey(),
			email: text().notNull(),
		});

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['public', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});

		sqlite.close();
	});

	test('applies matching hint and runs to ok with truncate on non-empty table', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY);');
		sqlite.prepare('INSERT INTO users (id) VALUES (1)').run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable('users', {
			id: integer().primaryKey(),
			email: text().notNull(),
		});

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'sqlite',
		});

		const rows = sqlite.prepare('SELECT * FROM users').all();
		expect(rows).toStrictEqual([]);

		const cols = sqlite.prepare('PRAGMA table_info(users)').all() as {
			name: string;
			notnull: number;
		}[];
		const emailCol = cols.find((c) => c.name === 'email');
		expect(emailCol).toBeDefined();
		expect(emailCol!.notnull).toBe(1);

		sqlite.close();
	});

	test('applies matching hint without truncate on empty table', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY);');
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable('users', {
			id: integer().primaryKey(),
			email: text().notNull(),
		});

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'sqlite',
		});

		const cols = sqlite.prepare('PRAGMA table_info(users)').all() as {
			name: string;
			notnull: number;
		}[];
		const emailCol = cols.find((c) => c.name === 'email');
		expect(emailCol).toBeDefined();
		expect(emailCol!.notnull).toBe(1);

		sqlite.close();
	});
});

describe('push sqlite confirm_data_loss[recreate_table-single] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, legacy TEXT, email TEXT);');
		sqlite.prepare("INSERT INTO users (id, legacy, email) VALUES (1, 'old', 'a@b.com')").run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable(
			'users',
			{
				id: integer().primaryKey(),
				email: text(),
			},
			(t) => [check('ck_email_nonempty', sql`length(${t.email}) > 0`)],
		);

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy'], reason: 'non_empty' },
			],
		});

		sqlite.close();
	});

	test('applies matching hint and runs to ok with check constraint', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, legacy TEXT, email TEXT);');
		sqlite.prepare("INSERT INTO users (id, legacy, email) VALUES (1, 'old', 'a@b.com')").run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable(
			'users',
			{
				id: integer().primaryKey(),
				email: text(),
			},
			(t) => [check('ck_email_nonempty', sql`length(${t.email}) > 0`)],
		);

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'sqlite',
		});

		const cols = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
		expect(cols.map((c) => c.name).sort()).toStrictEqual(['email', 'id']);

		const surviving = sqlite.prepare('SELECT id, email FROM users').all();
		expect(surviving).toStrictEqual([{ id: 1, email: 'a@b.com' }]);

		const tableSql = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as
			| { sql: string }
			| undefined;
		expect(tableSql?.sql).toContain('CHECK');
		expect(tableSql?.sql).toContain('length');

		sqlite.close();
	});
});

describe('push sqlite confirm_data_loss[recreate_table-multi] in json mode', () => {
	test('emits missing_hints with one entry per dropped column', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, legacy_a TEXT, legacy_b TEXT, email TEXT);');
		sqlite.prepare("INSERT INTO users (id, legacy_a, legacy_b, email) VALUES (1, 'a', 'b', 'a@b.com')").run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable(
			'users',
			{
				id: integer().primaryKey(),
				email: text(),
			},
			(t) => [check('ck_email_nonempty', sql`length(${t.email}) > 0`)],
		);

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		if (env.status !== 'missing_hints') throw new Error(`expected status 'missing_hints', got '${env.status}'`);
		expect(env.unresolved).toHaveLength(2);
		const entities = [...env.unresolved]
			.map((u) => (u.entity as readonly [string, string, string])[2])
			.sort();
		expect(entities).toStrictEqual(['legacy_a', 'legacy_b']);
		for (const u of env.unresolved) {
			expect(u).toMatchObject({
				type: 'confirm_data_loss',
				kind: 'column',
				reason: 'non_empty',
			});
			expect(u.entity[0]).toBe('public');
			expect(u.entity[1]).toBe('users');
		}

		sqlite.close();
	});

	test('applies matching hints and preserves non-dropped column data', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, legacy_a TEXT, legacy_b TEXT, email TEXT);');
		sqlite.prepare("INSERT INTO users (id, legacy_a, legacy_b, email) VALUES (1, 'a', 'b', 'a@b.com')").run();
		const db = sqliteDbFrom(sqlite);

		const usersTable = sqliteTable(
			'users',
			{
				id: integer().primaryKey(),
				email: text(),
			},
			(t) => [check('ck_email_nonempty', sql`length(${t.email}) > 0`)],
		);

		mockSqliteViewsForLiveDb();

		vi.doMock('../../src/dialects/sqlite/drizzle', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/sqlite/drizzle')>(
				'../../src/dialects/sqlite/drizzle',
			);
			return {
				...actual,
				prepareFromSchemaFiles: vi.fn(async () => ({ tables: [usersTable], views: [], relations: [] })),
			};
		});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_a'] },
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_b'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'sqlite',
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'sqlite',
		});

		const cols = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
		expect(cols.map((c) => c.name).sort()).toStrictEqual(['email', 'id']);

		const surviving = sqlite.prepare('SELECT id, email FROM users').all();
		expect(surviving).toStrictEqual([{ id: 1, email: 'a@b.com' }]);

		sqlite.close();
	});
});

describe('push mssql confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE [users];'],
				statements: [{ type: 'drop_table', table: { schema: 'dbo', name: 'users' } }],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'table', entity: ['dbo', 'users'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE [users];'],
				statements: [{ type: 'drop_table', table: { schema: 'dbo', name: 'users' } }],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['dbo', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

describe('push mssql confirm_data_loss[column] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] DROP COLUMN [legacy_col];'],
				statements: [{
					type: 'drop_column',
					column: { schema: 'dbo', table: 'users', name: 'legacy_col' },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['dbo', 'users', 'legacy_col'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] DROP COLUMN [legacy_col];'],
				statements: [{
					type: 'drop_column',
					column: { schema: 'dbo', table: 'users', name: 'legacy_col' },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['dbo', 'users', 'legacy_col'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

describe('push mssql confirm_data_loss[schema] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [{ count: 5 }]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP SCHEMA [analytics];'],
				statements: [{ type: 'drop_schema', name: 'analytics' }],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP SCHEMA [analytics];'],
				statements: [{ type: 'drop_schema', name: 'analytics' }],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

describe('push mssql confirm_data_loss[primary_key] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] DROP CONSTRAINT [PK_users];'],
				statements: [{
					type: 'drop_pk',
					pk: { schema: 'dbo', table: 'users', name: 'PK_users', columns: ['id'] },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['dbo', 'users', 'PK_users'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] DROP CONSTRAINT [PK_users];'],
				statements: [{
					type: 'drop_pk',
					pk: { schema: 'dbo', table: 'users', name: 'PK_users', columns: ['id'] },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['dbo', 'users', 'PK_users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

describe('push mssql confirm_data_loss[add_not_null] add_column in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: { ...schema, defaults: { one: () => null } }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] ADD [email] varchar(255) NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: { schema: 'dbo', table: 'users', name: 'email', notNull: true },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['dbo', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: { ...schema, defaults: { one: () => null } }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] ADD [email] varchar(255) NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: { schema: 'dbo', table: 'users', name: 'email', notNull: true },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['dbo', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

describe('push mssql confirm_data_loss[add_not_null] alter_column in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: { ...schema, defaults: { one: () => null } }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] ALTER COLUMN [email] varchar(255) NOT NULL;'],
				statements: [{
					type: 'alter_column',
					diff: { $right: { schema: 'dbo', table: 'users', name: 'email', notNull: true } },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['dbo', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: { ...schema, defaults: { one: () => null } }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] ALTER COLUMN [email] varchar(255) NOT NULL;'],
				statements: [{
					type: 'alter_column',
					diff: { $right: { schema: 'dbo', table: 'users', name: 'email', notNull: true } },
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['dbo', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

describe('push mssql confirm_data_loss[add_unique] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] ADD CONSTRAINT [users_email_unique] UNIQUE ([email]);'],
				statements: [{
					type: 'add_unique',
					unique: {
						schema: 'dbo',
						table: 'users',
						name: 'users_email_unique',
						columns: ['email'],
					},
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_unique',
					entity: ['dbo', 'users', 'users_email_unique'],
					reason: 'duplicates_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
		}));
		vi.doMock('../../src/cli/commands/pull-mssql', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractMssqlExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/mssql/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/mssql/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE [users] ADD CONSTRAINT [users_email_unique] UNIQUE ([email]);'],
				statements: [{
					type: 'add_unique',
					unique: {
						schema: 'dbo',
						table: 'users',
						name: 'users_email_unique',
						columns: ['email'],
					},
				}],
				groupedStatements: [],
			})),
		}));

		const pushMssql = await import('../../src/cli/commands/push-mssql');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_unique', entity: ['dbo', 'users', 'users_email_unique'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushMssql.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'dbo' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'mssql',
		});
	});
});

test('push mssql throws rename_schema_unsupported error in json mode', async () => {
	vi.doMock('../../src/cli/connections', () => ({
		connectToMsSQL: vi.fn(async () => ({ db: { query: vi.fn(async () => []) } })),
	}));
	vi.doMock('../../src/cli/commands/pull-mssql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({
		extractMssqlExisting: vi.fn(() => ({})),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/mssql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/ddl', () => ({
		interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['/* mssql does not support rename_schema; this comment is the convertor placeholder */'],
			statements: [{
				type: 'rename_schema',
				from: { name: 'old_analytics' },
				to: { name: 'analytics' },
			}],
			groupedStatements: [],
		})),
	}));

	const pushMssql = await import('../../src/cli/commands/push-mssql');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushMssql.handle(
			['schema.ts'],
			false,
			{} as never,
			[] as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'dbo' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'unsupported_schema_change',
			meta: {
				kind: 'rename_schema_unsupported',
				from: 'old_analytics',
				to: 'analytics',
				dialect: 'mssql',
			},
		});
});

describe('push cockroach confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [1]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE "public"."users";'],
				statements: [{ type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE "public"."users";'],
				statements: [{ type: 'drop_table', table: { schema: 'public', name: 'users' }, key: '"public"."users"' }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push cockroach confirm_data_loss[view] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [1]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP MATERIALIZED VIEW "public"."user_stats";'],
				statements: [{ type: 'drop_view', view: { schema: 'public', name: 'user_stats', materialized: true } }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'user_stats'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP MATERIALIZED VIEW "public"."user_stats";'],
				statements: [{ type: 'drop_view', view: { schema: 'public', name: 'user_stats', materialized: true } }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'user_stats'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push cockroach confirm_data_loss[column] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [1]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP COLUMN "legacy_id";'],
				statements: [{ type: 'drop_column', column: { schema: 'public', table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP COLUMN "legacy_id";'],
				statements: [{ type: 'drop_column', column: { schema: 'public', table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push cockroach confirm_data_loss[schema] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [{ count: 1 }]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP SCHEMA "analytics";'],
				statements: [{ type: 'drop_schema', name: 'analytics' }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP SCHEMA "analytics";'],
				statements: [{ type: 'drop_schema', name: 'analytics' }],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push cockroach confirm_data_loss[primary_key] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [1]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP CONSTRAINT "users_pkey";'],
				statements: [{
					type: 'drop_pk',
					pk: { schema: 'public', table: 'users', name: 'users_pkey', nameExplicit: true, columns: ['id'] },
				}],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'primary_key',
					entity: ['public', 'users', 'users_pkey'],
					reason: 'non_empty',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" DROP CONSTRAINT "users_pkey";'],
				statements: [{
					type: 'drop_pk',
					pk: { schema: 'public', table: 'users', name: 'users_pkey', nameExplicit: true, columns: ['id'] },
				}],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['public', 'users', 'users_pkey'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push cockroach confirm_data_loss[add_not_null] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [1]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" ADD COLUMN "email" text NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: {
						schema: 'public',
						table: 'users',
						name: 'email',
						notNull: true,
						default: null,
						generated: null,
						identity: null,
						type: 'text',
						typeSchema: null,
						dimensions: 0,
					},
				}],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['public', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE "public"."users" ADD COLUMN "email" text NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: {
						schema: 'public',
						table: 'users',
						name: 'email',
						notNull: true,
						default: null,
						generated: null,
						identity: null,
						type: 'text',
						typeSchema: null,
						dimensions: 0,
					},
				}],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push cockroach confirm_data_loss[add_unique] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => [1]) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['CREATE UNIQUE INDEX "users_email_idx" ON "public"."users" ("email");'],
				statements: [{
					type: 'create_index',
					index: {
						schema: 'public',
						table: 'users',
						name: 'users_email_idx',
						isUnique: true,
						nameExplicit: false,
						columns: [{ value: 'email', isExpression: false, asc: true }],
						where: null,
						method: null,
					},
					newTable: false,
				}],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_unique',
					entity: ['public', 'users', 'users_email_idx'],
					reason: 'duplicates_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('../../src/cli/connections', () => ({
			prepareCockroach: vi.fn(async () => ({ query: vi.fn(async () => []) })),
		}));
		vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
			introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractCrdbExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
			fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/ddl', () => ({
			interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
		}));
		vi.doMock('../../src/dialects/cockroach/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['CREATE UNIQUE INDEX "users_email_idx" ON "public"."users" ("email");'],
				statements: [{
					type: 'create_index',
					index: {
						schema: 'public',
						table: 'users',
						name: 'users_email_idx',
						isUnique: true,
						nameExplicit: false,
						columns: [{ value: 'email', isExpression: false, asc: true }],
						where: null,
						method: null,
					},
					newTable: false,
				}],
				groupedStatements: [],
			})),
		}));

		const pushCockroach = await import('../../src/cli/commands/push-cockroach');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_unique', entity: ['public', 'users', 'users_email_idx'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushCockroach.handle(
				['schema.ts'],
				false,
				{} as never,
				[] as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: 'public' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'cockroach',
		});
	});
});

describe('push singlestore confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE `users`;'],
				statements: [{ type: 'drop_table', table: 'users' }],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['DROP TABLE `users`;'],
				statements: [{ type: 'drop_table', table: 'users' }],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'singlestore',
		});
	});
});

describe('push singlestore confirm_data_loss[column] in json mode', () => {
	test('emits missing_hints when unresolved (drop_column non_empty)', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` DROP COLUMN `legacy_id`;'],
				statements: [{ type: 'drop_column', column: { table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'], reason: 'non_empty' },
			],
		});
	});

	test('applies matching hint and runs to ok (drop_column)', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` DROP COLUMN `legacy_id`;'],
				statements: [{ type: 'drop_column', column: { table: 'users', name: 'legacy_id' } }],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'singlestore',
		});
	});

	test('emits missing_hints when unresolved (alter_column type_change)', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `name` bigint;'],
				statements: [{
					type: 'alter_column',
					origin: { table: 'users', column: 'name' },
					column: { table: 'users', name: 'name', schema: 'public', default: null, generated: undefined },
					diff: { type: { from: 'text', to: 'bigint' } },
				}],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'column',
					entity: ['public', 'users', 'name'],
					reason: 'type_change',
					reason_details: { from: 'text', to: 'bigint' },
				},
			],
		});
	});

	test('applies matching hint and runs to ok (alter_column type_change)', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` MODIFY COLUMN `name` bigint;'],
				statements: [{
					type: 'alter_column',
					origin: { table: 'users', column: 'name' },
					column: { table: 'users', name: 'name', schema: 'public', default: null, generated: undefined },
					diff: { type: { from: 'text', to: 'bigint' } },
				}],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'name'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'singlestore',
		});
	});
});

describe('push singlestore confirm_data_loss[add_not_null] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => [1]) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` ADD COLUMN `email` varchar(191) NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: { table: 'users', name: 'email', notNull: true, default: null, generated: false },
				}],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{
					type: 'confirm_data_loss',
					kind: 'add_not_null',
					entity: ['public', 'users', 'email'],
					reason: 'nulls_present',
				},
			],
		});
	});

	test('applies matching hint and runs to ok', async () => {
		vi.doMock('hanji', async () => {
			const actual = await vi.importActual<typeof import('hanji')>('hanji');
			return {
				...actual,
				renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
			};
		});
		vi.doMock('../../src/cli/connections', () => ({
			connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
		}));
		vi.doMock('../../src/dialects/mysql/introspect', () => ({
			fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
			fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
		}));
		vi.doMock('../../src/dialects/mysql/ddl', async () => {
			const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>(
				'../../src/dialects/mysql/ddl',
			);
			return {
				...actual,
				interimToDDL: vi.fn((schema) => ({ ddl: schema, errors: [] })),
			};
		});
		vi.doMock('../../src/dialects/singlestore/diff', () => ({
			ddlDiff: vi.fn(async () => ({
				sqlStatements: ['ALTER TABLE `users` ADD COLUMN `email` varchar(191) NOT NULL;'],
				statements: [{
					type: 'add_column',
					column: { table: 'users', name: 'email', notNull: true, default: null, generated: false },
				}],
				groupedStatements: [],
			})),
		}));

		const pushSinglestore = await import('../../src/cli/commands/push-singlestore');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSinglestore.handle(
				['schema.ts'],
				{} as never,
				[] as never,
				false,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				hints,
			));

		expect(env).toStrictEqual({
			status: 'ok',
			dialect: 'singlestore',
		});
	});
});

test('push singlestore throws fk_target_not_unique error in json mode', async () => {
	vi.doMock('hanji', async () => {
		const actual = await vi.importActual<typeof import('hanji')>('hanji');
		return {
			...actual,
			renderWithTask: vi.fn(async (_view, promise: Promise<unknown>) => promise),
		};
	});
	vi.doMock('../../src/cli/connections', () => ({
		connectToSingleStore: vi.fn(async () => ({ db: { query: vi.fn(async () => []) }, database: 'db' })),
	}));
	vi.doMock('../../src/dialects/mysql/introspect', () => ({
		fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({
		prepareEntityFilter: vi.fn(() => () => true),
	}));
	vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
		fromDrizzleSchema: vi.fn(() => ({ to: 'schema' })),
	}));

	const ddl2 = {
		fks: { list: vi.fn(() => []) },
		indexes: { list: vi.fn(() => []) },
		pks: { one: vi.fn(() => null) },
	};
	vi.doMock('../../src/dialects/mysql/ddl', async () => {
		const actual = await vi.importActual<typeof import('../../src/dialects/mysql/ddl')>('../../src/dialects/mysql/ddl');
		return {
			...actual,
			interimToDDL: vi.fn()
				.mockReturnValueOnce({
					ddl: { fks: { list: () => [] }, indexes: { list: () => [] }, pks: { one: () => null } },
					errors: [],
				})
				.mockReturnValueOnce({ ddl: ddl2, errors: [] }),
		};
	});
	vi.doMock('../../src/dialects/singlestore/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: [
				'ALTER TABLE `orders` ADD CONSTRAINT `orders_user_email_users_email_fk` FOREIGN KEY (`user_email`) REFERENCES `users` (`email`);',
			],
			statements: [{
				type: 'create_fk',
				cause: 'create',
				fk: {
					table: 'orders',
					columns: ['user_email'],
					tableTo: 'users',
					columnsTo: ['email'],
				},
			}],
			groupedStatements: [],
		})),
	}));

	const pushSinglestore = await import('../../src/cli/commands/push-singlestore');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushSinglestore.handle(
			['schema.ts'],
			{} as never,
			[] as never,
			false,
			false,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		))).rejects.toMatchObject({
			code: 'unsupported_schema_change',
			meta: {
				kind: 'fk_target_not_unique',
				table: 'orders',
				columns: ['user_email'],
				table_to: 'users',
				columns_to: ['email'],
			},
		});
});

describe('check --output', () => {
	const ORIGIN = _ORIGIN;
	const makePgSnapshot = _makePgSnapshot;
	const stageOut = _stageOut;
	const writeSnapshot = _writeSnapshot;
	const stageValid = _stageValid;
	const stageConflict = _stageConflict;

	const runCheck = (out: string, extra: string[] = []) =>
		runCli(['check', `--out=${out}`, '--dialect=postgresql', ...extra]);

	const expectNoHumanStrings = (stdout: string) => {
		expect(stdout).not.toContain('🐶🔥');
		expect(stdout).not.toContain('Non-commutative');
		expect(stdout).not.toContain('\x1b[');
	};

	test('valid journal emits an ok envelope with clean json stdout in json mode', () => {
		const result = runCheck(stageValid(), ['--output', 'json']);

		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
		expectNoHumanStrings(result.stdout);
	});

	test('unsupported snapshot version emits a check_error envelope in json mode', () => {
		const out = stageOut();
		writeSnapshot(out, '0000_init', { version: '999', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [] });
		const result = runCheck(out, ['--output', 'json']);

		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.status).toBe('error');
		expect(parsed.error.code).toBe('check_error');
		expect(parsed.error.kind).toBe('unsupported');
		expect(typeof parsed.error.snapshot).toBe('string');
		expectNoHumanStrings(result.stdout);
	});

	test('non-latest snapshot version emits a check_error envelope in json mode', () => {
		const out = stageOut();
		writeSnapshot(out, '0000_init', { version: '1', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [] });
		const result = runCheck(out, ['--output', 'json']);

		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.status).toBe('error');
		expect(parsed.error.code).toBe('check_error');
		expect(parsed.error.kind).toBe('non_latest');
		expect(typeof parsed.error.snapshot).toBe('string');
		expectNoHumanStrings(result.stdout);
	});

	test('malformed snapshot emits a check_error envelope in json mode', () => {
		const out = stageOut();
		// Correct version but a structurally invalid body trips the `malformed` validator status.
		writeSnapshot(out, '0000_init', {
			version: '8',
			dialect: 'postgres',
			id: 'p1',
			prevIds: [ORIGIN],
			ddl: 'not-an-array',
		});
		const result = runCheck(out, ['--output', 'json']);

		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.status).toBe('error');
		expect(parsed.error.code).toBe('check_error');
		expect(parsed.error.kind).toBe('malformed');
		expect(typeof parsed.error.snapshot).toBe('string');
		expectNoHumanStrings(result.stdout);
	});

	test('valid-but-non-object snapshot emits a check_error envelope in json mode', () => {
		// Valid JSON but not an object — `JSON.parse` succeeds (no SyntaxError), so the post-parse
		// narrowing guard is what turns these into `malformed` rather than an uncaught
		// `'version' in <primitive>` TypeError. `null` is covered because `typeof null === 'object'`.
		for (const body of [42, 'x', true, null]) {
			const out = stageOut();
			writeSnapshot(out, '0000_init', body);
			const result = runCheck(out, ['--output', 'json']);

			expect(result.status).toBe(1);
			const parsed = JSON.parse(result.stdout.trim());
			expect(parsed.status).toBe('error');
			expect(parsed.error.code).toBe('check_error');
			expect(parsed.error.kind).toBe('malformed');
			expect(typeof parsed.error.snapshot).toBe('string');
			expectNoHumanStrings(result.stdout);
		}
	});

	test('conflicting branches emit an enriched conflicts envelope in json mode', () => {
		const result = runCheck(stageConflict(), ['--output', 'json']);

		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.status).toBe('error');
		expect(parsed.error.code).toBe('check_error');
		expect(parsed.error.kind).toBe('conflicts');
		expect(parsed.error.conflicts).toBeGreaterThan(0);

		// CHECK-05: the per-conflict parent/branch-leaf/statement-description data must be
		// machine-parseable from `error` (not just the count, and not via the human tree).
		expect(Array.isArray(parsed.error.details)).toBe(true);
		expect(parsed.error.details.length).toBe(parsed.error.conflicts);
		for (const detail of parsed.error.details) {
			expect(typeof detail.parentId).toBe('string');
			const detailKeys = Object.keys(detail).sort();
			expect(
				detailKeys.join(',') === 'branches,parentId'
					|| detailKeys.join(',') === 'branches,parentId,parentPath',
			).toBe(true);
			expect(Array.isArray(detail.branches)).toBe(true);
			expect(detail.branches.length).toBe(2);
			for (const branch of detail.branches) {
				expect(Object.keys(branch).sort()).toEqual(['leafId', 'leafPath', 'statementDescription']);
				expect(branch.leafId === null || typeof branch.leafId === 'string').toBe(true);
				expect(branch.leafPath === null || typeof branch.leafPath === 'string').toBe(true);
				expect(typeof branch.statementDescription).toBe('string');
			}
		}

		expectNoHumanStrings(result.stdout);
	});

	test('ignore-conflicts emits an ok envelope despite conflicts in json mode', () => {
		const result = runCheck(stageConflict(), ['--ignore-conflicts', '--output', 'json']);

		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
		expectNoHumanStrings(result.stdout);
	});

	test('text mode prints the human success line for a valid journal', () => {
		const result = runCheck(stageValid(), ['--output', 'text']);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Everything's fine 🐶🔥");
		expect(() => JSON.parse(result.stdout.trim())).toThrow();
	});

	test('text mode defaults when --output is omitted', () => {
		const result = runCheck(stageValid());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Everything's fine 🐶🔥");
		expect(() => JSON.parse(result.stdout.trim())).toThrow();
	});

	test('text mode renders the conflict tree and exits non-zero', () => {
		const result = runCheck(stageConflict(), ['--output', 'text']);

		expect(result.status).not.toBe(0);
		const combined = stripAnsi(result.stdout + result.stderr);
		expect(combined).toContain('Non-commutative migrations detected');
	});

	test('text mode renders the typed integrity error and emits no json on stdout', () => {
		const out = stageOut();
		writeSnapshot(out, '0000_init', { version: '999', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [] });
		const result = runCheck(out, ['--output', 'text']);

		expect(result.status).not.toBe(0);
		expect(() => JSON.parse(result.stdout.trim())).toThrow();
	});

	test('ignore-conflicts emits the human success line in text mode', () => {
		const result = runCheck(stageConflict(), ['--ignore-conflicts', '--output', 'text']);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Everything's fine 🐶🔥");
	});
});

describe('turso connection-layer machine-readable surface', () => {
	const TURSO_AUTH_TOKEN = 'super-secret-turso-auth-token-value';
	const TURSO_REMOTE_URL = 'libsql://my-secret-host.turso.io';

	// checkPackage decides which turso driver branch connectToTursoRemote / connectToSQLite enters.
	// Mocking it lets us reach a chosen branch without a live turso database or the real drivers.
	const mockDriverAvailability = (available: Record<string, boolean>) => {
		vi.doMock('../../src/cli/utils', async () => {
			const actual = await vi.importActual<typeof import('../../src/cli/utils')>('../../src/cli/utils');
			return {
				...actual,
				checkPackage: vi.fn(async (pkg: string) => available[pkg] ?? false),
			};
		});
	};

	test('serverless driver-info line is suppressed under --output json', async () => {
		mockDriverAvailability({ '@libsql/client': false, '@tursodatabase/serverless': true });
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const { connectToTursoRemote } = await import('../../src/cli/connections');

		await runWithCliContext(
			{ output: 'json', interactive: false },
			() => connectToTursoRemote({ url: TURSO_REMOTE_URL, authToken: TURSO_AUTH_TOKEN } as never).catch(() => {}),
		);

		const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
		expect(printed).not.toContain("Using '@tursodatabase/serverless' driver");
	});

	test('serverless driver-info line is present under --output text', async () => {
		mockDriverAvailability({ '@libsql/client': false, '@tursodatabase/serverless': true });
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const { connectToTursoRemote } = await import('../../src/cli/connections');

		await runWithCliContext(
			{ output: 'text', interactive: false },
			() => connectToTursoRemote({ url: TURSO_REMOTE_URL, authToken: TURSO_AUTH_TOKEN } as never).catch(() => {}),
		);

		const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
		expect(printed).toContain("Using '@tursodatabase/serverless' driver");
	});

	test('remote turso with only the local driver emits a database_driver_error envelope', async () => {
		// Only @tursodatabase/database is available, but the credential carries an authToken (remote target):
		// this reaches the mismatch block, which must route through the typed envelope rather than process.exit.
		mockDriverAvailability({
			'@libsql/client': false,
			'@tursodatabase/serverless': false,
			'@tursodatabase/database': true,
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
			(() => {
				throw new Error('process.exit called instead of throwing a typed error');
			}) as never,
		);

		const { connectToTursoRemote } = await import('../../src/cli/connections');

		const caught = await runWithCliContext(
			{ output: 'json', interactive: false },
			() =>
				connectToTursoRemote({ url: TURSO_REMOTE_URL, authToken: TURSO_AUTH_TOKEN } as never).catch(
					(err) => err,
				),
		);

		expect(exitSpy).not.toHaveBeenCalled();
		expect(caught).toMatchObject({ code: 'database_driver_error' });
		expect((caught as { meta?: { database?: string } }).meta?.database).toBe('turso');
	});

	test('database_driver_error envelope carries no credential substring', async () => {
		mockDriverAvailability({
			'@libsql/client': false,
			'@tursodatabase/serverless': false,
			'@tursodatabase/database': true,
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(
			(() => {
				throw new Error('process.exit called instead of throwing a typed error');
			}) as never,
		);

		const { connectToTursoRemote } = await import('../../src/cli/connections');
		const { errorToEnvelope } = await import('../../src/cli/errors');

		const caught = await runWithCliContext(
			{ output: 'json', interactive: false },
			() =>
				connectToTursoRemote({ url: TURSO_REMOTE_URL, authToken: TURSO_AUTH_TOKEN } as never).catch(
					(err) => err,
				),
		);

		const serialized = JSON.stringify(errorToEnvelope(caught));
		expect(serialized).toContain('database_driver_error');
		expect(serialized).not.toContain(TURSO_AUTH_TOKEN);
		expect(serialized).not.toContain('my-secret-host.turso.io');
	});

	test("turso push outcome envelope carries dialect 'turso'", async () => {
		vi.doMock('../../src/cli/commands/pull-sqlite', () => ({
			introspect: vi.fn(async () => ({ ddl: { from: 'db' } })),
		}));
		vi.doMock('../../src/dialects/drizzle', () => ({
			extractSqliteExisting: vi.fn(() => ({})),
		}));
		vi.doMock('../../src/dialects/pull-utils', () => ({
			prepareEntityFilter: vi.fn(() => () => true),
		}));
		vi.doMock('../../src/dialects/sqlite/drizzle', () => ({
			prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
			fromDrizzleSchema: vi.fn(() => ({ tables: [], views: [] })),
		}));
		vi.doMock('../../src/dialects/sqlite/ddl', () => ({
			interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
		}));
		vi.doMock('../../src/dialects/sqlite/diff', () => ({
			ddlDiff: vi.fn(async () => ({ sqlStatements: [], statements: [], groupedStatements: [] })),
		}));

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				{ query: vi.fn(async () => []), batch: vi.fn(async () => []) } as never,
				['schema.ts'],
				false,
				{} as never,
				{} as never,
				false,
				false,
				{ table: '__drizzle_migrations', schema: '' },
				'turso',
				new HintsHandler(),
			));

		expect(env).toStrictEqual({ status: 'no_changes', dialect: 'turso' });
	});
});
