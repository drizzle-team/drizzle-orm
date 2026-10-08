import { describe, expect, it } from 'vitest';
import { sqliteTable, text } from '~/sqlite-core';
import { mapResultRow } from '~/utils.ts';

const branding = sqliteTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

describe('mapResultRow', () => {
	it('keeps a nullable joined object when a later column is non-null', () => {
		const fields = [
			{ path: ['branding', 'logo'], field: branding.logo },
			{ path: ['branding', 'panelBackground'], field: branding.panelBackground },
		] as const;

		expect(mapResultRow(fields, [null, '#1a8cff'], { org_branding: false })).toEqual({
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});
});
