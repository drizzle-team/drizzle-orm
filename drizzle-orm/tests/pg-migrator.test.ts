import { describe, expect, test } from 'vitest';
import type { MigrationMeta } from '~/migrator.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { PgSession } from '~/pg-core/session.ts';
import type { SQL } from '~/sql/sql.ts';

const dialect = new PgDialect();

interface LoggedQuery {
	sql: string;
	params: unknown[];
}

type LogEntry = 'begin' | 'commit' | 'rollback' | LoggedQuery;

class MockSession {
	readonly log: LogEntry[] = [];
	appliedMigrations: { id: number; hash: string; created_at: string }[] = [];
	failOnSql: string | undefined;

	private record(query: SQL): void {
		const { sql: queryString, params } = dialect.sqlToQuery(query);
		this.log.push({ sql: queryString, params });
		if (this.failOnSql !== undefined && queryString.includes(this.failOnSql)) {
			throw new Error(`query failed: ${queryString}`);
		}
	}

	async execute(query: SQL): Promise<unknown> {
		this.record(query);
		return [];
	}

	async all(query: SQL): Promise<unknown[]> {
		this.record(query);
		return this.appliedMigrations;
	}

	async transaction<T>(transaction: (tx: { execute(query: SQL): Promise<unknown> }) => Promise<T>): Promise<T> {
		this.log.push('begin');
		try {
			const result = await transaction({ execute: async (query) => this.record(query) });
			this.log.push('commit');
			return result;
		} catch (error) {
			this.log.push('rollback');
			throw error;
		}
	}
}

function migration(folderMillis: number, ...statements: string[]): MigrationMeta {
	return {
		sql: statements,
		folderMillis,
		hash: `hash${folderMillis}`,
		bps: true,
	};
}

async function migrate(
	session: MockSession,
	migrations: MigrationMeta[],
	config: { migrationsTable?: string; migrationsSchema?: string } = {},
): Promise<LogEntry[]> {
	await dialect.migrate(migrations, session as unknown as PgSession, { migrationsFolder: '', ...config });
	// Drops the migrations schema + table setup and the applied migrations lookup,
	// which are identical for every run.
	return session.log.slice(3);
}

function query(sql: string): LoggedQuery {
	return { sql, params: [] };
}

function journalEntry(
	migration: MigrationMeta,
	schema = 'drizzle',
	table = '__drizzle_migrations',
): LoggedQuery {
	return {
		sql: `insert into "${schema}"."${table}" ("hash", "created_at") values($1, $2)`,
		params: [migration.hash, migration.folderMillis],
	};
}

describe('migrations without concurrent index statements', () => {
	test('applies all pending migrations in a single transaction', async () => {
		const session = new MockSession();
		const migration1 = migration(
			1,
			'CREATE TABLE "users" ("id" int)',
			'ALTER TABLE "users" ADD COLUMN "name" text',
		);
		const migration2 = migration(2, 'CREATE INDEX "users_name_index" ON "users" ("name")');

		const log = await migrate(session, [migration1, migration2]);

		expect(session.log[0]).toEqual(query('CREATE SCHEMA IF NOT EXISTS "drizzle"'));
		expect(log).toEqual([
			'begin',
			query('CREATE TABLE "users" ("id" int)'),
			query('ALTER TABLE "users" ADD COLUMN "name" text'),
			journalEntry(migration1),
			query('CREATE INDEX "users_name_index" ON "users" ("name")'),
			journalEntry(migration2),
			'commit',
		]);
	});

	test('skips migrations that were already applied', async () => {
		const session = new MockSession();
		session.appliedMigrations = [{ id: 1, hash: 'hash1', created_at: '1' }];
		const migration1 = migration(1, 'CREATE TABLE "users" ("id" int)');
		const migration2 = migration(2, 'ALTER TABLE "users" ADD COLUMN "name" text');

		const log = await migrate(session, [migration1, migration2]);

		expect(log).toEqual([
			'begin',
			query('ALTER TABLE "users" ADD COLUMN "name" text'),
			journalEntry(migration2),
			'commit',
		]);
	});

	test('rolls back all pending migrations when a statement fails', async () => {
		const session = new MockSession();
		session.failOnSql = 'DROP TABLE "missing"';
		const migration1 = migration(1, 'CREATE TABLE "users" ("id" int)');
		const migration2 = migration(2, 'DROP TABLE "missing"');

		await expect(migrate(session, [migration1, migration2])).rejects.toThrow('DROP TABLE "missing"');

		expect(session.log.slice(3)).toEqual([
			'begin',
			query('CREATE TABLE "users" ("id" int)'),
			journalEntry(migration1),
			query('DROP TABLE "missing"'),
			'rollback',
		]);
	});
});

