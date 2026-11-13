// The `int8` config: the default decode of int8 columns and int8[] elements, on the first (text) execution
// and on prepared re-executions (binary); a per-column shape target still wins.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Connection } from '../../../src/index.ts';
import { testConnect } from '../../helpers/db.ts';

const SQL = 'select $1::int8 a, array[1, 9007199254740993]::int8[] b, 7::int4 c';
const BIG = '9007199254740993'; // 2^53 + 1: exact as a string or BigInt, rounded as a number

const cases: Array<['bigint' | 'string' | 'number', unknown[]]> = [
	['bigint', [9007199254740993n, [1n, 9007199254740993n], 7]],
	['string', [BIG, ['1', BIG], 7]],
	['number', [9007199254740992, [1, 9007199254740992], 7]],
];

for (const [int8, want] of cases) {
	describe(`int8: '${int8}'`, () => {
		let c: Connection;
		beforeAll(async () => {
			c = await testConnect(int8 === 'bigint' ? {} : { int8 });
		});
		afterAll(async () => {
			await c?.end();
		});

		test('text first execution and binary re-executions decode alike', async () => {
			for (let i = 0; i < 3; i++) expect((await c.query(SQL, [BIG])).rows[0]).toEqual(want);
		});

		test('object rows', async () => {
			expect((await c.query(SQL, [BIG], { mode: 'object' })).rows[0]).toEqual({ a: want[0], b: want[1], c: 7 });
		});

		test('a shape target wins over the config', async () => {
			const r = await c.query(
				SQL,
				['5'],
				{ shape: [['a', 'int8:bigint'], ['b', 'int8[]:string'], ['c', 'int4']] } as never,
			);
			expect(r.rows[0]).toEqual({ a: 5n, b: ['1', BIG], c: 7 }); // a shape defaults to object rows
		});
	});
}
