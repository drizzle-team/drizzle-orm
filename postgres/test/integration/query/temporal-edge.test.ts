// Temporal values at the edges of the calendar / Date range, through every decode path: text scalars (no shape),
// binary scalars (shape), array elements and json shape leaves — on BOTH mappers (jit, interpreted).
// Regressions: Feb 29 of 1 BC -> Mar 1; end-of-range values with a positive
// offset or sub-ms digits -> Invalid Date; binary µs rounding across a ms (9999-12-31 23:59:59.999999 ->
// year 10000); json leaves with 5+ digit years or ' BC'.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Json, Jsonb } from '../../../src/index.ts';
import type { Connection } from '../../../src/index.ts';
import type { ShapeSpec } from '../../../src/spec.ts';
import { testConnect } from '../../helpers/db.ts';

const show = (v: unknown): string =>
	Array.isArray(v)
		? `[${v.map(show).join(', ')}]`
		: v instanceof Date
		? (Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString())
		: String(v);

// [session zone, sql literal, pg type, expected ISO]
const VALUES: Array<[string, string, 'date' | 'timestamp' | 'timestamptz', string]> = [
	['UTC', '0001-02-29 12:00:00+00 BC', 'timestamptz', '0000-02-29T12:00:00.000Z'],
	['UTC', '0001-02-29 12:00:00 BC', 'timestamp', '0000-02-29T12:00:00.000Z'],
	['UTC', '0001-02-29 BC', 'date', '0000-02-29T00:00:00.000Z'],
	['Europe/Kyiv', '0050-06-15 12:00:00+00', 'timestamptz', '0050-06-15T12:00:00.000Z'],
	['UTC', '0002-12-31 23:59:59.999+00 BC', 'timestamptz', '-000001-12-31T23:59:59.999Z'],
	['UTC', '0002-12-31 BC', 'date', '-000001-12-31T00:00:00.000Z'],
	['Europe/Kyiv', '1880-01-01 00:00:00+00', 'timestamptz', '1880-01-01T00:00:00.000Z'], // LMT +02:02:04
	['Asia/Kathmandu', '2020-06-01 00:00:00+00', 'timestamptz', '2020-06-01T00:00:00.000Z'],
	['America/St_Johns', '2020-06-01 00:00:00+00', 'timestamptz', '2020-06-01T00:00:00.000Z'],
	['UTC', '5000-01-01 00:00:00.999999+00', 'timestamptz', '5000-01-01T00:00:00.999Z'],
	['UTC', '9999-12-31 23:59:59.999999', 'timestamp', '9999-12-31T23:59:59.999Z'],
	['UTC', '1500-01-01 00:00:00.999999', 'timestamp', '1500-01-01T00:00:00.999Z'],
	['UTC', '6000-03-15 10:20:30.125', 'timestamp', '6000-03-15T10:20:30.125Z'], // whole ms (binary used to give .124)
	['UTC', '1000-07-01 08:00:00.001 BC', 'timestamp', '-000999-07-01T08:00:00.001Z'],
	['UTC', '200000-06-01 12:00:08', 'timestamp', '+200000-06-01T12:00:08.000Z'], // whole second (binary used to give 07.999)
	['Europe/Kyiv', '9999-12-31 23:59:59.999+00', 'timestamptz', '9999-12-31T23:59:59.999Z'],
	['UTC', '10000-01-01 00:00:00+00', 'timestamptz', '+010000-01-01T00:00:00.000Z'],
	['UTC', '10000-01-01', 'date', '+010000-01-01T00:00:00.000Z'],
	['Europe/Kyiv', '275760-09-13 00:00:00+00', 'timestamptz', '+275760-09-13T00:00:00.000Z'],
	['UTC', '275760-09-13 00:00:00.000567+00', 'timestamptz', '+275760-09-13T00:00:00.000Z'],
	['UTC', '275760-09-13', 'date', '+275760-09-13T00:00:00.000Z'],
	['America/St_Johns', '4714-11-24 00:00:00+00 BC', 'timestamptz', '-004713-11-24T00:00:00.000Z'], // PG's minimum, LMT offset
];

for (const decode of ['jit', 'interpreted'] as const) {
	describe(`temporal edge values (${decode})`, () => {
		let c: Connection;
		beforeAll(async () => {
			c = await testConnect({ decode });
		});
		afterAll(async () => {
			await c?.end();
		});

		const run = async (tz: string, sql: string, opts: { shape?: ShapeSpec }): Promise<Record<string, unknown>> => {
			await c.query(`set time zone '${tz}'`);
			const r = await c.query(sql, [], { mode: 'object', ...opts });
			return r.rows[0] as Record<string, unknown>;
		};

		test.each(VALUES)('%s %s::%s', async (tz, lit, type, want) => {
			const e = `'${lit}'::${type}`;
			const text = await run(tz, `select ${e} as v`, {});
			const bin = await run(tz, `select ${e} as v`, { shape: [['v', `${type}:date`]] });
			const arr = await run(tz, `select array[${e}, ${e}] as v`, {});
			const json = await run(tz, `select json_build_object('t', ${e}) as v`, {
				shape: [['v', Json([['t', `${type}:date`]])]],
			});
			const jsonb = await run(tz, `select jsonb_build_object('t', ${e}) as v`, {
				shape: [['v', Jsonb([['t', `${type}:ms`]])]],
			});
			expect({
				text: show(text.v),
				bin: show(bin.v),
				arr: show(arr.v),
				json: show((json.v as { t: unknown }).t),
				jsonb: show(new Date((jsonb.v as { t: number }).t)),
			}).toEqual({ text: want, bin: want, arr: `[${want}, ${want}]`, json: want, jsonb: want });
		});

		test('±infinity is Invalid Date on every path', async () => {
			for (const lit of ['infinity', '-infinity']) {
				const e = `'${lit}'::timestamptz`;
				expect(show((await run('UTC', `select ${e} as v`, {})).v)).toBe('Invalid Date');
				expect(show((await run('UTC', `select ${e} as v`, { shape: [['v', 'timestamptz:date']] })).v)).toBe(
					'Invalid Date',
				);
				expect(show((await run('UTC', `select array[${e}] as v`, {})).v)).toBe('[Invalid Date]');
				expect(
					show(
						((await run('UTC', `select json_build_object('t', ${e}) as v`, {
							shape: [['v', Json([['t', 'timestamptz:date']])]],
						})).v as { t: unknown }).t,
					),
				).toBe('Invalid Date');
			}
		});

		test('hand-written json strings still go through Date.parse', async () => {
			const r = await run(
				'UTC',
				`select '{"a":"2020-01-01T12:00","b":"2020-01-01T12:00Z","c":"2020-01-01T12:00:00.5Z"}'::json as v`,
				{ shape: [['v', Json([['a', 'timestamp:date'], ['b', 'timestamp:date'], ['c', 'timestamptz:date']])]] },
			);
			const v = r.v as Record<string, Date>;
			expect(v.b!.toISOString()).toBe('2020-01-01T12:00:00.000Z');
			expect(v.c!.toISOString()).toBe('2020-01-01T12:00:00.500Z');
			if (decode === 'interpreted') expect(v.a!.toISOString()).toBe('2020-01-01T12:00:00.000Z'); // naive -> UTC (jit: Date.parse, local)
		});
	});
}
