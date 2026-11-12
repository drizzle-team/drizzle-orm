import { expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

test('mapResultRow with left join nested partial select preserves non-null fields when first field is null', () => {
	const org = pgTable('org', {
		name: text('name'),
	});
	const orgBranding = pgTable('org_branding', {
		logo: text('logo'),
		panelBackground: text('panel_background'),
	});

	const columns = [
		{ path: ['name'], field: org.name },
		{ path: ['branding', 'logo'], field: orgBranding.logo },
		{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
	];

	const joinsNotNullableMap = {
		org_branding: false, // LEFT JOIN
	};

	// Scenario 1: First column in joined table is null, second has a value (Issue #1603)
	const row = ['Test Org', null, '#1a8cff'];
	const result = mapResultRow(columns as any, row, joinsNotNullableMap);

	expect(result).toEqual({
		name: 'Test Org',
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});

	// Scenario 2: Both columns in joined table are null (no matching joined row)
	const emptyJoinRow = ['Test Org', null, null];
	const emptyResult = mapResultRow(columns as any, emptyJoinRow, joinsNotNullableMap);

	expect(emptyResult).toEqual({
		name: 'Test Org',
		branding: null,
	});
});
