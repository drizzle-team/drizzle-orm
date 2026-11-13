// @drizzle-team/postgres/compat-prisma8 under Prisma 8's own Postgres driver, side by side with that driver on
// a node-postgres pool: the same rows (server text) for every type, prepared statements, transactions, errors;
// statements shared across the pool, and Prisma's session-settings check run once per lease, not per statement.
import postgresDriver from '@prisma/orm-target-postgres/driver/runtime';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import pg from 'pg';
import { createPool, type PrismaPgPool } from '../../src/compat/prisma8-node.ts';
import { TEST_CONFIG, VARIANT, withConn } from '../helpers/db.ts';

const T = `prisma8_${process.pid}`;
// The settings Prisma 8's Postgres target declares (orm-target-postgres), which its driver ensures per connection.
const SESSION = { DateStyle: 'ISO', lc_monetary: 'C' };
type Driver = ReturnType<typeof postgresDriver.create>;

async function driverOn(pool: unknown): Promise<Driver> {
	const d = postgresDriver.create({ sessionSettings: SESSION, cursor: { disabled: true } });
	await d.connect({ kind: 'pgPool', pool: pool as never, ownedByDriver: false }); // Prisma pins its own @types/pg
	return d;
}
async function rows(
	q: { query(r: { sql: string; params?: readonly unknown[] }): AsyncIterable<unknown> },
	sql: string,
	params?: unknown[],
) {
	const out: unknown[] = [];
	for await (const r of q.query({ sql, params })) out.push(r);
	return out;
}
const handle = () => {
	let v: unknown;
	return { get: () => v, set: (x: unknown) => void (v = x) };
};

const MATRIX: Array<[string, string]> = [
	[
		'numbers',
		"select 1::int2 a, 9223372036854775807::int8 b, 3.25::float4 c, 'NaN'::float8 d, 12.50::numeric e, 12.34::money f",
	],
	['text and bool', "select 'café ☕'::text a, 'abc'::char(5) b, true c, null::text d"],
	['bytea, uuid', "select '\\xdeadbeef'::bytea a, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid b"],
	[
		'temporal',
		"select '2024-02-03'::date a, '12:34:56.789'::time b, '2024-02-03 12:34:56.789'::timestamp c, '2024-02-03 12:34:56+00'::timestamptz d, '1 day 02:00'::interval e",
	],
	['json', `select '{"a":[1,2],"big":9007199254740993}'::json a, '{"z":1,"a":2}'::jsonb b`],
	[
		'arrays',
		`select array[1,null]::int4[] a, array['a','b "q"',null]::text[] b, array['{"a":1}'::jsonb] c, array['2024-02-03'::date] d`,
	],
	['several rows', 'select g a, g::text b from generate_series(1, 3) g'],
];

