// @drizzle-team/postgres/compat-prisma7 against @prisma/adapter-pg (on pg) — the adapter it replaces: the same
// SQL through both must give the same columnNames, columnTypes, rows and error causes. Plus transactions as
// Prisma drives them, and standalone statements shared across the pool.
import { PrismaPg as AdapterPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PrismaPg, type PrismaPgAdapter, type SqlQuery } from '../../src/compat/prisma7-node.ts';
import { TEST_CONFIG, VARIANT, withConn } from '../helpers/db.ts';

const T = `prisma7_${process.pid}`;
const ENUM = `${T}_mood`;
type Adapter = Pick<PrismaPgAdapter, 'queryRaw' | 'executeRaw' | 'startTransaction' | 'executeScript'>;
const q = (sql: string, args: unknown[] = [], argTypes?: SqlQuery['argTypes']): SqlQuery => ({
	sql,
	args,
	argTypes: argTypes ?? args.map(() => ({ scalarType: 'unknown', arity: 'scalar' })),
});
const caught = async (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e as Error & { cause?: unknown });

// One row per type family; each value also appears NULL-free and, for arrays, with a NULL element.
const MATRIX: Array<[string, string]> = [
	['integers', 'select 1::int2 a, 2147483647::int4 b, 9223372036854775807::int8 c, 26::oid d'],
	['floats', "select 3.25::float4 a, 2.718281828459045::float8 b, 'NaN'::float8 c, '-Infinity'::float8 d"],
	['numeric, money', 'select 12345.6789::numeric a, 0.1::numeric(10,2) b, 12.34::money c'],
	['bool', 'select true a, false b, null::bool c'],
	['text family', "select 'hi'::text a, 'v'::varchar b, 'abc'::char(5) c, 'nm'::name d, 'café ☕ 😀'::text e"],
	['bytea', "select '\\xdeadbeef'::bytea a, ''::bytea b"],
	['uuid', "select 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid a"],
	[
		'date, time',
		"select '2024-02-03'::date a, '12:34:56.789'::time b, '12:34:56+02'::timetz c, '0044-03-15 BC'::date d",
	],
	['timestamp', "select '2024-02-03 12:34:56.789'::timestamp a, '2024-02-03 12:34:56'::timestamp b"],
	['timestamptz', "select '2024-02-03 12:34:56.789+00'::timestamptz a, '2024-02-03 23:59:59+05'::timestamptz b"],
	['json', `select '{"a":[1,2,{"b":null}],"big":9007199254740993}'::json a, '{"z":1,"a":2}'::jsonb b, 'null'::jsonb c`],
	[
		'network, bit, xml',
		"select '10.0.0.1'::inet a, '10.0.0.0/8'::cidr b, B'101'::bit(3) c, B'1101'::varbit d, '<a>1</a>'::xml e",
	],
	[
		'int arrays',
		'select array[1,2,null]::int2[] a, array[1,2]::int4[] b, array[9223372036854775807,null]::int8[] c, array[26]::oid[] d',
	],
	[
		'float, numeric arrays',
		'select array[1.5,null]::float4[] a, array[2.5]::float8[] b, array[1.10,null]::numeric[] c, array[1.5]::money[] d',
	],
	[
		'bool, text arrays',
		`select array[true,null] a, array['a','b "q"','c,d',null,'']::text[] b, array['x']::varchar[] c, array['ab']::char(3)[] d, array['n']::"char"[] e`,
	],
	[
		'uuid, bytea arrays',
		"select array['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11']::uuid[] a, array['\\xdead'::bytea, null] b",
	],
	[
		'temporal arrays',
		"select array['2024-02-03'::date,null] a, array['12:00'::time] b, array['2024-02-03 12:00'::timestamp] c, array['2024-02-03 12:00+00'::timestamptz] d",
	],
	['json arrays', `select array['{"a":1}'::json, null] a, array['[1,"x"]'::jsonb] b`],
	[
		'network, bit, xml arrays',
		"select array['10.0.0.1'::inet] a, array['10.0.0.0/8'::cidr] b, array[B'1'::bit(1)] c, array[B'10'::varbit] d",
	],
	['enums', `select 'happy'::${ENUM} a, array['happy','sad']::${ENUM}[] b`],
	['nulls', 'select null::int4 a, null::text b, null::timestamptz c, null::jsonb d, null::int4[] e'],
	['empty result', 'select 1 a where false'],
];

