import { expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

test('nested partial select on left join keeps object when a later join column is non-null (#1603)', () => {
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
		org_branding: false,
	};

	// First joined column null, second non-null — must not nullify whole branding object
	const result = mapResultRow(columns as any, ['Test Org', null, '#1a8cff'], joinsNotNullableMap);
	expect(result).toEqual({
		name: 'Test Org',
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});

	// Order swapped — still preserves both fields
	const columnsSwapped = [
		{ path: ['name'], field: org.name },
		{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		{ path: ['branding', 'logo'], field: orgBranding.logo },
	];
	const swapped = mapResultRow(columnsSwapped as any, ['Test Org', '#1a8cff', null], joinsNotNullableMap);
	expect(swapped).toEqual({
		name: 'Test Org',
		branding: {
			panelBackground: '#1a8cff',
			logo: null,
		},
	});

	// Unmatched left join — all joined columns null — nullify nested object
	const empty = mapResultRow(columns as any, ['Test Org', null, null], joinsNotNullableMap);
	expect(empty).toEqual({
		name: 'Test Org',
		branding: null,
	});
});
