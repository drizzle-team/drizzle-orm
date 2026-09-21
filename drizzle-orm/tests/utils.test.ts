import { describe, test } from 'vitest';
import type { AnyColumn } from '~/column.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { pgTable, serial, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const org = pgTable('org', {
	id: serial('id'),
	name: text('name'),
});

const orgBranding = pgTable('org_branding', {
	id: serial('id'),
	logo: text('logo'),
	panelBackground: text('panel_background_colour'),
});

const fields: SelectedFieldsOrdered<AnyColumn> = [
	{ path: ['name'], field: org.name },
	{ path: ['branding', 'logo'], field: orgBranding.logo },
	{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
];

// `org_branding` is the nullable side of a left join
const joinsNotNullableMap = { org: true, org_branding: false };

describe('mapResultRow', () => {
	test('keeps nested object when first column is null but a later one is not', ({ expect }) => {
		const row = ['Test org 2', null, '#1a8cff'];
		expect(mapResultRow(fields, row, joinsNotNullableMap)).toStrictEqual({
			name: 'Test org 2',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	test('nullifies nested object when all columns of a nullable-join table are null', ({ expect }) => {
		const row = ['Test org 2', null, null];
		expect(mapResultRow(fields, row, joinsNotNullableMap)).toStrictEqual({
			name: 'Test org 2',
			branding: null,
		});
	});

	test('does not nullify nested objects whose columns come from multiple tables', ({ expect }) => {
		const mixedFields: SelectedFieldsOrdered<AnyColumn> = [
			{ path: ['meta', 'name'], field: org.name },
			{ path: ['meta', 'logo'], field: orgBranding.logo },
		];
		expect(mapResultRow(mixedFields, [null, null], joinsNotNullableMap)).toStrictEqual({
			meta: { name: null, logo: null },
		});
	});

	test('does not nullify nested objects of a not-nullable join', ({ expect }) => {
		const innerJoinMap = { org: true, org_branding: true };
		expect(mapResultRow(fields, ['Test org 2', null, null], innerJoinMap)).toStrictEqual({
			name: 'Test org 2',
			branding: { logo: null, panelBackground: null },
		});
	});
});
