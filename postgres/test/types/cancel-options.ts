// Type checks for timeout and signal. `bun run typecheck` fails when an expectation breaks.
// Nothing here runs.
import { connect, type Connection, createPool } from '../../src/index.ts';

const signal = new AbortController().signal;
const columns = { id: 'int4' } as const;

export async function singleConnectionRejectsCancelOptions() {
	const single = await connect();
	// @ts-expect-error canceling needs a pooled connection
	await single.query('select 1', [], { timeout: 1 });
	// @ts-expect-error canceling needs a pooled connection
	await single.query('select 1', [], { signal });
	// @ts-expect-error canceling needs a pooled connection
	await single.query('select 1', [], { mode: 'object', timeout: 1 });
	// @ts-expect-error canceling needs a pooled connection
	await single.queryTyped('select 1', [], [], { signal });
	// @ts-expect-error canceling needs a pooled connection
	await single.bulkInsert('t', columns, [[1]], { timeout: 1 });
	// @ts-expect-error canceling needs a pooled connection
	await single.bulkUpdate('t', columns, [[1]], { by: 'id', signal });
	// @ts-expect-error canceling needs a pooled connection
	await single.copyFrom('copy t from stdin', [], { timeout: 1 });
	// @ts-expect-error canceling needs a pooled connection
	await single.copyMany('t', columns, [[1]], { signal });
	// @ts-expect-error canceling needs a pooled connection
	single.stream('select 1', [], { timeout: 1 });
	// @ts-expect-error canceling needs a pooled connection
	single.copyTo('copy t to stdout', { signal });
	await single.transaction(async (tx) => {
		// @ts-expect-error a transaction on a single connection cannot cancel either
		await tx.query('select 1', [], { timeout: 1 });
	});
	await single.query('select 1', [], { mode: 'object' });
}

export async function pooledConnectionAcceptsCancelOptions() {
	const pool = createPool();
	const pooled = await pool.acquire();
	await pooled.query('select 1', [], { timeout: 1, signal });
	await pooled.query('select 1', [], { mode: 'object', timeout: 1 });
	await pooled.queryTyped('select 1', [], [], { signal });
	await pooled.bulkInsert('t', columns, [[1]], { timeout: 1 });
	await pooled.bulkUpdate('t', columns, [[1]], { by: 'id', signal });
	await pooled.copyFrom('copy t from stdin', [], { timeout: 1 });
	await pooled.copyMany('t', columns, [[1]], { signal });
	pooled.stream('select 1', [], { timeout: 1 });
	pooled.copyTo('copy t to stdout', { signal });
	const { client } = await pool.connect();
	await client.query('select 1', [], { timeout: 1 });
	await pool.transaction(async (tx) => {
		await tx.query('select 1', [], { signal });
		await tx.transaction(async (nested) => nested.query('select 1', [], { timeout: 1 }));
	});
	await pool.query('select 1', [], { timeout: 1 });
}

export async function plainConnectionAcceptsBoth() {
	const pool = createPool();
	const connections: Connection[] = [await connect(), await pool.acquire()];
	await connections[0]!.query('select 1', [], { timeout: 1, signal });
}
