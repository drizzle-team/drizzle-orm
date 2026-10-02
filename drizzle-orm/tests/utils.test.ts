import { describe, it } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const branding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe.concurrent('mapResultRow', () => {
	it('keeps a nullable joined object when a later column from the same table is non-null', ({ expect }) => {
		const fields = orderSelectedFields({
			branding: {
				logo: branding.logo,
				panelBackground: branding.panelBackground,
			},
		});

		const result = mapResultRow(
			fields,
			[null, '#1a8cff'],
			{ org_branding: false },
		);

		expect(result).toEqual({
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	it('nullifies a nullable joined object when every selected column is null', ({ expect }) => {
		const fields = orderSelectedFields({
			branding: {
				logo: branding.logo,
				panelBackground: branding.panelBackground,
			},
		});

		expect(mapResultRow(fields, [null, null], { org_branding: false })).toEqual({ branding: null });
	});
});
