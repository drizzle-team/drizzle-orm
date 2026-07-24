import { describe, it } from 'vitest';
import { text } from '~/sqlite-core/columns/text.ts';
import { sqliteTable } from '~/sqlite-core/table.ts';
import { mapResultRow } from '~/utils.ts';

const users = sqliteTable('users', {
	name: text('name'),
});

const pets = sqliteTable('pets', {
	name: text('name'),
	species: text('species'),
});

describe('mapResultRow', () => {
	it('does not nullify a nullable joined object when a later column from the same table is not null', ({ expect }) => {
		const result = mapResultRow(
			[
				{ path: ['user', 'name'], field: users.name },
				{ path: ['pet', 'name'], field: pets.name },
				{ path: ['pet', 'species'], field: pets.species },
			],
			['Jane', null, 'cat'],
			{ users: true, pets: false },
		);

		expect(result).toEqual({
			user: { name: 'Jane' },
			pet: { name: null, species: 'cat' },
		});
	});

	it('nullifies a nullable joined object when all columns from the same table are null', ({ expect }) => {
		const result = mapResultRow(
			[
				{ path: ['user', 'name'], field: users.name },
				{ path: ['pet', 'name'], field: pets.name },
				{ path: ['pet', 'species'], field: pets.species },
			],
			['Jane', null, null],
			{ users: true, pets: false },
		);

		expect(result).toEqual({
			user: { name: 'Jane' },
			pet: null,
		});
	});
});
