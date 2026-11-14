// Row mapper cache (src/mapper.ts RowMappers): one per client — a standalone connection, a pool (shared by
// its connections) or an HTTP client — never process-wide: two clients may point at different databases,
// where the same type has a different OID.
import { describe, expect, test } from 'bun:test';
import { buildDecoders, type CodegenCol } from '../../src/decode.ts';
import { Transform } from '../../src/json.ts';
import { RowMappers, SeenBytes } from '../../src/mapper.ts';
import { defineType } from '../../src/registry.ts';
import { shapeCols } from '../../src/spec.ts';

const cols: CodegenCol[] = [{ name: 'id', oid: 23 }, { name: 'name', oid: 25 }];
const desc = (s: string) => Buffer.from(s, 'latin1');

describe('row mapper cache', () => {
	for (const decode of ['jit', 'interpreted'] as const) {
		test(`${decode}: one mapper per shape within a cache`, () => {
			const m = new RowMappers(decode, buildDecoders());
			const a = m.forCols(cols, 'object');
			expect(m.forCols(cols.map((c) => ({ ...c })), 'object')).toBe(a);
			expect(m.forCols(cols, 'array')).not.toBe(a);
		});
	}

	test('separate caches never share a mapper', () => {
		const map = buildDecoders();
		expect(new RowMappers('interpreted', map).forCols(cols, 'object')).not.toBe(
			new RowMappers('interpreted', map).forCols(cols, 'object'),
		);
	});

	test('array mode ignores column names; object mode does not', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const renamed = [{ name: 'a', oid: 23 }, { name: 'b', oid: 25 }];
		expect(m.forCols(renamed, 'array')).toBe(m.forCols(cols, 'array'));
		expect(m.forCols(renamed, 'object')).not.toBe(m.forCols(cols, 'object'));
	});

	test('a column name cannot forge a column boundary', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const two = m.forCols([{ name: 'a', oid: 25 }, { name: 'b', oid: 25 }], 'object');
		const forged = m.forCols([{ name: 'a|25|t|||||||;1:b', oid: 25 }], 'object');
		expect(forged).not.toBe(two);
		const row = Buffer.from([0, 1, 0, 0, 0, 1, 0x78]); // 1 column, 'x'
		expect(forged(row)).toEqual({ 'a|25|t|||||||;1:b': 'x' });
	});

	test('custom types on the same OID get their own mapper', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const a = defineType('ta', { targets: { up: (t) => t.toUpperCase() } });
		const b = defineType('tb', { targets: { up: (t) => t + '!' } });
		const col = (t: typeof a) => [{ name: 'v', oid: 1234, js: 'up' as never, custom: t.def }];
		const ma = m.forCols(col(a), 'object');
		const mb = m.forCols(col(b), 'object');
		expect(mb).not.toBe(ma);
		const row = Buffer.from([0, 1, 0, 0, 0, 2, 0x61, 0x62]); // 1 column, 'ab'
		expect(ma(row)).toEqual({ v: 'AB' });
		expect(mb(row)).toEqual({ v: 'ab!' });
	});

	test('each Transform() is its own shape', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const shape = () => shapeCols({ name: Transform('text', (v: string) => v.toUpperCase()) });
		const a = m.forCols(shape(), 'object');
		expect(m.forCols(shape(), 'object')).not.toBe(a);
		const row = Buffer.from([0, 1, 0, 0, 0, 2, 0x61, 0x62]); // 1 column, length 2, 'ab'
		expect(a(row)).toEqual({ name: 'AB' });
	});

	test('forDesc: one map per text/binary and mode, columns resolved only on a miss', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		let built = 0;
		const resolve = () => (built++, cols);
		const a = m.forDesc(desc('T1'), false, 'object', resolve);
		expect(m.forDesc(desc('T1'), false, 'object', resolve)).toBe(a);
		expect(built).toBe(1);
		m.forDesc(desc('T1'), true, 'object', resolve); // same bytes, binary run: its own map
		m.forDesc(desc('T1'), false, 'array', resolve); // same bytes, array mode: its own map
		expect(built).toBe(3);
		expect(m.forDesc(desc('T2'), false, 'object', resolve)).toBe(a); // other bytes, same columns: forCols dedupes the compile
	});

	test('forDesc: found by bytes, in a reused buffer, and past the number of descriptions kept', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		let built = 0;
		const resolve = () => (built++, cols);
		// the driver hands over a view into its receive buffer, which the next message overwrites
		const scratch = Buffer.alloc(64);
		const view = (name: string) => {
			const d = desc(name);
			d.copy(scratch);
			return scratch.subarray(0, d.length);
		};
		const a = m.forDesc(view('T1'), false, 'object', resolve);
		const b = m.forDesc(view('T22'), false, 'object', resolve); // overwrites the bytes 'T1' was read from
		expect(m.forDesc(view('T1'), false, 'object', resolve)).toBe(a);
		expect(m.forDesc(view('T22'), false, 'object', resolve)).toBe(b);
		expect(m.forDesc(view('T2'), false, 'object', resolve)).toBe(a); // a prefix of 'T22' is its own description
		expect(built).toBe(3);
		for (let pass = 0; pass < 2; pass++) {
			for (let n = 0; n < 40; n++) m.forDesc(view('N' + n), false, 'object', resolve);
		}
		expect(built).toBe(43); // 40 more, each resolved once: the ones past the kept set fall back to the string key
	});

	test('SeenBytes: a match needs the same end, or room for the whole entry when the end is unknown', () => {
		const s = new SeenBytes<number>();
		const big = Buffer.from('[{"name":"id"},{"name":"name"}]');
		s.add(big, 0, big.length, 1);
		expect(s.find(big, 0, big.length)?.value).toBe(1);
		expect(s.find(big, 0, -1)?.value).toBe(1);
		const short = Buffer.from('[{"name":"id"}]'); // shorter than the remembered entry: must not read past its end
		expect(s.find(short, 0, -1)).toBeUndefined();
		expect(s.find(short, 0, short.length)).toBeUndefined();
		const inside = Buffer.concat([Buffer.from('xx'), big, Buffer.from(',"rows":[]')]);
		expect(s.find(inside, 2, -1)?.value).toBe(1);
		expect(s.find(inside, 2, inside.length)).toBeUndefined(); // same start, another end
	});

	test('plan: resolved once per shape object, mapper once per mode', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const shape = { id: 'int4' };
		let resolved = 0;
		const resolve = () => (resolved++, [{ name: 'id', oid: 23, format: 'binary' as const }]);
		const p = m.plan(shape, resolve);
		expect(m.plan(shape, resolve)).toBe(p);
		expect(resolved).toBe(1);
		expect(p.resultFormat).toEqual([1]);
		expect(p.deferred).toBe(false);
		expect(m.planMapper(p, 'object')).toBe(m.planMapper(p, 'object'));
		expect(m.plan({ id: 'int4' }, resolve)).not.toBe(p); // inline (new object): resolved again
		expect(m.plan({ x: 'unknown' }, () => [{ name: 'x', oid: 0 }]).deferred).toBe(true);
	});

	test('the cache is bounded: the oldest shape is evicted first', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const first = m.forCols([{ name: 'c0', oid: 23 }], 'object');
		const second = m.forCols([{ name: 'c1', oid: 23 }], 'object');
		for (let i = 2; i <= 1024; i++) m.forCols([{ name: `c${i}`, oid: 23 }], 'object');
		expect(m.forCols([{ name: 'c1', oid: 23 }], 'object')).toBe(second);
		expect(m.forCols([{ name: 'c0', oid: 23 }], 'object')).not.toBe(first);
	});
});

