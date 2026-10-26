import { DsqlAsyncJobError, DsqlInvalidObjectsError } from 'src/cli/errors';
import { QueryError } from 'src/cli/utils';
import {
	assertNoInvalidDsqlObjects,
	dsqlEntityFilter,
	isDsqlOcc,
	runDsqlStatements,
	withDsqlOccRetry,
} from 'src/dialects/postgres/dsql';
import type { DB } from 'src/utils';
import { describe, expect, test } from 'vitest';

type Step = { match: RegExp; params?: unknown[]; rows?: unknown[]; error?: unknown };

// A database that expects exactly these queries, in this order.
const scripted = (steps: Step[]) => {
	const queue = [...steps];
	const calls: string[] = [];
	const db: DB = {
		query: async <T>(sql: string, params?: any[]) => {
			calls.push(sql);
			const step = queue.shift();
			if (!step) throw new Error(`unexpected query: ${sql}`);
			expect(sql).toMatch(step.match);
			if (step.params) expect(params).toStrictEqual(step.params);
			if (step.error) throw step.error;
			return (step.rows ?? []) as T[];
		},
	};
	return { db, calls, remaining: () => queue.length };
};

const occ = (code: string) =>
	Object.assign(new Error(`schema has been updated by another transaction (${code})`), { code });
// The code alone, so a test of the code check can't pass on the message.
const occCode = (code: string) => Object.assign(new Error('conflict'), { code });
const wrapped = (e: unknown, sql = 'sql') => new QueryError(e, sql, []);
const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });
const noSleep = { sleep: async () => {} };

const CREATE_INDEX = 'CREATE INDEX ASYNC "i" ON "s"."t" ("a");';
const VALIDATE = 'ALTER TABLE ASYNC "s"."t" VALIDATE CONSTRAINT "c";';
const WAIT = /^CALL sys\.wait_for_job\(\$1\)$/;
const JOB = /FROM sys\.jobs WHERE job_id = \$1/;
const INDEX_NAME = /FROM pg_catalog\.pg_class/;
const CONSTRAINT_NAME = /FROM pg_catalog\.pg_constraint/;

describe('isDsqlOcc', () => {
	test.each([
		['OC000 code', occCode('OC000'), true],
		['OC001 code', occCode('OC001'), true],
		['40001 code', occCode('40001'), true],
		['a QueryError around 40001', wrapped(occCode('40001')), true],
		['OC000 in the message only', new Error('change conflicts with another transaction (OC000)'), true],
		['OC001 in the message of a nested cause', new Error('outer', { cause: new Error('x (OC001)') }), true],
		['another SQLSTATE', pgError('42P07', 'relation exists'), false],
		['a plain error', new Error('boom'), false],
		['null', null, false],
	])('%s', (_, error, expected) => {
		expect(isDsqlOcc(error)).toBe(expected);
	});
});

