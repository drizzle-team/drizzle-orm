import { describe, expect, it } from 'vitest';
import { arrayCompatNormalize, arrayCompatNormalizeInput, textToDate, textToDateWithTz } from '~/pg-core/codecs.ts';

describe('arrayCompatNormalize', () => {
	it('preserves null elements in 1D array with BigInt codec', () => {
		const normalize = arrayCompatNormalize(BigInt);
		const input = ['1', null, '42'];
		const output = normalize(input, 1);
		expect(output).toEqual([1n, null, 42n]);
	});

	it('preserves null elements in 1D array with Number codec', () => {
		const normalize = arrayCompatNormalize(Number);
		const input = ['1.5', null, '3.14'];
		const output = normalize(input, 1);
		expect(output).toEqual([1.5, null, 3.14]);
	});

	it('preserves null elements in 1D array with Date codecs', () => {
		const normalizeDate = arrayCompatNormalize(textToDate);
		const inputDate = ['2024-01-02', null];
		const outputDate = normalizeDate(inputDate, 1);
		expect(outputDate).toEqual([new Date('2024-01-02'), null]);

		const normalizeDateTz = arrayCompatNormalize(textToDateWithTz);
		const inputDateTz = ['2024-01-02 03:04:05', null];
		const outputDateTz = normalizeDateTz(inputDateTz, 1);
		expect(outputDateTz).toEqual([new Date('2024-01-02 03:04:05+0000'), null]);
	});

	it('preserves null elements in 2D array', () => {
		const normalize = arrayCompatNormalize(Number);
		const input = [
			['1', null],
			[null, '2'],
		];
		const output = normalize(input, 2);
		expect(output).toEqual([
			[1, null],
			[null, 2],
		]);
	});

	it('returns null when array itself is null', () => {
		const normalize = arrayCompatNormalize(Number);
		expect(normalize(null, 1)).toBeNull();
		expect(normalize(null, 2)).toBeNull();
	});
});

describe('arrayCompatNormalizeInput', () => {
	it('preserves null elements during normalization', () => {
		const normalize = arrayCompatNormalizeInput(Number);
		const input = [1, null, 2];
		const output = normalize(input, 1);
		expect(output).toEqual([1, null, 2]);
	});

	it('returns null when input itself is null', () => {
		const normalize = arrayCompatNormalizeInput(Number);
		expect(normalize(null, 1)).toBeNull();
	});
});
