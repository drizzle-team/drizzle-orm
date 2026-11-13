import { describe, test } from 'vitest';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const bills = sqliteTable('bills', {
	id: integer('id').primaryKey(),
});

const cheques = sqliteTable('cheques', {
	id: integer('id').primaryKey(),
	serial: text('serial'),
});

const banks = sqliteTable('banks', {
	id: integer('id').primaryKey(),
	name: text('name'),
});

describe.concurrent('mapResultRow nullify', () => {
	test('nullifies a depth-1 nested object on an unmatched left join', ({ expect }) => {
		const columns = orderSelectedFields({
			cheque: { id: cheques.id, serial: cheques.serial },
		});

		const result = mapResultRow(columns, [null, null], { cheques: false });

		expect(result).toEqual({ cheque: null });
	});

	test('nullifies a depth-2 nested object on an unmatched left join', ({ expect }) => {
		const columns = orderSelectedFields({
			bill: { id: bills.id, cheque: { id: cheques.id, serial: cheques.serial } },
		});

		const result = mapResultRow(columns, [1, null, null], { bills: true, cheques: false });

		expect(result).toEqual({ bill: { id: 1, cheque: null } });
	});

	test('nullifies a depth-3 nested object on an unmatched left join', ({ expect }) => {
		const columns = orderSelectedFields({
			bill: { id: bills.id, cheque: { id: cheques.id, bank: { id: banks.id, name: banks.name } } },
		});

		const result = mapResultRow(
			columns,
			[1, 5, null, null],
			{ bills: true, cheques: true, banks: false },
		);

		expect(result).toEqual({ bill: { id: 1, cheque: { id: 5, bank: null } } });
	});

	test('keeps a nested object when the left join matches', ({ expect }) => {
		const columns = orderSelectedFields({
			bill: { id: bills.id, cheque: { id: cheques.id, serial: cheques.serial } },
		});

		const result = mapResultRow(columns, [1, 5, 'A-1'], { bills: true, cheques: false });

		expect(result).toEqual({ bill: { id: 1, cheque: { id: 5, serial: 'A-1' } } });
	});
});
