import { expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import { mapResultRow } from '~/utils.ts';

const org = pgTable('org', {
	id: integer('id'),
	name: text('name'),
	slug: text('slug'),
});

const orgBranding = pgTable('org_branding', {
	orgId: integer('org_id'),
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

// `org` is the base table, `org_branding` is joined via LEFT JOIN and is therefore nullable.
const joinsNotNullableMap = { org: true, org_branding: false };

function fields(...branding: ('logo' | 'panelBackground')[]): SelectedFieldsOrdered {
	return [
		{ path: ['name'], field: org.name },
		{ path: ['slug'], field: org.slug },
		...branding.map((key) => ({ path: ['branding', key], field: orgBranding[key] })),
	];
}

test('nested object is kept when a later column is non-null', () => {
	// logo is NULL in the database, panel_background_colour is not.
	const result = mapResultRow(
		fields('logo', 'panelBackground'),
		['Test org 2', 'test-org-2', null, '#1a8cff'],
		joinsNotNullableMap,
	);

	expect(result).toEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: { logo: null, panelBackground: '#1a8cff' },
	});
});

test('nested object is kept regardless of selected column order', () => {
	// Same row, the two branding columns selected the other way around.
	const result = mapResultRow(
		fields('panelBackground', 'logo'),
		['Test org 2', 'test-org-2', '#1a8cff', null],
		joinsNotNullableMap,
	);

	expect(result).toEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: { panelBackground: '#1a8cff', logo: null },
	});
});

test('nested object is nullified when the join did not match', () => {
	const result = mapResultRow(
		fields('logo', 'panelBackground'),
		['Test org 2', 'test-org-2', null, null],
		joinsNotNullableMap,
	);

	expect(result).toEqual({
		name: 'Test org 2',
		slug: 'test-org-2',
		branding: null,
	});
});
