import { test } from 'vitest';
import type { AnyColumn } from '~/column.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

test('does not nullify nested object when only the first same-table joined column is null', ({ expect }) => {
	const columns: SelectedFieldsOrdered<AnyColumn> = [
		{ path: ['branding', 'logo'], field: orgBranding.logo },
		{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
	];

	const result = mapResultRow(
		columns,
		[null, '#1a8cff'],
		{ org_branding: false },
	);

	expect(result).toEqual({
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});
});

test('nullifies nested object when all same-table joined columns are null', ({ expect }) => {
	const columns: SelectedFieldsOrdered<AnyColumn> = [
		{ path: ['branding', 'logo'], field: orgBranding.logo },
		{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
	];

	const result = mapResultRow(
		columns,
		[null, null],
		{ org_branding: false },
	);

	expect(result).toEqual({
		branding: null,
	});
});
