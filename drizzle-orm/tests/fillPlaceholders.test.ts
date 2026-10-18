import { describe, expect, test } from 'vitest';
import { fillPlaceholders, Param, Placeholder } from '~/sql/sql.ts';
import { integer, sqliteTable } from '~/sqlite-core/index.ts';

describe('fillPlaceholders', () => {
	test('preserves null for column with encoder (e.g. SQLiteBoolean)', () => {
		const testTable = sqliteTable('test_table', {
			id: integer('id').primaryKey(),
			flag: integer('flag', { mode: 'boolean' }),
		});

		const param = new Param(new Placeholder('flag'), testTable.flag);
		const result = fillPlaceholders([param], { flag: null });

		expect(result).toEqual([null]);
	});

	test('maps boolean true to 1 and false to 0', () => {
		const testTable = sqliteTable('test_table', {
			id: integer('id').primaryKey(),
			flag: integer('flag', { mode: 'boolean' }),
		});

		const param = new Param(new Placeholder('flag'), testTable.flag);
		expect(fillPlaceholders([param], { flag: true })).toEqual([1]);
		expect(fillPlaceholders([param], { flag: false })).toEqual([0]);
	});
});

describe('SQLiteBoolean', () => {
	test('mapToDriverValue handles null gracefully', () => {
		const testTable = sqliteTable('test_table', {
			flag: integer('flag', { mode: 'boolean' }),
		});

		expect(testTable.flag.mapToDriverValue(null as any)).toBeNull();
		expect(testTable.flag.mapToDriverValue(true)).toBe(1);
		expect(testTable.flag.mapToDriverValue(false)).toBe(0);
	});
});