describe('runDsqlStatements', () => {
	test('runs a statement without a job once', async () => {
		const { db, calls } = scripted([{ match: /^CREATE TABLE/ }]);

		await runDsqlStatements(db, ['CREATE TABLE "s"."t" ("id" uuid PRIMARY KEY);'], noSleep);

		expect(calls).toHaveLength(1);
	});

	test('retries a statement after an OCC error', async () => {
		const { db, calls } = scripted([
			{ match: /^CREATE TABLE/, error: wrapped(occ('OC001')) },
			{ match: /^CREATE TABLE/ },
		]);

		await runDsqlStatements(db, ['CREATE TABLE "s"."t" ("id" uuid PRIMARY KEY);'], noSleep);

		expect(calls).toHaveLength(2);
	});

	test('throws the last OCC error after 5 attempts', async () => {
		const errors = [1, 2, 3, 4, 5].map((it) => wrapped(occ('40001'), `attempt ${it}`));
		const { db, calls } = scripted(errors.map((error) => ({ match: /^CREATE TABLE/, error })));

		await expect(runDsqlStatements(db, ['CREATE TABLE "t" ();'], noSleep)).rejects.toBe(errors[4]);
		expect(calls).toHaveLength(5);
	});

	test('does not retry another error', async () => {
		const error = wrapped(pgError('42P07', 'relation "t" already exists'));
		const { db, calls } = scripted([{ match: /^CREATE TABLE/, error }]);

		await expect(runDsqlStatements(db, ['CREATE TABLE "t" ();'], noSleep)).rejects.toBe(error);
		expect(calls).toHaveLength(1);
	});

	test('waits for the job of an async statement', async () => {
		const { db, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, params: ['j1'], rows: [{ succeeded: true }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(remaining()).toBe(0);
	});

	test('retries the wait without submitting the statement again', async () => {
		const { db, calls } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, error: wrapped(occ('OC001')) },
			{ match: WAIT, error: wrapped(pgError('57P01', 'terminating connection due to administrator command')) },
			{ match: WAIT, error: wrapped(pgError('CONNECTION_CLOSED', 'write CONNECTION_CLOSED cluster:5432')) },
			{ match: WAIT, error: wrapped(pgError('CONNECT_TIMEOUT', 'write CONNECT_TIMEOUT cluster:5432')) },
			{ match: WAIT, params: ['j1'], rows: [{ succeeded: true }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(calls.filter((it) => it.startsWith('CREATE INDEX'))).toHaveLength(1);
	});

	test('keeps waiting through a run of OCC conflicts, as the job runs on', async () => {
		const conflicts: Step[] = [];
		for (let i = 0; i < 12; i++) conflicts.push({ match: WAIT, error: wrapped(occ('OC001')) });
		const { db, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			...conflicts,
			{ match: WAIT, rows: [{ succeeded: true }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(remaining()).toBe(0);
	});

	test('waits again while the job still runs, and never drops it', async () => {
		const { db, calls, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, rows: [{ succeeded: false }] },
			{ match: JOB, params: ['j1'], rows: [{ status: 'processing' }] },
			{ match: WAIT, params: ['j1'], rows: [{ succeeded: true }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(remaining()).toBe(0);
		expect(calls.filter((it) => it.startsWith('DROP'))).toStrictEqual([]);
	});

	test('waits again after the wait itself fails while the job runs', async () => {
		const { db, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, error: wrapped(pgError('54000', 'transaction exceeds the maximum duration')) },
			{ match: JOB, rows: [{ status: 'submitted' }] },
			{ match: WAIT, rows: [{ succeeded: true }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(remaining()).toBe(0);
	});

	test('a job that completed while the wait failed is done', async () => {
		const { db, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, error: wrapped(pgError('54000', 'transaction exceeds the maximum duration')) },
			{ match: JOB, rows: [{ status: 'completed' }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(remaining()).toBe(0);
	});

	test('throws the error of a failed wait when the job is unknown', async () => {
		const error = wrapped(pgError('54000', 'transaction exceeds the maximum duration'));
		const { db } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, error },
			{ match: JOB, rows: [] },
		]);

		await expect(runDsqlStatements(db, [CREATE_INDEX], noSleep)).rejects.toBe(error);
	});

	test('retries a wait after node-postgres loses its connection', async () => {
		const { db, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, error: wrapped(new Error('Connection terminated unexpectedly')) },
			{ match: WAIT, rows: [{ succeeded: true }] },
		]);

		await runDsqlStatements(db, [CREATE_INDEX], noSleep);

		expect(remaining()).toBe(0);
	});

	test('a job_id column of a statement that starts no job is not a job', async () => {
		const { db, calls } = scripted([{ match: /^INSERT/, rows: [{ job_id: 'mine' }] }]);

		await runDsqlStatements(db, ['INSERT INTO "jobs" ("job_id") VALUES (\'mine\') RETURNING "job_id";'], noSleep);

		expect(calls).toHaveLength(1);
	});

	test('drops a failed index and reports the reason', async () => {
		const { db, remaining } = scripted([
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
			{ match: /^DROP INDEX IF EXISTS "s"\."i";$/ },
		]);

		const error = await runDsqlStatements(db, [CREATE_INDEX, 'CREATE TABLE "never" ();'], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toStrictEqual({
			job_id: 'j1',
			job_type: 'INDEX_BUILD',
			object_name: 's.i',
			details: 'found duplicate key(s) while validating index uniqueness',
			sql: CREATE_INDEX,
		});
		expect(error.message.split('\n')[2]).toBe(
			'The object was dropped. The statements before it stay applied, so if it replaced an index or constraint, the table now has neither. Fix the data and run the command again',
		);
		expect(remaining()).toBe(0);
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
					details: 'check constraint "c" of relation "t" is violated by some row',
					class_id: '2606',
					object_id: '52978',
				}],
			},
			{ match: CONSTRAINT_NAME, params: ['52978'], rows: [{ schema: 's', table: 't', name: 'c' }] },
			{ match: /^ALTER TABLE "s"\."t" DROP CONSTRAINT IF EXISTS "c";$/ },
		]);

		const error = await runDsqlStatements(db, [VALIDATE], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toStrictEqual({
			job_id: 'j2',
			job_type: 'VALIDATE_CONSTRAINT',
			object_name: 'c on s.t',
			details: 'check constraint "c" of relation "t" is violated by some row',
			sql: VALIDATE,
		});
		expect(remaining()).toBe(0);
	});

	test('retries reading the job and the cleanup after OCC errors', async () => {
		const { db, calls, remaining } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, rows: [{ succeeded: false }] },
			{ match: JOB, error: wrapped(occ('OC000')) },
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
			{ match: /^DROP INDEX IF EXISTS/, error: wrapped(occ('OC001')) },
			{ match: /^DROP INDEX IF EXISTS/ },
		]);

		const error = await runDsqlStatements(db, [CREATE_INDEX], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).not.toHaveProperty('cleanup_error');
		expect(calls.filter((it) => it.startsWith('CREATE INDEX'))).toHaveLength(1);
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
			{ match: /^DROP INDEX IF EXISTS/, error: wrapped(pgError('42501', 'permission denied')) },
		]);

		const error = await runDsqlStatements(db, [CREATE_INDEX], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toMatchObject({ details: 'd', cleanup_error: 'permission denied' });
		expect(error.message.split('\n')[2]).toBe(
			'Dropping the object failed, so "s"."i" is left behind: permission denied',
		);
	});

	test('reports a failed read of the job with the job failure', async () => {
		const { db } = scripted([
			{ match: /^CREATE INDEX ASYNC/, rows: [{ job_id: 'j1' }] },
			{ match: WAIT, rows: [{ succeeded: false }] },
			{ match: JOB, error: wrapped(pgError('42501', 'permission denied')) },
		]);

		const error = await runDsqlStatements(db, [CREATE_INDEX], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toStrictEqual({
			job_id: 'j1',
			job_type: 'unknown',
			object_name: 'unknown',
			details: 'no details',
			sql: CREATE_INDEX,
			cleanup_error: 'permission denied',
		});
		expect(error.message.split('\n')[2]).toBe(
			'Dropping the object failed, so the object of the job is left behind: permission denied',
		);
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
			{ match: INDEX_NAME, error: wrapped(pgError('42501', 'permission denied')) },
		]);

		const error = await runDsqlStatements(db, [CREATE_INDEX], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toMatchObject({ job_id: 'j1', details: 'd', cleanup_error: 'permission denied' });
		expect(error.message.split('\n')[2]).toBe(
			'Dropping the object failed, so s.i is left behind: permission denied',
		);
	});

	test('reports a failed cleanup of a constraint with the job failure', async () => {
		const { db } = scripted([
			{ match: /^ALTER TABLE ASYNC/, rows: [{ job_id: 'j2' }] },
			{ match: WAIT, rows: [{ succeeded: false }] },
			{
				match: JOB,
				rows: [{
					status: 'failed',
					job_type: 'VALIDATE_CONSTRAINT',
					object_name: 'c on s.t',
					details: 'd',
					class_id: 2606,
					object_id: 9,
				}],
			},
			{ match: CONSTRAINT_NAME, rows: [{ schema: 's', table: 't', name: 'c' }] },
			{ match: /DROP CONSTRAINT IF EXISTS/, error: wrapped(pgError('42501', 'permission denied')) },
		]);

		const error = await runDsqlStatements(db, [VALIDATE], noSleep).catch((e) => e);

		expect(error.message.split('\n')[2]).toBe(
			'Dropping the object failed, so "c" on "s"."t" is left behind: permission denied',
		);
	});

	test('skips the cleanup when the object is gone', async () => {
		const { db, remaining } = scripted([
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
			{ match: INDEX_NAME, rows: [] },
		]);

		const error = await runDsqlStatements(db, [CREATE_INDEX], noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toStrictEqual({
			job_id: 'j1',
			job_type: 'INDEX_BUILD',
			object_name: 's.i',
			details: 'd',
			sql: CREATE_INDEX,
		});
		expect(remaining()).toBe(0);
	});
});

describe('assertNoInvalidDsqlObjects', () => {
	const INVALID = /indisvalid/;
	const ACTIVE_JOBS = /FROM sys\.jobs WHERE status IN \('submitted', 'processing'\)/;
	const migrations = { schema: 'drizzle', table: '__drizzle_migrations' };
	const all = () => true;

	test('passes when every object is valid', async () => {
		const { db, remaining } = scripted([{ match: INVALID, rows: [] }]);

		await assertNoInvalidDsqlObjects(db, all, migrations, noSleep);

		expect(remaining()).toBe(0);
	});

	test('waits for a running job and passes once it succeeds', async () => {
		const index = { kind: 'index', schema: 's', table: 't', name: 'i', class_id: 1259, oid: '10' };
		const { db, remaining } = scripted([
			{ match: INVALID, rows: [index] },
			{ match: ACTIVE_JOBS, rows: [{ job_id: 'j1', class_id: '1259', object_id: '10' }] },
			{ match: WAIT, params: ['j1'], rows: [{ succeeded: true }] },
			{ match: INVALID, rows: [] },
		]);

		await assertNoInvalidDsqlObjects(db, all, migrations, noSleep);

		expect(remaining()).toBe(0);
	});

	test('retries its reads after OCC errors', async () => {
		const index = { kind: 'index', schema: 's', table: 't', name: 'i', class_id: 1259, oid: '10' };
		const { db, remaining } = scripted([
			{ match: INVALID, error: wrapped(occ('OC001')) },
			{ match: INVALID, rows: [index] },
			{ match: ACTIVE_JOBS, error: wrapped(occ('OC000')) },
			{ match: ACTIVE_JOBS, rows: [{ job_id: 'j1', class_id: 1259, object_id: 10 }] },
			{ match: WAIT, rows: [{ succeeded: true }] },
			{ match: INVALID, rows: [] },
		]);

		await assertNoInvalidDsqlObjects(db, all, migrations, noSleep);

		expect(remaining()).toBe(0);
	});

	test('waits only for the jobs of the invalid objects', async () => {
		const index = { kind: 'index', schema: 's', table: 't', name: 'i', class_id: 1259, oid: '10' };
		const { db, remaining } = scripted([
			{ match: INVALID, rows: [index] },
			{
				match: ACTIVE_JOBS,
				rows: [
					{ job_id: 'other_class', class_id: '2606', object_id: '10' },
					{ job_id: 'other_object', class_id: '1259', object_id: '11' },
				],
			},
			{ match: INVALID, rows: [index] },
		]);

		await expect(assertNoInvalidDsqlObjects(db, all, migrations, noSleep)).rejects.toBeInstanceOf(
			DsqlInvalidObjectsError,
		);
		expect(remaining()).toBe(0);
	});

	test('lists what is still invalid', async () => {
		const index = { kind: 'index', schema: 's', table: 't', name: 'i', class_id: 1259, oid: '10' };
		const constraint = { kind: 'constraint', schema: 's', table: 't', name: 'c', class_id: 2606, oid: '11' };
		const { db } = scripted([
			{ match: INVALID, rows: [index, constraint] },
			{ match: ACTIVE_JOBS, rows: [] },
			{ match: INVALID, rows: [index, constraint] },
		]);

		const error = await assertNoInvalidDsqlObjects(db, all, migrations, noSleep).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlInvalidObjectsError);
		expect(error.meta).toStrictEqual({ indexes: ['s.t.i'], constraints: ['s.t.c'] });
	});

	test('ignores the migrations table and tables outside the filter', async () => {
		const { db, remaining } = scripted([{
			match: INVALID,
			rows: [
				{ kind: 'index', schema: 'drizzle', table: '__drizzle_migrations', name: 'i', class_id: 1259, oid: '1' },
				{ kind: 'index', schema: 'other', table: 't', name: 'i', class_id: 1259, oid: '2' },
			],
		}]);

		await assertNoInvalidDsqlObjects(
			db,
			(it) => !(it.type === 'table' && it.schema === 'other'),
			migrations,
			noSleep,
		);

		expect(remaining()).toBe(0);
	});
});

