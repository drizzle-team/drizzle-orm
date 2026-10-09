import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const org = pgTable('org', {
	name: text('name'),
});

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
	footer: text('footer'),
});

describe('mapResultRow nested partial selects', () => {
	test.each([false, true])('preserves a joined object regardless of column order (reversed: %s)', (reversed) => {
		const branding = reversed
			? { panelBackground: orgBranding.panelBackground, logo: orgBranding.logo }
			: { logo: orgBranding.logo, panelBackground: orgBranding.panelBackground };
		const columns = orderSelectedFields({ name: org.name, branding });
		const row = reversed ? ['Test org 2', '#1a8cff', null] : ['Test org 2', null, '#1a8cff'];

		expect(mapResultRow(columns, row, { org: true, org_branding: false })).toEqual({
			name: 'Test org 2',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	test.each(['', '#1a8cff'])('preserves a non-null value between null columns (%j)', (panelBackground) => {
		const columns = orderSelectedFields({ branding: orgBranding });

		expect(mapResultRow(columns, [null, panelBackground, null], { org_branding: false })).toEqual({
			branding: { logo: null, panelBackground, footer: null },
		});
	});

	test('nullifies a nullable joined object when all selected columns are null', () => {
		const columns = orderSelectedFields({ branding: orgBranding });

		expect(mapResultRow(columns, [null, null, null], { org_branding: false })).toEqual({ branding: null });
	});

	test.each([undefined, { org_branding: true }])('preserves null fields without a nullable join (%j)', (joins) => {
		const columns = orderSelectedFields({ branding: orgBranding });

		expect(mapResultRow(columns, [null, null, null], joins)).toEqual({
			branding: { logo: null, panelBackground: null, footer: null },
		});
	});

	test('preserves a nested object containing columns from different tables', () => {
		const columns = orderSelectedFields({ branding: { logo: orgBranding.logo, name: org.name } });

		expect(mapResultRow(columns, [null, null], { org: false, org_branding: false })).toEqual({
			branding: { logo: null, name: null },
		});
	});
});
