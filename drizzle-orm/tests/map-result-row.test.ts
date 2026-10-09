import { describe, expect, test } from 'vitest';
import { alias, boolean, integer, pgTable, text } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const org = pgTable('org', {
	id: integer('id'),
	name: text('name'),
});

const branding = pgTable('org_branding', {
	logo: text('logo'),
	panelBackground: text('panel_background'),
	favicon: text('favicon'),
	enabled: boolean('enabled'),
	count: integer('count'),
});

describe('mapResultRow', () => {
	const orders = [
		['logo', 'panelBackground', 'favicon'],
		['logo', 'favicon', 'panelBackground'],
		['panelBackground', 'logo', 'favicon'],
		['panelBackground', 'favicon', 'logo'],
		['favicon', 'logo', 'panelBackground'],
		['favicon', 'panelBackground', 'logo'],
	] as const;

	describe.each(orders)('column order %s, %s, %s', (...order) => {
		const fields = orderSelectedFields({
			branding: Object.fromEntries(order.map((key) => [key, branding[key]])),
		});

		test('retains a matched nullable object with a non-null column', () => {
			const values = { logo: null, panelBackground: '#1a8cff', favicon: null };
			expect(mapResultRow(fields, order.map((key) => values[key]), { org_branding: false }))
				.toEqual({ branding: values });
		});

		test('nullifies an all-null nullable object', () => {
			expect(mapResultRow(fields, [null, null, null], { org_branding: false }))
				.toEqual({ branding: null });
		});
	});

	test.each([
		{ column: branding.enabled, value: false },
		{ column: branding.count, value: 0 },
		{ column: branding.panelBackground, value: '' },
	])('retains a later falsy non-null column: $value', ({ column, value }) => {
		const fields = orderSelectedFields({ branding: { logo: branding.logo, value: column } });
		expect(mapResultRow(fields, [null, value], { org_branding: false }))
			.toEqual({ branding: { logo: null, value } });
	});

	test.each([{ org_branding: true }, undefined])('retains all-null fields without a nullable join: %s', (joins) => {
		const fields = orderSelectedFields({
			branding: { logo: branding.logo, panelBackground: branding.panelBackground },
		});
		expect(mapResultRow(fields, [null, null], joins))
			.toEqual({ branding: { logo: null, panelBackground: null } });
	});

	test.each([
		{
			position: 'middle',
			selection: { logo: branding.logo, name: org.name, panelBackground: branding.panelBackground },
		},
		{
			position: 'first',
			selection: { name: org.name, logo: branding.logo, panelBackground: branding.panelBackground },
		},
		{ position: 'last', selection: { logo: branding.logo, panelBackground: branding.panelBackground, name: org.name } },
	])('retains an all-null mixed-table object with the other table $position', ({ selection }) => {
		expect(mapResultRow(orderSelectedFields({ mixed: selection }), [null, null, null], {
			org: false,
			org_branding: false,
		})).toEqual({ mixed: { logo: null, name: null, panelBackground: null } });
	});

	test('uses the joined alias for nullability and tracks nested objects independently', () => {
		const joinedBranding = alias(branding, 'joined_branding');
		const fields = orderSelectedFields({
			present: { logo: joinedBranding.logo, panelBackground: joinedBranding.panelBackground },
			absent: { logo: joinedBranding.logo, favicon: joinedBranding.favicon },
			base: { logo: branding.logo, favicon: branding.favicon },
		});
		expect(mapResultRow(fields, [null, '#1a8cff', null, null, null, null], {
			org_branding: true,
			joined_branding: false,
		})).toEqual({
			present: { logo: null, panelBackground: '#1a8cff' },
			absent: null,
			base: { logo: null, favicon: null },
		});
	});

	test('treats different aliases of one table as mixed tables', () => {
		const joinedBranding = alias(branding, 'joined_branding');
		const fields = orderSelectedFields({
			mixed: { logo: branding.logo, favicon: joinedBranding.favicon, panelBackground: branding.panelBackground },
		});
		expect(mapResultRow(fields, [null, null, null], { org_branding: false, joined_branding: false }))
			.toEqual({ mixed: { logo: null, favicon: null, panelBackground: null } });
	});

	test('preserves flat and deeper nested fields', () => {
		const fields = orderSelectedFields({ logo: branding.logo, nested: { branding: { logo: branding.logo } } });
		expect(mapResultRow(fields, [null, null], { org_branding: false }))
			.toEqual({ logo: null, nested: { branding: { logo: null } } });
	});

	test('preserves SQL decoding and column-based nullification', () => {
		const fields = orderSelectedFields({
			branding: { logo: branding.logo, expression: sql<string>`'fallback'`.as('expression') },
			expression: { value: sql`42`.mapWith(Number) },
			decoded: { logo: branding.logo, count: branding.count },
		});
		expect(mapResultRow(fields, [null, 'fallback', '42', null, '0'], { org_branding: false }))
			.toEqual({ branding: null, expression: { value: 42 }, decoded: { logo: null, count: 0 } });
	});
});
