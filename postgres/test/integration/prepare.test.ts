// `prepare` config: server-side named prepared statements, auto-disabled behind a transaction pooler.
// The auto-detect tests are DB-free (constructor only); the behavior tests hit the local cluster.
import { afterEach, describe, expect, test } from 'bun:test';
import { connect, Connection } from '../../src/index.ts';

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' };
let open: Array<Awaited<ReturnType<typeof connect>>> = [];
afterEach(async () => {
	for (const c of open) await c.end().catch(() => {});
	open = [];
});

describe('prepare auto-detect (no connection)', () => {
	const P = (o: Record<string, unknown>) => new Connection(o).cfg.prepare;
	test('pooler: true → off on any host', () => {
		expect(P({ host: '127.0.0.1', port: 6432, pooler: true })).toBe(false);
	});
	test('pooler: false → on, even on a detected pooler host', () => {
		expect(P({ host: 'ep-x-pooler.aws.neon.tech', pooler: false })).toBe(true);
	});
	test('Neon "-pooler" host → off', () => {
		expect(P({ host: 'ep-cool-name-pooler.us-east-2.aws.neon.tech' })).toBe(false);
	});
	test('Supabase pooler host / port 6543 → off', () => {
		expect(P({ host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543 })).toBe(false);
		expect(P({ host: 'anything', port: 6543 })).toBe(false);
	});
	test('Vercel runtime → off (overridable)', () => {
		const prev = process.env.VERCEL;
		process.env.VERCEL = '1';
		try {
			expect(P({ host: 'db.example.com', port: 5432 })).toBe(false);
		} finally {
			if (prev === undefined) delete process.env.VERCEL;
			else process.env.VERCEL = prev;
		}
	});
	test('direct host → on', () => {
		expect(P({ host: '127.0.0.1', port: 5432 })).toBe(true);
	});
	test('explicit config always wins', () => {
		expect(P({ host: 'ep-x-pooler.aws.neon.tech', prepare: true })).toBe(true);
		expect(P({ host: 'db.example.com', port: 5432, prepare: false })).toBe(false);
	});
});

describe('prepare behavior vs real PG (pg_prepared_statements)', () => {
	test('prepare:true creates the server-side named statement', async () => {
		const c = await connect({ ...CFG, prepare: true });
		open.push(c);
		await c.query('select 1 as x', [], { name: 'p_on' });
		const r = await c.query('select count(*)::int as n from pg_prepared_statements where name = $1', ['p_on'], {
			mode: 'object',
		});
		expect((r.rows[0] as { n: number }).n).toBe(1);
	});
	test('prepare:false ignores { name } — nothing prepared server-side', async () => {
		const c = await connect({ ...CFG, prepare: false });
		open.push(c);
		await c.query('select 1 as x', [], { name: 'p_off' }); // name ignored -> unnamed
		const r = await c.query('select count(*)::int as n from pg_prepared_statements', [], { mode: 'object' });
		expect((r.rows[0] as { n: number }).n).toBe(0); // no named statements at all
	});
	test('prepare:false stays correct + reusable across many named calls', async () => {
		const c = await connect({ ...CFG, prepare: false });
		open.push(c);
		for (let i = 0; i < 3; i++) {
			const r = await c.query('select $1::int4 as x', [i], { name: 'reused', mode: 'object' });
			expect((r.rows[0] as { x: number }).x).toBe(i);
		}
	});
});
