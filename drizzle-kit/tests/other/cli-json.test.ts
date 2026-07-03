import { PGlite } from '@electric-sql/pglite';
import { createClient as createLibsqlClient } from '@libsql/client';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'child_process';
import { sql } from 'drizzle-orm';
import { integer as pgInteger, pgPolicy, pgSchema, pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { stripAnsi } from 'hanji/utils';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { HintsHandler } from '../../src/cli/hints';
import {
	fromExports as pgFromExports,
	type PreparedPostgresSchema,
	SchemaSource as PgSchemaSource,
} from '../../src/dialects/postgres/drizzle';
import {
	fromExports as sqliteFromExports,
	SchemaSource as SqliteSchemaSource,
} from '../../src/dialects/sqlite/drizzle';
import {
	ORIGIN as _ORIGIN,
	stageConflict as _stageConflict,
	stageOut as _stageOut,
	stageTableConflict as _stageTableConflict,
	stageValid as _stageValid,
	writeSnapshot as _writeSnapshot,
} from './check-fixtures';

const runWithCliContext = async <T>(
	context: { output: 'text' | 'json'; interactive: boolean },
	callback: () => Promise<T> | T,
): Promise<T> => {
	const ctx = await import('../../src/cli/context');
	return ctx.runWithCliContext(context, callback);
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

const libsqlDbFrom = (client: ReturnType<typeof createLibsqlClient>) => {
	return {
		query: async <T>(query: string, params: unknown[] = []) => {
			return client.execute({ sql: query, args: params as never }).then((it) => it.rows as unknown as T[]);
		},
		run: async (query: string) => {
			await client.execute(query);
		},
		batch: async (sqlStatements: string[]) => {
			await client.batch(sqlStatements, 'write');
		},
	};
};

const runPushPostgres = async (
	schema: PreparedPostgresSchema,
	hints: HintsHandler,
	client: PGlite,
) => {
	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	return runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(schema),
			false,
			{ driver: 'pglite', client } as never,
			[] as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));
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
			'../../src/dialects/postgres/introspect',
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
			'../../src/dialects/cockroach/introspect',
			'../../src/cli/commands/pull-mssql',
			'../../src/dialects/mssql/drizzle',
			'../../src/dialects/mssql/ddl',
			'../../src/dialects/mssql/diff',
			'../../src/dialects/mssql/introspect',
			'../../src/dialects/mysql/introspect',
			'../../src/dialects/singlestore/drizzle',
			'../../src/dialects/singlestore/diff',
		]
	) {
		vi.doUnmock(modulePath);
	}
};

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

test('push throws a structured command_output_error for a duplicate-name schema in json mode', async () => {
	const client = new PGlite();

	// Two exported tables map to the same physical name, so the real ddl mapper raises a
	// `table_name_duplicate` SchemaError that the push handler wraps as command_output_error.
	const schema = pgFromExports({
		a: pgTable('dup', { id: pgInteger() }),
		b: pgTable('dup', { name: pgText() }),
	});

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	await expect(runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(schema),
			false,
			{ driver: 'pglite', client } as never,
			[] as never,
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

	await client.close();
});

test('push postgres explain emits structured json payload in json mode', async () => {
	const client = new PGlite();
	await client.query('CREATE TABLE users (name text);');

	const schema = pgFromExports({ users: pgTable('users', { name: pgText().notNull() }) });

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(schema),
			false,
			{ driver: 'pglite', client } as never,
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

	await client.close();
});

test('generate postgres explain emits structured json payload in json mode', async () => {
	const schema = pgFromExports({ users: pgTable('users', { name: pgText().notNull() }) });

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');

	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-json-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			schemaSource: PgSchemaSource.fromSchema(schema),
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
		type: 'create_table',
		table: { name: 'users' },
	});
});

