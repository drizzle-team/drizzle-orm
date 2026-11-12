import { describe, expect, test } from 'vitest';
import { customType, integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const nullOnEmpty = customType<{ data: string | null; driverData: string }>({
	dataType() {
		return 'text';
	},
	fromDriver(value) {
		return value === '' ? null : value;
	},
});

const users = pgTable('users', {
	id: integer('id').notNull(),
	name: text('name'),
});

const pets = pgTable('pets', {
	id: integer('id'),
	name: text('name'),
	nickname: nullOnEmpty('nickname'),
});

// https://github.com/drizzle-team/drizzle-orm/issues/1603
describe('mapResultRow nested partial select nullification', () => {
	test('left join: first column null, later column non-null keeps object', () => {
		const columns = orderSelectedFields({
			id: users.id,
			pet: { name: pets.name, id: pets.id },
		});

		const result = mapResultRow(columns, [1, null, 10], { users: true, pets: false });

		expect(result).toEqual({ id: 1, pet: { name: null, id: 10 } });
	});

	test('left join: result does not depend on column order', () => {
		const columns = orderSelectedFields({
			id: users.id,
			pet: { id: pets.id, name: pets.name },
		});

		const result = mapResultRow(columns, [1, 10, null], { users: true, pets: false });

		expect(result).toEqual({ id: 1, pet: { id: 10, name: null } });
	});

	test('left join: all columns null nullifies object', () => {
		const columns = orderSelectedFields({
			id: users.id,
			pet: { name: pets.name, id: pets.id },
		});

		const result = mapResultRow(columns, [1, null, null], { users: true, pets: false });

		expect(result).toEqual({ id: 1, pet: null });
	});

	test('inner join: all columns null keeps object with null fields', () => {
		const columns = orderSelectedFields({
			id: users.id,
			pet: { name: pets.name, id: pets.id },
		});

		const result = mapResultRow(columns, [1, null, null], { users: true, pets: true });

		expect(result).toEqual({ id: 1, pet: { name: null, id: null } });
	});

	test('left join: decoder mapping non-null raw value to null keeps object', () => {
		const columns = orderSelectedFields({
			id: users.id,
			pet: { nickname: pets.nickname, name: pets.name },
		});

		const result = mapResultRow(columns, [1, '', null], { users: true, pets: false });

		expect(result).toEqual({ id: 1, pet: { nickname: null, name: null } });
	});
});