describe("compat-prisma8 under Prisma 8's driver", () => {
	let pgPool: pg.Pool;
	let ours: PrismaPgPool;
	let theirs: Driver;
	let mine: Driver;
	beforeAll(async () => {
		pgPool = new pg.Pool({ ...TEST_CONFIG, max: 4 } as pg.PoolConfig);
		ours = createPool({ ...TEST_CONFIG, decode: VARIANT, max: 4 });
		[theirs, mine] = [await driverOn(pgPool), await driverOn(ours)];
		await withConn((c) => c.query(`create table ${T} (id int primary key, name text not null)`));
	});
	afterAll(async () => {
		await withConn((c) => c.query(`drop table if exists ${T}`));
		await theirs?.close();
		await mine?.close();
		await pgPool?.end();
		await ours?.end();
	});

	for (const [name, sql] of MATRIX) {
		test(`rows: ${name}`, async () => {
			expect(await rows(mine, sql)).toEqual(await rows(theirs, sql));
		});
	}

	test("every session starts with Prisma's settings", async () => {
		expect(await rows(mine, "select current_setting('datestyle') d, current_setting('lc_monetary') m")).toEqual([
			{ d: expect.stringMatching(/^ISO, /), m: 'C' },
		]);
	});

	test('prepared statements: the same rows on first and later executions', async () => {
		const h = handle();
		const sql = 'select $1::int8 a, $2::timestamptz b, $3::numeric c';
		const params = ['9007199254740993', '2024-02-03 12:34:56+00', '1.50'];
		const want = await rows(theirs, sql, params);
		for (let i = 0; i < 3; i++) {
			const out: unknown[] = [];
			for await (const r of mine.query({ sql, params, preparedStatementHandle: h })) out.push(r);
			expect(out).toEqual(want);
		}
		expect(typeof h.get()).toBe('string'); // Prisma named it
	});

	test('execute returns affected rows', async () => {
		expect(await mine.execute({ sql: `insert into ${T} values (1, 'a'), (2, 'b')` })).toEqual({ affectedRows: 2 });
		expect(await mine.execute({ sql: `delete from ${T}` })).toEqual({ affectedRows: 2 });
	});

	test('errors reach Prisma as they do from pg', async () => {
		await mine.execute({ sql: `insert into ${T} values (1, 'a')` });
		for (const sql of [`insert into ${T} values (1, 'b')`, `select * from missing_${T}`, 'select 1/0', 'selec 1']) {
			const [a, b] = [
				await theirs.execute({ sql }).catch((e: Error) => e),
				await mine.execute({ sql }).catch((e: Error) => e),
			];
			expect(b).toBeInstanceOf(Error);
			expect([(b as Error).name, (b as Error).message, (b as { code?: string }).code]).toEqual([
				(a as Error).name,
				(a as Error).message,
				(a as { code?: string }).code,
			]);
		}
		await mine.execute({ sql: `delete from ${T}` });
	});

	test('a transaction holds one connection from BEGIN to COMMIT', async () => {
		const conn = await mine.acquireConnection();
		const tx = await conn.beginTransaction();
		await tx.execute({ sql: `insert into ${T} values (10, 'tx')` });
		const a = await rows(tx, 'select txid_current()::text x, pg_backend_pid() p');
		await Promise.all(Array.from({ length: 20 }, () => rows(mine, 'select 1'))); // shared statements meanwhile
		expect(await rows(tx, 'select txid_current()::text x, pg_backend_pid() p')).toEqual(a);
		await tx.commit();
		await conn.release();
		expect(await rows(mine, `select name from ${T} where id = 10`)).toEqual([{ name: 'tx' }]);
		const conn2 = await mine.acquireConnection();
		const tx2 = await conn2.beginTransaction();
		await tx2.execute({ sql: `delete from ${T}` });
		await tx2.rollback();
		await conn2.release();
		expect(await rows(mine, `select count(*)::int n from ${T}`)).toEqual([{ n: '1' }]);
		await mine.execute({ sql: `delete from ${T}` });
	});

	test('statements share connections, and Prisma confirms its settings once per lease', async () => {
		const pool = createPool({ ...TEST_CONFIG, decode: VARIANT, max: 2 });
		const d = await driverOn(pool);
		let setConfig = 0;
		const query = pool.pool.query.bind(pool.pool);
		pool.pool.query = ((sql: string, ...rest: never[]) => {
			if (sql.includes('set_config(')) setConfig++;
			return query(sql, ...rest);
		}) as typeof pool.pool.query;
		try {
			for (let i = 0; i < 50; i++) await rows(d, 'select $1::int4 v', [i]); // one statement at a time: one lease
			expect(setConfig).toBe(1);
			const rs = await Promise.all(Array.from({ length: 200 }, (_, i) => rows(d, 'select $1::int4 v', [i])));
			expect(rs.map((r) => (r[0] as { v: string }).v)).toEqual(Array.from({ length: 200 }, (_, i) => String(i)));
			// A burst makes a lease per concurrent statement, and Prisma confirms its settings on each new one; the
			// free list keeps them, so the next burst reuses them and confirms nothing.
			const afterFirstBurst = setConfig;
			expect(afterFirstBurst).toBeLessThanOrEqual(201);
			await Promise.all(Array.from({ length: 200 }, (_, i) => rows(d, 'select $1::int4 v', [i])));
			expect(setConfig).toBe(afterFirstBurst);
			const held = [await pool.pool.connect(), await pool.pool.connect()];
			expect(Math.max(...held.map((h) => h.client.stats.maxInflight))).toBeGreaterThan(1);
			for (const h of held) h.release();
		} finally {
			await d.close();
			await pool.end();
		}
	});
});
