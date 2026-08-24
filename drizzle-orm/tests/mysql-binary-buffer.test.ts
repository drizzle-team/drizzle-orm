import { Buffer } from 'node:buffer';
import { describe, test } from 'vitest';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const table = mysqlTable('binary_buffer_test', {
	binary: binary('binary', { length: 11 }).notNull(),
	varbinary: varbinary('varbinary', { length: 11 }).notNull(),
});

describe.concurrent('MySQL binary columns', () => {
	test('preserve Buffer values returned by mysql2', ({ expect }) => {
		const value = Buffer.from('hello world');

		const binaryValue = table.binary.mapFromDriverValue(value);
		const varbinaryValue = table.varbinary.mapFromDriverValue(value);

		expect(Buffer.isBuffer(binaryValue)).toBe(true);
		expect(Buffer.isBuffer(varbinaryValue)).toBe(true);
		expect(binaryValue).toEqual(value);
		expect(varbinaryValue).toEqual(value);
	});

	test('convert string values returned by string-based adapters to Buffer', ({ expect }) => {
		const binaryValue = table.binary.mapFromDriverValue('hello world');
		const varbinaryValue = table.varbinary.mapFromDriverValue('hello world');

		expect(binaryValue).toEqual(Buffer.from('hello world'));
		expect(varbinaryValue).toEqual(Buffer.from('hello world'));
	});
});
