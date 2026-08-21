import { expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const joinedTable = pgTable('joined', {
	nullableField: text('nullable_field'),
	nonNullField: text('non_null_field').notNull(),
});

test('mapResultRow keeps nested object when first joined column is null', () => {
	const fields = {
		joined: {
			nullableField: joinedTable.nullableField,
			nonNullField: joinedTable.nonNullField,
		},
	};

	const columns = orderSelectedFields(fields);

	const result = mapResultRow(
		columns,
		[null, 'value'],
		{
			joined: false,
		},
	);

	expect(result).toEqual({
		joined: {
			nullableField: null,
			nonNullField: 'value',
		},
	});
});

test('mapResultRow nullifies nested object when all joined columns are null', () => {
	const fields = {
		joined: {
			nullableField: joinedTable.nullableField,
			nonNullField: joinedTable.nonNullField,
		},
	};

	const columns = orderSelectedFields(fields);

	const result = mapResultRow(
		columns,
		[null, null],
		{
			joined: false,
		},
	);

	expect(result).toEqual({
		joined: null,
	});
});