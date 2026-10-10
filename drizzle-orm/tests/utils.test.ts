import { expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

// Regression tests for https://github.com/drizzle-team/drizzle-orm/issues/1603
//
// Bug: a nested partial-select object built from a left-joined (nullable) table
// was incorrectly nullified whenever the FIRST column read for that object was
// null, even if a LATER column from the same table had a non-null value. The
// nullability decision now reflects whether any column has a non-null value
// (i.e. whether the joined row exists), not just the first field's value.

const orgTable = pgTable('org', {
	id: integer('id'),
	name: text('name'),
	slug: text('slug'),
});

const orgBrandingTable = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

test('keeps nested object when the first column is null but a later column is not', () => {
	const columns = orderSelectedFields({
		name: orgTable.name,
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	// the exact scenario from the issue: logo is null in the database,
	// panel_background_colour is '#1a8cff'
	const result = mapResultRow(
		columns,
		['Test org 2', null, '#1a8cff'],
		{ org: true, org_branding: false },
	);

	expect(result).toEqual({
		name: 'Test org 2',
		branding: { logo: null, panelBackground: '#1a8cff' },
	});
});

test('is independent of column order (first column non-null, last column null)', () => {
	const columns = orderSelectedFields({
		branding: {
			panelBackground: orgBrandingTable.panelBackground,
			logo: orgBrandingTable.logo,
		},
	});

	const result = mapResultRow(columns, ['#1a8cff', null], { org_branding: false });

	expect(result).toEqual({
		branding: { panelBackground: '#1a8cff', logo: null },
	});
});

test('keeps the nested object when the joined row matched (all columns non-null)', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	const result = mapResultRow(columns, ['logo.png', '#1a8cff'], { org_branding: false });

	expect(result).toEqual({
		branding: { logo: 'logo.png', panelBackground: '#1a8cff' },
	});
});

test('still nullifies the nested object when every column is null and the join is nullable', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	const result = mapResultRow(columns, [null, null], { org_branding: false });

	expect(result).toEqual({ branding: null });
});

test('keeps all-null nested object when the join is not nullable', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

	const result = mapResultRow(columns, [null, null], { org_branding: true });

	expect(result).toEqual({ branding: { logo: null, panelBackground: null } });
});
