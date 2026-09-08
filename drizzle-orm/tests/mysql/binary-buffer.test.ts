import { describe, test } from 'vitest';
import { binary, varbinary } from '~/mysql-core/index.ts';
import { mysqlTable } from '~/mysql-core/index.ts';

const table = mysqlTable('binary_buffer', {
	bin: binary('bin', { length: 16 }),
	varbin: varbinary('varbin', { length: 16 }),
});

describe('mysql binary/varbinary map to Buffer', () => {
	test('binary maps driver Buffer to Buffer', ({ expect }) => {
		const buf = Buffer.from([0x00, 0x01, 0xff]);
		const res = table.bin.mapFromDriverValue(buf);
		expect(Buffer.isBuffer(res)).toBe(true);
		expect(res).toStrictEqual(buf);
	});

	test('varbinary maps driver Buffer to Buffer', ({ expect }) => {
		const buf = Buffer.from('1010110101001101');
		const res = table.varbin.mapFromDriverValue(buf);
		expect(Buffer.isBuffer(res)).toBe(true);
		expect(res).toStrictEqual(buf);
	});

	test('binary maps driver string to Buffer', ({ expect }) => {
		const res = table.bin.mapFromDriverValue('1');
		expect(Buffer.isBuffer(res)).toBe(true);
		expect((res as Buffer).toString()).toBe('1');
	});

	test('varbinary maps driver Uint8Array to Buffer', ({ expect }) => {
		const res = table.varbin.mapFromDriverValue(new Uint8Array([49]));
		expect(Buffer.isBuffer(res)).toBe(true);
		expect((res as Buffer).toString()).toBe('1');
	});
});
