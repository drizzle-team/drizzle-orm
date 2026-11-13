import { sql } from 'drizzle-orm';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core';
import { SnapshotPeer } from './instrumentation';

type Expect = (actual: any) => { toEqual(expected: any): void; toBe(expected: any): void };

export async function assertDroppedConnectionRejectsTransaction(
	db: PgAsyncDatabase<any, any>,
	peer: Omit<SnapshotPeer, 'close'>,
	expect: Expect,
) {
	let error: any;
	try {
		await db.transaction(async (tx) => {
			const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`, 'objects');
			await peer.query(`select pg_terminate_backend(${Number(row!.pid)})`);
			await new Promise((resolve) => setTimeout(resolve, 200));
			await tx.execute(sql`select 1`);
		});
	} catch (e) {
		error = e;
	}

	// Original failure, not the rollback attempted on a dead connection
	expect(error?.query).toBe('select 1');

	// Broken client was discarded, pool hands out a working one
	const res = await db.execute<{ ok: number }>(sql`select 1 as ok`, 'objects');
	expect(res).toEqual([{ ok: 1 }]);
}
