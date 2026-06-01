import { expect, test } from 'vitest';

import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const org = pgTable('org', {
	name: text('name'),
	slug: text('slug'),
});

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

// org is the base table (not nullable), org_branding is left-joined (nullable).
const joinsNotNullableMap = { org: true, org_branding: false };

test('nested partial select keeps a left-joined object whose first column is null (#1603)', () => {
	const columns = orderSelectedFields({
		name: org.name,
		slug: org.slug,
		branding: {
			logo: orgBranding.logo, // null in the row
			panelBackground: orgBranding.panelBackground, // has a value
		},
	});
	const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];

	expect(mapResultRow(columns, row, joinsNotNullableMap)).toStrictEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: { logo: null, panelBackground: '#1a8cff' },
	});
});

test('column order does not affect a partially-null left-joined object (#1603)', () => {
	// Same data, columns swapped so the non-null column comes first.
	const columns = orderSelectedFields({
		name: org.name,
		slug: org.slug,
		branding: {
			panelBackground: orgBranding.panelBackground, // has a value
			logo: orgBranding.logo, // null
		},
	});
	const row = ['Test org 2', 'test-org-2', '#1a8cff', null];

	expect(mapResultRow(columns, row, joinsNotNullableMap)).toStrictEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: { panelBackground: '#1a8cff', logo: null },
	});
});

test('a left-joined object is still nullified when ALL of its columns are null', () => {
	const columns = orderSelectedFields({
		name: org.name,
		slug: org.slug,
		branding: {
			logo: orgBranding.logo,
			panelBackground: orgBranding.panelBackground,
		},
	});
	const row = ['Test org 2', 'test-org-2', null, null];

	expect(mapResultRow(columns, row, joinsNotNullableMap)).toStrictEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: null,
	});
});
