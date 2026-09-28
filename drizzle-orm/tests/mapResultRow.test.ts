import { describe, expect, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

describe('mapResultRow - nested partial select on left joins (issue #1603)', () => {
	const orgTable = pgTable('org', {
		id: integer('id').notNull(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
	});

	const orgBrandingTable = pgTable('org_branding', {
		orgId: integer('org_id').notNull(),
		logo: text('logo'),
		panelBackground: text('panel_background_colour'),
	});

	const orgSettingsTable = pgTable('org_settings', {
		orgId: integer('org_id').notNull(),
		theme: text('theme'),
		notificationsEnabled: text('notifications_enabled'),
	});

	test('preserves nested object when first column is null but subsequent column is non-null (reproduction of #1603)', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo, // null in database
				panelBackground: orgBrandingTable.panelBackground, // non-null in database
			},
		});

		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	test('preserves nested object when non-null column precedes null column', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				panelBackground: orgBrandingTable.panelBackground, // non-null in database
				logo: orgBrandingTable.logo, // null in database
			},
		});

		const row = ['Test org 2', 'test-org-2', '#1a8cff', null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				panelBackground: '#1a8cff',
				logo: null,
			},
		});
	});

	test('correctly nullifies nested object when all columns from left-joined table are null (left join miss)', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		});

		const row = ['Test org 2', 'test-org-2', null, null];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});

	test('preserves nested object when all columns have non-null values', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		});

		const row = ['Test org 2', 'test-org-2', 'logo.png', '#1a8cff'];
		const joinsNotNullableMap = { org: true, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: 'logo.png',
				panelBackground: '#1a8cff',
			},
		});
	});

	test('does not nullify multi-table composite nested objects even if all fields are null', () => {
		const fields = orderSelectedFields({
			composite: {
				orgName: orgTable.name,
				brandingLogo: orgBrandingTable.logo,
			},
		});

		const row = [null, null];
		const joinsNotNullableMap = { org: false, org_branding: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			composite: {
				orgName: null,
				brandingLogo: null,
			},
		});
	});

	test('does not nullify nested objects for inner / not-nullable joins even if all values are null', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		});

		const row = ['Test org', null, null];
		// org_branding is not nullable (e.g. inner join)
		const joinsNotNullableMap = { org: true, org_branding: true };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org',
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});

	test('handles multiple left-joined nested objects independently in the same row', () => {
		const fields = orderSelectedFields({
			name: orgTable.name,
			branding: {
				logo: orgBrandingTable.logo, // null
				panelBackground: orgBrandingTable.panelBackground, // '#1a8cff' (partial match)
			},
			settings: {
				theme: orgSettingsTable.theme, // null
				notifications: orgSettingsTable.notificationsEnabled, // null (full miss)
			},
		});

		const row = ['Test org 2', null, '#1a8cff', null, null];
		const joinsNotNullableMap = { org: true, org_branding: false, org_settings: false };

		const result = mapResultRow(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
			settings: null,
		});
	});
});
