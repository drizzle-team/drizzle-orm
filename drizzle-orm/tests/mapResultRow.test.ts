import { describe, test } from 'vitest';

import type { AnyColumn } from '~/column.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

describe.concurrent('mapResultRow', () => {
	test('keeps a nullable nested object when a later column from the same table is not null', ({ expect }) => {
		const fields: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['branding', 'logo'], field: orgBranding.logo },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		];

		const result = mapResultRow(fields, [null, '#1a8cff'], { org_branding: false });

		expect(result).toEqual({
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('nullifies a nullable nested object when every selected column from that table is null', ({ expect }) => {
		const fields: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['branding', 'logo'], field: orgBranding.logo },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		];

		const result = mapResultRow(fields, [null, null], { org_branding: false });

		expect(result).toEqual({ branding: null });
	});

	test('does not nullify a nested object for a non-nullable join', ({ expect }) => {
		const fields: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['branding', 'logo'], field: orgBranding.logo },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		];

		const result = mapResultRow(fields, [null, null], { org_branding: true });

		expect(result).toEqual({
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});
});
