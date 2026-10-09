import { expect, test } from 'vitest';
import { customType, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const branding = pgTable('branding', {
	logo: text(),
	background: text(),
});

test('keeps nullable joined object when a later column is non-null', () => {
	const fields = orderSelectedFields({
		branding: {
			logo: branding.logo,
			background: branding.background,
		},
	});

	expect(mapResultRow(fields, [null, '#1a8cff'], { branding: false })).toEqual({
		branding: { logo: null, background: '#1a8cff' },
	});
});

test('nested join nullification is independent of selected column order', () => {
	const fields = orderSelectedFields({
		branding: {
			background: branding.background,
			logo: branding.logo,
		},
	});

	expect(mapResultRow(fields, ['#1a8cff', null], { branding: false })).toEqual({
		branding: { background: '#1a8cff', logo: null },
	});
});

test('nullifies nullable joined object only when every selected column is null', () => {
	const fields = orderSelectedFields({
		branding: {
			logo: branding.logo,
			background: branding.background,
		},
	});

	expect(mapResultRow(fields, [null, null], { branding: false })).toEqual({
		branding: null,
	});
});

test('join presence is based on raw driver values before custom decoding', () => {
	const nullableText = customType<{ data: null; driverData: string }>({
		dataType: () => 'text',
		fromDriver: () => null,
	});
	const decoded = pgTable('decoded', {
		first: nullableText(),
		second: nullableText(),
	});
	const fields = orderSelectedFields({
		joined: {
			first: decoded.first,
			second: decoded.second,
		},
	});

	expect(mapResultRow(fields, [null, 'present'], { decoded: false })).toEqual({
		joined: { first: null, second: null },
	});
	expect(mapResultRow(fields, [null, null], { decoded: false })).toEqual({
		joined: null,
	});
});
