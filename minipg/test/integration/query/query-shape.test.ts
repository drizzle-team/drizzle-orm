// query(sql, params, { shape }) — decode a result with a declared column shape (ShapeSpec object or a
// Shape() mapper), using the SAME cached jit/interpreted mapper as any query. Runs under both decode
// variants (MINIPG_VARIANT) so the interpreted and jit shape mappers are validated against real PG.
import { afterEach, describe, expect, test } from 'bun:test';
import { Json, JsonArray, Shape, type ShapeSpec } from '../../../src/index.ts';
import { testConnect } from '../../helpers/db.ts';

let open: Array<Awaited<ReturnType<typeof testConnect>>> = [];
afterEach(async () => {
	for (const c of open) await c.end().catch(() => {});
	open = [];
});
const conn = async () => {
	const c = await testConnect();
	open.push(c);
	return c;
};

describe('query({ shape }) — declared shape decode', () => {
	test('scalar shape spec: typed decode (int8 BigInt, int8:number, bool, float8)', async () => {
		const c = await conn();
		const sql = `select 42::int4 as i, 'hi'::text as t, 9223372036854775807::int8 as big,
                        100::int8 as n, true as b, 3.5::float8 as f`;
		const r = await c.query(sql, [], {
			shape: { i: 'int4', t: 'text', big: 'int8', n: 'int8:number', b: 'bool', f: 'float8' },
		});
		expect(r.rows[0]).toEqual({ i: 42, t: 'hi', big: 9223372036854775807n, n: 100, b: true, f: 3.5 });
		expect(typeof (r.rows[0] as Record<string, unknown>).big).toBe('bigint'); // int8 -> BigInt
		expect(typeof (r.rows[0] as Record<string, unknown>).n).toBe('number'); // int8:number -> number
	});

	test('a Shape() mapper can be passed as the shape (its $cols are reused)', async () => {
		const c = await conn();
		const user = Shape({ id: 'int4', name: 'text' });
		const r = await c.query('select 7 as id, $1::text as name', ['ada'], { shape: user, mode: 'object' });
		expect(r.rows[0]).toEqual({ id: 7, name: 'ada' });
	});

	test('array mode with a shape', async () => {
		const c = await conn();
		const r = await c.query('select 1::int4, 2::int4', [], { shape: { a: 'int4', b: 'int4' }, mode: 'array' });
		expect(r.rows[0]).toEqual([1, 2]);
	});

	test('text:latin1 decodes an ASCII column identically to text (fast path)', async () => {
		const c = await conn();
		const sql = `select 'ada.lovelace@example.com'::text as email`;
		const utf = await c.query(sql, [], { shape: { email: 'text' }, mode: 'object' });
		const lat = await c.query(sql, [], { shape: { email: 'text:latin1' }, mode: 'object' });
		expect(lat.rows[0]).toEqual({ email: 'ada.lovelace@example.com' });
		expect(lat.rows[0]).toEqual(utf.rows[0]); // same result, latin1 just skips the utf8 scan
	});

	test('shaped json column decodes to a typed object', async () => {
		const c = await conn();
		const sql = `select '{"id":1,"name":"x","ok":true}'::json as j`;
		const r = await c.query(sql, [], { shape: { j: Json({ id: 'int4', name: 'text', ok: 'bool' }) }, mode: 'object' });
		expect((r.rows[0] as { j: unknown }).j).toEqual({ id: 1, name: 'x', ok: true });
	});

	test('the same shape reused across calls stays correct (cached mapper)', async () => {
		const c = await conn();
		const shape = { g: 'int4' } as const;
		for (let i = 1; i <= 3; i++) {
			const r = await c.query('select $1::int4 as g', [i], { shape });
			expect(r.rows[0]).toEqual({ g: i });
		}
	});

	test('unknown type in a shape spec throws a helpful error', async () => {
		const c = await conn();
		// 'notatype' is ALSO a compile error now (TypeSpec is a typed union) — that's the point; assert the runtime guard too.
		// @ts-expect-error - not a known PG type alias
		await expect(c.query('select 1', [], { shape: { x: 'notatype' } })).rejects.toThrow(
			/unknown type "notatype".*in shape/,
		);
	});

	// box is PG's one built-in type whose arrays delimit with ';' (box_out itself writes commas). Declared as
	// text[] it used to split inside every box: ["(3","4)","(1","2);(7",…].
	test('box / box[]: arrays split on box\'s own ";" delimiter', async () => {
		const c = await conn();
		const sql = `select '(1,2),(3,4)'::box s, array['(1,2),(3,4)'::box, '(5,6),(7,8)'::box] a,
                        '{{"(1,1),(0,0)"};{"(2,2),(0,0)"}}'::box[] m, '{}'::box[] z, '{"(1,1),(0,0)";NULL}'::box[] n, null::box[] nul`;
		const r = await c.query(sql, [], {
			shape: { s: 'box', a: 'box[]', m: 'box[]', z: 'box[]', n: 'box[]', nul: 'box[]' },
		});
		expect(r.rows[0]).toEqual({
			s: '(3,4),(1,2)',
			a: ['(3,4),(1,2)', '(7,8),(5,6)'],
			m: [['(1,1),(0,0)'], ['(2,2),(0,0)']],
			z: [],
			n: ['(1,1),(0,0)', null],
			nul: null,
		});
		// without a shape box[] stays the raw literal, like every array type with no element decoder
		expect((await c.query(sql, [], { mode: 'object' })).rows[0]).toMatchObject({ a: '{(3,4),(1,2);(7,8),(5,6)}' });
		// a declared box[] param pins the type; the value is a ';' literal (a JS array is encoded with ',')
		const p = await c.query('select $1 as v', ['{(3,4),(1,2);(7,8),(5,6)}'], {
			params: ['box[]'],
			shape: { v: 'box[]' },
			mode: 'object',
		});
		expect(p.rows[0]).toEqual({ v: ['(3,4),(1,2)', '(7,8),(5,6)'] });
	});
});

