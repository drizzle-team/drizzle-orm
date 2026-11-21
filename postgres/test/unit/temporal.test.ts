// src/temporal.ts: the three copies of the PG temporal text parser (inline snippet, Buffer, string) must agree
// with each other and with an independent reference; binTimestampMs must equal the exact BigInt division.
import { describe, expect, test } from 'bun:test';
import {
	binTimestampMs,
	instantFromBytes,
	instantFromString,
	instantSnippet,
	PG_EPOCH_MS,
} from '../../src/temporal.ts';

const snippetFn = new Function(
	'b',
	'o',
	'l',
	`let ms, ok; ${instantSnippet('b', 'o', 'o + l', 'ms', 'ok')} return ok ? ms : undefined`,
) as (b: Uint8Array, o: number, l: number) => number | undefined;

/** All three parsers on `s` (bytes at a non-zero offset to catch o-relative bugs); throws if they disagree. */
const parse = (s: string): number | undefined => {
	const pad = Buffer.from('xx' + s + 'yy');
	const a = instantFromString(s), b = instantFromBytes(pad, 2, s.length), c = snippetFn(pad, 2, s.length);
	expect(Object.is(b, a)).toBe(true);
	expect(Object.is(c, a)).toBe(true);
	return a;
};
const iso = (
	ms: number | undefined,
) => (ms === undefined ? 'undefined' : Number.isNaN(ms) ? 'NaN' : new Date(ms).toISOString());

// Reference: setUTCFullYear/setUTCHours take the year verbatim (no 0-99 remap) and normalize overflow.
const ref = (y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, offSec: number) => {
	const dt = new Date(0);
	dt.setUTCFullYear(y, mo - 1, d);
	dt.setUTCHours(h, mi, s - offSec, ms);
	return dt.getTime();
};

