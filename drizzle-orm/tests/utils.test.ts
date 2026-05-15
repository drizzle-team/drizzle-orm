import { expect, test } from 'vitest';

import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const orgs = pgTable('org', {
	name: text('name'),
	slug: text('slug'),
});

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

test('mapResultRow keeps partially-null left-joined nested objects intact', () => {
	const fields = orderSelectedFields({
		name: orgs.name,
		slug: orgs.slug,
		branding: {
			logo: orgBranding.logo,
			panelBackground: orgBranding.panelBackground,
		},
	});

	const result = mapResultRow(fields, ['Test org 2', 'test-org-2', null, '#1a8cff'], {
		org: true,
		org_branding: false,
	});

	expect(result).toEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});
});

test('mapResultRow still nullifies left-joined nested objects when every field is null', () => {
	const fields = orderSelectedFields({
		name: orgs.name,
		slug: orgs.slug,
		branding: {
			logo: orgBranding.logo,
			panelBackground: orgBranding.panelBackground,
		},
	});

	const result = mapResultRow(fields, ['Test org 2', 'test-org-2', null, null], {
		org: true,
		org_branding: false,
	});

	expect(result).toEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: null,
	});
});