describe('migrations with concurrent index statements', () => {
	test('runs the concurrent statement outside of the transaction and commits preceding statements first', async () => {
		const session = new MockSession();
		const migration1 = migration(
			1,
			'CREATE TABLE "users" ("id" int, "name" text)',
			'CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")',
			'ALTER TABLE "users" ADD COLUMN "email" text',
		);

		const log = await migrate(session, [migration1]);

		expect(log).toEqual([
			'begin',
			query('CREATE TABLE "users" ("id" int, "name" text)'),
			'commit',
			query('CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")'),
			'begin',
			query('ALTER TABLE "users" ADD COLUMN "email" text'),
			journalEntry(migration1),
			'commit',
		]);
	});

	test('applies and records each migration separately', async () => {
		const session = new MockSession();
		const migration1 = migration(1, 'CREATE TABLE "users" ("id" int, "name" text)');
		const migration2 = migration(2, 'CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")');
		const migration3 = migration(3, 'ALTER TABLE "users" ADD COLUMN "email" text');

		const log = await migrate(session, [migration1, migration2, migration3]);

		expect(log).toEqual([
			'begin',
			query('CREATE TABLE "users" ("id" int, "name" text)'),
			journalEntry(migration1),
			'commit',
			query('CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")'),
			'begin',
			journalEntry(migration2),
			'commit',
			'begin',
			query('ALTER TABLE "users" ADD COLUMN "email" text'),
			journalEntry(migration3),
			'commit',
		]);
	});

	test('uses the configured migrations schema and table', async () => {
		const session = new MockSession();
		const migration1 = migration(1, 'CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")');

		const log = await migrate(session, [migration1], {
			migrationsSchema: 'custom_schema',
			migrationsTable: 'custom_table',
		});

		expect(log).toEqual([
			query('CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")'),
			'begin',
			journalEntry(migration1, 'custom_schema', 'custom_table'),
			'commit',
		]);
	});

	test('does not record a migration whose concurrent statement fails', async () => {
		const session = new MockSession();
		session.failOnSql = 'CREATE INDEX CONCURRENTLY';
		const migration1 = migration(
			1,
			'CREATE TABLE "users" ("id" int, "name" text)',
			'CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")',
		);

		await expect(migrate(session, [migration1])).rejects.toThrow('CREATE INDEX CONCURRENTLY');

		expect(session.log.slice(3)).toEqual([
			'begin',
			query('CREATE TABLE "users" ("id" int, "name" text)'),
			'commit',
			query('CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")'),
		]);
	});

	test('keeps recorded migrations when a later migration fails', async () => {
		const session = new MockSession();
		session.failOnSql = 'DROP TABLE "missing"';
		const migration1 = migration(1, 'CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")');
		const migration2 = migration(2, 'DROP TABLE "missing"');

		await expect(migrate(session, [migration1, migration2])).rejects.toThrow('DROP TABLE "missing"');

		expect(session.log.slice(3)).toEqual([
			query('CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")'),
			'begin',
			journalEntry(migration1),
			'commit',
			'begin',
			query('DROP TABLE "missing"'),
			'rollback',
		]);
	});
});

describe('concurrent index statement detection', () => {
	test.each([
		'CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")',
		'create index concurrently "users_name_index" on "users" ("name")',
		'CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_name_index" ON "users" ("name")',
		'CREATE INDEX CONCURRENTLY ON "users" ("name")',
		'CREATE UNIQUE INDEX CONCURRENTLY "users_name_index" ON "users" USING btree ("name");',
		'\nCREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name");',
		'-- adds the index\nCREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")',
		'/* adds\nthe index */ CREATE INDEX CONCURRENTLY "users_name_index" ON "users" ("name")',
		'create\tunique\nindex   concurrently "users_name_index" on "users" ("name")',
		'DROP INDEX CONCURRENTLY "users_name_index"',
	])('runs outside of the transaction: %s', async (statement) => {
		const session = new MockSession();
		const migration1 = migration(1, statement);

		const log = await migrate(session, [migration1]);

		expect(log).toEqual([
			query(statement),
			'begin',
			journalEntry(migration1),
			'commit',
		]);
	});

	test.each([
		'CREATE INDEX "users_name_index" ON "users" ("name")',
		'CREATE UNIQUE INDEX "users_name_index" ON "users" ("name")',
		'CREATE INDEX concurrently_index ON "users" ("name")',
		'CREATE INDEX "concurrently" ON "users" ("name")',
		'DROP INDEX "users_name_index"',
		`INSERT INTO "log" ("message") VALUES ('create index concurrently')`,
	])('runs inside of the transaction: %s', async (statement) => {
		const session = new MockSession();
		const migration1 = migration(1, statement);

		const log = await migrate(session, [migration1]);

		expect(log).toEqual([
			'begin',
			query(statement),
			journalEntry(migration1),
			'commit',
		]);
	});
});
