import { describe, expect, it } from 'vitest';
import { pgTable, text } from '~/pg-core';
import { mapResultRow, orderSelectedFields } from '~/utils';

const branding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

const fields = orderSelectedFields({
	branding: {
		logo: branding.logo,
		panelBackground: branding.panelBackground,
	},
});

describe('mapResultRow nullable nested partial selects', () => {
	it('preserves a joined object when a later field is non-null', () => {
		expect(
			mapResultRow(fields, [null, '#1a8cff'], { org_branding: false }),
		).toEqual({
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	it('still nullifies the joined object when every selected field is null', () => {
		expect(mapResultRow(fields, [null, null], { org_branding: false })).toEqual({
			branding: null,
		});
	});
});