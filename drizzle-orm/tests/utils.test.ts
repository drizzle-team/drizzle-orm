import { describe, expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

describe('mapResultRow with nested partial select on left join (#1603)', () => {
	const orgTable = pgTable('org', {
		id: integer('id').primaryKey(),
		name: text('name'),
		slug: text('slug'),
	});

	const orgBrandingTable = pgTable('org_branding', {
		id: integer('id').primaryKey(),
		orgId: integer('org_id'),
		logo: text('logo'),
		panelBackground: text('panel_background_colour'),
	});

	test('should not nullify nested object when the first joined column is null but other columns have values', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo, // null in database
				panelBackground: orgBrandingTable.panelBackground, // '#1a8cff' in database
			},
		};

		const ordered = orderSelectedFields(fields);
		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false }; // left join on org_branding

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('should nullify nested object when ALL joined columns are null (unmatched left join)', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		};

		const ordered = orderSelectedFields(fields);
		const row = ['Test org 2', 'test-org-2', null, null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});
});
