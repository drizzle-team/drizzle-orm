import { describe, it } from 'vitest';
import { pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgs = pgTable('orgs', {
	id: text('id'),
	name: text('name'),
});

const orgBranding = pgTable('org_branding', {
	orgId: text('org_id'),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const selection = [
	{ path: ['name'], field: orgs.name },
	{ path: ['branding', 'logo'], field: orgBranding.logo },
	{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
];

// `orgs` is the base table; `org_branding` is left joined, so it is nullable.
const leftJoined = { orgs: true, org_branding: false };

describe.concurrent('mapResultRow nested partial select', () => {
	it('keeps the joined object when a later column has a value', ({ expect }) => {
		const result = mapResultRow(selection, ['Test org', null, '#1a8cff'], leftJoined);

		expect(result).toEqual({
			name: 'Test org',
			branding: { logo: null, panelBackground: '#1a8cff' },
		});
	});

	it('does not depend on which column of the object is selected first', ({ expect }) => {
		const swapped = [
			{ path: ['name'], field: orgs.name },
			{ path: ['branding', 'panelBackground'], field: orgBranding.panelBackground },
			{ path: ['branding', 'logo'], field: orgBranding.logo },
		];

		const result = mapResultRow(swapped, ['Test org', '#1a8cff', null], leftJoined);

		expect(result).toEqual({
			name: 'Test org',
			branding: { panelBackground: '#1a8cff', logo: null },
		});
	});

	it('still nullifies the object when the join matched no row', ({ expect }) => {
		const result = mapResultRow(selection, ['Test org', null, null], leftJoined);

		expect(result).toEqual({ name: 'Test org', branding: null });
	});

	it('keeps an object from a non-nullable join even when every column is null', ({ expect }) => {
		const innerJoined = { orgs: true, org_branding: true };
		const result = mapResultRow(selection, ['Test org', null, null], innerJoined);

		expect(result).toEqual({
			name: 'Test org',
			branding: { logo: null, panelBackground: null },
		});
	});
});
