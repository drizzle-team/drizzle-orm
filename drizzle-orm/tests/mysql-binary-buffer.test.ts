import { describe, expect, expectTypeOf, test } from 'vitest';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const table = mysqlTable('bin_test', {
	buf: binary('buf', { length: 4 }),
	str: binary('str', { length: 4, mode: 'string' }),
	vbuf: varbinary('vbuf', { length: 8 }),
	vstr: varbinary('vstr', { length: 8, mode: 'string' }),
});

describe('mysql binary/varbinary buffer mode (default)', () => {
	test('mapFromDriverValue preserves Buffer bytes', () => {
		const input = Buffer.from([0x00, 0xff, 0x10, 0x20]);
		const out = table.buf.mapFromDriverValue(input);
		expect(Buffer.isBuffer(out)).toBe(true);
		expect(out.equals(input)).toBe(true);
	});

	test('mapFromDriverValue converts PlanetScale/string driver values to Buffer', () => {
		const out = table.buf.mapFromDriverValue('ab');
		expect(Buffer.isBuffer(out)).toBe(true);
		expect(out.equals(Buffer.from('ab', 'binary'))).toBe(true);
	});

	test('mapFromDriverValue accepts Uint8Array', () => {
		const out = table.vbuf.mapFromDriverValue(Uint8Array.from([1, 2, 3]));
		expect(out.equals(Buffer.from([1, 2, 3]))).toBe(true);
	});

	test('string mode keeps legacy toString behaviour', () => {
		expect(table.str.mapFromDriverValue(Buffer.from('hi'))).toBe('hi');
		expect(table.vstr.mapFromDriverValue('raw')).toBe('raw');
	});

	test('getSQLType ignores mode', () => {
		expect(table.buf.getSQLType()).toBe('binary(4)');
		expect(table.str.getSQLType()).toBe('binary(4)');
		expect(table.vbuf.getSQLType()).toBe('varbinary(8)');
	});

	test('select type inference', () => {
		expectTypeOf(table.buf.mapFromDriverValue(Buffer.alloc(0))).toEqualTypeOf<Buffer>();
		expectTypeOf(table.str.mapFromDriverValue('x')).toEqualTypeOf<string>();
		expectTypeOf(table.vbuf.mapFromDriverValue(Buffer.alloc(0))).toEqualTypeOf<Buffer>();
		expectTypeOf(table.vstr.mapFromDriverValue('x')).toEqualTypeOf<string>();
	});
});
