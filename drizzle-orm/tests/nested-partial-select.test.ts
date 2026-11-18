import { describe, expect, it } from 'vitest';
import { eq, sql } from '~/index.ts';
import { integer as pgInteger, pgTable, text as pgText } from '~/pg-core/index.ts';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';
import { drizzle as drizzleSqlite } from '~/sqlite-proxy/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

describe('Nested partial select on left join (issue #1603)', () => {
	const orgTable = pgTable('org', {
		id: pgInteger('id').primaryKey(),
		name: pgText('name').notNull(),
		slug: pgText('slug').notNull(),
	});

	const orgBrandingTable = pgTable('org_branding', {
		id: pgInteger('id').primaryKey(),
		orgId: pgInteger('org_id').references(() => orgTable.id),
		logo: pgText('logo'),
		panelBackground: pgText('panel_background_colour'),
	});

	const joinsNotNullableMap = {
		org: true,
		org_branding: false,
	};

	it('returns nested object when first column is null but second column is non-null (mapResultRow)', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo, // null in database row
				panelBackground: orgBrandingTable.panelBackground, // '#1a8cff' in database row
			},
		};

		const ordered = orderSelectedFields(fields);
		const row = ['Test org 2', 'test-org-2', null, '#1a8cff'];

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

	it('returns nested object when first column is non-null and second column is null (mapResultRow)', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				panelBackground: orgBrandingTable.panelBackground, // '#1a8cff'
				logo: orgBrandingTable.logo, // null
			},
		};

		const ordered = orderSelectedFields(fields);
		const row = ['Test org 2', 'test-org-2', '#1a8cff', null];

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

	it('returns null for nested object when all joined columns are null (unmatched left join)', () => {
		const fields = {
			name: orgTable.name,
			slug: orgTable.slug,
			branding: {
				logo: orgBrandingTable.logo, // null
				panelBackground: orgBrandingTable.panelBackground, // null
			},
		};

		const ordered = orderSelectedFields(fields);
		const row = ['Test org 2', 'test-org-2', null, null];

		const result = mapResultRow(ordered, row, joinsNotNullableMap);

		expect(result).toEqual({
			name: 'Test org 2',
			slug: 'test-org-2',
			branding: null,
		});
	});

	it('end-to-end query returns nested object when first column is null in left join', async () => {
		const sqlOrgTable = sqliteTable('org', {
			id: sqliteInteger('id').primaryKey(),
			name: sqliteText('name').notNull(),
			slug: sqliteText('slug').notNull(),
		});

		const sqlOrgBrandingTable = sqliteTable('org_branding', {
			id: sqliteInteger('id').primaryKey(),
			orgId: sqliteInteger('org_id'),
			logo: sqliteText('logo'),
			panelBackground: sqliteText('panel_background_colour'),
		});

		const db = drizzleSqlite(async () => {
			return {
				rows: [
					['Test org 2', 'test-org-2', null, '#1a8cff'],
				],
			};
		});

		const result = await db
			.select({
				name: sqlOrgTable.name,
				slug: sqlOrgTable.slug,
				branding: {
					logo: sqlOrgBrandingTable.logo,
					panelBackground: sqlOrgBrandingTable.panelBackground,
				},
			})
			.from(sqlOrgTable)
			.leftJoin(sqlOrgBrandingTable, eq(sqlOrgTable.id, sqlOrgBrandingTable.orgId));

		expect(result).toEqual([
			{
				name: 'Test org 2',
				slug: 'test-org-2',
				branding: {
					logo: null,
					panelBackground: '#1a8cff',
				},
			},
		]);
	});

	it('end-to-end query returns null for nested object when left join does not match', async () => {
		const sqlOrgTable = sqliteTable('org', {
			id: sqliteInteger('id').primaryKey(),
			name: sqliteText('name').notNull(),
			slug: sqliteText('slug').notNull(),
		});

		const sqlOrgBrandingTable = sqliteTable('org_branding', {
			id: sqliteInteger('id').primaryKey(),
			orgId: sqliteInteger('org_id'),
			logo: sqliteText('logo'),
			panelBackground: sqliteText('panel_background_colour'),
		});

		const db = drizzleSqlite(async () => {
			return {
				rows: [
					['Test org 2', 'test-org-2', null, null],
				],
			};
		});

		const result = await db
			.select({
				name: sqlOrgTable.name,
				slug: sqlOrgTable.slug,
				branding: {
					logo: sqlOrgBrandingTable.logo,
					panelBackground: sqlOrgBrandingTable.panelBackground,
				},
			})
			.from(sqlOrgTable)
			.leftJoin(sqlOrgBrandingTable, eq(sqlOrgTable.id, sqlOrgBrandingTable.orgId));

		expect(result).toEqual([
			{
				name: 'Test org 2',
				slug: 'test-org-2',
				branding: null,
			},
		]);
	});

	it('returns nested object when first two columns are null and third column is non-null', () => {
		const extraTable = pgTable('details', {
			id: pgInteger('id').primaryKey(),
			a: pgText('a'),
			b: pgText('b'),
			c: pgText('c'),
		});

		const fields = {
			item: {
				a: extraTable.a,
				b: extraTable.b,
				c: extraTable.c,
			},
		};

		const ordered = orderSelectedFields(fields);
		const joins = { details: false };

		const row1 = [null, null, 'value_c'];
		const res1 = mapResultRow(ordered, row1, joins);
		expect(res1).toEqual({
			item: { a: null, b: null, c: 'value_c' },
		});

		const row2 = [null, 'value_b', null];
		const res2 = mapResultRow(ordered, row2, joins);
		expect(res2).toEqual({
			item: { a: null, b: 'value_b', c: null },
		});

		const row3 = [null, null, null];
		const res3 = mapResultRow(ordered, row3, joins);
		expect(res3).toEqual({
			item: null,
		});
	});

	it('does not nullify nested object with columns from multiple tables', () => {
		const table1 = pgTable('t1', {
			id: pgInteger('id').primaryKey(),
			a: pgText('a'),
		});
		const table2 = pgTable('t2', {
			id: pgInteger('id').primaryKey(),
			b: pgText('b'),
		});

		const fields = {
			mixed: {
				a: table1.a,
				b: table2.b,
			},
		};

		const ordered = orderSelectedFields(fields);
		const joins = { t1: false, t2: false };

		const row = [null, null];
		const res = mapResultRow(ordered, row, joins);
		expect(res).toEqual({
			mixed: { a: null, b: null },
		});
	});
});