test('generate postgres explain emits no_changes for empty diff in json mode', async () => {
	const schema = pgFromExports({});

	const generatePostgres = await import('../../src/cli/commands/generate-postgres');
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres.handle({
			out: mkdtempSync(join(tmpdir(), 'drizzle-kit-generate-noop-json-')),
			filenames: ['schema.ts'],
			schemaSource: PgSchemaSource.fromSchema(schema),
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
	const generateSqlite = await import('../../src/cli/commands/generate-sqlite');
	const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-custom-json-'));
	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		generateSqlite.handle({
			out: tempDir,
			filenames: ['schema.ts'],
			schemaSource: SqliteSchemaSource.fromSchema(
				sqliteFromExports({ users: sqliteTable('users', { id: integer().primaryKey() }) }),
			),
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

test('push postgres schema warnings do not leak to stdout in json mode', async () => {
	const client = new PGlite();

	// A standalone policy that is never linked to a table makes the real schema reader
	// emit a `policy_not_linked` warning; the empty diff still resolves to no_changes.
	const schema = pgFromExports({ orphan_policy: pgPolicy('orphan_policy') });

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(schema),
			false,
			{ driver: 'pglite', client } as never,
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
	const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
	expect(printed).not.toContain('policy');

	await client.close();
});

test('push postgres emits missing_hints for unresolved schema rename in json mode', async () => {
	const client = new PGlite();
	await client.query('CREATE SCHEMA prev_schema;');

	const schema = pgFromExports({ next_schema: pgSchema('next_schema') });

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const hints = new HintsHandler();

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(schema),
			false,
			{ driver: 'pglite', client } as never,
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

	await client.close();
});

test('push postgres orders rename hint resolves create_or_rename and applies changes in json mode', async () => {
	const client = new PGlite();
	await client.query('CREATE TABLE orders (id integer);');

	const schema = pgFromExports({ orders1: pgTable('orders1', { id: pgInteger() }) });

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const hints = new HintsHandler([
		{ type: 'rename', kind: 'table', from: ['public', 'orders'], to: ['public', 'orders1'] },
	]);

	const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(schema),
			false,
			{ driver: 'pglite', client } as never,
			[] as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			hints,
		));

	expect(env).toMatchObject({ status: 'ok', dialect: 'postgresql' });

	const tables = await client.query<{ tablename: string }>(
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('orders', 'orders1')`,
	);
	expect(tables.rows.map((r) => r.tablename)).toStrictEqual(['orders1']);

	await client.close();
});

describe('push postgres confirm_data_loss[view] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const client = new PGlite();
		await client.query('CREATE TABLE base (id integer);');
		await client.query('INSERT INTO base (id) VALUES (1);');
		await client.query('CREATE MATERIALIZED VIEW user_stats AS SELECT id FROM base;');

		const schema = pgFromExports({ base: pgTable('base', { id: pgInteger() }) });

		const env = await runPushPostgres(schema, new HintsHandler(), client);

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'user_stats'], reason: 'non_empty' },
			],
		});

		await client.close();
	});

	test('applies matching hint and runs to ok', async () => {
		const client = new PGlite();
		await client.query('CREATE TABLE base (id integer);');
		await client.query('INSERT INTO base (id) VALUES (1);');
		await client.query('CREATE MATERIALIZED VIEW user_stats AS SELECT id FROM base;');

		const schema = pgFromExports({ base: pgTable('base', { id: pgInteger() }) });

		const env = await runPushPostgres(
			schema,
			new HintsHandler([{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'user_stats'] }]),
			client,
		);

		expect(env).toStrictEqual({ status: 'ok', dialect: 'postgresql' });

		const views = await client.query(`SELECT matviewname FROM pg_matviews WHERE matviewname = 'user_stats'`);
		expect(views.rows).toStrictEqual([]);

		await client.close();
	});
});

describe('push postgres confirm_data_loss[schema] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const client = new PGlite();
		await client.query('CREATE SCHEMA analytics;');
		await client.query('CREATE TABLE analytics.events (id integer);');

		const schema = pgFromExports({});

		const env = await runPushPostgres(schema, new HintsHandler(), client);

		expect(env).toStrictEqual({
			status: 'missing_hints',
			unresolved: [
				{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'], reason: 'non_empty' },
			],
		});

		await client.close();
	});

	test('applies matching hint and runs to ok', async () => {
		const client = new PGlite();
		await client.query('CREATE SCHEMA analytics;');
		await client.query('CREATE TABLE analytics.events (id integer);');

		const schema = pgFromExports({});

		const env = await runPushPostgres(
			schema,
			new HintsHandler([{ type: 'confirm_data_loss', kind: 'schema', entity: ['analytics'] }]),
			client,
		);

		expect(env).toStrictEqual({ status: 'ok', dialect: 'postgresql' });

		const schemas = await client.query(`SELECT nspname FROM pg_namespace WHERE nspname = 'analytics'`);
		expect(schemas.rows).toStrictEqual([]);

		await client.close();
	});
});

describe('push postgres confirm_data_loss[primary_key] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const client = new PGlite();
		await client.query('CREATE TABLE users (id integer NOT NULL, CONSTRAINT users_pkey PRIMARY KEY (id));');
		await client.query('INSERT INTO users (id) VALUES (1);');

		const schema = pgFromExports({ users: pgTable('users', { id: pgInteger().notNull() }) });

		const env = await runPushPostgres(schema, new HintsHandler(), client);

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

		await client.close();
	});

	test('applies matching hint and runs to ok', async () => {
		const client = new PGlite();
		await client.query('CREATE TABLE users (id integer NOT NULL, CONSTRAINT users_pkey PRIMARY KEY (id));');
		await client.query('INSERT INTO users (id) VALUES (1);');

		const schema = pgFromExports({ users: pgTable('users', { id: pgInteger().notNull() }) });

		const env = await runPushPostgres(
			schema,
			new HintsHandler([{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['public', 'users', 'users_pkey'] }]),
			client,
		);

		expect(env).toStrictEqual({ status: 'ok', dialect: 'postgresql' });

		const pks = await client.query(
			`SELECT conname FROM pg_constraint WHERE contype = 'p' AND conrelid = 'users'::regclass`,
		);
		expect(pks.rows).toStrictEqual([]);

		await client.close();
	});
});

describe('push postgres add_unique in json mode', () => {
	test('proceeds without a confirm and applies the constraint', async () => {
		const client = new PGlite();
		await client.query('CREATE TABLE users (id integer, email text);');
		await client.query("INSERT INTO users (id, email) VALUES (1, 'a@b.com');");

		const schema = pgFromExports({
			users: pgTable('users', { id: pgInteger(), email: pgText().unique() }),
		});

		const env = await runPushPostgres(schema, new HintsHandler(), client);

		expect(env).toStrictEqual({ status: 'ok', dialect: 'postgresql' });

		const uniques = await client.query<{ conname: string }>(
			`SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = 'users'::regclass`,
		);
		expect(uniques.rows.map((r) => r.conname)).toStrictEqual(['users_email_key']);

		await client.close();
	});
});

describe('push sqlite confirm_data_loss[table] in json mode', () => {
	test('emits missing_hints when unresolved', async () => {
		const sqlite = new BetterSqlite3(':memory:');
		sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY);');
		sqlite.prepare('INSERT INTO users (id) VALUES (1)').run();
		const db = sqliteDbFrom(sqlite);

		const sqliteSchema = sqliteFromExports({});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({});

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'users'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_id'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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
					reason: 'table_recreate',
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'users', 'email'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler();

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

		const sqliteSchema = sqliteFromExports({ usersTable });

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_a'] },
			{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'users', 'legacy_b'] },
		]);

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteSchema),
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

describe('check --output', () => {
	const ORIGIN = _ORIGIN;
	const stageOut = _stageOut;
	const writeSnapshot = _writeSnapshot;
	const stageValid = _stageValid;
	const stageConflict = _stageConflict;
	const stageTableConflict = _stageTableConflict;

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

		// the per-conflict parent/branch-leaf/statement-description data must be
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
				expect(Object.keys(branch).sort()).toEqual(
					['action', 'leafId', 'leafPath', 'statementDescription', 'target'].sort(),
				);
				expect(branch.leafId === null || typeof branch.leafId === 'string').toBe(true);
				expect(branch.leafPath === null || typeof branch.leafPath === 'string').toBe(true);
				expect(typeof branch.statementDescription).toBe('string');
				expect(typeof branch.action).toBe('string');
				expect(typeof branch.target).toBe('object');
				expect(typeof branch.target.kind).toBe('string');
				expect(typeof branch.target.name).toBe('string');
				expect(branch.target.kind).toBe('column');
				expect(branch.target.name).toBe('email');
				expect(branch.target.table).toBe('users');
			}
		}

		expectNoHumanStrings(result.stdout);
	});

	test('a table-level conflict carries a table-kind target with its schema in json mode', () => {
		const result = runCheck(stageTableConflict(), ['--output', 'json']);

		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.error.kind).toBe('conflicts');
		expect(parsed.error.details.length).toBeGreaterThan(0);
		for (const detail of parsed.error.details) {
			for (const branch of detail.branches) {
				// The structured kind for a create_table/create_table conflict is the table
				// itself — not 'column' and not the schema — and it carries the schema so the
				// consumer renders "<verb> `orders` in schema `public`" without parsing strings.
				expect(branch.target.kind).toBe('table');
				expect(branch.target.name).toBe('orders');
				expect(branch.target.schema).toBe('public');
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
	type TursoDriver = '@libsql/client' | '@tursodatabase/serverless' | '@tursodatabase/database';
	const mockDriverAvailability = (available: Partial<Record<TursoDriver, boolean>>) => {
		vi.doMock('../../src/cli/utils', async () => {
			const actual = await vi.importActual<typeof import('../../src/cli/utils')>('../../src/cli/utils');
			return {
				...actual,
				checkPackage: vi.fn(async (pkg: string) => available[pkg as TursoDriver] ?? false),
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
		const client = createLibsqlClient({ url: ':memory:' });
		const db = libsqlDbFrom(client);

		const pushSqlite = await import('../../src/cli/commands/push-sqlite');

		const env = await runWithCliContext({ output: 'json', interactive: false }, () =>
			pushSqlite.handle(
				db as never,
				SqliteSchemaSource.fromSchema(sqliteFromExports({})),
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

		client.close();
	});
});

describe('pull json envelopes', () => {
	const importRunPull = async () => {
		const schema = await import('../../src/cli/schema');
		return (schema as { runPull?: (config: unknown) => Promise<unknown> }).runPull;
	};

	const stageSnapshot = (out: string, tag: string) => {
		const meta = join(out, tag);
		mkdirSync(meta, { recursive: true });
		const snapshotPath = join(meta, 'snapshot.json');
		writeFileSync(snapshotPath, JSON.stringify({ version: '8', dialect: 'postgres', id: tag, prevIds: [], ddl: [] }));
		return snapshotPath;
	};

	const baseConfig = (out: string) => ({
		dialect: 'postgresql' as const,
		credentials: { url: 'postgresql://postgres:postgres@127.0.0.1:5432/db' },
		out,
		casing: 'camel' as const,
		breakpoints: true,
		filters: { entities: undefined, extensions: undefined, schemas: undefined, tables: undefined },
		init: false,
		migrations: { table: '__drizzle_migrations', schema: 'public' },
		output: 'json' as const,
	});

	test('ok manifest (fresh) surfaces every path with migrationPath present', async () => {
		const client = new PGlite();

		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-pull-ok-fresh-'));
		const runPull = await importRunPull();

		const env = await runWithCliContext(
			{ output: 'json', interactive: false },
			() => runPull!({ ...baseConfig(out), credentials: { driver: 'pglite', client } }),
		);

		expect(env).toMatchObject({
			status: 'ok',
			dialect: 'postgresql',
			schemaPath: join(out, 'schema.ts'),
			relationsPath: join(out, 'relations.ts'),
		});
		expect((env as { snapshotPath: string }).snapshotPath).toContain('snapshot.json');
		expect((env as { migrationPath: string }).migrationPath).toContain('migration.sql');
		expect(env).not.toHaveProperty('missing_hints');
		expect((env as { status: string }).status).toBe('ok');

		await client.close();
	});

	test('ok manifest (pre-existing snapshot) omits migrationPath', async () => {
		const client = new PGlite();

		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-pull-ok-existing-'));
		const latestSnapshot = stageSnapshot(out, '0000_x');
		const runPull = await importRunPull();

		const env = await runWithCliContext(
			{ output: 'json', interactive: false },
			() => runPull!({ ...baseConfig(out), credentials: { driver: 'pglite', client } }),
		);

		expect(env).toMatchObject({
			status: 'ok',
			dialect: 'postgresql',
			snapshotPath: latestSnapshot,
		});
		expect(env).not.toHaveProperty('migrationPath');

		await client.close();
	});

	test('a real connection failure never leaks the configured credentials into the error envelope', async () => {
		// The CLI holds the password and host in its config; an unreachable database makes the real
		// driver fail to connect, and the database_driver_error envelope must echo back neither.
		const password = 'S3NT1NEL_pw_a9F2';
		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-pull-driver-error-'));
		const runPull = await importRunPull();
		const { errorToEnvelope } = await import('../../src/cli/errors');

		const caught = await runWithCliContext(
			{ output: 'json', interactive: false },
			() =>
				runPull!({ ...baseConfig(out), credentials: { url: `postgresql://app:${password}@127.0.0.1:1/none` } })
					.then(() => null, (err) => err),
		);

		expect(caught).toMatchObject({ code: 'database_driver_error' });

		const serialized = JSON.stringify(errorToEnvelope(caught));
		expect(serialized).toContain('database_driver_error');
		expect(serialized).not.toContain(password);
		expect(serialized).not.toContain('127.0.0.1');
		expect(serialized).not.toContain('query_error');
	});

	test('json mode emits only the envelope and never constructs IntrospectProgress', async () => {
		const client = new PGlite();

		const introspectProgress = vi.fn();
		vi.doMock('../../src/cli/views', async () => {
			const actual = await vi.importActual<typeof import('../../src/cli/views')>('../../src/cli/views');
			class SpyIntrospectProgress extends actual.IntrospectProgress {
				constructor(...args: ConstructorParameters<typeof actual.IntrospectProgress>) {
					super(...args);
					introspectProgress(...args);
				}
			}
			return { ...actual, IntrospectProgress: SpyIntrospectProgress };
		});

		const hanji = await import('hanji');
		const renderSpy = vi.spyOn(hanji, 'render').mockImplementation((() => {}) as never);
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);

		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-pull-chatter-'));
		const runPull = await importRunPull();

		const env = await runWithCliContext(
			{ output: 'json', interactive: false },
			() => runPull!({ ...baseConfig(out), credentials: { driver: 'pglite', client } }),
		);

		expect((env as { status: string }).status).toBe('ok');
		expect(introspectProgress).not.toHaveBeenCalled();
		expect(renderSpy).not.toHaveBeenCalled();
		const stdoutBytes = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
		expect(stdoutBytes).not.toContain('[✓]');
		expect(stdoutBytes).not.toContain('[i]');
		expect(logSpy).not.toHaveBeenCalled();

		await client.close();
	});
});
