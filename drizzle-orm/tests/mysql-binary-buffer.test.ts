import { Buffer } from 'node:buffer';
import { describe, test } from 'vitest';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const table = mysqlTable('binary_buffer_test', {
	binary: binary('binary', { length: 11 }).notNull(),
	varbinary: varbinary('varbinary', { length: 11 }).notNull(),
});

describe.concurrent('MySQL binary columns', () => {
	test('preserve Buffer values returned by mysql2', ({ expect }) => {
		const value = Buffer.from([0x00, 0xff, 0x80, 0x31]);

		const binaryValue = table.binary.mapFromDriverValue(value);
		const varbinaryValue = table.varbinary.mapFromDriverValue(value);

		expect(Buffer.isBuffer(binaryValue)).toBe(true);
		expect(Buffer.isBuffer(varbinaryValue)).toBe(true);
		expect(binaryValue).toEqual(value);
		expect(varbinaryValue).toEqual(value);
	});

	test('convert Uint8Array values returned by binary adapters to Buffer without changing bytes', ({ expect }) => {
		const value = new Uint8Array([0x00, 0xff, 0x80, 0x31]);

		const binaryValue = table.binary.mapFromDriverValue(value);
		const varbinaryValue = table.varbinary.mapFromDriverValue(value);

		expect(Buffer.isBuffer(binaryValue)).toBe(true);
		expect(Buffer.isBuffer(varbinaryValue)).toBe(true);
		expect(binaryValue).toEqual(Buffer.from(value));
		expect(varbinaryValue).toEqual(Buffer.from(value));
	});

	test('convert legacy string driver values to Buffer', ({ expect }) => {
		const binaryValue = table.binary.mapFromDriverValue('hello world');
		const varbinaryValue = table.varbinary.mapFromDriverValue('hello world');

		expect(binaryValue).toEqual(Buffer.from('hello world'));
		expect(varbinaryValue).toEqual(Buffer.from('hello world'));
	});
});
