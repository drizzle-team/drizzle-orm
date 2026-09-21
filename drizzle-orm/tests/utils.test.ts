import { expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

// Regression for https://github.com/drizzle-team/drizzle-orm/issues/1603
// Nested partial-select on a nullable left join must not nullify the entire
// object when only the first selected column is null but a later column has a value.

const orgTable = pgTable('org', {
	id: integer('id'),
	name: text('name'),
	slug: text('slug'),
});

const orgBrandingTable = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const orgThemeTable = pgTable('org_theme', {
	themeName: text('theme_name'),
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

test('does not nullify when nested fields come from different tables', () => {
	const columns = orderSelectedFields({
		mixed: {
			logo: orgBrandingTable.logo,
			themeName: orgThemeTable.themeName,
		},
	});

	const result = mapResultRow(
		columns,
		[null, 'dark'],
		{ org_branding: false, org_theme: false },
	);

	expect(result).toEqual({
		mixed: { logo: null, themeName: 'dark' },
	});
});

test('sql expression in nested select does not force nullification', () => {
	const columns = orderSelectedFields({
		branding: {
			logo: orgBrandingTable.logo,
			label: sql`upper(${orgBrandingTable.panelBackground})`.mapWith(String),
		},
	});

	const result = mapResultRow(
		columns,
		[null, '#1A8CFF'],
		{ org_branding: false },
	);

	expect(result).toEqual({
		branding: { logo: null, label: '#1A8CFF' },
	});
});
