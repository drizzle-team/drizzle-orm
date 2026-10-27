import { test as brotest } from '@drizzle-team/brocli';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { integer, pgTable, serial, uuid } from 'drizzle-orm/pg-core';
import { index } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportSql } from 'src/cli-sdk/export';
import {
	DsqlInvalidObjectsError,
	errorToEnvelope,
	UnsupportedCommandCliError,
	UnsupportedSchemaChangeError,
} from 'src/cli/errors';
import { HintsHandler } from 'src/cli/hints';
import { exportRaw } from 'src/cli/schema';
import { fromExports, SchemaSource } from 'src/dialects/postgres/drizzle';
import type { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { prepareTestDatabase, type TestDatabase } from './mocks';

// push connects through `preparePostgresDB`, so its tests hand it their own database here.
const connection = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('src/cli/connections', async (importOriginal) => ({
	...(await importOriginal<typeof import('src/cli/connections')>()),
	preparePostgresDB: async () => connection.db,
}));

const runWithCliContext = async <T>(
	context: { output: 'text' | 'json'; interactive: boolean },
	callback: () => Promise<T> | T,
): Promise<T> => {
	const ctx = await import('src/cli/context');
	return ctx.runWithCliContext(context, callback);
};

const indexed = {
	users: pgTable('users', { id: uuid().primaryKey(), age: integer() }, (t) => [index('users_age_idx').on(t.age)]),
};

const generate = async (
	schema: Record<string, unknown>,
	opts: { driver?: 'dsql'; breakpoints?: boolean; out?: string } = {},
) => {
	const { handle } = await import('src/cli/commands/generate-postgres');
	const out = opts.out ?? mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-generate-'));
	const res = await runWithCliContext({ output: 'json', interactive: false }, () =>
		handle({
			dialect: 'postgresql',
			out,
			filenames: ['schema.ts'],
			schemaSource: SchemaSource.fromSchema(fromExports(schema)),
			custom: false,
			name: 'm',
			breakpoints: opts.breakpoints ?? true,
			bundle: false,
			driver: opts.driver,
			explain: false,
			hints: new HintsHandler(),
		} as never));
	return { res, out };
};

const migrationSqlOf = (out: string, folder: string) => readFileSync(join(out, folder, 'migration.sql'), 'utf8');

const migrationSql = (out: string) => {
	const folder = readdirSync(out).find((it) => existsSync(join(out, it, 'migration.sql')))!;
	return migrationSqlOf(out, folder);
};

describe('generate', () => {
	test('writes DSQL SQL with driver dsql', async () => {
		const { out } = await generate(indexed, { driver: 'dsql' });

		expect(migrationSql(out)).toContain('CREATE INDEX ASYNC "users_age_idx" ON "users" ("age");');
	});

	test('keeps Postgres SQL without a driver', async () => {
		const { out } = await generate(indexed);

		expect(migrationSql(out)).toContain('CREATE INDEX "users_age_idx" ON "users" ("age");');
	});

	test('rejects an unsupported change before writing a migration', async () => {
		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-generate-'));
		const error = await generate({ users: pgTable('users', { id: serial().primaryKey() }) }, {
			driver: 'dsql',
			out,
		}).catch((e) => e);

		expect(error).toBeInstanceOf(UnsupportedSchemaChangeError);
		expect(errorToEnvelope(error)).toStrictEqual({
			status: 'error',
			error: {
				code: 'unsupported_schema_change',
				kind: 'dsql_unsupported',
				issues: [{
					statement: 'create_table',
					entity: 'public.users.id',
					reason: "Aurora DSQL doesn't support serial types. Use uuid or bigint().generatedAlwaysAsIdentity() instead",
				}],
			},
		});
		expect(readdirSync(out)).toStrictEqual([]);
	});

	test('rejects breakpoints false with driver dsql', async () => {
		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-generate-'));
		const error = await generate(indexed, { driver: 'dsql', breakpoints: false, out }).catch((e) => e);

		expect(error).toBeInstanceOf(UnsupportedCommandCliError);
		expect(errorToEnvelope(error)).toStrictEqual({
			status: 'error',
			error: {
				code: 'unsupported_command_dialect_error',
				command: 'generate',
				dialect: 'postgresql',
				option: 'breakpoints',
			},
		});
		expect(readdirSync(out)).toStrictEqual([]);
	});

	test('stores the hash of the DSQL SQL in the snapshot', async () => {
		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-generate-'));
		await generate(indexed, { driver: 'dsql', out });
		await generate({
			users: pgTable('users', { id: uuid().primaryKey(), age: integer() }, (t) => [
				index('users_age_idx').on(t.age).where(sql`${t.age} > 0`),
			]),
		}, { driver: 'dsql', out });

		const folders = readdirSync(out).filter((it) => existsSync(join(out, it, 'snapshot.json'))).sort();
		const snapshot = JSON.parse(readFileSync(join(out, folders.at(-1)!, 'snapshot.json'), 'utf8'));
		const dsqlSql = [
			'DROP INDEX IF EXISTS "users_age_idx";',
			'CREATE INDEX ASYNC "users_age_idx" ON "users" ("age") WHERE "age" > 0;',
		];
		expect(migrationSqlOf(out, folders.at(-1)!)).toContain(dsqlSql.join('--> statement-breakpoint\n'));
		expect(snapshot.footprints).toContainEqual(expect.objectContaining({
			statementType: 'recreate_index',
			sqlHash: createHash('sha256').update(dsqlSql.join('\n')).digest('hex').slice(0, 16),
		}));
	});
});

describe('export', () => {
	const schemaFile = join(process.cwd(), 'tests/postgres/schemas/dsql-export.ts');

	// `pnpm test` sets a config path prefix that would also prefix this absolute schema path.
	const prefix = process.env['TEST_CONFIG_PATH_PREFIX'];
	beforeEach(() => {
		delete process.env['TEST_CONFIG_PATH_PREFIX'];
	});
	afterAll(() => {
		if (prefix !== undefined) process.env['TEST_CONFIG_PATH_PREFIX'] = prefix;
	});

	test('parses --driver dsql', async () => {
		const res = await brotest(exportRaw, `--dialect=postgresql --schema=${schemaFile} --driver=dsql`);
		if (res.type !== 'handler') throw new Error(`expected handler, got ${res.type}`);

		expect(res.options).toMatchObject({ dialect: 'postgresql', driver: 'dsql' });
	});

	test('prints DSQL SQL with driver dsql', async () => {
		const res = await exportSql({ dialect: 'postgresql', schema: schemaFile, driver: 'dsql' });

		expect(res).toMatchObject({ status: 'ok' });
		expect((res as { statements: string[] }).statements).toContain(
			'CREATE INDEX ASYNC "dsql_export_age_idx" ON "dsql_export" ("age");',
		);
	});

	test('prints Postgres SQL without a driver', async () => {
		const res = await exportSql({ dialect: 'postgresql', schema: schemaFile });

		expect((res as { statements: string[] }).statements).toContain(
			'CREATE INDEX "dsql_export_age_idx" ON "dsql_export" ("age");',
		);
	});
});

describe('pull', () => {
	let _: TestDatabase;

	beforeAll(async () => {
		_ = await prepareTestDatabase();
	});

	afterAll(async () => {
		await _.close();
	});

	beforeEach(async () => {
		await _.clear();
	});

	const pull = async (
		breakpoints: boolean,
		entities?: unknown,
		db: DB = _.db,
		out = mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-pull-')),
	) => {
		const { handle } = await import('src/cli/commands/pull-postgres');
		const res = await runWithCliContext({ output: 'json', interactive: false }, () =>
			handle(
				'camel',
				out,
				breakpoints,
				{ driver: 'dsql', url: 'postgresql://admin@localhost/postgres' },
				{ tables: undefined, schemas: undefined, entities, extensions: undefined } as never,
				{ schema: 'drizzle', table: '__drizzle_migrations' },
				false,
				db as never,
			));
		return { res, out };
	};

	test('writes the DSQL form of the pulled schema into its migration', async () => {
		await _.db.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY, "age" integer);');
		await _.db.query('CREATE INDEX "users_age_idx" ON "users" ("age");');

		const { out } = await pull(true);

		expect(migrationSql(out)).toContain('CREATE INDEX ASYNC "users_age_idx" ON "users" ("age");');
	});

	test('leaves the DSQL system roles out of the pulled schema', async () => {
		await _.db.query('CREATE ROLE "admin";');
		await _.db.query('CREATE ROLE "app_user" WITH LOGIN;');

		const { out } = await pull(true, { roles: { include: ['admin', 'app_user'] } });

		const schemaTs = readFileSync(join(out, 'schema.ts'), 'utf8');
		expect(schemaTs).toContain('pgRole("app_user", { canLogin: true })');
		expect(schemaTs).not.toContain('pgRole("admin"');
		expect(migrationSql(out)).not.toContain('"admin"');
	});

	test('refuses to pull while an index is invalid', async () => {
		await _.db.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY, "age" integer);');
		await _.db.query('CREATE INDEX "users_age_idx" ON "users" ("age");');
		await _.db.query(`UPDATE pg_index SET indisvalid = false WHERE indexrelid = '"users_age_idx"'::regclass;`);
		// No DSQL job is running.
		const db: DB = {
			query: (sql, params) => sql.includes('FROM sys.jobs') ? Promise.resolve([]) : _.db.query(sql, params),
		};
		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-pull-'));

		const error = await pull(true, undefined, db, out).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlInvalidObjectsError);
		expect((error as DsqlInvalidObjectsError).meta).toStrictEqual({
			indexes: ['public.users.users_age_idx'],
			constraints: [],
		});
		expect(readdirSync(out)).toStrictEqual([]);
	});

	test('rejects breakpoints false with driver dsql', async () => {
		const error = await pull(false).catch((e) => e);

		expect(error).toBeInstanceOf(UnsupportedCommandCliError);
		expect((error as UnsupportedCommandCliError).meta).toStrictEqual({
			command: 'pull',
			dialect: 'postgresql',
			option: 'breakpoints',
		});
	});
});

