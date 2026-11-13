import { expect, test } from 'vitest';

import { integer, pgTable, text } from '~/pg-core';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

// #1603: orgs left-joined to a branding table where 'logo' is NULL in the
// matched row but 'panelBackground' is not. The nested object must NOT be
// nullified just because the first selected column of the joined table is
// null.

const orgs = pgTable('orgs', {
	name: text('name').notNull(),
	slug: text('slug').notNull(),
});

const branding = pgTable('branding', {
	orgId: integer('org_id').notNull(),
	logo: text('logo'), // nullable
	panelBackground: text('panel_background'), // nullable
});

// joinsNotNullableMap shape produced by .from(orgs).leftJoin(branding, ...)
const joinMap = { orgs: true, branding: false };

const fields = {
	name: orgs.name,
	branding: {
		logo: branding.logo,
		panelBackground: branding.panelBackground,
	},
};

test('nested partial select: first null column must not nullify the object (#1603)', () => {
	const columns = orderSelectedFields(fields as any);

	// path layout: [name], [branding, logo], [branding, panelBackground]
	expect(columns.map((c: any) => c.path.join('.'))).toEqual([
		'name',
		'branding.logo',
		'branding.panelBackground',
	]);

	// Matched left-join row where logo is NULL but panelBackground is set.
	// Before the fix: branding === null (order-dependent data loss).
	const result = mapResultRow(columns, ['Nova', null, '#1a8cff'], joinMap);
	expect(result).toEqual({
		name: 'Nova',
		branding: { logo: null, panelBackground: '#1a8cff' },
	});
});

test('result is independent of the selected field order', () => {
	const fields2 = {
		name: orgs.name,
		branding: {
			panelBackground: branding.panelBackground,
			logo: branding.logo,
		},
	};
	const columns2 = orderSelectedFields(fields2 as any);
	const result2 = mapResultRow(columns2, ['Nova', '#1a8cff', null], joinMap);
	expect(result2).toEqual({
		name: 'Nova',
		branding: { panelBackground: '#1a8cff', logo: null },
	});
});

test('genuinely absent left-join row still nullifies the nested object', () => {
	const columns = orderSelectedFields(fields as any);
	const result = mapResultRow(columns, ['Nova', null, null], joinMap);
	expect(result).toEqual({ name: 'Nova', branding: null });
});

test('non-nullable join keeps the object even when all its columns are null', () => {
	const columns = orderSelectedFields(fields as any);
	const result = mapResultRow(columns, ['Nova', null, null], { orgs: true, branding: true });
	expect(result).toEqual({ name: 'Nova', branding: { logo: null, panelBackground: null } });
});

test('mixed-table nested object is not nullified (regression guard)', () => {
	// Nested object whose columns come from DIFFERENT tables: nullifyMap marks
	// the object false (mixed), so no nullification may happen.
	const mixed = {
		name: orgs.name,
		row: {
			org: orgs.slug,
			logo: branding.logo,
		},
	};
	const columns = orderSelectedFields(mixed as any);
	const result = mapResultRow(columns, ['Nova', 'nova', null], { orgs: true, branding: false });
	expect(result).toEqual({ name: 'Nova', row: { org: 'nova', logo: null } });
});
