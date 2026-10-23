// Arrays of scalars INSIDE Json()/Jsonb() shapes: 'bigint[]', 'numeric[]', 'timestamptz[]', … —
// element-typed decode of JSON arrays (row_to_json over array columns, json_agg of scalars).
// JIT reads elements exactly from the bytes; the interpreted engine fixes up after JSON.parse,
// so (like scalar fields) its int8 exactness beyond 2^53 needs jsonBigints: 'bigint'.
import { describe, expect, test } from 'bun:test';
import { Json, Jsonb } from '../../../src/index.ts';
import { caught, TEST_TIMEOUT, testConnect, VARIANT, withConn } from '../../helpers/db.ts';

const BIG = 9007199254740993n; // 2^53 + 1: JSON.parse rounds it to ...992

describe('scalar arrays inside Json()/Jsonb() shapes', () => {
	test('bigint[] over row_to_json: exact with jsonBigints (BOTH engines)', async () => {
		const c = await testConnect({ jsonBigints: 'bigint' });
		try {
			const r = await c.query(`select row_to_json(x) as row from (select array[${BIG}, 2, 3]::int8[] as ids) x`, [], {
				shape: { row: Json({ ids: 'bigint[]' }) },
			});
			expect((r.rows[0] as { row: { ids: bigint[] } }).row.ids).toEqual([BIG, 2n, 3n]);
		} finally {
			await c.end();
		}
	}, TEST_TIMEOUT);

	// json[]/jsonb[] COLUMNS (arrays of json values, not a json array): their elements used to be plain
	// JSON.parse whatever jsonBigints said, so a nested big integer rounded.
	test('jsonb[] / json[] elements honor jsonBigints, with and without a shape (BOTH engines)', async () => {
		const sql =
			`select array['{"x": ${BIG}}', '{"y": [1, -${BIG}]}', null]::jsonb[] as jb, array['{"x": ${BIG}}']::json[] as j`;
		const c = await testConnect({ jsonBigints: 'bigint' });
		try {
			const want = { jb: [{ x: BIG }, { y: [1, -BIG] }, null], j: [{ x: BIG }] };
			expect((await c.query(sql, [], { mode: 'object' })).rows[0]).toEqual(want);
			expect((await c.query(sql, [], { shape: { jb: 'jsonb[]', j: 'json[]' } })).rows[0]).toEqual(want);
		} finally {
			await c.end();
		}
		const s = await testConnect({ jsonBigints: 'string' });
		try {
			expect((await s.query(sql, [], { mode: 'object' })).rows[0]).toMatchObject({
				jb: [{ x: String(BIG) }, { y: [1, '-' + BIG] }, null],
			});
		} finally {
			await s.end();
		}
	}, TEST_TIMEOUT);

	test.skipIf(VARIANT === 'interpreted')('bigint[] exact under DEFAULT config (jit scanner)', async () => {
		await withConn(async (c) => {
			const r = await c.query(`select row_to_json(x) as row from (select array[${BIG}, 2, 3]::int8[] as ids) x`, [], {
				shape: { row: Json({ ids: 'bigint[]' }) },
			});
			expect((r.rows[0] as { row: { ids: bigint[] } }).row.ids).toEqual([BIG, 2n, 3n]);
		});
	}, TEST_TIMEOUT);

	test('bigint[] small values -> BigInt[]; bigint[]:number -> number[] (both engines)', async () => {
		await withConn(async (c) => {
			const sql = `select json_build_object('ids', json_build_array(1, 2, 3)) as d`;
			const asBig = await c.query(sql, [], { shape: { d: Json({ ids: 'bigint[]' }) } });
			expect((asBig.rows[0] as { d: { ids: bigint[] } }).d.ids).toEqual([1n, 2n, 3n]);
			const asNum = await c.query(sql, [], { shape: { d: Json({ ids: 'bigint[]:number' }) } });
			expect((asNum.rows[0] as { d: { ids: number[] } }).d.ids).toEqual([1, 2, 3]);
		});
	}, TEST_TIMEOUT);

	test.skipIf(VARIANT === 'interpreted')('numeric[] -> exact string elements (jit scanner)', async () => {
		await withConn(async (c) => {
			const r = await c.query(
				`select row_to_json(x) as row from (select array['10.50','0.1']::numeric[] as prices) x`,
				[],
				{ shape: { row: Json({ prices: 'numeric[]' }) } },
			);
			expect((r.rows[0] as { row: { prices: string[] } }).row.prices).toEqual(['10.50', '0.1']);
		});
	}, TEST_TIMEOUT);

	test('timestamptz[] -> Date[]; :ms -> number[] (both engines)', async () => {
		await withConn(async (c) => {
			const sql = `select row_to_json(x) as row from (select array['2026-01-02T03:04:05.678Z'::timestamptz] as at) x`;
			const asDate = await c.query(sql, [], { shape: { row: Json({ at: 'timestamptz[]' }) } });
			const dates = (asDate.rows[0] as { row: { at: Date[] } }).row.at;
			expect(dates[0]).toBeInstanceOf(Date);
			expect(dates[0]!.getTime()).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 678));
			const asMs = await c.query(sql, [], { shape: { row: Json({ at: 'timestamptz[]:ms' }) } });
			expect((asMs.rows[0] as { row: { at: number[] } }).row.at).toEqual([Date.UTC(2026, 0, 2, 3, 4, 5, 678)]);
		});
	}, TEST_TIMEOUT);

	test('null array, empty array, null elements — with a precision sibling forcing the scanner', async () => {
		await withConn(async (c) => {
			const shape = { row: Json({ ids: 'bigint[]', v: 'int8' }) } as const;
			const q = (sel: string) =>
				c.query(`select row_to_json(x) as row from (select ${sel}) x`, [], { shape: shape as never });
			expect(((await q(`null::int8[] as ids, 7::int8 as v`)).rows[0] as { row: { ids: null } }).row.ids).toBeNull();
			expect(((await q(`array[]::int8[] as ids, 7::int8 as v`)).rows[0] as { row: { ids: bigint[] } }).row.ids).toEqual(
				[],
			);
			expect(
				((await q(`array[1, null, 3]::int8[] as ids, 7::int8 as v`)).rows[0] as { row: { ids: (bigint | null)[] } }).row
					.ids,
			)
				.toEqual([1n, null, 3n]);
		});
	}, TEST_TIMEOUT);

	test('int4[]/text[] fast path (no scanner) still decode as plain arrays', async () => {
		await withConn(async (c) => {
			const r = await c.query(
				`select row_to_json(x) as row from (select array[1,2]::int4[] as ns, array['a "quoted"', 'café 😀']::text[] as ts) x`,
				[],
				{ shape: { row: Json({ ns: 'int4[]', ts: 'text[]' }) } },
			);
			const row = (r.rows[0] as { row: { ns: number[]; ts: string[] } }).row;
			expect(row.ns).toEqual([1, 2]);
			expect(row.ts).toEqual(['a "quoted"', 'café 😀']);
		});
	}, TEST_TIMEOUT);

	test('jsonb: array field participates in jsonb key sort order', async () => {
		await withConn(async (c) => {
			const r = await c.query(
				`select jsonb_build_object('zz', ${BIG}::int8, 'a', array[1,2]::int8[]) as d`,
				[],
				{ shape: { d: Jsonb({ zz: 'int8:string', a: 'bigint[]' }) } },
			);
			const d = (r.rows[0] as { d: { zz: string; a: bigint[] } }).d;
			expect(d.a).toEqual([1n, 2n]);
			expect(d.zz).toBe(VARIANT === 'jit' ? String(BIG) : d.zz); // jit exact; interpreted documented-lossy w/o jsonBigints
		});
	}, TEST_TIMEOUT);

	test('Transform on an array field sees the decoded array', async () => {
		await withConn(async (c) => {
			const { Transform } = await import('../../../src/index.ts');
			const r = await c.query(`select json_build_object('ids', json_build_array(1,2,3)) as d`, [], {
				shape: { d: Json({ ids: Transform('bigint[]', (a: bigint[]) => a.length) }) },
			});
			expect((r.rows[0] as { d: { ids: number } }).d.ids).toBe(3);
		});
	}, TEST_TIMEOUT);

	test('MULTIDIMENSIONAL arrays: one spec covers every dimensionality (report.md repro)', async () => {
		await withConn(async (c) => {
			// scanner path (precision elements) — was BROKEN: nested '[' consumed as a bogus scalar
			const r1 = await c.query(`select row_to_json(x) as d from (select array[[1,2],[3,4]]::int8[] as v) x`, [], {
				shape: { d: Json({ v: 'int8[]' }) },
			});
			expect((r1.rows[0] as { d: { v: bigint[][] } }).d.v).toEqual([[1n, 2n], [3n, 4n]]);
			const r2 = await c.query(`select row_to_json(x) as d from (select array[[1,2],[3,4]]::int8[] as v) x`, [], {
				shape: { d: Json({ v: 'int8[]:string' }) },
			});
			expect((r2.rows[0] as { d: { v: string[][] } }).d.v).toEqual([['1', '2'], ['3', '4']]);
			// temporal elements through the walk/scanner, 2-D
			const r3 = await c.query(
				`select row_to_json(x) as d from (select array[['2026-01-02T03:04:05Z']]::timestamptz[] as v) x`,
				[],
				{ shape: { d: Json({ v: 'timestamptz[]:ms' }) } },
			);
			expect((r3.rows[0] as { d: { v: number[][] } }).d.v).toEqual([[Date.UTC(2026, 0, 2, 3, 4, 5)]]);
			// 3-D + null elements + null inner array
			const r4 = await c.query(
				`select json_build_object('v', json_build_array(json_build_array(json_build_array(1, null), null))) as d`,
				[],
				{ shape: { d: Json({ v: 'bigint[]' }) } },
			);
			expect((r4.rows[0] as { d: { v: unknown } }).d.v).toEqual([[[1n, null], null]]);
			// fast path (JSON.parse) unchanged
			const r5 = await c.query(`select row_to_json(x) as d from (select array[[1,2],[3,4]]::int8[] as v) x`, [], {
				shape: { d: Json({ v: 'int8[]:number' }) },
			});
			expect((r5.rows[0] as { d: { v: number[][] } }).d.v).toEqual([[1, 2], [3, 4]]);
		});
	}, TEST_TIMEOUT);

	test.skipIf(VARIANT === 'interpreted')('multidim numeric[] -> exact string elements (jit scanner)', async () => {
		await withConn(async (c) => {
			const r = await c.query(
				`select row_to_json(x) as d from (select array[['10.50'],['0.1']]::numeric[] as v) x`,
				[],
				{ shape: { d: Json({ v: 'numeric[]' }) } },
			);
			expect((r.rows[0] as { d: { v: string[][] } }).d.v).toEqual([['10.50'], ['0.1']]);
		});
	}, TEST_TIMEOUT);

	test('numeric:bigint — the uint256 contract: exact beyond int8, LOUD throw on fractional', async () => {
		await withConn(async (c) => {
			const big = 2n ** 100n; // far beyond int8's 64 bits — the reason the target exists
			// wire: scalar + array + multidim
			const r = await c.query(
				`select ${big}::numeric(40,0) as v, array[${big}, 2]::numeric[] as a, array[[${big}],[7]]::numeric[] as aa`,
				[],
				{ shape: { v: 'numeric:bigint', a: 'numeric[]:bigint', aa: 'numeric[]:bigint' } },
			);
			const row = r.rows[0] as { v: bigint; a: bigint[]; aa: bigint[][] };
			expect(row.v).toBe(big);
			expect(row.a).toEqual([big, 2n]);
			expect(row.aa).toEqual([[big], [7n]]);
			// shaped json (the scanner reads exact digit tokens — both engines)
			const j = await c.query(
				`select row_to_json(x) as d from (select ${big}::numeric(40,0) as v, array[${big}]::numeric[] as a) x`,
				[],
				{ shape: { d: Json({ v: 'numeric:bigint', a: 'numeric[]:bigint' }) } },
			);
			const dj = (j.rows[0] as { d: { v: bigint; a: bigint[] } }).d;
			expect(dj.v).toBe(big);
			expect(dj.a).toEqual([big]);
			// fractional value violates the declared integer contract -> LOUD error, connection survives
			const e = await caught(() => c.query('select 10.50::numeric as v', [], { shape: { v: 'numeric:bigint' } }));
			expect(String((e as Error).message)).toMatch(/Cannot convert|Failed to parse|invalid BigInt/);
			expect(((await c.query('select 1 as ok', [], { mode: 'object' })).rows[0] as { ok: number }).ok).toBe(1);
		});
	}, TEST_TIMEOUT);

	test(`'json[]'/'unknown[]' inside Json() throw at shape build (no silent mis-decode)`, async () => {
		await withConn(async (c) => {
			const e = await caught(() => c.query('select 1 as d', [], { shape: { d: Json({ x: 'json[]' as never }) } }));
			expect(String((e as Error).message)).toMatch(/isn't supported inside a json shape/);
			const e2 = await caught(() => c.query('select 1 as d', [], { shape: { d: Json({ x: 'unknown[]' as never }) } }));
			expect(String((e2 as Error).message)).toMatch(/isn't supported inside a json shape/);
		});
	}, TEST_TIMEOUT);
});
