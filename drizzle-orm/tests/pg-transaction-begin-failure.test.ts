import { Pool as NeonPool } from '@neondatabase/serverless';
import { VercelPool } from '@vercel/postgres';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { drizzle as drizzleNeon } from '~/neon-serverless/index.ts';
import { drizzle as drizzleNodePg } from '~/node-postgres/index.ts';
import { drizzle as drizzleVercel } from '~/vercel-postgres/index.ts';

// Regression test for pooled transactions: when `BEGIN` itself fails (statement
// timeout, connection dropped while connecting, ...), the client acquired from
// the pool must still be released. Before the fix `begin` ran outside the
// try/finally, so the client leaked and the pool eventually ran dry.

interface FakePoolStats {
	acquired: number;
	released: number;
	queries: string[];
}

function fakeClient(stats: FakePoolStats, failOn: (text: string) => Error | undefined) {
	return {
		query: async (query: string | { text: string }) => {
			const text = typeof query === 'string' ? query : query.text;
			stats.queries.push(text);
			const error = failOn(text.toLowerCase());
			if (error) throw error;
			return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
		},
		release: () => {
			stats.released++;
		},
	};
}

function beginFailure(): Error {
	return Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
}

const connectionString = 'postgres://user:password@localhost:5432/db';

const drivers = [
	{
		name: 'node-postgres',
		make(stats: FakePoolStats, failOn: (text: string) => Error | undefined) {
			class FailingPool extends pg.Pool {
				override connect(): any {
					stats.acquired++;
					return Promise.resolve(fakeClient(stats, failOn));
				}
			}
			return drizzleNodePg({ client: new FailingPool({ connectionString }) });
		},
	},
	{
		name: 'neon-serverless',
		make(stats: FakePoolStats, failOn: (text: string) => Error | undefined) {
			class FailingPool extends NeonPool {
				override connect(): any {
					stats.acquired++;
					return Promise.resolve(fakeClient(stats, failOn));
				}
			}
			return drizzleNeon({ client: new FailingPool({ connectionString }) });
		},
	},
	{
		name: 'vercel-postgres',
		make(stats: FakePoolStats, failOn: (text: string) => Error | undefined) {
			class FailingPool extends VercelPool {
				override connect(): any {
					stats.acquired++;
					return Promise.resolve(fakeClient(stats, failOn));
				}
			}
			return drizzleVercel({ client: new FailingPool({ connectionString }) });
		},
	},
];

describe.each(drivers)('$name pooled transaction', ({ make }) => {
	test('releases the pool client when BEGIN fails', async () => {
		const stats: FakePoolStats = { acquired: 0, released: 0, queries: [] };
		const db = make(stats, (text) => (text.startsWith('begin') ? beginFailure() : undefined));
		let callbackRan = false;

		const error = await db
			.transaction(async () => {
				callbackRan = true;
			})
			.then(() => undefined, (e: unknown) => e as Error & { cause?: { code?: string } });

		expect(error?.cause?.code).toBe('57014');
		expect(callbackRan).toBe(false);
		expect(stats.acquired).toBe(1);
		expect(stats.released).toBe(1);
	});

	test('still commits and releases on the happy path', async () => {
		const stats: FakePoolStats = { acquired: 0, released: 0, queries: [] };
		const db = make(stats, () => undefined);

		const result = await db.transaction(async () => 'ok');

		expect(result).toBe('ok');
		expect(stats.queries.map((q) => q.split(' ')[0])).toEqual(['begin', 'commit']);
		expect(stats.released).toBe(1);
	});
});
