import { describe, expect, test } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const org = pgTable('org', {
	name: text('name'),
	slug: text('slug'),
});

const orgBranding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

const joinsNotNullableMap = {
	org: true,
	org_branding: false,
};

describe('mapResultRow nested partial select (#1603)', () => {
	test('keeps nested object when the first joined column is null and a later one is not', () => {
		const columns = [
			{ path: ['name'], field: org.name },
			{ path: ['slug'], field: org.slug },
			{ path: ['branding', 'logo'], field: orgBranding.logo },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		];

		const result = mapResultRow(
			columns,
			['Test org 2', 'test-org-2', null, '#1a8cff'],
			joinsNotNullableMap,
		);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('is independent of nested column order', () => {
		const columns = [
			{ path: ['name'], field: org.name },
			{ path: ['slug'], field: org.slug },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
			{ path: ['branding', 'logo'], field: orgBranding.logo },
		];

		const result = mapResultRow(
			columns,
			['Test org 2', 'test-org-2', '#1a8cff', null],
			joinsNotNullableMap,
		);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				panelBackground: '#1a8cff',
				logo: null,
			},
		});
	});

	test('still nulls the nested object when every joined column is null on a nullable join', () => {
		const columns = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'logo'], field: orgBranding.logo },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		];

		const result = mapResultRow(
			columns,
			['Test org 2', null, null],
			joinsNotNullableMap,
		);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: null,
		});
	});

	test('keeps nested nulls when the join itself is not nullable', () => {
		const columns = [
			{ path: ['name'], field: org.name },
			{ path: ['branding', 'logo'], field: orgBranding.logo },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
		];

		const result = mapResultRow(
			columns,
			['Test org 2', null, null],
			{ org: true, org_branding: true },
		);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});
});
