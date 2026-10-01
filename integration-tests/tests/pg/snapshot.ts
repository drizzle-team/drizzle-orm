import { sql } from 'drizzle-orm';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core';
import { SnapshotPeer } from './instrumentation';

type Expect = (actual: any) => { toEqual(expected: any): void; toBe(expected: any): void };
const causeOf = (e: any): string => String(e?.cause?.message ?? e?.message);

async function rejection(promise: Promise<unknown>): Promise<any> {
	try {
		await promise;
	} catch (e) {
		return e;
	}
	throw new Error('expected the transaction to reject, but it resolved');
}

export async function assertSnapshotIsolatesTransaction(
	db: PgAsyncDatabase<any, any>,
	peer: Omit<SnapshotPeer, 'close'>,
	expect: Expect,
	prefix = 'tx',
) {
	const table = sql.identifier(`${prefix}_snapshot`);

	await db.execute(sql`drop table if exists ${table}`);
	await db.execute(sql`create table ${table} (id integer)`);
	await db.execute(sql`insert into ${table} values (1)`);

	await peer.query('begin isolation level repeatable read');
	try {
		const [{ snapshot }] = await peer.query('select pg_export_snapshot() as snapshot');

		await db.execute(sql`insert into ${table} values (2)`);

		await db.transaction(async (tx) => {
			const res = await tx.execute<{ id: number }>(sql`select id from ${table} order by id`, 'objects');
			expect(res).toEqual([{ id: 1 }]);
		}, { isolationLevel: 'repeatable read', snapshot });

		await db.transaction(async (tx) => {
			const res = await tx.execute<{ id: number }>(sql`select id from ${table} order by id`, 'objects');
			expect(res).toEqual([{ id: 1 }, { id: 2 }]);
		}, { isolationLevel: 'repeatable read' });
	} finally {
		await peer.query('commit').catch(() => null);
		await db.execute(sql`drop table ${table}`);
	}
}

export async function assertMalformedSnapshotRejected(db: PgAsyncDatabase<any, any>, expect: Expect) {
	const e = await rejection(
		db.transaction(async () => {}, { isolationLevel: 'repeatable read', snapshot: 'not-a-snapshot' }),
	);
	expect(causeOf(e)).toEqual('invalid snapshot identifier: "not-a-snapshot"');
}

export async function assertSnapshotIdNotInjectable(db: PgAsyncDatabase<any, any>, expect: Expect, prefix = 'tx') {
	const table = sql.identifier(`${prefix}_snapshot_injection`);

	await db.execute(sql`drop table if exists ${table}`);
	await db.execute(sql`create table ${table} (id integer)`);

	try {
		const payload = `x'; drop table ${prefix}_snapshot_injection; --`;
		const e = await rejection(
			db.transaction(async () => {}, { isolationLevel: 'repeatable read', snapshot: payload }),
		);
		expect(causeOf(e)).toEqual(`invalid snapshot identifier: "${payload}"`);

		const res = await db.execute<{ c: number }>(sql`select count(*)::int as c from ${table}`, 'objects');
		expect(res[0]?.c).toBe(0);
	} finally {
		await db.execute(sql`drop table ${table}`);
	}
}
