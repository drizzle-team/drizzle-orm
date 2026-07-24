import { describe, expect, test } from 'vitest';

import type { AnyColumn } from '~/column.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const org = pgTable('org', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
});

const branding = pgTable('org_branding', {
	orgId: integer('org_id').notNull(),
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

const owner = pgTable('owner', {
	id: integer('id').notNull(),
	displayName: text('display_name'),
});

describe('mapResultRow — nested partial select with leftJoin (#1603)', () => {
	test('regression: first nested column null, later non-null — object preserved', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['name'], field: org.name },
			{ path: ['slug'], field: org.slug },
			{ path: ['branding', 'logo'], field: branding.logo },
			{ path: ['branding', 'panelBackground'], field: branding.panelBackground },
		];
		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		expect(mapResultRow(columns, row, joinsNotNullableMap)).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	test('control: last nested column null, earlier non-null — object preserved', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'panelBackground'], field: branding.panelBackground },
			{ path: ['branding', 'logo'], field: branding.logo },
		];
		const row = ['Test org', '#1a8cff', null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		expect(mapResultRow(columns, row, joinsNotNullableMap)).toEqual({
			name: 'Test org',
			branding: { panelBackground: '#1a8cff', logo: null },
		});
	});

	test('all nested columns null on nullable join — object nullified', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'logo'], field: branding.logo },
			{ path: ['branding', 'panelBackground'], field: branding.panelBackground },
		];
		const row = ['Test org', null, null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		expect(mapResultRow(columns, row, joinsNotNullableMap)).toEqual({
			name: 'Test org',
			branding: null,
		});
	});

	test('all nested columns null on non-nullable join — object preserved', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'logo'], field: branding.logo },
			{ path: ['branding', 'panelBackground'], field: branding.panelBackground },
		];
		const row = ['Test org', null, null];
		const joinsNotNullableMap = { org: true, org_branding: true };

		expect(mapResultRow(columns, row, joinsNotNullableMap)).toEqual({
			name: 'Test org',
			branding: { logo: null, panelBackground: null },
		});
	});

	test('columns from multiple tables under same nested key — never nullified', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['data', 'orgName'], field: org.name },
			{ path: ['data', 'logo'], field: branding.logo },
		];
		const row = [null, null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		expect(mapResultRow(columns, row, joinsNotNullableMap)).toEqual({
			data: { orgName: null, logo: null },
		});
	});

	test('two independent nested objects from different nullable tables', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'logo'], field: branding.logo },
			{ path: ['branding', 'panelBackground'], field: branding.panelBackground },
			{ path: ['owner', 'displayName'], field: owner.displayName },
		];
		const row = ['Test org', null, '#1a8cff', null];
		const joinsNotNullableMap = { org: true, org_branding: false, owner: false };

		expect(mapResultRow(columns, row, joinsNotNullableMap)).toEqual({
			name: 'Test org',
			branding: { logo: null, panelBackground: '#1a8cff' },
			owner: null,
		});
	});

	test('non-Column nested field (no row) — unchanged behaviour', () => {
		const columns: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'logo'], field: branding.logo },
		];
		const row = ['Test org', null];

		expect(mapResultRow(columns, row, undefined)).toEqual({
			name: 'Test org',
			branding: { logo: null },
		});
	});
});