describe('temporal targets — :ms / :date', () => {
	const ISO = '2022-11-21T14:29:11.987Z';

	test('top-level timestamptz:ms -> number, :date -> Date (both mappers)', async () => {
		const c = await conn();
		const sql = `select '2022-11-21 14:29:11.987+00'::timestamptz as ts`;
		const e = await c.query(sql, [], { shape: { ts: 'timestamptz:ms' }, mode: 'object' });
		expect((e.rows[0] as { ts: number }).ts).toBe(Date.parse(ISO));
		const d = await c.query(sql, [], { shape: { ts: 'timestamptz:date' }, mode: 'object' });
		const dt = (d.rows[0] as { ts: Date }).ts;
		expect(dt).toBeInstanceOf(Date);
		expect(dt.toISOString()).toBe(ISO);
	});

	test('json field :ms re-parses the ISO string to epoch ms (both mappers — interpreted walks after JSON.parse)', async () => {
		const c = await conn();
		const sql = `select json_build_object('n', 1, 'ts', '2022-11-21T14:29:11.987+00:00'::timestamptz) as j`;
		const r = await c.query(sql, [], { shape: { j: Json({ n: 'int4', ts: 'timestamptz:ms' }) }, mode: 'object' });
		expect((r.rows[0] as { j: { ts: unknown } }).j.ts).toBe(Date.parse(ISO)); // jit scanner OR interpreted post-parse walk
	});

	test('json array over row_to_json(s.*): :ms fields become numbers (both mappers)', async () => {
		const c = await conn();
		const sql = `select coalesce(json_agg(row_to_json(t)), '[]') as rows from (
      select 1::int4 as id, '2022-11-21T14:29:11.987+00:00'::timestamptz as ts) t`;
		const r = await c.query(sql, [], {
			shape: { rows: JsonArray({ id: 'int4', ts: 'timestamptz:ms' }) },
			mode: 'object',
		});
		expect((r.rows[0] as { rows: Array<{ ts: unknown }> }).rows[0]!.ts).toBe(Date.parse(ISO));
	});

	test('regression: two json shapes on one connection do not collide in the mapper cache', async () => {
		const c = await conn();
		const sql = `select json_build_object('ts', '2022-11-21T14:29:11.987+00:00'::timestamptz) as j`;
		const asStr = await c.query(sql, [], { shape: { j: Json({ ts: 'timestamptz:string' }) }, mode: 'object' });
		const asEpoch = await c.query(sql, [], { shape: { j: Json({ ts: 'timestamptz:ms' }) }, mode: 'object' });
		expect(typeof (asStr.rows[0] as { j: { ts: unknown } }).j.ts).toBe('string'); // :string shape -> ISO string, not reused below
		expect((asEpoch.rows[0] as { j: { ts: unknown } }).j.ts).toBe(Date.parse(ISO)); // :ms shape -> number, in both mappers
	});
});

describe('{ debug: true } surfaces the decode plan', () => {
	test('reports mode, jit/interpreted (+ source), and per-column text/binary format', async () => {
		const c = await conn();
		const r = await c.query('select 1::int8 as big, now() as ts, 42::int4 as i, 2.5::float4 as f', [], {
			shape: { big: 'int8', ts: 'timestamptz:ms', i: 'int4', f: 'float4:precise' },
			mode: 'object',
			debug: true,
		});
		const d = r.debug!;
		expect(d.mode).toBe('object');
		expect(['jit', 'interpreted']).toContain(d.decode);
		if (d.decode === 'jit') expect(typeof d.mapperSource).toBe('string'); // the generated per-shape function
		else expect(d.mapperSource).toBeUndefined();
		const byName = Object.fromEntries(d.columns.map((x) => [x.name, x]));
		expect(byName.big).toMatchObject({ oid: 20, format: 'binary' }); // int8 -> binary
		expect(byName.ts).toMatchObject({ oid: 1184, format: 'binary', js: 'ms' }); // timestamptz:ms -> binary
		expect(byName.i!.format).toBe('binary'); // int4 -> binary
		expect(byName.f).toMatchObject({ oid: 700, format: 'binary', js: 'precise' }); // float4:precise -> binary
	});

	test('no debug option -> no .debug', async () => {
		const c = await conn();
		expect((await c.query('select 1')).debug).toBeUndefined();
	});
});

// Type-level checks (no runtime): the shape value union autocompletes + rejects typos.
{
	const ok: ShapeSpec = {
		a: 'int4',
		b: 'bigint:number',
		c: 'timestamptz:ms',
		d: 'text:latin1',
		e: 'timestamptz:string',
		g: 'float4:precise',
		h: 'float4:pretty',
		f: Json({ n: 'int8:number', ts: 'timestamptz:date' }),
	};
	void ok;
	// @ts-expect-error - 'bignt' is not a PG type alias
	const bad1: ShapeSpec = { a: 'bignt' };
	// @ts-expect-error - ':temporal' is not a valid JS target
	const bad2: ShapeSpec = { a: 'date:temporal' };
	// @ts-expect-error - timestamptz has no :number target (use :ms for epoch ms)
	const bad3: ShapeSpec = { a: 'timestamptz:number' };
	// @ts-expect-error - timestamptz has no :latin1 target
	const bad4: ShapeSpec = { a: 'timestamptz:latin1' };
	// @ts-expect-error - :precise is float4-only, not a float8 target
	const bad5: ShapeSpec = { a: 'float8:precise' };
	void bad1;
	void bad2;
	void bad3;
	void bad4;
	void bad5;
}
