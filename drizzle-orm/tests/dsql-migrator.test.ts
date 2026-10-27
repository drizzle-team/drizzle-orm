import { expect, test, vi } from 'vitest';
import { DrizzleError, DrizzleQueryError } from '~/errors.ts';
import type { MigrationMeta } from '~/migrator.ts';
import { drizzle as nodePgDsql } from '~/node-postgres/dsql/driver.ts';
import type { DsqlAsyncDatabase } from '~/pg-core/async/dsql/db.ts';
import { migrate } from '~/pg-core/async/dsql/migrator.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { SQL } from '~/sql/sql.ts';

type Step = { match: RegExp; params?: unknown[]; rows?: unknown[]; error?: unknown };

const dialect = new PgDialect();

// A DSQL database with a new migrations table that expects exactly `steps` for the migration statements, in
// this order. The bookkeeping queries of the migrator are answered as for an empty database.
const scripted = (steps: Step[]) => {
	const queue = [...steps];
	const calls: { sql: string; params: unknown[] }[] = [];
	const run = async (query: SQL) => {
		const { sql, params } = dialect.sqlToQuery(query);
		calls.push({ sql, params });
		if (/^CREATE SCHEMA IF NOT EXISTS|FROM information_schema\.tables|CREATE TABLE IF NOT EXISTS/.test(sql.trim())) {
			return [];
		}
		if (sql.startsWith('select id, hash, created_at, name from')) return [];
		if (sql.startsWith('insert into')) return [];
		const step = queue.shift();
		if (!step) throw new Error(`unexpected query: ${sql}`);
		expect(sql).toMatch(step.match);
		if (step.params) expect(params).toStrictEqual(step.params);
		if (step.error) throw step.error;
		return step.rows ?? [];
	};
	const db = { execute: run, session: { objects: run, execute: run } } as unknown as DsqlAsyncDatabase<any, any>;
	return { db, calls, remaining: () => queue.length };
};

const migration = (name: string, sql: string[]): MigrationMeta => ({
	sql,
	folderMillis: 1,
	hash: `hash_${name}`,
	bps: true,
	name,
});

const occ = (code: string) =>
	new DrizzleQueryError(
		'q',
		[],
		Object.assign(new Error(`schema has been updated by another transaction (${code})`), { code }),
	);
const pgError = (code: string, message: string) =>
	new DrizzleQueryError('q', [], Object.assign(new Error(message), { code }));

const CREATE_INDEX = 'CREATE INDEX ASYNC "i" ON "s"."t" ("a");';
const WAIT = /^CALL sys\.wait_for_job\(\$1\)$/;
const JOB = /FROM sys\.jobs WHERE job_id = \$1/;
const INDEX_NAME = /FROM pg_catalog\.pg_class/;
const CONSTRAINT_NAME = /FROM pg_catalog\.pg_constraint/;
const recorded = (calls: { sql: string }[]) => calls.filter((it) => it.sql.startsWith('insert into'));
const config = { migrationsFolder: 'unused' };

test('runs a statement without a job and records the migration', async () => {
	const { db, calls, remaining } = scripted([{ match: /^CREATE TABLE "s"\."t"/ }]);

	await migrate([migration('m1', ['CREATE TABLE "s"."t" ("id" uuid PRIMARY KEY);'])], db, config);

	expect(remaining()).toBe(0);
	expect(recorded(calls)).toHaveLength(1);
});

// node-postgres resolves a query with several statements to one result per statement.
test('runs a chunk with several statements on node-postgres and records the migration', async () => {
	const queries: string[] = [];
	const result = (command: string) => ({ command, rows: [], rowCount: 0, fields: [] });
	const client = {
		query: async (query: string | { text: string }) => {
			const text = typeof query === 'string' ? query : query.text;
			queries.push(text);
			return text.startsWith('INSERT INTO "t"') ? [result('INSERT'), result('INSERT')] : result('SELECT');
		},
	};
	const db = nodePgDsql({ client: client as never });

	await migrate([migration('m1', ['INSERT INTO "t" VALUES (1); INSERT INTO "t" VALUES (2);'])], db, config);

	expect(queries.filter((it) => it.startsWith('insert into "drizzle"."__drizzle_migrations"'))).toHaveLength(1);
	expect(queries.filter((it) => it.includes('wait_for_job'))).toStrictEqual([]);
});

