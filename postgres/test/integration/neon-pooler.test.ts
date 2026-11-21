// Neon's pooled endpoint (PgBouncer in transaction mode) keeps named statements across backends, which is why
// `prepare` stays on for `-pooler` hosts (ADR 0019): a named statement runs again and again while other
// connections keep the pooler moving ours between backends. Needs a live endpoint:
//   NEON_POOLER_URL='postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require' bun run test:neon-pooler
import { describe, expect, test } from 'bun:test';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { createPool as kyselyPool } from '../../src/compat/kysely-node.ts';
import { connect, createPool } from '../../src/index.ts';

const URL = process.env.NEON_POOLER_URL;
const d = describe.skipIf(!URL);

d("Neon's pooled endpoint keeps named statements", () => {
	test('a -pooler URL is behind a pooler with named statements on', async () => {
		const pool = createPool(URL!);
		try {
			expect([pool.behindPooler, pool.prepare]).toEqual([true, true]);
		} finally {
			await pool.end();
		}
	});

	test('one named statement, 300 runs, while other connections keep the pooler busy', async () => {
		const conns = await Promise.all(Array.from({ length: 4 }, () => connect(URL!)));
		const [c, ...others] = conns;
		try {
			let stop = false;
			const noise = others.map(async (o) => {
				while (!stop) await o.query('select pg_sleep(0.002)');
			});
			for (let i = 0; i < 300; i++) {
				const r = await c!.query('select $1::int4 v', [i], { name: 'neon_pooler_probe', mode: 'object' });
				expect((r.rows[0] as { v: number }).v).toBe(i);
			}
			stop = true;
			await Promise.all(noise);
		} finally {
			await Promise.all(conns.map((x) => x.end()));
		}
	}, 120_000);

	test('compat-kysely names its statements there by default, and they keep working', async () => {
		const pool = kyselyPool(URL!);
		const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
		try {
			const rs = await Promise.all(
				Array.from({ length: 200 }, (_, i) => sql<{ v: number }>`select ${i}::int4 v`.execute(db)),
			);
			expect(rs.map((r) => r.rows[0]!.v)).toEqual(Array.from({ length: 200 }, (_, i) => i));
		} finally {
			await db.destroy();
		}
	}, 120_000);
});
