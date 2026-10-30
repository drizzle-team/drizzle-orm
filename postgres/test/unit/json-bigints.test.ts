// jsonBigints: the json/jsonb decoders (src/decode.ts jsonDecoder + the json[]/jsonb[] map entries).
//   - only an INTEGER token of 16+ digits takes the exact (slow) path — float fraction/exponent digits
//     don't, so float-heavy documents stay on native JSON.parse;
//   - json[]/jsonb[] elements honor jsonBigints (they used to be plain JSON.parse, lossy past 2^53);
//   - the pure-JS buffer parser (runtimes without JSON.parse's context.source) gives the same results.
import { afterEach, describe, expect, test } from 'bun:test';
import { buildDecoders, jsonDecoder } from '../../src/decode.ts';

const buf = (s: string) => Buffer.from(s, 'utf8');

// Records whether the exact path ran: it is the only caller that passes JSON.parse a reviver.
const realParse = JSON.parse;
let revived = 0;
function spyParse() {
	revived = 0;
	(JSON as { parse: typeof JSON.parse }).parse = ((s: string, r?: Parameters<typeof JSON.parse>[1]) => {
		if (r) revived++;
		return realParse(s, r);
	}) as typeof JSON.parse;
}
afterEach(() => {
	(JSON as { parse: typeof JSON.parse }).parse = realParse;
});

describe('jsonDecoder: which values take the exact path', () => {
	const exact = [
		['{"a":9007199254740993}', { a: '9007199254740993' }],
		['[-9007199254740993]', ['-9007199254740993']],
		['{"a":{"b":[1,{"c":1000000000000000001}]}}', { a: { b: [1, { c: '1000000000000000001' }] } }],
		['[ 9007199254740993 ,1]', ['9007199254740993', 1]],
	] as const;
	for (const [json, want] of exact) {
		test(`big integer is kept exact: ${json}`, () => {
			spyParse();
			expect(jsonDecoder('string')(buf(json))).toEqual(want);
			expect(revived).toBe(1);
		});
	}

	const fast = [
		'{"x":0.30000000000000004}',
		'{"x":534.2108676188552,"y":-0.12345678901234567}',
		'[12345678901234567.5]',
		'[1.5e1234567890123456]',
		'[1E-1234567890123456]',
		'{"n":123456789012345}',
	];
	for (const json of fast) {
		test(`no big integer -> plain JSON.parse: ${json}`, () => {
			spyParse();
			expect(jsonDecoder('string')(buf(json))).toEqual(realParse(json));
			expect(revived).toBe(0);
		});
	}

	test("'bigint' mode returns BigInt", () => {
		expect(jsonDecoder('bigint')(buf('{"a":[-9007199254740993,1.5]}'))).toEqual({ a: [-9007199254740993n, 1.5] });
	});
});

describe('json[] / jsonb[] elements honor jsonBigints', () => {
	const literal = buf(
		'{"{\\"x\\": 9007199254740993}","{\\"y\\": [1, -1000000000000000001]}",NULL,"[0.30000000000000004]"}',
	);

	test("'string' and 'bigint'", () => {
		for (const oid of [199, 3807]) {
			expect(buildDecoders(undefined, 'string').get(oid)!(literal)).toEqual([
				{ x: '9007199254740993' },
				{ y: [1, '-1000000000000000001'] },
				null,
				[0.30000000000000004],
			]);
			expect(buildDecoders(undefined, 'bigint').get(oid)!(literal)).toEqual([
				{ x: 9007199254740993n },
				{ y: [1, -1000000000000000001n] },
				null,
				[0.30000000000000004],
			]);
		}
	});

	test("'number' (default) adds no json[] decoder — the generic array path stays in charge", () => {
		expect(buildDecoders().has(3807)).toBe(false);
		expect(buildDecoders(undefined, 'number').has(199)).toBe(false);
	});

	test('a config.types override of the array OID still wins', () => {
		const mine = () => 'mine';
		expect(buildDecoders({ 3807: mine }, 'bigint').get(3807)).toBe(mine);
	});
});

describe('runtimes without JSON.parse context.source use the buffer parser', () => {
	// A fresh decode.ts instance, loaded (and run) while the reviver gets no context: jsonSourceSupported is
	// false there, and an exact result can only come from parseJsonBuffer.
	async function noSourceDecode() {
		(JSON as { parse: typeof JSON.parse }).parse =
			((s: string, r?: (k: string, v: unknown) => unknown) =>
				r ? realParse(s, (k, v) => r(k, v)) : realParse(s)) as typeof JSON.parse;
		const fresh = '../../src/decode.ts?no-json-source'; // a variable: tsc can't resolve the ?query, Bun loads a new instance
		return import(fresh) as Promise<typeof import('../../src/decode.ts')>;
	}

	test('scalar json and json[] elements', async () => {
		const mod = await noSourceDecode();
		expect(mod.jsonDecoder).not.toBe(jsonDecoder);
		expect(mod.jsonDecoder('string')(buf('{"a":{"b":[9007199254740993,0.30000000000000004]}}'))).toEqual({
			a: { b: ['9007199254740993', 0.30000000000000004] },
		});
		expect(mod.jsonDecoder('bigint')(buf('[-9007199254740993]'))).toEqual([-9007199254740993n]);
		expect(mod.buildDecoders(undefined, 'bigint').get(3807)!(buf('{"{\\"x\\": 9007199254740993}"}'))).toEqual([{
			x: 9007199254740993n,
		}]);
	});
});