describe('push', () => {
	// PGlite with DSQL's async job protocol: `CREATE INDEX ASYNC` builds the index and returns a job id, every job
	// succeeds, and no job is running.
	const dsqlLike = async (setup: string[]) => {
		const client = new PGlite();
		for (const it of setup) await client.query(it);
		const queries: string[] = [];
		const db: DB = {
			query: async (sql, params) => {
				queries.push(sql);
				if (/^CREATE (UNIQUE )?INDEX ASYNC /.test(sql)) {
					await client.query(sql.replace(' ASYNC ', ' '));
					return [{ job_id: 'j1' }] as never[];
				}
				if (sql.startsWith('CALL sys.wait_for_job(')) return [{ succeeded: true }] as never[];
				if (sql.includes('FROM sys.jobs')) return [];
				return (await client.query(sql, params)).rows as never[];
			},
		};
		connection.db = db;
		return { client, queries };
	};

	const push = async (schema: Record<string, unknown>) => {
		const { handle } = await import('src/cli/commands/push-postgres');
		return runWithCliContext({ output: 'json', interactive: false }, () =>
			handle(
				SchemaSource.fromSchema(fromExports(schema)),
				false,
				{ driver: 'dsql', url: 'postgresql://admin@localhost/postgres' },
				{ tables: undefined, schemas: undefined, entities: undefined, extensions: undefined } as never,
				false,
				false,
				{ schema: 'drizzle', table: '__drizzle_migrations' },
				new HintsHandler(),
			));
	};

	test('runs the DSQL SQL and waits for its job', async () => {
		const { queries } = await dsqlLike(['CREATE TABLE "users" ("id" uuid PRIMARY KEY, "age" integer);']);

		const res = await push(indexed);

		expect(res).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
		const index = queries.indexOf('CREATE INDEX ASYNC "users_age_idx" ON "users" ("age");');
		expect(index).toBeGreaterThan(-1);
		expect(queries[index + 1]).toBe('CALL sys.wait_for_job($1)');
	});

	test('rejects an unsupported change before running any SQL', async () => {
		const { queries } = await dsqlLike([]);

		const error = await push({ users: pgTable('users', { id: serial().primaryKey() }) }).catch((e) => e);

		expect(error).toBeInstanceOf(UnsupportedSchemaChangeError);
		expect((error as UnsupportedSchemaChangeError).meta).toMatchObject({ kind: 'dsql_unsupported' });
		expect(queries.filter((it) => it.startsWith('CREATE'))).toStrictEqual([]);
	});

	test('refuses to run while an index is invalid', async () => {
		const { queries } = await dsqlLike([
			'CREATE TABLE "users" ("id" uuid PRIMARY KEY, "age" integer);',
			'CREATE INDEX "users_age_idx" ON "users" ("age");',
			`UPDATE pg_index SET indisvalid = false WHERE indexrelid = '"users_age_idx"'::regclass;`,
		]);

		// The schema adds a column, so a push that ran past the check would change the table.
		const error = await push({
			users: pgTable('users', { id: uuid().primaryKey(), age: integer(), extra: integer() }, (t) => [
				index('users_age_idx').on(t.age),
			]),
		}).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlInvalidObjectsError);
		expect((error as DsqlInvalidObjectsError).meta).toStrictEqual({
			indexes: ['public.users.users_age_idx'],
			constraints: [],
		});
		expect(queries.filter((it) => /^(CREATE|ALTER|DROP)/.test(it))).toStrictEqual([]);
	});
});
