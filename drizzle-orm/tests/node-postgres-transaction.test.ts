import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { NodePgSession } from '~/node-postgres/session.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { sql } from '~/sql/sql.ts';

// https://github.com/drizzle-team/drizzle-orm/issues/6437
// pg-pool removes its own `error` listener from a client while it is checked
// out, so transaction() must listen for as long as it holds the client: a
// connection the server drops mid-transaction otherwise emits `error` on a
// client nobody listens to, and Node exits.

/** A client checked out of a pool: an EventEmitter that records its release. */
// pg clients are EventEmitters, not EventTargets.
// eslint-disable-next-line drizzle-internal/require-entity-kind, unicorn/prefer-event-target
class MockClient extends EventEmitter {
	released: unknown[] = [];
	failing: Error | undefined;
	query = vi.fn(async () => {
		if (this.failing) throw this.failing;
		return { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
	});
	release(error?: Error) {
		this.released.push(error);
	}
}

/** Name must include "Pool": NodePgSession recognizes pools by constructor name. */
// eslint-disable-next-line drizzle-internal/require-entity-kind
class MockPool {
	constructor(readonly client: MockClient) {}
	connect = vi.fn(async () => this.client);
}

function poolSession() {
	const client = new MockClient();
	const session = new NodePgSession(new MockPool(client) as any, new PgDialect(), undefined, {});
	return { client, session };
}

describe('node-postgres transaction() on a pool', () => {
	test('listens for client errors while the client is checked out', async () => {
		const { client, session } = poolSession();
		let listening = 0;
		await session.transaction(async (tx) => {
			listening = client.listenerCount('error');
			await tx.execute(sql`select 1`);
		});
		expect(listening).toBe(1);
		expect(client.listenerCount('error')).toBe(0);
		expect(client.released).toEqual([undefined]);
	});

	test('a connection lost mid-transaction rejects, and the client is released with the error', async () => {
		const { client, session } = poolSession();
		const lost = new Error('terminating connection due to administrator command');
		const notQueryable = new Error('Client has encountered a connection error and is not queryable');
		const result = session.transaction(async (tx) => {
			// Without a listener this emit throws, which is the process crash.
			client.emit('error', lost);
			client.failing = notQueryable;
			await tx.execute(sql`select 1`);
		});
		await expect(result).rejects.toThrow();
		expect(client.listenerCount('error')).toBe(0);
		// pg-pool discards a client released with an error.
		expect(client.released).toEqual([lost]);
	});
});
