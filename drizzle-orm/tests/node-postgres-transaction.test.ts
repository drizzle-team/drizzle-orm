import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { NodePgSession } from '~/node-postgres/session.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { sql } from '~/sql/sql.ts';

// https://github.com/drizzle-team/drizzle-orm/issues/6437
// https://github.com/drizzle-team/drizzle-orm/issues/6023
// https://github.com/drizzle-team/drizzle-orm/issues/6114
// https://github.com/drizzle-team/drizzle-orm/issues/6241
// https://github.com/drizzle-team/drizzle-orm/issues/6341
// https://github.com/drizzle-team/drizzle-orm/issues/6622

/** Records its queries and releases. Fails the statements in `failures`, and loses its connection on the ones in `drops`. */
// pg clients are EventEmitters, not EventTargets.
// eslint-disable-next-line drizzle-internal/require-entity-kind, unicorn/prefer-event-target
class MockClient extends EventEmitter {
	queries: string[] = [];
	released: unknown[] = [];
	failures = new Map<string, Error>();
	drops = new Map<string, Error>();

	async query(config: { text: string }) {
		this.queries.push(config.text);
		const drop = this.drops.get(config.text);
		if (drop) {
			// pg emits the connection's error on the client and fails the query in flight with it.
			// Without a listener this emit throws, which is the process crash.
			this.emit('error', drop);
			throw drop;
		}
		const failure = this.failures.get(config.text);
		if (failure) throw failure;
		return { rows: [], rowCount: 0, command: '', fields: [] };
	}

	release(error?: unknown) {
		this.released.push(error);
	}
}

/** Name must include "Pool": NodePgSession recognizes pools by constructor name. */
// eslint-disable-next-line drizzle-internal/require-entity-kind
class MockPool {
	constructor(readonly client: MockClient) {}

	async connect() {
		return this.client;
	}
}

function poolSession() {
	const client = new MockClient();
	const session = new NodePgSession(new MockPool(client) as any, new PgDialect(), undefined, {});
	return { client, session };
}

describe('node-postgres transaction() on a pool', () => {
	test('listens for client errors only while the client is checked out', async () => {
		const { client, session } = poolSession();
		let listening = 0;

		await session.transaction(async (tx) => {
			listening = client.listenerCount('error');
			await tx.execute(sql`select 1`);
		});

		expect(listening).toBe(1);
		expect(client.listenerCount('error')).toBe(0);
		expect(client.queries).toEqual(['begin', 'select 1', 'commit']);
		expect(client.released).toEqual([undefined]);
	});

	test('a connection dropped mid-transaction rejects with the original failure, and the client is discarded', async () => {
		const { client, session } = poolSession();
		const terminated = new Error('terminating connection due to administrator command');
		const notQueryable = new Error('Client has encountered a connection error and is not queryable');
		client.failures.set('select 1', notQueryable);
		client.failures.set('rollback', notQueryable);

		const error = await session.transaction(async (tx) => {
			// pg reports a terminated backend twice: the server's error, then the closed socket.
			// Without a listener the first emit throws, which is the process crash.
			client.emit('error', terminated);
			client.emit('error', new Error('Connection terminated unexpectedly'));
			await tx.execute(sql`select 1`);
		}).catch((e) => e);

		expect(error.query).toBe('select 1');
		expect(error.cause).toBe(notQueryable);
		// No rollback on a dead connection
		expect(client.queries).toEqual(['begin', 'select 1']);
		// pg-pool destroys a client released with an error
		expect(client.released).toEqual([terminated]);
	});

	test('a connection dropped during `begin` rejects, and the client is discarded', async () => {
		const { client, session } = poolSession();
		const reset = new Error('read ECONNRESET');
		client.drops.set('begin', reset);
		let ran = false;

		const error = await session.transaction(async () => {
			ran = true;
		}).catch((e) => e);

		expect(error.query).toBe('begin');
		expect(error.cause).toBe(reset);
		expect(ran).toBe(false);
		expect(client.queries).toEqual(['begin']);
		expect(client.released).toEqual([reset]);
	});

	test('a failed `begin` rejects, and the client is discarded', async () => {
		const { client, session } = poolSession();
		const timeout = new Error('Query read timeout');
		client.failures.set('begin', timeout);
		let ran = false;

		const error = await session.transaction(async () => {
			ran = true;
		}).catch((e) => e);

		expect(error.query).toBe('begin');
		expect(error.cause).toBe(timeout);
		expect(ran).toBe(false);
		expect(client.queries).toEqual(['begin']);
		expect(client.listenerCount('error')).toBe(0);
		// `begin` may still reach the server, so the client is never reused
		expect(client.released).toEqual([expect.any(Error)]);
	});

	test('a rolled back transaction returns the client to the pool', async () => {
		const { client, session } = poolSession();
		const original = new Error('original');

		await expect(session.transaction(async () => {
			throw original;
		})).rejects.toBe(original);

		expect(client.queries).toEqual(['begin', 'rollback']);
		expect(client.listenerCount('error')).toBe(0);
		expect(client.released).toEqual([undefined]);
	});

	test('a failed `rollback` does not mask the error that caused it, and the client is discarded', async () => {
		const { client, session } = poolSession();
		const original = new Error('original');
		client.failures.set('rollback', new Error('Query read timeout'));

		await expect(session.transaction(async () => {
			throw original;
		})).rejects.toBe(original);

		expect(client.queries).toEqual(['begin', 'rollback']);
		expect(client.listenerCount('error')).toBe(0);
		expect(client.released).toEqual([expect.any(Error)]);
	});

	test('a failed `rollback to savepoint` does not mask the error that caused it', async () => {
		const { client, session } = poolSession();
		const original = new Error('original');
		client.failures.set('rollback to savepoint sp1', new Error('Query read timeout'));

		await expect(session.transaction((tx) =>
			tx.transaction(async () => {
				throw original;
			})
		)).rejects.toBe(original);

		expect(client.queries).toEqual(['begin', 'savepoint sp1', 'rollback to savepoint sp1', 'rollback']);
		expect(client.released).toEqual([undefined]);
	});
});

test('node-postgres transaction() on a single client neither listens on it nor releases it', async () => {
	const client = new MockClient();
	const session = new NodePgSession(client as any, new PgDialect(), undefined, {});
	let listening = -1;

	await session.transaction(async () => {
		listening = client.listenerCount('error');
	});

	expect(listening).toBe(0);
	expect(client.queries).toEqual(['begin', 'commit']);
	expect(client.released).toEqual([]);
});