describe('instant text parser', () => {
	test.each([
		// [text, expected ISO]
		['2020-06-01 13:45:00', '2020-06-01T13:45:00.000Z'],
		['2020-06-01 13:45:00.123456+02', '2020-06-01T11:45:00.123Z'],
		['2020-06-01T13:45:00.1+05:45', '2020-06-01T08:00:00.100Z'],
		['1880-01-01 02:02:04+02:02:04', '1880-01-01T00:00:00.000Z'],
		['2020-06-01T13:45:00Z', '2020-06-01T13:45:00.000Z'],
		['2020-06-01', '2020-06-01T00:00:00.000Z'],
		// years 0-99 (Date.UTC remaps them to 19xx) incl. Feb 29 of 1 BC (year 0 is leap, 1900 isn't)
		['0001-02-29 12:00:00+00 BC', '0000-02-29T12:00:00.000Z'],
		['0001-02-29T12:00:00 BC', '0000-02-29T12:00:00.000Z'],
		['0001-02-29 BC', '0000-02-29T00:00:00.000Z'],
		['0004-02-29', '0004-02-29T00:00:00.000Z'],
		['0099-12-31 23:00:00-01', '0100-01-01T00:00:00.000Z'],
		['0001-01-01 01:00:00+02', '0000-12-31T23:00:00.000Z'],
		['0100-01-01 00:00:00+01', '0099-12-31T23:00:00.000Z'],
		['0002-12-31T23:59:59.999+00:00 BC', '-000001-12-31T23:59:59.999Z'],
		['0002-12-31 BC', '-000001-12-31T00:00:00.000Z'],
		['4714-11-24 00:00:00+00 BC', '-004713-11-24T00:00:00.000Z'],
		// 5+ digit years; the instant (not the wall clock) is range-checked
		['10000-01-01T00:00:00+00:00', '+010000-01-01T00:00:00.000Z'],
		['10000-01-01T01:59:59.999+02:00', '9999-12-31T23:59:59.999Z'],
		['10000-01-01', '+010000-01-01T00:00:00.000Z'],
		['275760-09-13 03:00:00+03', '+275760-09-13T00:00:00.000Z'],
		['275760-09-13 00:00:00.000567+00', '+275760-09-13T00:00:00.000Z'],
		['275760-09-13 00:00:00.001+00', 'NaN'],
		['271822-04-19 21:00:00-03 BC', '-271821-04-20T00:00:00.000Z'],
		['infinity', 'NaN'],
		['-infinity', 'NaN'],
	])('%s', (s, want) => {
		expect(iso(parse(s))).toBe(want);
	});

	test.each([
		'',
		'infinityx',
		'-inf',
		'20-01-01',
		'2020/01/01',
		'2020-01-01 1:00:00',
		'2020-01-01 12:00',
		'2020-01-01 12:00:00 junk',
		'-000001-01-01',
		'Jan 1 2020',
	])('rejects %p', (s) => {
		expect(parse(s)).toBeUndefined();
	});

	test('random dates, times, offsets agree with the reference', () => {
		let seed = 12345;
		const rnd = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};
		const p2 = (n: number) => String(n).padStart(2, '0');
		for (let i = 0; i < 20000; i++) {
			const y = rnd(5) === 0 ? rnd(200) - 99 : rnd(250000) - 4000; // astronomical; dense around 0-99
			const mo = rnd(12) + 1, d = rnd(new Date(Date.UTC(2000 + (((y % 400) + 400) % 400), mo, 0)).getUTCDate()) + 1;
			const h = rnd(24), mi = rnd(60), s = rnd(60), us = rnd(1000000);
			const oh = rnd(16), om = rnd(4) * 15, os = rnd(10) === 0 ? rnd(60) : 0, sg = rnd(2) ? 1 : -1;
			const off = sg * ((oh * 60 + om) * 60 + os);
			const Y = y <= 0 ? 1 - y : y;
			const txt = `${String(Y).padStart(4, '0')}-${p2(mo)}-${p2(d)} ${p2(h)}:${p2(mi)}:${p2(s)}.${
				String(us).padStart(6, '0')
			}${sg < 0 ? '-' : '+'}${p2(oh)}:${p2(om)}${os ? ':' + p2(os) : ''}${y <= 0 ? ' BC' : ''}`;
			const got = parse(txt);
			const want = ref(y, mo, d, h, mi, s, Math.floor(us / 1000), off);
			if (got !== want) throw new Error(`${txt}: got ${iso(got)}, want ${iso(want)}`);
		}
	});
});

describe('binTimestampMs', () => {
	const enc = (us: bigint) => {
		const b = Buffer.alloc(10);
		b.writeBigInt64BE(us, 1);
		return b;
	};
	const exact = (us: bigint) => {
		let q = us / 1000n;
		if (us % 1000n < 0n) q -= 1n;
		return Number(q) + PG_EPOCH_MS;
	}; // floor

	test.each([
		0n,
		1n,
		-1n,
		999n,
		-999n,
		1000n,
		-1001n,
		8639053315200000567n, // 275760-09-13 00:00:00.000567 — as one double it rounded past 8.64e15
		8639053315200000000n,
		253402300799999999n - 946684800000000n, // 9999-12-31 23:59:59.999999 — rounded up to year 10000
		95649120000999999n, // 5000-01-01 00:00:00.999999
		-8640000000000000000n - 946684800000000n, // -271821-04-20, start of Date range
		9223372036854775807n,
		-9223372036854775808n, // PG ±infinity
	])('%p', (us) => {
		const got = binTimestampMs(enc(us), 1);
		const want = exact(us);
		if (Math.abs(want) <= 8.64e15) expect(got).toBe(want);
		else expect(Number.isNaN(new Date(got).getTime())).toBe(true);
	});

	test('random int64 µs in Date range match the exact BigInt division', () => {
		let s = 987654321n;
		for (let i = 0; i < 20000; i++) {
			s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
			const us = (s % 17280000000000000000n) - 8640000000000000000n - 946684800000000n;
			const got = binTimestampMs(enc(us), 1), want = exact(us);
			if (got !== want) throw new Error(`${us}: got ${got}, want ${want}`);
		}
	});
});