test('reads the job id through node-postgres and waits for the job', async () => {
	const queries: { text: string; values?: unknown[] }[] = [];
	const result = (rows: unknown[]) => ({ command: 'SELECT', rows, rowCount: rows.length, fields: [] });
	const client = {
		query: async (query: string | { text: string }, values?: unknown[]) => {
			const text = typeof query === 'string' ? query : query.text;
			queries.push({ text, values });
			if (text.startsWith('CREATE INDEX ASYNC')) return result([{ job_id: 'j1' }]);
			if (text.startsWith('CALL sys.wait_for_job')) return result([{ succeeded: true }]);
			return result([]);
		},
	};
	const db = nodePgDsql({ client: client as never });

	await migrate([migration('m1', [CREATE_INDEX])], db, config);

	expect(queries.filter((it) => it.text.startsWith('CALL sys.wait_for_job'))).toStrictEqual([
		{ text: 'CALL sys.wait_for_job($1)', values: ['j1'] },
	]);
	expect(queries.filter((it) => it.text.startsWith('insert into "drizzle"."__drizzle_migrations"'))).toHaveLength(1);
});

test('retries a statement after an OCC error', async () => {
	const { db, calls } = scripted([
		{ match: /^CREATE TABLE/, error: occ('OC001') },
		{ match: /^CREATE TABLE/ },
	]);

	await migrate([migration('m1', ['CREATE TABLE "t" ();'])], db, config);

	expect(calls.filter((it) => it.sql.startsWith('CREATE TABLE "t"'))).toHaveLength(2);
	expect(recorded(calls)).toHaveLength(1);
});

test('throws the last OCC error after 5 attempts and records nothing', async () => {
	const errors = [1, 2, 3, 4, 5].map(() => occ('40001'));
	const { db, calls } = scripted(errors.map((error) => ({ match: /^CREATE TABLE/, error })));

	await expect(migrate([migration('m1', ['CREATE TABLE "t" ();'])], db, config)).rejects.toBe(errors[4]);
	expect(recorded(calls)).toHaveLength(0);
});

test('does not retry another error', async () => {
	const error = pgError('42P07', 'relation "t" already exists');
	const { db, calls } = scripted([{ match: /^CREATE TABLE/, error }]);

	await expect(migrate([migration('m1', ['CREATE TABLE "t" ();'])], db, config)).rejects.toBe(error);
	expect(calls.filter((it) => it.sql.startsWith('CREATE TABLE "t"'))).toHaveLength(1);
});

test('waits for the job of an async statement before recording the migration', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, params: ['j1'], rows: [{ succeeded: true }] },
	]);

	await migrate([migration('m1', [CREATE_INDEX])], db, config);

	expect(remaining()).toBe(0);
	const order = calls.map((it) => it.sql);
	expect(order.findIndex((it) => WAIT.test(it))).toBeLessThan(order.findIndex((it) => it.startsWith('insert into')));
});

test('retries the wait without submitting the statement again', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, error: occ('OC001') },
		{ match: WAIT, error: pgError('57P01', 'terminating connection due to administrator command') },
		{ match: WAIT, error: pgError('CONNECTION_CLOSED', 'write CONNECTION_CLOSED cluster:5432') },
		{ match: WAIT, error: pgError('CONNECT_TIMEOUT', 'write CONNECT_TIMEOUT cluster:5432') },
		{ match: WAIT, rows: [{ succeeded: true }] },
	]);

	await migrate([migration('m1', [CREATE_INDEX])], db, config);

	expect(remaining()).toBe(0);
	expect(calls.filter((it) => it.sql.startsWith('CREATE INDEX'))).toHaveLength(1);
	expect(recorded(calls)).toHaveLength(1);
});

test('keeps waiting through a run of OCC conflicts, as the job runs on', async () => {
	const conflicts: Step[] = [];
	for (let i = 0; i < 12; i++) conflicts.push({ match: WAIT, error: occ('OC001') });
	const { db, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		...conflicts,
		{ match: WAIT, rows: [{ succeeded: true }] },
	]);

	// The backoff between the waits adds up to about 10 seconds.
	vi.useFakeTimers();
	try {
		const run = migrate([migration('m1', [CREATE_INDEX])], db, config).then(() => null, (e) => e);
		await vi.runAllTimersAsync();
		expect(await run).toBeNull();
	} finally {
		vi.useRealTimers();
	}

	expect(remaining()).toBe(0);
});

