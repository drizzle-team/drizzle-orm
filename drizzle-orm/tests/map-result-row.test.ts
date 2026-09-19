import { expect, test } from 'vitest';
import { customType, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const branding = pgTable('branding', { logo: text(), background: text() });
const other = pgTable('other', { value: text() });

test('nullable joined objects do not depend on column order', () => {
	for (
		const [fields, row] of [
			[{ logo: branding.logo, background: branding.background }, [null, '#1a8cff']],
			[{ background: branding.background, logo: branding.logo }, ['#1a8cff', null]],
		] as const
	) {
		expect(mapResultRow(orderSelectedFields({ branding: fields }), [...row], { branding: false }))
			.toEqual({ branding: { logo: null, background: '#1a8cff' } });
	}
});

test('only all-null nullable single-table objects collapse', () => {
	const fields = orderSelectedFields({ branding: { logo: branding.logo, background: branding.background } });
	expect(mapResultRow(fields, [null, null], { branding: false })).toEqual({ branding: null });
	expect(mapResultRow(fields, [null, null], { branding: true }))
		.toEqual({ branding: { logo: null, background: null } });
	expect(mapResultRow(fields, [null, null], undefined))
		.toEqual({ branding: { logo: null, background: null } });
	const mixed = orderSelectedFields({ mixed: { logo: branding.logo, value: other.value } });
	expect(mapResultRow(mixed, [null, null], { branding: false, other: false }))
		.toEqual({ mixed: { logo: null, value: null } });
});

test('join presence uses driver values before custom decoding', () => {
	let decoded = 0;
	const nullableText = customType<{ data: null; driverData: string }>({
		dataType: () => 'text',
		fromDriver: () => {
			decoded++;
			return null;
		},
	});
	const table = pgTable('decoded', { first: nullableText(), second: nullableText() });
	const fields = orderSelectedFields({ joined: { first: table.first, second: table.second } });
	for (const row of [[null, 'present'], ['present', null]]) {
		expect(mapResultRow(fields, row, { decoded: false }))
			.toEqual({ joined: { first: null, second: null } });
	}
	expect(decoded).toBe(2);
	expect(mapResultRow(fields, [null, null], { decoded: false })).toEqual({ joined: null });
	expect(decoded).toBe(2);
});
