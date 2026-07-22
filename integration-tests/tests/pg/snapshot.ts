import { sql } from 'drizzle-orm';

type Expect = (actual: any) => { toEqual(expected: any): void; toBe(expected: any): void };
const rowsOf = (res: any): any[] => res.rows ?? res;
const causeOf = (e: any): string => String(e?.cause?.message ?? e?.message);

async function rejection(promise: Promise<unknown>): Promise<any> {
	try {
		await promise;
	} catch (e) {
		return e;
	}
	throw new Error('expected the transaction to reject, but it resolved');
}

interface Peer {
	query: (sql: string) => Promise<any[]>;
}

/**
 * The snapshot is only importable while the exporting transaction is still open, so `peer` has to be a
 * connection other than the one `db` uses. This holds a transaction open on it for the duration.
 */
export async function assertSnapshotIsolatesTransaction(db: any, peer: Peer, expect: Expect, prefix = 'tx') {
	const table = sql.identifier(`${prefix}_snapshot`);

	await db.execute(sql`drop table if exists ${table}`);
	await db.execute(sql`create table ${table} (id integer)`);
	await db.execute(sql`insert into ${table} values (1)`);

	await peer.query('begin isolation level repeatable read');
	try {
		const [{ snapshot }] = await peer.query('select pg_export_snapshot() as snapshot');

		await db.execute(sql`insert into ${table} values (2)`);

		await db.transaction(async (tx: any) => {
			const res = await tx.execute(sql`select id from ${table} order by id`);
			expect(rowsOf(res)).toEqual([{ id: 1 }]);
		}, { isolationLevel: 'repeatable read', snapshot });

		await db.transaction(async (tx: any) => {
			const res = await tx.execute(sql`select id from ${table} order by id`);
			expect(rowsOf(res)).toEqual([{ id: 1 }, { id: 2 }]);
		}, { isolationLevel: 'repeatable read' });
	} finally {
		await peer.query('commit').catch(() => {});
		await db.execute(sql`drop table ${table}`);
	}
}

export async function assertMalformedSnapshotRejected(db: any, expect: Expect) {
	const e = await rejection(
		db.transaction(async () => {}, { isolationLevel: 'repeatable read', snapshot: 'not-a-snapshot' }),
	);
	expect(causeOf(e)).toEqual('invalid snapshot identifier: "not-a-snapshot"');
}

export async function assertSnapshotIdNotInjectable(db: any, expect: Expect, prefix = 'tx') {
	const table = sql.identifier(`${prefix}_snapshot_injection`);

	await db.execute(sql`drop table if exists ${table}`);
	await db.execute(sql`create table ${table} (id integer)`);

	try {
		const payload = `x'; drop table ${prefix}_snapshot_injection; --`;
		const e = await rejection(
			db.transaction(async () => {}, { isolationLevel: 'repeatable read', snapshot: payload }),
		);
		expect(causeOf(e)).toEqual(`invalid snapshot identifier: "${payload}"`);

		const res = await db.execute(sql`select count(*)::int as c from ${table}`);
		expect(rowsOf(res)[0].c).toBe(0);
	} finally {
		await db.execute(sql`drop table ${table}`);
	}
}
