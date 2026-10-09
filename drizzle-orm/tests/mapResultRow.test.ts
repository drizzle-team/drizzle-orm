import { describe, expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { orderSelectedFields } from '~/utils.ts';
import { mapResultRow } from '~/utils.ts';

const users = pgTable('users', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
});

const cities = pgTable('cities', {
	id: integer('id').notNull(),
	name: text('name'),
	country: text('country'),
});

describe('mapResultRow nested partial select with left join (#1603)', () => {
	test('nested object is not nullified when only the first joined column is null', () => {
		const fields = orderSelectedFields({
			id: users.id,
			city: {
				name: cities.name,
				country: cities.country,
			},
		});

		const row = [1, null, 'USA'];
		const joinsNotNullableMap = { users: true, cities: false };
		const result = mapResultRow<any>(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			id: 1,
			city: { name: null, country: 'USA' },
		});
	});

	test('nested object is nullified when all joined columns are null', () => {
		const fields = orderSelectedFields({
			id: users.id,
			city: {
				name: cities.name,
				country: cities.country,
			},
		});

		const row = [1, null, null];
		const joinsNotNullableMap = { users: true, cities: false };
		const result = mapResultRow<any>(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			id: 1,
			city: null,
		});
	});

	test('nested object stays an object when first column non-null and rest null', () => {
		const fields = orderSelectedFields({
			id: users.id,
			city: {
				name: cities.name,
				country: cities.country,
			},
		});

		const row = [1, 'Paris', null];
		const joinsNotNullableMap = { users: true, cities: false };
		const result = mapResultRow<any>(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			id: 1,
			city: { name: 'Paris', country: null },
		});
	});
});
