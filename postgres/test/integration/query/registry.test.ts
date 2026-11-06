// defineType(): the user-extensible type registry. Name-keyed markers usable as shape columns,
// array elements, and Collect fields; bare = raw text; loud errors for unknown targets and
// unsupported placements. Dual-variant (jit + interpreted) like every decode-path suite.
import { describe, expect, test } from 'bun:test';
import { geometry } from '../../../src/geometry.ts';
import { Collect, defineType, Json } from '../../../src/index.ts';
import { caught, TEST_TIMEOUT, withConn } from '../../helpers/db.ts';

// a toy PG-ish type: 'complex' rendered as 'a+bi'
const complex = defineType('complex', {
	ascii: true,
	targets: {
		obj: (s) => {
			const i = s.indexOf('+');
			return { re: Number(s.slice(0, i)), im: Number(s.slice(i + 1, -1)) };
		},
	},
	rawTargets: { len: (b, o, l) => l }, // zero-copy tier: cell byte length
});

describe('defineType registry', () => {
	test('scalar targets, bare raw text, rawTargets, arrays, Collect composition', async () => {
		await withConn(async (c) => {
			const r = await c.query(
				`select '1.5+2i'::text v, '1.5+2i'::text raw, '1.5+2i'::text len,
                '{"1+2i","3+4i"}'::text arr, '{"1+2i"}'::text arrraw, 7::int4 id`,
				[],
				{
					shape: {
						v: complex('obj'),
						raw: complex(),
						len: complex('len'),
						arr: complex.array('obj'),
						arrraw: complex.array(),
						grp: Collect({ id: 'int4' }),
					},
				},
			);
			const row = r.rows[0] as Record<string, unknown>;
			expect(row.v).toEqual({ re: 1.5, im: 2 });
			expect(row.raw).toBe('1.5+2i'); // bare = raw text
			expect(row.len).toBe(6); // rawTargets got (b, o, l)
			expect(row.arr).toEqual([{ re: 1, im: 2 }, { re: 3, im: 4 }]);
			expect(row.arrraw).toEqual(['1+2i']); // bare elements = raw text
			expect(row.grp).toEqual({ id: 7 });
		});
	}, TEST_TIMEOUT);

	test('@drizzle-team/postgres/geometry is a registry customer: same machinery end to end', async () => {
		await withConn(async (c) => {
			const PT = '0101000020E6100000000000000000F03F0000000000000040'; // SRID=4326 POINT(1 2)
			const LINE = '010200000002000000' + '0000000000000000'.repeat(2) + '000000000000F03F'.repeat(2); // LINESTRING(0 0,1 1)
			const r = await c.query(`select '${PT}'::text g, '${PT}'::text gxy, '${PT}'::text gt, '{"${PT}"}'::text gs`, [], {
				shape: { g: geometry('geojson'), gxy: geometry('xy'), gt: geometry('tuple'), gs: geometry.array('xy') },
			});
			const row = r.rows[0] as Record<string, unknown>;
			expect(row.g).toEqual({ type: 'Point', coordinates: [1, 2], srid: 4326 });
			expect(row.gxy).toEqual({ x: 1, y: 2 });
			expect(row.gt).toEqual([1, 2]);
			expect(row.gs).toEqual([{ x: 1, y: 2 }]);
			// the declared-Point contract is LOUD: a LineString under :xy rejects, connection survives
			const e = await caught(() => c.query(`select '${LINE}'::text g`, [], { shape: { g: geometry('xy') } }));
			expect(String((e as Error).message)).toMatch(/expect a Point geometry, got LineString/);
			expect((await c.query('select 1', [])).rowCount).toBe(1);
		});
	}, TEST_TIMEOUT);

	test('a declared type wins over a config.types override of its real OID', async () => {
		const mood = defineType('mood', { ascii: true, targets: { upper: (s) => s.toUpperCase() } });
		await withConn(async (c) => {
			await c.query('drop type if exists postgres_test_mood');
			await c.query(`create type postgres_test_mood as enum ('happy')`);
			try {
				const oids = await c.query(
					`select 'postgres_test_mood'::regtype::oid::int4 s, 'postgres_test_mood[]'::regtype::oid::int4 a`,
				);
				const [scalar, array] = oids.rows[0] as number[];
				const override = () => 'override';
				await withConn(async (o) => {
					const r = await o.query(`select 'happy'::postgres_test_mood m, '{happy}'::postgres_test_mood[] ms`, [], {
						shape: { m: mood('upper'), ms: mood.array('upper') },
					});
					expect(r.rows).toEqual([{ m: 'HAPPY', ms: ['HAPPY'] }]);
				}, { types: { [scalar!]: override, [array!]: override } });
			} finally {
				await c.query('drop type postgres_test_mood');
			}
		});
	}, TEST_TIMEOUT);

	test('loud errors: unknown target at marker creation; markers inside Json() rejected', async () => {
		expect(() => complex('nope' as never)).toThrow(/has no target "nope"/);
		await withConn(async (c) => {
			const e = await caught(() =>
				c.query('select 1 as d', [], { shape: { d: Json({ x: complex('obj') as never }) } })
			);
			expect(String((e as Error).message)).toMatch(/aren't supported inside a json shape/);
		});
	}, TEST_TIMEOUT);
});
