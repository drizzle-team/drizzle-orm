import { describe, expect, it } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgTable = pgTable('org', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
});

const orgBrandingTable = pgTable('org_branding', {
	orgId: integer('org_id')
		.notNull()
		.references(() => orgTable.id),
	logo: text('logo'),
	panelBackground: text('panel_background').notNull(),
});

const otherTable = pgTable('other', {
	orgId: integer('org_id')
		.notNull()
		.references(() => orgTable.id),
	note: text('note'),
});

// columns for: select { name, slug, branding: { logo, panelBackground } }
const brandingColumns = [
	{ path: ['name'], field: orgTable.name },
	{ path: ['slug'], field: orgTable.slug },
	{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
	{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
];

describe.concurrent('mapResultRow', () => {
	// https://github.com/drizzle-team/drizzle-orm/issues/1603
	it('does not nullify a nested object when a non-first field of the same table is not null', () => {
		// joined row exists: logo is NULL, panelBackground is '#1a8cff'
		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];

		const result = mapResultRow<any>(
			brandingColumns,
			row,
			{ org: true, org_branding: false },
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

	it('nullifies a nested object when every field of the joined table is null', () => {
		// left join found no matching row: all joined columns are NULL
		const row = ['Test org 2', 'test-org-2', null, null];

		const result = mapResultRow<any>(
			brandingColumns,
			row,
			{ org: true, org_branding: false },
		);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});

	it('does not nullify a nested object when its fields come from different tables', () => {
		const columns = [
			{ path: ['name'], field: orgTable.name },
			{ path: ['mixed', 'note'], field: otherTable.note },
			{ path: ['mixed', 'panelBackground'], field: orgBrandingTable.panelBackground },
		];

		const result = mapResultRow<any>(
			columns,
			['Test org 2', null, '#1a8cff'],
			{ org: true, org_branding: false, other: false },
		);

		expect(result).toEqual({
			name: 'Test org 2',
			mixed: {
				note: null,
				panelBackground: '#1a8cff',
			},
		});
	});
});
