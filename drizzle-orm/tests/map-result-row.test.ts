import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const org = pgTable('org', {
	id: text('id'),
	name: text('name'),
});

const orgBranding = pgTable('orgBranding', {
	orgId: text('org_id'),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

// `org` is the base table, `orgBranding` is LEFT JOINed (nullable).
const joinsNotNullableMap = { org: true, orgBranding: false };

describe('mapResultRow — nested partial select over a left join (#1603)', () => {
	test('keeps the nested object when a non-null column follows a null column of the same table', () => {
		const fields = orderSelectedFields({
			name: org.name,
			branding: {
				logo: orgBranding.logo, // null in the row
				panelBackground: orgBranding.panelBackground, // present in the row
			},
		});

		const result = mapResultRow(fields, ['Test org', null, '#1a8cff'], joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	test('is independent of column order (non-null column first)', () => {
		const fields = orderSelectedFields({
			name: org.name,
			branding: {
				panelBackground: orgBranding.panelBackground, // present in the row
				logo: orgBranding.logo, // null in the row
			},
		});

		const result = mapResultRow(fields, ['Test org', '#1a8cff', null], joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			branding: { panelBackground: '#1a8cff', logo: null },
		});
	});

	test('still nullifies the nested object when the left join did not match (all columns null)', () => {
		const fields = orderSelectedFields({
			name: org.name,
			branding: {
				logo: orgBranding.logo,
				panelBackground: orgBranding.panelBackground,
			},
		});

		const result = mapResultRow(fields, ['Test org', null, null], joinsNotNullableMap);

		expect(result).toEqual({ name: 'Test org', branding: null });
	});
});
