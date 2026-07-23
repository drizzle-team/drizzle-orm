import { describe, test } from 'vitest';
import { pgTable, serial, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgTable = pgTable('org', {
	id: serial('id'),
	name: text('name'),
});

const orgBrandingTable = pgTable('org_branding', {
	id: serial('id'),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe('mapResultRow left join bug', () => {
	test('nested object should not be nullified if any value is not null', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});
});
