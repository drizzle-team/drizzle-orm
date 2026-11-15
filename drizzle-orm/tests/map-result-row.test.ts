import { expect, test } from 'vitest';

import type { AnyColumn } from '~/column.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { integer, pgTable, serial, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

const orgTable = pgTable('org', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orgBrandingTable = pgTable('org_branding', {
	orgId: integer('org_id').notNull(),
	logo: text('logo'),
	panelBackground: text('panel_background'),
});

const columns = [
	{ path: ['name'], field: orgTable.name },
	{ path: ['branding', 'logo'], field: orgBrandingTable.logo },
	{ path: ['branding', 'panelBackground'], field: orgBrandingTable.panelBackground },
] as SelectedFieldsOrdered<AnyColumn>;

// A left join is nullable, so `joinsNotNullableMap` records `false` for it.
const leftJoinMap = { org: true, org_branding: false };

test('keeps a nested object when a later field from the same nullable join is non-null', () => {
	const result = mapResultRow(
		columns,
		['Test org', null, '#1a8cff'],
		leftJoinMap,
	);

	expect(result).toEqual({
		name: 'Test org',
		branding: { logo: null, panelBackground: '#1a8cff' },
	});
});

test('nullifies a nested object when every field from the nullable join is null', () => {
	const result = mapResultRow(
		columns,
		['Test org', null, null],
		leftJoinMap,
	);

	expect(result).toEqual({ name: 'Test org', branding: null });
});

test('keeps a nested object when its first field is non-null', () => {
	const result = mapResultRow(
		columns,
		['Test org', 'logo.png', null],
		leftJoinMap,
	);

	expect(result).toEqual({
		name: 'Test org',
		branding: { logo: 'logo.png', panelBackground: null },
	});
});

test('keeps a nested object from a non-nullable join', () => {
	const result = mapResultRow(
		columns,
		['Test org', null, null],
		{ org: true, org_branding: true },
	);

	expect(result).toEqual({
		name: 'Test org',
		branding: { logo: null, panelBackground: null },
	});
});