// One RowDescription body: int16 column count, then per column a name, NUL and 18 bytes of numbers.
const rowDesc = (cols: [string, number][]) => {
	const parts = [Buffer.from([cols.length >> 8, cols.length & 0xff])];
	for (const [name, oid] of cols) {
		const tail = Buffer.alloc(18);
		tail.writeInt32BE(oid, 6);
		tail.writeInt16BE(-1, 10);
		tail.writeInt32BE(-1, 12);
		parts.push(Buffer.from(name + '\0', 'utf8'), tail);
	}
	return Buffer.concat(parts);
};

describe('fields of a repeated RowDescription', () => {
	test('the same bytes give the same parsed array', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const d = rowDesc([['id', 23], ['name', 25]]);
		const a = m.fieldsFor(d);
		expect(a.map((f) => [f.name, f.dataTypeOid])).toEqual([['id', 23], ['name', 25]]);
		expect(m.fieldsFor(Buffer.from(d))).toBe(a);
		// found inside a larger buffer that is reused afterwards
		const scratch = Buffer.concat([Buffer.alloc(9, 1), d, Buffer.alloc(9, 2)]);
		expect(m.fieldsFor(scratch.subarray(9, 9 + d.length))).toBe(a);
		scratch.fill(0);
		expect(m.fieldsFor(d)).toBe(a);
		expect(a[1]!.name).toBe('name');
	});

	test('a different name, type or column count is a different array', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const a = m.fieldsFor(rowDesc([['id', 23], ['name', 25]]));
		expect(m.fieldsFor(rowDesc([['id', 20], ['name', 25]]))[0]!.dataTypeOid).toBe(20);
		expect(m.fieldsFor(rowDesc([['id', 23], ['nam', 25]]))[1]!.name).toBe('nam');
		expect(m.fieldsFor(rowDesc([['id', 23]])).length).toBe(1);
		expect(m.fieldsFor(rowDesc([['id', 23], ['name', 25], ['x', 16]])).length).toBe(3);
		expect(m.fieldsFor(rowDesc([['id', 23], ['name', 25]]))).toBe(a);
	});

	test('the shared array cannot be changed', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		const a = m.fieldsFor(rowDesc([['id', 23]]));
		expect(Object.isFrozen(a)).toBe(true);
		expect(Object.isFrozen(a[0])).toBe(true);
		expect(() => a.push(a[0]!)).toThrow();
		expect(() => {
			'use strict';
			a[0]!.name = 'x';
		}).toThrow();
	});

	test('more layouts than are kept still parse correctly', () => {
		const m = new RowMappers('interpreted', buildDecoders());
		for (let round = 0; round < 2; round++) {
			for (let k = 0; k < 40; k++) {
				const f = m.fieldsFor(rowDesc([[`c${k}`, 23], ['t', 25]]));
				expect(f.map((x) => x.name)).toEqual([`c${k}`, 't']);
				expect(Object.isFrozen(f)).toBe(true);
			}
		}
	});

	test('two clients never share an array', () => {
		const d = rowDesc([['id', 23]]);
		const map = buildDecoders();
		expect(new RowMappers('interpreted', map).fieldsFor(d)).not.toBe(new RowMappers('interpreted', map).fieldsFor(d));
	});
});

