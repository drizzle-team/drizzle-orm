import { expect, test } from 'vitest';
import { mapResultRow } from '../src/utils.ts';
import { pgTable, text } from '../src/pg-core/index.ts';
import { Column } from '../src/column.ts';

const users = pgTable('users', {
	id: text('id'),
	name: text('name'),
});

const profile = pgTable('profile', {
	id: text('id'),
	bio: text('bio'),
	theme: text('theme'),
});

test('mapResultRow left join null propagation', () => {
	const columns = [
		{ path: ['user', 'id'], field: users.id },
		{ path: ['user', 'name'], field: users.name },
		{ path: ['profile', 'bio'], field: profile.bio },
		{ path: ['profile', 'theme'], field: profile.theme },
	] as any[];

	const joinsNotNullableMap = {
		users: true,
		profile: false,
	};

	// Test 1: First property is null, second is non-null -> object NOT null
	const result1 = mapResultRow(columns, ['1', 'John', null, 'dark'], joinsNotNullableMap);
	expect(result1).toEqual({
		user: { id: '1', name: 'John' },
		profile: { bio: null, theme: 'dark' },
	});

	// Test 2: All properties null -> object SHOULD be null
	const result2 = mapResultRow(columns, ['1', 'John', null, null], joinsNotNullableMap);
	expect(result2).toEqual({
		user: { id: '1', name: 'John' },
		profile: null,
	});

	// Test 3: Multi-level nesting
	const columnsMulti = [
		{ path: ['user', 'id'], field: users.id },
		{ path: ['user', 'settings', 'bio'], field: profile.bio },
		{ path: ['user', 'settings', 'theme'], field: profile.theme },
	] as any[];

	const result3 = mapResultRow(columnsMulti, ['1', null, 'dark'], joinsNotNullableMap);
	expect(result3).toEqual({
		user: { id: '1', settings: { bio: null, theme: 'dark' } },
	});

	const result4 = mapResultRow(columnsMulti, ['1', null, null], joinsNotNullableMap);
	expect(result4).toEqual({
		user: { id: '1', settings: null },
	});
});
