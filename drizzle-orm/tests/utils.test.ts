import { expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

// Regression tests for https://github.com/drizzle-team/drizzle-orm/issues/1603
//
// Bug: a nested partial-select object built from a left-joined (nullable) table
// was incorrectly nulled out whenever the FIRST column read for that object
// happened to be null, even if a LATER column from the same table was non-null.
// The fix makes `mapResultRow` only nullify the nested object when every one
// of its own columns is null.

const orgBrandingTable = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

test('keeps nested object when first column is null but a later column is non-null', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	const result = mapResultRow(columns, [null, '#1a8cff'], { org_branding: false });

	expect(result).toEqual({
		branding: { logo: null, panelBackground: '#1a8cff' },
	});
});

test('is independent of column order (last column null, first non-null)', () => {
	const columns = orderSelectedFields({
		branding: {
			panelBackground: orgBrandingTable.panelBackground,
			logo: orgBrandingTable.logo,
		},
	});

	const result = mapResultRow(columns, ['#1a8cff', null], { org_branding: false });

	expect(result).toEqual({
		branding: { panelBackground: '#1a8cff', logo: null },
	});
});

test('still nullifies the nested object when every column is null and the join is nullable', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	const result = mapResultRow(columns, [null, null], { org_branding: false });

	expect(result).toEqual({ branding: null });
});

test('keeps the nested object when every column is null but the join is not nullable', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	const result = mapResultRow(columns, [null, null], { org_branding: true });

	expect(result).toEqual({ branding: { logo: null, panelBackground: null } });
});
