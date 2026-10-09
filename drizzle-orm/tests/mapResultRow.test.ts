import { describe, expect, test } from 'vitest';
import { eq } from '~/expressions.ts';
import { integer, pgTable, text, serial } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const orgTable = pgTable('org', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
});

const orgBrandingTable = pgTable('org_branding', {
	id: serial('id').primaryKey(),
	orgId: integer('org_id').notNull(),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe('mapResultRow', () => {
	test('nested partial select with left join should not nullify object when first column is null', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		};

		const columns = orderSelectedFields(fields);

		// Simulate row: name='Test org', slug='test-org', logo=null, panelBackground='#1a8cff'
		const row = ['Test org', 'test-org', null, '#1a8cff'];

		// org_branding is a left join (nullable)
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			slug: 'test-org',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('nested partial select with left join should nullify when ALL columns are null', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		};

		const columns = orderSelectedFields(fields);

		// Simulate row: name='Test org', slug='test-org', logo=null, panelBackground=null
		const row = ['Test org', 'test-org', null, null];

		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			slug: 'test-org',
			branding: null,
		});
	});

	test('nested partial select with left join and swapped column order should work', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				panelBackground: orgBrandingTable.panelBackground,
				logo: orgBrandingTable.logo,
			},
		};

		const columns = orderSelectedFields(fields);

		// panelBackground='#1a8cff', logo=null
		const row = ['Test org', 'test-org', '#1a8cff', null];

		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

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
