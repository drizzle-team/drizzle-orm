import { describe, test } from 'vitest';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';
import { pgTable, serial, timestamp } from '~/pg-core/index.ts';

const usersTable = pgTable('users', {
	deletedAt: timestamp('deleted_at'),
	id: serial('id'),
});

describe.concurrent('mapResultRow', () => {
	test('should not nullify nested object on left join when first column is null but subsequent columns are non-null', ({ expect }) => {
		const fields = orderSelectedFields({
			user: {
				deletedAt: usersTable.deletedAt,
				id: usersTable.id,
			},
		});

		const joinsNotNullableMap = { users: false };
		const row = [null, 1];

		const result = mapResultRow<{ user: { deletedAt: Date | null; id: number } | null }>(
			fields,
			row,
			joinsNotNullableMap,
		);

		expect(result).toEqual({
			user: {
				deletedAt: null,
				id: 1,
			},
		});
	});

	test('should nullify nested object on left join when all columns are null', ({ expect }) => {
		const fields = orderSelectedFields({
			user: {
				deletedAt: usersTable.deletedAt,
				id: usersTable.id,
			},
		});

		const joinsNotNullableMap = { users: false };
		const row = [null, null];

		const result = mapResultRow<{ user: { deletedAt: Date | null; id: number } | null }>(
			fields,
			row,
			joinsNotNullableMap,
		);

		expect(result).toEqual({
			user: null,
		});
	});
});
