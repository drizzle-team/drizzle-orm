import { describe, expect, test, vi } from 'vitest';
import { DrizzleQueryError } from '~/errors.ts';
import { NodePgSession } from '~/node-postgres/session.ts';
import { PgDialect } from '~/pg-core/dialect.ts';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/6341
// `BEGIN` used to run before the try/finally, so a BEGIN failure leaked the
// pool client. A failed `ROLLBACK` also released the client as healthy.

/** Name must include "Pool" — NodePgSession detects pools by constructor name. */
class MockPool {
	connect = vi.fn();
}

function createSession(pool: MockPool, queryImpl: (text: string) => Promise<unknown>) {
	const release = vi.fn();
	const query = vi.fn(async (config: { text: string }) => queryImpl(config.text));
	pool.connect.mockResolvedValue({ query, release });
	const session = new NodePgSession(pool as any, new PgDialect(), undefined, {});
	return { session, query, release };
}

describe('node-postgres transaction() client release (issue #6341)', () => {
	test('BEGIN failure releases the pool client and rethrows the original error', async () => {
		const beginError = new Error('Connection terminated unexpectedly');
		const pool = new MockPool();
		const { session, release } = createSession(pool, async (text) => {
			if (text.startsWith('begin')) throw beginError;
			return { rows: [] };
		});

		const cb = vi.fn();
		// The driver wraps query failures in DrizzleQueryError; the original
		// error must survive as `cause`.
		const err = await session.transaction(cb).then(
			() => {
				throw new Error('transaction should have rejected');
			},
			(e) => e,
		);
		expect(err).toBeInstanceOf(DrizzleQueryError);
		expect((err as DrizzleQueryError).cause).toBe(beginError);
		expect(cb).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledTimes(1);
		expect(release).toHaveBeenCalledWith(undefined);
	});

	test('failed ROLLBACK releases the client with the error and rethrows the original error', async () => {
		const txError = new Error('tx body failed');
		const rollbackError = new Error('Connection terminated unexpectedly');
		const pool = new MockPool();
		const { session, release } = createSession(pool, async (text) => {
			if (text.startsWith('begin')) return { rows: [] };
			if (text.startsWith('rollback')) throw rollbackError;
			return { rows: [] };
		});

		await expect(session.transaction(async () => {
			throw txError;
		})).rejects.toBe(txError);
		expect(release).toHaveBeenCalledTimes(1);
		// pg-pool destroys the client when release() gets a truthy error.
		const releasedWith = release.mock.calls[0]![0];
		expect(releasedWith).toBeInstanceOf(DrizzleQueryError);
		expect((releasedWith as DrizzleQueryError).cause).toBe(rollbackError);
	});

	test('happy path commits and releases the client healthy', async () => {
		const pool = new MockPool();
		const { session, query, release } = createSession(pool, async () => ({ rows: [] }));

		const result = await session.transaction(async () => 'ok');
		expect(result).toBe('ok');
		expect(query.mock.calls.map((c) => (c[0] as { text: string }).text)).toEqual([
			'begin',
			'commit',
		]);
		expect(release).toHaveBeenCalledTimes(1);
		expect(release).toHaveBeenCalledWith(undefined);
	});
});
