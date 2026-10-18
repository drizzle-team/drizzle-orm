import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgsTable = pgTable('orgs', {
	name: text('name'),
	slug: text('slug'),
});

const orgBrandingTable = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe.concurrent('mapResultRow with left joins', () => {
	test('nested partial select preserves object when first column is null but subsequent column has value', () => {
		const fields = [
			{ path: ['name'], field: orgsTable.name },
			{ path: ['slug'], field: orgsTable.slug },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const joinsNotNullableMap = {
			orgs: true,
			org_branding: false,
		};

		// First joined column is null, second joined column has non-null value
		const row = ['Test org', 'test-org', null, '#1a8cff'];

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			slug: 'test-org',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('nested partial select nullifies object when all joined columns are null', () => {
		const fields = [
			{ path: ['name'], field: orgsTable.name },
			{ path: ['slug'], field: orgsTable.slug },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const joinsNotNullableMap = {
			orgs: true,
			org_branding: false,
		};

		// Both joined columns are null
		const row = ['Test org', 'test-org', null, null];

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			slug: 'test-org',
			branding: null,
		});
	});
});
