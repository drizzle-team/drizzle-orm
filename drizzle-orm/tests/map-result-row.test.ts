import { describe, expect, test } from 'vitest';
import { pgTable, text, uuid } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import { mapResultRow } from '~/utils.ts';

const organization = pgTable('organization', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
});

const organizationBranding = pgTable('organization_branding', {
	orgId: uuid('org_id').notNull(),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const organizationContact = pgTable('organization_contact', {
	orgId: uuid('org_id').notNull(),
	email: text('email'),
});

/** `select({ name, branding: { logo, panelBackground } })` */
const fields: SelectedFieldsOrdered = [
	{ path: ['name'], field: organization.name },
	{ path: ['branding', 'logo'], field: organizationBranding.logo },
	{ path: ['branding', 'panelBackground'], field: organizationBranding.panelBackground },
];

/** Same selection, with the nested columns in the opposite order */
const reversedFields: SelectedFieldsOrdered = [
	{ path: ['name'], field: organization.name },
	{ path: ['branding', 'panelBackground'], field: organizationBranding.panelBackground },
	{ path: ['branding', 'logo'], field: organizationBranding.logo },
];

const leftJoin = { organization: true, organization_branding: false };
const innerJoin = { organization: true, organization_branding: true };

describe.concurrent('mapResultRow', () => {
	test('keeps nested object when its first column is null and a later one is not', () => {
		const result = mapResultRow(fields, ['Drizzle', null, '#1a8cff'], leftJoin);

		expect(result).toEqual({
			name: 'Drizzle',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	test('keeps nested object when its first column is not null and a later one is', () => {
		const result = mapResultRow(reversedFields, ['Drizzle', '#1a8cff', null], leftJoin);

		expect(result).toEqual({
			name: 'Drizzle',
			branding: { panelBackground: '#1a8cff', logo: null },
		});
	});

	test('mapping is not affected by the order of the nested columns', () => {
		const result = mapResultRow(fields, ['Drizzle', null, '#1a8cff'], leftJoin);
		const reversedResult = mapResultRow(reversedFields, ['Drizzle', '#1a8cff', null], leftJoin);

		expect(result).toEqual(reversedResult);
	});

	test('nullifies nested object of a missing left join row', () => {
		const result = mapResultRow(fields, ['Drizzle', null, null], leftJoin);

		expect(result).toEqual({ name: 'Drizzle', branding: null });
	});

	test('keeps all-null nested object of a not nullable join', () => {
		const result = mapResultRow(fields, ['Drizzle', null, null], innerJoin);

		expect(result).toEqual({
			name: 'Drizzle',
			branding: { logo: null, panelBackground: null },
		});
	});

	test('never nullifies a nested object built from multiple tables', () => {
		const mixedFields: SelectedFieldsOrdered = [
			{ path: ['name'], field: organization.name },
			{ path: ['details', 'logo'], field: organizationBranding.logo },
			{ path: ['details', 'email'], field: organizationContact.email },
		];

		const result = mapResultRow(mixedFields, ['Drizzle', null, null], {
			organization: true,
			organization_branding: false,
			organization_contact: false,
		});

		expect(result).toEqual({
			name: 'Drizzle',
			details: { logo: null, email: null },
		});
	});

	test('nullifies only the nested objects whose columns are all null', () => {
		const multipleFields: SelectedFieldsOrdered = [
			{ path: ['name'], field: organization.name },
			{ path: ['branding', 'logo'], field: organizationBranding.logo },
			{ path: ['branding', 'panelBackground'], field: organizationBranding.panelBackground },
			{ path: ['contact', 'email'], field: organizationContact.email },
		];

		const result = mapResultRow(multipleFields, ['Drizzle', null, '#1a8cff', null], {
			organization: true,
			organization_branding: false,
			organization_contact: false,
		});

		expect(result).toEqual({
			name: 'Drizzle',
			branding: { logo: null, panelBackground: '#1a8cff' },
			contact: null,
		});
	});

	test('does not nullify anything without a joins map', () => {
		const result = mapResultRow(fields, ['Drizzle', null, null], undefined);

		expect(result).toEqual({
			name: 'Drizzle',
			branding: { logo: null, panelBackground: null },
		});
	});
});
