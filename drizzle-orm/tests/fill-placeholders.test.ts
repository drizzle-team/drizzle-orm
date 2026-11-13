import { describe, test } from 'vitest';
import { fillPlaceholders, Param, Placeholder, sql } from '~/sql/sql.ts';

describe.concurrent('fillPlaceholders', () => {
	test('passes null through without calling the encoder', ({ expect }) => {
		const calls: unknown[] = [];
		const encoder = {
			mapToDriverValue(value: unknown) {
				calls.push(value);
				return value ? 1 : 0;
			},
		};

		const params = [new Param(sql.placeholder('flag'), encoder)];

		expect(fillPlaceholders(params, { flag: null })).toEqual([null]);
		expect(calls).toEqual([]);
	});

	test('still encodes non-null placeholder values', ({ expect }) => {
		const encoder = { mapToDriverValue: (value: unknown) => (value ? 1 : 0) };
		const params = [new Param(sql.placeholder('flag'), encoder)];

		expect(fillPlaceholders(params, { flag: true })).toEqual([1]);
		expect(fillPlaceholders(params, { flag: false })).toEqual([0]);
	});

	test('passes null through for a bare placeholder', ({ expect }) => {
		expect(fillPlaceholders([new Placeholder('a')], { a: null })).toEqual([null]);
	});
});
