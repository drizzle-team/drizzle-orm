import { describe, test } from 'vitest';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow } from '~/utils.ts';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/1603
//
// Bug: when a nested/partial select object groups multiple columns from the same
// (potentially left-joined) table, `mapResultRow` used to decide whether to collapse
// the whole nested object to `null` based only on the *first* field it encountered for
// that object. If that first field happened to be `null` on an otherwise real, matched
// row (while a later field in the same nested object was non-null), the entire nested
// object was incorrectly nulled out.
describe('mapResultRow', () => {
	const brandingTable = pgTable('branding', {
		logo: text('logo'),
		panelBackground: text('panel_background'),
	});

	const columns = [
		{ path: ['branding', 'logo'], field: brandingTable.logo },
		{ path: ['branding', 'panelBackground'], field: brandingTable.panelBackground },
	] as any;

	const joinsNotNullableMap = { branding: false };

	test('does not nullify a nested object when only its first field is null but a later field is non-null', ({ expect }) => {
		// logo (first field) is null, panelBackground (second field) has a real value -> real matched row
		const row = [null, 'https://example.com/bg.png'];
		const result = mapResultRow(columns, row, joinsNotNullableMap);
		expect(result).toEqual({
			branding: { logo: null, panelBackground: 'https://example.com/bg.png' },
		});
	});

	test('still nullifies a nested object when the entire joined row is genuinely absent (all fields null)', ({ expect }) => {
		const row = [null, null];
		const result: any = mapResultRow(columns, row, joinsNotNullableMap);
		expect(result.branding).toBeNull();
	});

	test('does not nullify when the first field is non-null and a later field is null (order-independent)', ({ expect }) => {
		const row = ['https://example.com/logo.png', null];
		const result = mapResultRow(columns, row, joinsNotNullableMap);
		expect(result).toEqual({
			branding: { logo: 'https://example.com/logo.png', panelBackground: null },
		});
	});
});
