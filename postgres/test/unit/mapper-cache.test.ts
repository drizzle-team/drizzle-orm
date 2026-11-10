// Row mapper cache (src/mapper.ts RowMappers): one per client — a standalone connection, a pool (shared by
// its connections) or an HTTP client — never process-wide: two clients may point at different databases,
// where the same type has a different OID.
import { describe, expect, test } from 'bun:test';
import { buildDecoders, type CodegenCol } from '../../src/decode.ts';
import { Transform } from '../../src/json.ts';
import { RowMappers } from '../../src/mapper.ts';
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
