import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const orgTable = pgTable('org', {
	id: text('id'),
	name: text('name'),
	slug: text('slug'),
});

const orgBrandingTable = pgTable('org_branding', {
	orgId: text('org_id'),
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

describe('mapResultRow', () => {
	test('nested partial select: first column null, subsequent columns non-null should not nullify nested object', () => {
		// Reproduces: https://github.com/drizzle-team/drizzle-orm/issues/1603
		// When first selected column of a left-joined nested object is null but later
		// columns are non-null, the entire nested object should NOT be nullified.
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo, // null in DB
				panelBackground: orgBrandingTable.panelBackground, // "#1a8cff" in DB
			},
		});

		// Simulate a row where logo is null but panelBackground has a value
		// Fields order: name, slug, branding.logo, branding.panelBackground
		const row = ['Test org', 'test-org', null, '#1a8cff'];

		// joinsNotNullableMap: 'org' table is always present (inner), 'org_branding' is left-joined (nullable)
		const joinsNotNullableMap = { org: true, org_branding: false };

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

	test('nested partial select: all columns null from left join should nullify nested object', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		});

		// Simulate a row where both branding columns are null (no matching left join row)
		const row = ['Test org', 'test-org', null, null];

		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			slug: 'test-org',
			branding: null,
		});
	});

	test('nested partial select: first column non-null, second null should not nullify nested object', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				panelBackground: orgBrandingTable.panelBackground, // "#1a8cff"
				logo: orgBrandingTable.logo, // null
			},
		});

		const row = ['Test org', 'test-org', '#1a8cff', null];

		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			slug: 'test-org',
			branding: {
				panelBackground: '#1a8cff',
				logo: null,
			},
		});
	});
});
