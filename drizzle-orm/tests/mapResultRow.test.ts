import { describe, expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const table = pgTable('t1', {
	id: integer('id'),
	val1: text('val1'),
	val2: text('val2'),
});

describe('mapResultRow nested nullify', () => {
	test('should not nullify nested object if a later column is not null', () => {
		const columns = [
			{
				path: ['val1'],
				field: table.val1,
			},
			{
				path: ['nested', 'val1'],
				field: table.val1,
			},
			{
				path: ['nested', 'val2'],
				field: table.val2,
			},
		];

		const row = ['some_val', null, 'not_null_value'];
		const joinsNotNullableMap = { t1: false };

		const result = mapResultRow<{ val1: string; nested: { val1: string | null; val2: string } | null }>(
			columns,
			row,
			joinsNotNullableMap,
		);

		expect(result).toEqual({
			val1: 'some_val',
			nested: {
				val1: null,
				val2: 'not_null_value',
			},
		});
	});
});
