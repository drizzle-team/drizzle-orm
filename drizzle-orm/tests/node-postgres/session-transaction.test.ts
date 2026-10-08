import { describe, expect, it } from 'vitest';
import { DrizzleQueryError } from '~/errors.ts';
import { NodePgSession } from '~/node-postgres/session.ts';
import { PgDialect } from '~/pg-core/dialect.ts';

class MockPoolClient {
	releaseCalls: unknown[] = [];
	failQuery: ((text: string) => Error | undefined) | undefined;

	async query(config: { text: string }, _params: unknown[]) {
		const error = this.failQuery?.(config.text);
		if (error) throw error;
		return { rows: [] };
	}

	release(err?: unknown) {
		this.releaseCalls.push(err);
	}
}

class MockPool {
	readonly client = new MockPoolClient();

	async connect(): Promise<MockPoolClient> {
		return this.client;
	}
}

function makeSession(pool: MockPool) {
	return new NodePgSession(
		pool as unknown as import('~/node-postgres/session.ts').NodePgClient,
		new PgDialect(),
		undefined,
	);
}

describe('NodePgSession.transaction', () => {
	it('releases the pooled client when BEGIN fails', async () => {
		const pool = new MockPool();
		pool.client.failQuery = (text) =>
			text.startsWith('begin') ? new Error('Connection terminated unexpectedly') : undefined;

		const session = makeSession(pool);
		const error: unknown = await session.transaction(async () => {}).catch((e) => e);

		expect(error).toBeInstanceOf(DrizzleQueryError);
		const drizzleError = error as DrizzleQueryError;
		expect((drizzleError.cause as Error).message).toBe('Connection terminated unexpectedly');
		// The client must be released back to the pool even though `begin` threw,
		// otherwise it is leaked for the life of the process.
		expect(pool.client.releaseCalls).toHaveLength(1);
	});

	it('destroys the pooled client when ROLLBACK fails', async () => {
		const pool = new MockPool();
		pool.client.failQuery = (text) =>
			text.startsWith('rollback') ? new Error('connection is closed') : undefined;

		const session = makeSession(pool);
		await expect(session.transaction(async () => {
			throw new Error('boom');
		})).rejects.toThrow('boom');

		// release(err) tells pg-pool to destroy the client instead of recycling a dead one.
		expect(pool.client.releaseCalls).toHaveLength(1);
		expect(pool.client.releaseCalls[0]).toBeInstanceOf(Error);
	});

	it('releases the pooled client normally on success', async () => {
		const pool = new MockPool();
		const session = makeSession(pool);

		const result = await session.transaction(async () => 42);

		expect(result).toBe(42);
		expect(pool.client.releaseCalls).toEqual([undefined]);
	});
});