describe('compat-prisma7 matches @prisma/adapter-pg', () => {
	let theirs: Adapter;
	let ours: PrismaPgAdapter;
	beforeAll(async () => {
		theirs = (await new AdapterPg({ ...TEST_CONFIG, max: 4 } as never).connect()) as unknown as Adapter;
		ours = await new PrismaPg({ ...TEST_CONFIG, decode: VARIANT, max: 4 }).connect();
		await withConn(async (c) => {
			await c.query(`drop type if exists ${ENUM} cascade`);
			await c.query(`create type ${ENUM} as enum ('happy', 'sad')`);
			await c.query(
				`create table ${T} (id int primary key, name text not null unique, parent int references ${T}(id))`,
			);
		});
	});
	afterAll(async () => {
		await withConn(async (c) => {
			await c.query(`drop table if exists ${T}`);
			await c.query(`drop type if exists ${ENUM}`);
		});
		await (theirs as unknown as { dispose(): Promise<void> } | undefined)?.dispose();
		await ours?.dispose();
	});

	for (const [name, sql] of MATRIX) {
		test(`queryRaw: ${name}`, async () => {
			const [a, b] = [await theirs.queryRaw(q(sql)), await ours.queryRaw(q(sql))];
			expect(b).toEqual(a);
		});
	}

	test('the same values from a re-executed (prepared) statement', async () => {
		const sql = "select $1::int8 a, $2::timestamptz b, '2024-02-03'::date c, 12.5::numeric d";
		const args = ['9007199254740993', '2024-02-03 12:00:00+00'];
		for (let i = 0; i < 3; i++) expect(await ours.queryRaw(q(sql, args))).toEqual(await theirs.queryRaw(q(sql, args)));
	});

	test('arguments convert alike: datetime, date, time, bytes, lists', async () => {
		const d = new Date('2024-02-03T12:34:56.789Z');
		const query = q('select $1::timestamptz a, $2::date b, $3::time c, $4::bytea d, $5::int4[] e, $6::text f', [
			d,
			d.toISOString(),
			d,
			Buffer.from([1, 2, 255]).toString('base64'),
			[1, 2, 3],
			'x',
		], [
			{ scalarType: 'datetime', dbType: 'TIMESTAMPTZ', arity: 'scalar' },
			{ scalarType: 'datetime', dbType: 'DATE', arity: 'scalar' },
			{ scalarType: 'datetime', dbType: 'TIME', arity: 'scalar' },
			{ scalarType: 'bytes', arity: 'scalar' },
			{ scalarType: 'int', arity: 'list' },
			{ scalarType: 'string', arity: 'scalar' },
		]);
		expect(await ours.queryRaw(query)).toEqual(await theirs.queryRaw(query));
	});

	test('unsupported column types fail alike', async () => {
		for (const sql of ["select '1 day'::interval a", 'select point(1,2) a', 'select \'x\'::"char" a']) {
			const [a, b] = [await caught(theirs.queryRaw(q(sql))), await caught(ours.queryRaw(q(sql)))];
			expect(a?.name).toBe('DriverAdapterError');
			expect(b?.name).toBe('DriverAdapterError');
			expect(b?.cause).toEqual(a?.cause);
		}
	});

	test('database errors map to the same causes', async () => {
		await theirs.executeRaw(q(`insert into ${T} values (1, 'a', null)`));
		const cases = [
			`insert into ${T} values (1, 'b', null)`, // unique (pkey)
			`insert into ${T} values (2, 'a', null)`, // unique (name)
			`insert into ${T} values (3, null, null)`, // not null
			`insert into ${T} values (4, 'd', 99)`, // foreign key
			`select * from missing_${T}`, // no table
			`select nope from ${T}`, // no column
			"select 'x'::int", // invalid input
			'select 2147483647::int4 + 1', // out of range
			'selec 1', // syntax error: the generic postgres kind
			'select 1/0', // the generic postgres kind
		];
		for (const sql of cases) {
			const [a, b] = [await caught(theirs.executeRaw(q(sql))), await caught(ours.executeRaw(q(sql)))];
			expect(b?.name).toBe(a?.name);
			expect(b?.cause).toEqual(a?.cause);
		}
		await theirs.executeRaw(q(`delete from ${T}`));
	});

	test('executeRaw returns the affected row count', async () => {
		expect(await ours.executeRaw(q(`insert into ${T} values (10, 'x', null), (11, 'y', 10)`))).toBe(2);
		expect(await ours.executeRaw(q(`update ${T} set name = name || '!' where id >= $1`, [10]))).toBe(2);
		expect(await ours.executeRaw(q(`delete from ${T} where id >= 10`))).toBe(2);
	});

	test('a transaction as Prisma drives it: BEGIN, statements, COMMIT through executeRaw, then commit()', async () => {
		const tx = await ours.startTransaction();
		expect(tx.options).toEqual({ usePhantomQuery: false });
		await tx.executeRaw(q(`insert into ${T} values (20, 'tx', null)`));
		const inside = await tx.queryRaw(q('select txid_current() x, pg_backend_pid() p'));
		const again = await tx.queryRaw(q('select txid_current() x, pg_backend_pid() p'));
		expect(again.rows).toEqual(inside.rows); // one backend, one transaction
		await tx.executeRaw(q('COMMIT'));
		await tx.commit();
		expect((await ours.queryRaw(q(`select name from ${T} where id = 20`))).rows).toEqual([['tx']]);
		await ours.executeRaw(q(`delete from ${T} where id = 20`));
	});

	test('rollback, isolation level and savepoints', async () => {
		const tx = await ours.startTransaction('SERIALIZABLE');
		expect((await tx.queryRaw(q("select current_setting('transaction_isolation')"))).rows).toEqual([['serializable']]);
		await tx.executeRaw(q(`insert into ${T} values (30, 'kept', null)`));
		await tx.createSavepoint('s1');
		await tx.executeRaw(q(`insert into ${T} values (31, 'undone', null)`));
		await tx.rollbackToSavepoint('s1');
		await tx.releaseSavepoint('s1');
		expect((await tx.queryRaw(q(`select id from ${T} where id >= 30 order by id`))).rows).toEqual([[30]]);
		await tx.executeRaw(q('ROLLBACK'));
		await tx.rollback();
		expect((await ours.queryRaw(q(`select id from ${T} where id >= 30`))).rows).toEqual([]);
	});

	test('executeScript runs every statement', async () => {
		await ours.executeScript(`insert into ${T} values (40, 's1', null); insert into ${T} values (41, 's2', 40);`);
		expect((await ours.queryRaw(q(`select id from ${T} where id >= 40 order by id`))).rows).toEqual([[40], [41]]);
		await ours.executeRaw(q(`delete from ${T} where id >= 40`));
	});

	test('getConnectionInfo reports the schema option', async () => {
		const a = await new PrismaPg(TEST_CONFIG, { schema: 'app' }).connect();
		try {
			expect(a.getConnectionInfo()).toEqual({ schemaName: 'app', supportsRelationJoins: true });
		} finally {
			await a.dispose();
		}
	});

	test('standalone statements share connections; a transaction gets one of its own', async () => {
		const a = await new PrismaPg({ ...TEST_CONFIG, decode: VARIANT, max: 2 }).connect();
		try {
			const tx = await a.startTransaction();
			const txPid = (await tx.queryRaw(q('select pg_backend_pid()'))).rows[0]![0];
			const rs = await Promise.all(
				Array.from({ length: 100 }, (_, i) => a.queryRaw(q('select $1::int4, pg_backend_pid()', [i]))),
			);
			expect(rs.map((r) => r.rows[0]![0])).toEqual(Array.from({ length: 100 }, (_, i) => i));
			expect(new Set(rs.map((r) => r.rows[0]![1])).has(txPid)).toBe(false); // none ran on the transaction's
			await tx.executeRaw(q('COMMIT'));
			await tx.commit();
			const held = [await a.pool.connect(), await a.pool.connect()];
			expect(Math.max(...held.map((h) => h.client.stats.maxInflight))).toBeGreaterThan(1);
			for (const h of held) h.release();
		} finally {
			await a.dispose();
		}
	});
});
