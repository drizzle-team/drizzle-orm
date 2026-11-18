import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { getTableName } from '~/table.ts';
import { mapResultRow } from '~/utils.ts';

describe('mapResultRow nested partial select with left join', () => {
	const orgTable = pgTable('org', {
		name: text('name').notNull(),
		slug: text('slug'),
	});

	const orgBrandingTable = pgTable('org_branding', {
		logo: text('logo'),
		panelBackgroundColor: text('panel_background_colour'),
	});

	// Simulates a left join: the base table is not-nullable, the joined table is nullable.
	const joinsNotNullableMap = {
		[getTableName(orgTable)]: true,
		[getTableName(orgBrandingTable)]: false,
	};

	test('keeps nested partial object when a later column is non-null', () => {
		const selectedFields = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['slug'], field: orgTable.slug },
			{
				path: ['branding', 'logo'],
				field: orgBrandingTable.logo,
			},
			{
				path: ['branding', 'panelBackgroundColor'],
				field: orgBrandingTable.panelBackgroundColor,
			},
		];

		// logo (first inner column) is null in the DB, panelBackgroundColor is '#1a8cff'
		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];

		const result = mapResultRow(selectedFields, row, joinsNotNullableMap) as Record<string, any>;

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackgroundColor: '#1a8cff',
			},
		});
	});

	test('nullifies nested partial object when all joined columns are null', () => {
		const selectedFields = [
			{ path: ['name'], field: orgTable.name },
			{
				path: ['branding', 'logo'],
				field: orgBrandingTable.logo,
			},
			{
				path: ['branding', 'panelBackgroundColor'],
				field: orgBrandingTable.panelBackgroundColor,
			},
		];

		// all columns of the joined table are null -> no joined row, object should be null
		const row = ['Test org 2', null, null];

		const result = mapResultRow(selectedFields, row, joinsNotNullableMap) as Record<string, any>;

		expect(result).toEqual({
			name: 'Test org 2',
			branding: null,
		});
	});
});