// The migrator sleeps between waits on a job that still runs.
const migrateOnFakeTimers = async (db: DsqlAsyncDatabase<any, any>, migrations: MigrationMeta[]) => {
	vi.useFakeTimers();
	try {
		const run = migrate(migrations, db, config).then(() => null, (e) => e);
		await vi.runAllTimersAsync();
		return await run;
	} finally {
		vi.useRealTimers();
	}
};

test('waits again while the job still runs, and never drops it', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{ match: JOB, params: ['j1'], rows: [{ status: 'processing' }] },
		{ match: WAIT, params: ['j1'], rows: [{ succeeded: true }] },
	]);

	expect(await migrateOnFakeTimers(db, [migration('m1', [CREATE_INDEX])])).toBeNull();

	expect(remaining()).toBe(0);
	expect(calls.filter((it) => it.sql.startsWith('DROP'))).toStrictEqual([]);
	expect(recorded(calls)).toHaveLength(1);
});

test('waits again after the wait itself fails while the job runs', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, error: pgError('54000', 'transaction exceeds the maximum duration') },
		{ match: JOB, rows: [{ status: 'submitted' }] },
		{ match: WAIT, rows: [{ succeeded: true }] },
	]);

	expect(await migrateOnFakeTimers(db, [migration('m1', [CREATE_INDEX])])).toBeNull();

	expect(remaining()).toBe(0);
	expect(recorded(calls)).toHaveLength(1);
});

test('a job that completed while the wait failed is done', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, error: pgError('54000', 'transaction exceeds the maximum duration') },
		{ match: JOB, rows: [{ status: 'completed' }] },
	]);

	await migrate([migration('m1', [CREATE_INDEX])], db, config);

	expect(remaining()).toBe(0);
	expect(recorded(calls)).toHaveLength(1);
});

test('throws the error of a failed wait when the job is unknown', async () => {
	const error = pgError('54000', 'transaction exceeds the maximum duration');
	const { db, calls } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, error },
		{ match: JOB, rows: [] },
	]);

	await expect(migrate([migration('m1', [CREATE_INDEX])], db, config)).rejects.toBe(error);
	expect(recorded(calls)).toHaveLength(0);
});

test('retries a wait after node-postgres loses its connection', async () => {
	const { db, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, error: new DrizzleQueryError('q', [], new Error('Connection terminated unexpectedly')) },
		{ match: WAIT, rows: [{ succeeded: true }] },
	]);

	await migrate([migration('m1', [CREATE_INDEX])], db, config);

	expect(remaining()).toBe(0);
});

test('a job_id column of a statement that starts no job is not a job', async () => {
	const { db, calls } = scripted([{ match: /^INSERT/, rows: [{ job_id: 'mine' }] }]);

	await migrate([migration('m1', ['INSERT INTO "jobs" ("job_id") VALUES (\'mine\') RETURNING "job_id";'])], db, config);

	expect(calls.filter((it) => WAIT.test(it.sql))).toStrictEqual([]);
	expect(recorded(calls)).toHaveLength(1);
});

test('drops a failed index, records nothing and reports the reason', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{
			match: JOB,
			params: ['j1'],
			rows: [{
				status: 'failed',
				job_type: 'INDEX_BUILD',
				object_name: 's.i',
				details: 'found duplicate key(s) while validating index uniqueness',
				class_id: '1259',
				object_id: '52977',
			}],
		},
		{ match: INDEX_NAME, params: ['52977'], rows: [{ schema: 's', name: 'i' }] },
		{ match: /^DROP INDEX IF EXISTS "s"\."i"$/ },
	]);

	const error = await migrate(
		[migration('0001_users', [CREATE_INDEX, 'CREATE TABLE "never" ();'])],
		db,
		config,
	).catch((e) => e);

	expect(error).toBeInstanceOf(DrizzleError);
	expect(error.message).toContain('0001_users');
	expect(error.message).toContain('j1');
	expect(error.message).toContain('found duplicate key(s) while validating index uniqueness');
	expect(error.message).toContain(CREATE_INDEX);
	expect(error.message).toContain(
		'The failed object was dropped. If the migration replaced an index or constraint, it dropped the old one first, so the table now has neither.',
	);
	expect(remaining()).toBe(0);
	expect(recorded(calls)).toHaveLength(0);
});

