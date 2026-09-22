import { expect, test } from 'vitest';

import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const org = pgTable('org', {
	id: integer('id'),
	name: text('name'),
});

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
	orgId: integer('org_id'),
});

test('mapResultRow keeps nested left join object when first field is null but later field is not', () => {
	const fields = orderSelectedFields({
		name: org.name,
		branding: {
			logo: orgBranding.logo,
			panelBackground: orgBranding.panelBackground,
		},
	});

	const result = mapResultRow(fields, ['Test org 2', null, '#1a8cff'], {
		org: true,
		org_branding: false,
	});

	expect(result).toEqual({
		name: 'Test org 2',
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});
});

test('mapResultRow nullifies nested left join object when every field from the table is null', () => {
	const fields = orderSelectedFields({
		name: org.name,
		branding: {
			logo: orgBranding.logo,
			panelBackground: orgBranding.panelBackground,
		},
	});

	const result = mapResultRow(fields, ['Test org 2', null, null], {
		org: true,
		org_branding: false,
	});

	expect(result).toEqual({
		name: 'Test org 2',
		branding: null,
	});
});
