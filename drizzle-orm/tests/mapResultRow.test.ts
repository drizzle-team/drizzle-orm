import { describe, expect, it } from 'vitest';
import { customType, integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

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
});

const pets = pgTable('pets', {
	id: integer('id'),
	name: text('name'),
	nickname: nullOnEmpty('nickname'),
});

describe('mapResultRow', () => {
	it('keeps a left-joined object when a later column is non-null', () => {
		const fields = [
			{ path: ['id'], field: users.id },
			{ path: ['pet', 'name'], field: pets.name },
			{ path: ['pet', 'id'], field: pets.id },
		];

		expect(mapResultRow(fields, [1, null, 10], { users: true, pets: false })).toEqual({
			id: 1,
			pet: { name: null, id: 10 },
		});
	});

	it('does not depend on selected column order', () => {
		const fields = [
			{ path: ['id'], field: users.id },
			{ path: ['pet', 'id'], field: pets.id },
			{ path: ['pet', 'name'], field: pets.name },
		];

		expect(mapResultRow(fields, [1, 10, null], { users: true, pets: false })).toEqual({
			id: 1,
			pet: { id: 10, name: null },
		});
	});

	it('nullifies a left-joined object when every raw column is null', () => {
		const fields = [
			{ path: ['id'], field: users.id },
			{ path: ['pet', 'name'], field: pets.name },
			{ path: ['pet', 'id'], field: pets.id },
		];

		expect(mapResultRow(fields, [1, null, null], { users: true, pets: false })).toEqual({ id: 1, pet: null });
	});

	it('keeps an inner-joined object when every selected value is null', () => {
		const fields = [
			{ path: ['id'], field: users.id },
			{ path: ['pet', 'name'], field: pets.name },
			{ path: ['pet', 'id'], field: pets.id },
		];

		expect(mapResultRow(fields, [1, null, null], { users: true, pets: true })).toEqual({
			id: 1,
			pet: { name: null, id: null },
		});
	});

	it('uses raw values when a custom decoder returns null', () => {
		const fields = [
			{ path: ['pet', 'nickname'], field: pets.nickname },
			{ path: ['pet', 'name'], field: pets.name },
		];

		expect(mapResultRow(fields, ['', null], { pets: false })).toEqual({ pet: { nickname: null, name: null } });
		expect(mapResultRow(fields, [null, 'Fluffy'], { pets: false })).toEqual({
			pet: { nickname: null, name: 'Fluffy' },
		});
	});
});
