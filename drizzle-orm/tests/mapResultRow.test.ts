import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const orgTable = pgTable('org', {
	name: text('name'),
	slug: text('slug'),
});

const brandingTable = pgTable('branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe('mapResultRow with nested partial select on left join', () => {
	test('preserves nested object when first column is null but subsequent column is non-null (#1603)', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: brandingTable.logo,
				panelBackground: brandingTable.panelBackground,
			},
		});

		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];
		const result = mapResultRow(fields, row, { org: true, branding: false });

		expect(result).toStrictEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('preserves nested object when first column is non-null and subsequent column is null', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				panelBackground: brandingTable.panelBackground,
				logo: brandingTable.logo,
			},
		});

		const row = ['Test org 2', 'test-org-2', '#1a8cff', null];
		const result = mapResultRow(fields, row, { org: true, branding: false });

		expect(result).toStrictEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				panelBackground: '#1a8cff',
				logo: null,
			},
		});
	});

	test('nullifies nested object when all columns of left-joined table are null', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: brandingTable.logo,
				panelBackground: brandingTable.panelBackground,
			},
		});

		const row = ['Test org 2', 'test-org-2', null, null];
		const result = mapResultRow(fields, row, { org: true, branding: false });

		expect(result).toStrictEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});

	test('preserves nested object for inner join even when all columns are null', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			branding: {
				logo: brandingTable.logo,
				panelBackground: brandingTable.panelBackground,
			},
		});

		const row = ['Test org 2', null, null];
		const result = mapResultRow(fields, row, { org: true, branding: true });

		expect(result).toStrictEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});

	test('preserves nested object when columns come from multiple tables', () => {
		const fields = orderSelectedFields({
			mixed: {
				logo: brandingTable.logo,
				name: orgTable.name,
			},
		});

		const row = [null, null];
		const result = mapResultRow(fields, row, { org: true, branding: false });

		expect(result).toStrictEqual({
			mixed: {
				logo: null,
				name: null,
			},
		});
	});

	test('preserves nested object when it contains a non-column field', () => {
		const fields = orderSelectedFields({
			branding: {
				logo: brandingTable.logo,
				extra: sql`1`,
			},
		});

		const row = [null, 1];
		const result = mapResultRow(fields, row, { org: true, branding: false });

		expect(result).toStrictEqual({
			branding: {
				logo: null,
				extra: 1,
			},
		});
	});
});
