import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgBrandingTable = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe('mapResultRow nested select with nullable joins (Issue #1603)', () => {
	test('does not nullify nested object when first column is null but subsequent column has value', () => {
		const columns = [
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];
		const row = [null, '#1a8cff'];
		const joinsNotNullableMap = { org_branding: false };

		const mapped = mapResultRow(columns as any, row, joinsNotNullableMap);
		expect(mapped).toEqual({
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('nullifies nested object when all columns from joined table are null', () => {
		const columns = [
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];
		const row = [null, null];
		const joinsNotNullableMap = { org_branding: false };

		const mapped = mapResultRow(columns as any, row, joinsNotNullableMap);
		expect(mapped).toEqual({
			branding: null,
		});
	});
});
