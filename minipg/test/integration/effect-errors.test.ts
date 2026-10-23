// SqlError reasons from the Effect entry point, triggered against the local cluster.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Cause, Effect, Exit, Redacted } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';
import { MinipgClient } from '../../src/effect/index.ts';
import { PgError, testPool } from '../helpers/db.ts';
import { runTest } from '../helpers/effect.ts';

const T = `effect_errors_${process.pid}`;

const sqlError = async <A>(effect: Effect.Effect<A, SqlError, SqlClient>, o = {}): Promise<SqlError> => {
	const exit = await runTest(Effect.exit(effect), o);
	if (Exit.isSuccess(exit)) throw new Error('expected the Effect to fail');
	const failure = exit.cause.reasons.find(Cause.isFailReason);
	if (!failure) throw new Error(`expected a failure, got ${Cause.pretty(exit.cause)}`);
	return failure.error;
};
const run = (text: string) =>
	Effect.gen(function*() {
		return yield* (yield* SqlClient).unsafe(text);
	});

beforeAll(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${T}, ${T}_child`);
	await pool.query(
		`create table ${T} (id int primary key, email text constraint ${T}_email_key unique, qty int not null check (qty >= 0))`,
	);
	await pool.query(`create table ${T}_child (parent int references ${T}(id))`);
	await pool.query(`insert into ${T} values (1, 'a@x', 1), (2, 'b@x', 2)`);
	await pool.end();
});
afterAll(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${T}_child, ${T}`);
	await pool.end();
});

describe('SqlError reasons', () => {
	test('an invalid connection URL fails the layer with a SqlError', async () => {
		const layer = MinipgClient.layer({ url: Redacted.make('mysql://localhost/db') });
		const exit = await Effect.runPromise(Effect.exit(Effect.provide(run('select 1'), layer)));
		if (Exit.isSuccess(exit)) throw new Error('expected the layer to fail');
		const failure = exit.cause.reasons.find(Cause.isFailReason);
		expect((failure?.error as SqlError | undefined)?.reason._tag).toBe('ConnectionError');
	});

	test('a unique violation carries the constraint name, and the cause is the full PgError', async () => {
		const err = await sqlError(run(`insert into ${T} values (3, 'a@x', 1)`));
		expect(err.reason._tag).toBe('UniqueViolation');
		expect((err.reason as { constraint: string }).constraint).toBe(`${T}_email_key`);
		const cause = err.reason.cause as PgError;
		expect(cause).toBeInstanceOf(PgError);
		expect(cause.code).toBe('23505');
		expect(cause.detail).toMatch(/already exists/);
		expect(cause.constraint).toBe(`${T}_email_key`);
	});

	test('not-null, check and foreign key violations are ConstraintErrors', async () => {
		expect((await sqlError(run(`insert into ${T} values (4, 'c@x', null)`))).reason._tag).toBe('ConstraintError');
		expect((await sqlError(run(`insert into ${T} values (4, 'c@x', -1)`))).reason._tag).toBe('ConstraintError');
		expect((await sqlError(run(`insert into ${T}_child values (99)`))).reason._tag).toBe('ConstraintError');
	});

	test('a syntax error is a SqlSyntaxError', async () => {
		expect((await sqlError(run('selec 1'))).reason._tag).toBe('SqlSyntaxError');
	});

	test('a missing privilege is an AuthorizationError', async () => {
		const err = await sqlError(run(`select * from ${T}`), { username: 'md5user', password: Redacted.make('md5pw') });
		expect(err.reason._tag).toBe('AuthorizationError');
	});

	test('statement_timeout is a retryable StatementTimeoutError', async () => {
		const err = await sqlError(Effect.gen(function*() {
			const sql = yield* SqlClient;
			yield* sql.withTransaction(Effect.gen(function*() {
				yield* sql`set local statement_timeout = '50ms'`;
				yield* sql`select pg_sleep(1)`;
			}));
		}));
		expect(err.reason._tag).toBe('StatementTimeoutError');
		expect(err.isRetryable).toBe(true);
	});

	test('a lock that cannot be taken is a LockTimeoutError', async () => {
		const holder = testPool();
		const { client, release } = await holder.connect();
		try {
			await client.query('begin');
			await client.query(`select * from ${T} where id = 1 for update`);
			const err = await sqlError(Effect.gen(function*() {
				const sql = yield* SqlClient;
				yield* sql.withTransaction(Effect.gen(function*() {
					yield* sql`set local lock_timeout = '50ms'`;
					yield* sql.unsafe(`select * from ${T} where id = 1 for update`);
				}));
			}));
			expect(err.reason._tag).toBe('LockTimeoutError');
		} finally {
			await client.query('rollback');
			release();
			await holder.end();
		}
	});

	test('a deadlock is a retryable DeadlockError', async () => {
		const err = await sqlError(Effect.gen(function*() {
			const sql = yield* SqlClient;
			const lockBoth = (first: number, second: number) =>
				sql.withTransaction(Effect.gen(function*() {
					yield* sql.unsafe(`update ${T} set qty = qty where id = ${first}`);
					yield* Effect.sleep('100 millis');
					yield* sql.unsafe(`update ${T} set qty = qty where id = ${second}`);
				}));
			yield* Effect.all([lockBoth(1, 2), lockBoth(2, 1)], { concurrency: 'unbounded' });
		}));
		expect(err.reason._tag).toBe('DeadlockError');
		expect(err.isRetryable).toBe(true);
	}, 10000);

	test('a concurrent update under repeatable read is a SerializationError', async () => {
		const other = testPool();
		try {
			const err = await sqlError(Effect.gen(function*() {
				const sql = yield* SqlClient;
				yield* sql.withTransaction(Effect.gen(function*() {
					yield* sql`set transaction isolation level repeatable read`;
					yield* sql.unsafe(`select qty from ${T} where id = 2`);
					yield* Effect.promise(() => other.query(`update ${T} set qty = qty + 1 where id = 2`).then(() => {}));
					yield* sql.unsafe(`update ${T} set qty = qty + 1 where id = 2`);
				}));
			}));
			expect(err.reason._tag).toBe('SerializationError');
		} finally {
			await other.end();
		}
	});

	test('a lost connection is a retryable ConnectionError', async () => {
		const killer = testPool();
		try {
			const err = await sqlError(Effect.scoped(Effect.gen(function*() {
				const sql = yield* SqlClient;
				const conn = yield* sql.reserve;
				const [row] = yield* conn.executeValues('select pg_backend_pid()', []);
				yield* Effect.promise(() => killer.query('select pg_terminate_backend($1)', [row![0]]).then(() => {}));
				yield* conn.executeValues('select 1', []);
			})));
			expect(err.reason._tag).toBe('ConnectionError');
			expect(err.isRetryable).toBe(true);
		} finally {
			await killer.end();
		}
	});

	test('other database errors are UnknownErrors', async () => {
		const err = await sqlError(run('select 1 / 0'));
		expect(err.reason._tag).toBe('UnknownError');
		expect((err.reason.cause as PgError).code).toBe('22012');
	});
});