test('dsqlEntityFilter hides the DSQL system roles', () => {
	const filter = dsqlEntityFilter((it) => it.type !== 'table' || it.name !== 'hidden');

	expect(filter({ type: 'role', name: 'admin' })).toBe(false);
	expect(filter({ type: 'role', name: 'dbowner' })).toBe(false);
	expect(filter({ type: 'role', name: 'app' })).toBe(true);
	expect(filter({ type: 'table', schema: 'public', name: 'hidden' })).toBe(false);
	expect(filter({ type: 'table', schema: 'public', name: 'users' })).toBe(true);
});

describe('withDsqlOccRetry', () => {
	test('retries a query that hits an OCC conflict', async () => {
		const { db, calls } = scripted([
			{ match: /^SELECT/, error: wrapped(occ('OC001')) },
			{ match: /^SELECT/, params: [1], rows: [{ a: 1 }] },
		]);

		expect(await withDsqlOccRetry(db, noSleep).query('SELECT $1', [1])).toStrictEqual([{ a: 1 }]);
		expect(calls).toHaveLength(2);
	});

	test('outlasts a run of OCC conflicts, as introspection only reads', async () => {
		const conflicts: Step[] = [];
		for (let i = 0; i < 12; i++) conflicts.push({ match: /^SELECT/, error: wrapped(occ('OC001')) });
		const { db, remaining } = scripted([...conflicts, { match: /^SELECT/, rows: [] }]);

		await withDsqlOccRetry(db, noSleep).query('SELECT 1');

		expect(remaining()).toBe(0);
	});

	test('does not retry another error', async () => {
		const error = wrapped(pgError('42P01', 'relation "t" does not exist'));
		const { db, calls } = scripted([{ match: /^SELECT/, error }]);

		await expect(withDsqlOccRetry(db, noSleep).query('SELECT 1')).rejects.toBe(error);
		expect(calls).toHaveLength(1);
	});
});
