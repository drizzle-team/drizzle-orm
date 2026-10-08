import { describe, expect, expectTypeOf, test } from 'vitest';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const table = mysqlTable('binary_test', {
	str: binary('str', { length: 4 }),
	buf: binary('buf', { length: 4, mode: 'buffer' }),
	vstr: varbinary('vstr', { length: 8 }),
	vbuf: varbinary('vbuf', { length: 8, mode: 'buffer' }),
});

describe('mysql binary/varbinary buffer mode (#1188)', () => {
	test('buffer mode maps a driver Buffer to Buffer, preserving bytes', () => {
		const bytes = Buffer.from([0, 1, 2, 255]);
		expect(table.buf.mapFromDriverValue(bytes)).toBeInstanceOf(Buffer);
		expect(table.buf.mapFromDriverValue(bytes).equals(bytes)).toBe(true);
		expect(table.vbuf.mapFromDriverValue(bytes).equals(bytes)).toBe(true);
	});

	test('string mode is unchanged (the default)', () => {
		expect(table.str.mapFromDriverValue('abc')).toBe('abc');
		expect(table.vstr.mapFromDriverValue('abc')).toBe('abc');
	});

	test('getSQLType is unaffected by mode', () => {
		expect(table.buf.getSQLType()).toBe('binary(4)');
		expect(table.vbuf.getSQLType()).toBe('varbinary(8)');
	});

	test('select types: buffer mode infers Buffer, default infers string', () => {
		type Row = typeof table.$inferSelect;
		expectTypeOf<Row['str']>().toEqualTypeOf<string | null>();
		expectTypeOf<Row['buf']>().toEqualTypeOf<Buffer | null>();
		expectTypeOf<Row['vstr']>().toEqualTypeOf<string | null>();
		expectTypeOf<Row['vbuf']>().toEqualTypeOf<Buffer | null>();
	});
});
