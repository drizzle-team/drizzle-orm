import { describe, test } from 'vitest';
import { pgTable, serial, text } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

const orgTable = pgTable('org', {
	id: serial('id'),
	name: text('name'),
});

const orgBrandingTable = pgTable('org_branding', {
	id: serial('id'),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

describe('mapResultRow left join bug', () => {
	test('nested object should not be nullified if any value is not null (first column is null)', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('nested object should not be nullified if first column is non-null and second is null', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', 'logo.png', null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: 'logo.png',
				panelBackground: null,
			},
		});
	});

	test('nested object should be nullified if all values from nullable join table are null', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', null, null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: null,
		});
	});

	test('nested object should not be nullified if non-null value comes 3rd after multiple nulls', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'id'], field: orgBrandingTable.id },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', null, null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				id: null,
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('nested object should not be nullified if table join is non-nullable (inner join)', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', null, null];
		const joinsNotNullableMap = { org: true, org_branding: true };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});

	test('nested object should not be nullified if non-column field (SQL) is non-null even if first column is null', ({ expect }) => {
		const sqlField = sql`1`;
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'customFlag'], field: sqlField },
		];

		const row = ['Test org 2', null, 1];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				customFlag: 1,
			},
		});
	});

	test('deeply nested object should not be nullified if any value is non-null', ({ expect }) => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['branding', 'theme', 'logo'], field: orgBrandingTable.logo },
			{ path: ['branding', 'theme', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const row = ['Test org 2', null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(columns, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				theme: {
					logo: null,
					panelBackground: '#1a8cff',
				},
			},
		});
	});
});