// The wire transports hand a mapper the socket chunk and where the row starts in it (no view per row).
describe('a mapper reads a row at an offset', () => {
	const dataRow = (cells: (string | null)[]) => {
		const parts = [Buffer.from([cells.length >> 8, cells.length & 0xff])];
		for (const c of cells) {
			const len = Buffer.alloc(4);
			if (c === null) {
				len.writeInt32BE(-1);
				parts.push(len);
			} else {
				const v = Buffer.from(c, 'utf8');
				len.writeInt32BE(v.length);
				parts.push(len, v);
			}
		}
		return Buffer.concat(parts);
	};
	const layout: CodegenCol[] = [
		{ name: 'id', oid: 20 },
		{ name: 'n', oid: 23 },
		{ name: 'f', oid: 701 },
		{ name: 'ok', oid: 16 },
		{ name: 'at', oid: 1184 },
		{ name: 'meta', oid: 3802 },
		{ name: 'tags', oid: 1009 },
		{ name: 'name', oid: 25 },
		{ name: 'raw', oid: 17 },
		{ name: 'gone', oid: 25 },
	];
	const rows = [
		[
			'9007199254740993',
			'42',
			'3.5',
			't',
			'2026-11-13 10:15:00.123+00',
			'{"a":[1,2]}',
			'{x,y}',
			'héllo wörld',
			'\\x00ff10',
			null,
		],
		['-1', '-7', '0', 'f', '1999-01-01 00:00:00+00', 'null', '{}', '', '\\x', null],
	];
	for (const decode of ['jit', 'interpreted'] as const) {
		for (const mode of ['object', 'array'] as const) {
			test(`${decode} ${mode}: same row at offset 0 and in the middle of a chunk`, () => {
				const m = new RowMappers(decode, buildDecoders()).forCols(layout, mode);
				const bodies = rows.map(dataRow);
				// a chunk as the socket delivers it: junk, then frames one after another, then junk
				const chunk = Buffer.concat([
					Buffer.alloc(13, 0xee),
					...bodies.flatMap((b) => [Buffer.alloc(5, 0xdd), b]),
					Buffer.alloc(9, 0xee),
				]);
				let at = 13;
				for (const body of bodies) {
					at += 5;
					const alone = m(body);
					expect(m(body, 0)).toEqual(alone);
					expect(m(chunk, at)).toEqual(alone);
					at += body.length;
				}
			});
		}
	}

	test('a Collect shape reads at an offset too', () => {
		for (const decode of ['jit', 'interpreted'] as const) {
			const cols: CodegenCol[] = [{ name: 'id', oid: 23 }, { name: 'city', oid: 25, path: ['address'] }];
			const m = new RowMappers(decode, buildDecoders()).forCols(cols, 'object');
			const body = dataRow(['7', 'Kyiv']);
			const chunk = Buffer.concat([Buffer.alloc(31, 1), body, Buffer.alloc(4, 1)]);
			expect(m(chunk, 31)).toEqual(m(body));
			expect(m(chunk, 31)).toEqual({ id: 7, address: { city: 'Kyiv' } });
		}
	});
});
