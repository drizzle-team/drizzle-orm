import { expectTypeOf, test } from 'vitest';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const table = mysqlTable('binary_buffer_test', {
	binaryString: binary('binary_string', { length: 4 }),
	binaryBuffer: binary('binary_buffer', { length: 4, mode: 'buffer' }),
	varbinaryString: varbinary('varbinary_string', { length: 4 }),
	varbinaryBuffer: varbinary('varbinary_buffer', { length: 4, mode: 'buffer' }),
});

type SelectRow = typeof table.$inferSelect;

test('mysql binary and varbinary buffer modes infer Buffer', () => {
	expectTypeOf<SelectRow['binaryString']>().toEqualTypeOf<string | null>();
	expectTypeOf<SelectRow['binaryBuffer']>().toEqualTypeOf<Buffer | null>();
	expectTypeOf<SelectRow['varbinaryString']>().toEqualTypeOf<string | null>();
	expectTypeOf<SelectRow['varbinaryBuffer']>().toEqualTypeOf<Buffer | null>();
});

test('mysql binary and varbinary buffer modes preserve raw bytes', ({ expect }) => {
	const bytes = Buffer.from([0xff, 0xfe, 0xfd, 0x00]);
	const uint8 = new Uint8Array([0xff, 0xfe, 0xfd, 0x00]);

	expect(table.binaryBuffer.mapFromDriverValue(bytes)).toEqual(bytes);
	expect(table.binaryBuffer.mapFromDriverValue(uint8)).toEqual(bytes);
	expect(table.varbinaryBuffer.mapFromDriverValue(bytes)).toEqual(bytes);
	expect(table.varbinaryBuffer.mapFromDriverValue(uint8)).toEqual(bytes);
});

test('mysql binary and varbinary keep the existing string mode by default', ({ expect }) => {
	const bytes = Buffer.from('test');

	expect(table.binaryString.mapFromDriverValue(bytes)).toBe('test');
	expect(table.varbinaryString.mapFromDriverValue(bytes)).toBe('test');
});