test('drops a constraint that failed to validate', async () => {
	const { db, remaining } = scripted([
		{ match: /^ALTER TABLE ASYNC/, rows: [{ job_id: 'j2' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{
			match: JOB,
			rows: [{
				status: 'failed',
				job_type: 'VALIDATE_CONSTRAINT',
				object_name: 'c on s.t',
				details: 'violated',
				class_id: 2606,
				object_id: 9,
			}],
		},
		{ match: CONSTRAINT_NAME, params: ['9'], rows: [{ schema: 's', table: 't', name: 'c' }] },
		{ match: /^ALTER TABLE "s"\."t" DROP CONSTRAINT IF EXISTS "c"$/ },
	]);

	const error = await migrate([migration('m1', ['ALTER TABLE ASYNC "s"."t" VALIDATE CONSTRAINT "c";'])], db, config)
		.catch((e) => e);

	expect(error.message).toContain('violated');
	expect(error.message).toContain('The failed object was dropped.');
	expect(remaining()).toBe(0);
});

test('retries reading the job and the cleanup after OCC errors', async () => {
	const { db, calls, remaining } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{ match: JOB, error: occ('OC000') },
		{
			match: JOB,
			rows: [{
				status: 'failed',
				job_type: 'INDEX_BUILD',
				object_name: 's.i',
				details: 'd',
				class_id: 1259,
				object_id: 7,
			}],
		},
		{ match: INDEX_NAME, rows: [{ schema: 's', name: 'i' }] },
		{ match: /^DROP INDEX IF EXISTS/, error: occ('OC001') },
		{ match: /^DROP INDEX IF EXISTS/ },
	]);

	const error = await migrate([migration('m1', [CREATE_INDEX])], db, config).catch((e) => e);

	expect(error).toBeInstanceOf(DrizzleError);
	expect(error.message).not.toContain('left behind');
	expect(calls.filter((it) => it.sql.startsWith('CREATE INDEX'))).toHaveLength(1);
	expect(remaining()).toBe(0);
});

test('reports a failed cleanup with the job failure', async () => {
	const { db } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{
			match: JOB,
			rows: [{
				status: 'failed',
				job_type: 'INDEX_BUILD',
				object_name: 's.i',
				details: 'd',
				class_id: 1259,
				object_id: 7,
			}],
		},
		{ match: INDEX_NAME, rows: [{ schema: 's', name: 'i' }] },
		{ match: /^DROP INDEX IF EXISTS/, error: pgError('42501', 'permission denied') },
	]);

	const error = await migrate([migration('m1', [CREATE_INDEX])], db, config).catch((e) => e);

	expect(error).toBeInstanceOf(DrizzleError);
	expect(error.message).toContain('"s"."i" is left behind');
	expect(error.message).toContain('permission denied');
});

test('reports a failed read of the job with the job failure', async () => {
	const { db } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{ match: JOB, error: pgError('42501', 'permission denied') },
	]);

	const error = await migrate([migration('m1', [CREATE_INDEX])], db, config).catch((e) => e);

	expect(error).toBeInstanceOf(DrizzleError);
	expect(error.message).toContain('Migration "m1" failed: Aurora DSQL job j1');
	expect(error.message).toContain('Dropping it failed, so the object of the job is left behind: permission denied');
});

test('reports a failed lookup of the object with the job failure', async () => {
	const { db } = scripted([
		{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
		{ match: WAIT, rows: [{ succeeded: false }] },
		{
			match: JOB,
			rows: [{
				status: 'failed',
				job_type: 'INDEX_BUILD',
				object_name: 's.i',
				details: 'd',
				class_id: 1259,
				object_id: 7,
			}],
		},
		{ match: INDEX_NAME, error: pgError('42501', 'permission denied') },
	]);

	const error = await migrate([migration('m1', [CREATE_INDEX])], db, config).catch((e) => e);

	expect(error).toBeInstanceOf(DrizzleError);
	expect(error.message).toContain('job j1');
	expect(error.message).toContain('Dropping it failed, so s.i is left behind: permission denied');
});
