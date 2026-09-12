import { describe, expect, it } from 'vitest';
import { integer, pgTable, serial, text } from '~/pg-core';
import { sql } from '~/sql';
import { getTableName } from '~/table';
import { mapResultRow, orderSelectedFields } from '~/utils';

describe('mapResultRow - nested partial select (issue #1603)', () => {
	const orgTable = pgTable('org', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
	});

	const orgBrandingTable = pgTable('org_branding', {
		id: serial('id').primaryKey(),
		orgId: integer('org_id').notNull(),
		logo: text('logo'),
		panelBackground: text('panel_background_colour'),
	});

	it('should return nested object with null first property and non-null second property on left join', () => {
		const selection = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo, // null in database
				panelBackground: orgBrandingTable.panelBackground, // "#1a8cff" in database
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: false, // left join
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackground: '#1a8cff',
			},
		});
	});

	it('should return nested object when non-null property comes first (swapped order)', () => {
		const selection = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				panelBackground: orgBrandingTable.panelBackground, // "#1a8cff" in database
				logo: orgBrandingTable.logo, // null in database
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = ['Test org 2', 'test-org-2', '#1a8cff', null];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: false, // left join
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				panelBackground: '#1a8cff',
				logo: null,
			},
		});
	});

	it('should return null for nested object if ALL constituent fields are null on left join', () => {
		const selection = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = ['Test org 2', 'test-org-2', null, null];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: false, // left join with no match
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});

	it('should NOT return null for nested object if all fields are null on INNER join', () => {
		const selection = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo,
				panelBackground: orgBrandingTable.panelBackground,
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = ['Test org 2', 'test-org-2', null, null];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: true, // inner join
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: {
				logo: null,
				panelBackground: null,
			},
		});
	});

	it('should handle 3+ constituent fields where earlier fields are null and later field is non-null', () => {
		const multiFieldTable = pgTable('multi_col', {
			f1: text('f1'),
			f2: text('f2'),
			f3: text('f3'),
			f4: text('f4'),
		});

		const selection = {
			details: {
				a: multiFieldTable.f1,
				b: multiFieldTable.f2,
				c: multiFieldTable.f3,
				d: multiFieldTable.f4,
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = [null, null, 'third-is-set', null];
		const joinsNotNullableMap = {
			[getTableName(multiFieldTable)]: false,
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			details: {
				a: null,
				b: null,
				c: 'third-is-set',
				d: null,
			},
		});
	});

	it('should not nullify nested object if fields belong to multiple tables', () => {
		const selection = {
			combined: {
				logo: orgBrandingTable.logo,
				orgName: orgTable.name,
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = [null, null];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: false,
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			combined: {
				logo: null,
				orgName: null,
			},
		});
	});

	it('should not nullify nested object if it contains non-column SQL expression', () => {
		const selection = {
			branding: {
				logo: orgBrandingTable.logo,
				custom: sql<string | null>`null`,
			},
		};

		const ordered = orderSelectedFields(selection);
		const row = [null, null];
		const joinsNotNullableMap = {
			[getTableName(orgBrandingTable)]: false,
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			branding: {
				logo: null,
				custom: null,
			},
		});
	});

	it('should correctly nullify left-joined table in full select when join has no match', () => {
		const selection = {
			org: orgTable,
			branding: orgBrandingTable,
		};

		const ordered = orderSelectedFields(selection);
		// org row exists, branding columns are all null
		const row = [1, 'Acme', 'acme', null, null, null, null];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: false,
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			org: {
				id: 1,
				name: 'Acme',
				slug: 'acme',
			},
			branding: null,
		});
	});

	it('should correctly preserve left-joined table in full select when join has match (id non-null, logo null)', () => {
		const selection = {
			org: orgTable,
			branding: orgBrandingTable,
		};

		const ordered = orderSelectedFields(selection);
		// org row exists, branding row exists with id=10, but logo=null
		const row = [1, 'Acme', 'acme', 10, 1, null, '#000000'];
		const joinsNotNullableMap = {
			[getTableName(orgTable)]: true,
			[getTableName(orgBrandingTable)]: false,
		};

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			org: {
				id: 1,
				name: 'Acme',
				slug: 'acme',
			},
			branding: {
				id: 10,
				orgId: 1,
				logo: null,
				panelBackground: '#000000',
			},
		});
	});
});
