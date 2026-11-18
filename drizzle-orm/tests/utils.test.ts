import { expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

// Regression for https://github.com/drizzle-team/drizzle-orm/issues/1603
// Nested partial-select on a nullable left join must not nullify the whole
// object when only the first selected column is null.

const orgTable = pgTable('org', {
	id: integer('id'),
	name: text('name'),
	slug: text('slug'),
});

const orgBrandingTable = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

test('keeps nested object when first joined column is null but a later column is not', () => {
	const columns = orderSelectedFields({
		name: orgTable.name,
		branding: {
			logo: orgBrandingTable.logo,
			panelBackground: orgBrandingTable.panelBackground,
		},
	});

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

test('is independent of column order (first non-null, later null)', () => {
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

test('keeps nested object when all joined columns are non-null', () => {
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

test('nullifies nested object when every joined column is null and join is nullable', () => {
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

	expect(result).toEqual({
		branding: { logo: null, panelBackground: null },
	});
});
