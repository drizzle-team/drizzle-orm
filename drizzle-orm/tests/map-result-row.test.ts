import { describe, expect, it } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const org = pgTable('org', {
	id: integer('id'),
	name: text('name'),
	slug: text('slug'),
});

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const fields = {
	name: org.name,
	slug: org.slug,
	branding: {
		logo: orgBranding.logo,
		panelBackground: orgBranding.panelBackground,
	},
};

const columns = orderSelectedFields(fields);
const joinsNotNullableMap = { org: true, org_branding: false };

describe('mapResultRow nested partial select (drizzle-team/drizzle-orm#1603)', () => {
	it('keeps the nested object when the first column is null but a later one is not', () => {
		const result = mapResultRow(columns, ['Test org 2', 'test-org-2', null, '#1a8cff'], joinsNotNullableMap);
		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	it('nullifies the nested object when all its columns are null', () => {
		const result = mapResultRow(columns, ['Test org 2', 'test-org-2', null, null], joinsNotNullableMap);
		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});
});
