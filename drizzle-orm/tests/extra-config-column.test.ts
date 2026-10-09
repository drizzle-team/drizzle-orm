import { describe, expect, test } from 'vitest';
import { gelTable, getTableConfig as getGelTableConfig, integer as gelInteger } from '~/gel-core/index.ts';
import type { ExtraConfigColumn } from '~/pg-core/index.ts';
import { customType, getTableConfig, integer, pgTable, varchar } from '~/pg-core/index.ts';

describe('pg', () => {
	const citext = customType<{ data: string }>({
		dataType: () => 'citext',
	});

	const captured: Record<string, ExtraConfigColumn> = {};

	const table = pgTable('table', {
		id: integer('id'),
		name: varchar('name', { length: 256 }),
		email: citext('email'),
		tags: integer('tags').array(),
	}, (t) => {
		Object.assign(captured, t);
		return [];
	});

	// The extra config callback is invoked lazily.
	getTableConfig(table);

	test.each([
		['id', 'integer'],
		['name', 'varchar(256)'],
		['email', 'citext'],
		['tags', 'integer[]'],
	])('%s: getSQLType() resolves to the underlying column type', (name, sqlType) => {
		expect(captured[name]!.getSQLType()).toBe(sqlType);
	});

	test('getSQLType() matches the table column it stands in for', () => {
		expect(captured['id']!.getSQLType()).toBe(table.id.getSQLType());
	});
});

describe('gel', () => {
	const captured: Record<string, { getSQLType: () => string }> = {};

	const table = gelTable('table', {
		id: gelInteger('id'),
	}, (t) => {
		Object.assign(captured, t);
		return [];
	});

	getGelTableConfig(table);

	test('getSQLType() resolves to the underlying column type', () => {
		expect(captured['id']!.getSQLType()).toBe('integer');
	});
});
