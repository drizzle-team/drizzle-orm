import { describe, expect, test } from 'vitest';

import { alias, boolean, integer, pgTable, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const branding = pgTable('branding', {
	logo: text(),
	background: text(),
	caption: text(),
	count: integer(),
	visible: boolean(),
});
const other = pgTable('other', { value: text() });

const map = (selection: Record<string, unknown>, row: unknown[], joins: Record<string, boolean> | undefined) =>
	mapResultRow(orderSelectedFields(selection), row, joins);

describe('nested partial-select nullification', () => {
	const fields = { logo: branding.logo, background: branding.background, caption: branding.caption };
	const values = { logo: null, background: '#1a8cff', caption: null };
	const orders = [
		['logo', 'background', 'caption'],
		['logo', 'caption', 'background'],
		['background', 'logo', 'caption'],
		['background', 'caption', 'logo'],
		['caption', 'logo', 'background'],
		['caption', 'background', 'logo'],
	] as const;
	for (const order of orders) {
		test(`preserves the joined object with field order ${order.join(', ')}`, () => {
			const selection = Object.fromEntries(order.map((key) => [key, fields[key]]));
			expect(map({ branding: selection }, order.map((key) => values[key]), { branding: false }))
				.toEqual({ branding: values });
		});
	}

	test('zero after null is a value, not an absent joined row', () => {
		expect(map({ branding: { logo: branding.logo, count: branding.count } }, [null, 0], { branding: false }))
			.toEqual({ branding: { logo: null, count: 0 } });
	});
	test('false after null is a value, not an absent joined row', () => {
		expect(map({ branding: { logo: branding.logo, visible: branding.visible } }, [null, false], { branding: false }))
			.toEqual({ branding: { logo: null, visible: false } });
	});
	test('an empty string after null is a value, not an absent joined row', () => {
		expect(map({ branding: { logo: branding.logo, background: branding.background } }, [null, ''], { branding: false }))
			.toEqual({ branding: { logo: null, background: '' } });
	});
	test('all-null columns of a nullable joined table still collapse', () => {
		expect(map({ branding: fields }, [null, null, null], { branding: false })).toEqual({ branding: null });
	});
	test('all-null columns of a non-nullable table do not collapse', () => {
		expect(map({ branding: fields }, [null, null, null], { branding: true }))
			.toEqual({ branding: { logo: null, background: null, caption: null } });
	});
	test('mapping without join metadata is unchanged', () => {
		expect(map({ branding: fields }, [null, null, null], undefined))
			.toEqual({ branding: { logo: null, background: null, caption: null } });
	});
	test('flat selected fields do not participate in nested nullification', () => {
		expect(map(fields, [null, '#1a8cff', null], { branding: false })).toEqual(values);
	});
	test('a single nullable selected column retains its existing behavior', () => {
		expect(map({ branding: { logo: branding.logo } }, [null], { branding: false })).toEqual({ branding: null });
	});
	test('the join map uses the table alias, not the output object name', () => {
		const selected = alias(branding, 'selected_branding');
		expect(
			map({ appearance: { logo: selected.logo, background: selected.background } }, [null, '#1a8cff'], {
				branding: true,
				selected_branding: false,
			}),
		)
			.toEqual({ appearance: { logo: null, background: '#1a8cff' } });
	});
	test('one nested object containing different tables is not collapsed', () => {
		expect(
			map({ combined: { logo: branding.logo, value: other.value } }, [null, null], { branding: false, other: false }),
		).toEqual({ combined: { logo: null, value: null } });
	});
	test('two nested joined objects have independent nullification state', () => {
		expect(
			map({ branding: { logo: branding.logo, background: branding.background }, other: { value: other.value } }, [
				null,
				'#1a8cff',
				null,
			], { branding: false, other: false }),
		)
			.toEqual({ branding: { logo: null, background: '#1a8cff' }, other: null });
	});
	test('column decoding still runs for a later non-null value', () => {
		expect(map({ branding: { logo: branding.logo, count: branding.count } }, [null, '42'], { branding: false }))
			.toEqual({ branding: { logo: null, count: 42 } });
	});
});
