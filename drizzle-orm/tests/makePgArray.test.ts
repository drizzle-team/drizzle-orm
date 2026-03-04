import { describe, it } from 'vitest';
import { makePgArray } from '~/pg-core/utils/array.ts';

describe.concurrent('makePgArray', () => {
	it('parses simple 1D array', ({ expect }) => {
		const input = ['1', '2', '3'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","2","3"}');
	});

	it('parses simple 2D array', ({ expect }) => {
		const input = [
			['1', '2', '3'],
			['4', '5', '6'],
			['7', '8', '9'],
		];
		const output = makePgArray(input);
		expect(output).toEqual('{{"1","2","3"},{"4","5","6"},{"7","8","9"}}');
	});

	it('parses array with quoted values', ({ expect }) => {
		const input = ['1', '2,3', '4'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","2,3","4"}');
	});

	it('parses array with nested quoted values', ({ expect }) => {
		const input = [
			['1', '2,3', '4'],
			['5', '6,7', '8'],
		];
		const output = makePgArray(input);
		expect(output).toEqual('{{"1","2,3","4"},{"5","6,7","8"}}');
	});

	it('parses array with empty values', ({ expect }) => {
		const input = ['1', '', '3'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","","3"}');
	});

	it('parses array with empty nested values', ({ expect }) => {
		const input = [
			['1', '2', '3'],
			['', '5', '6'],
			['7', '8', '9'],
		];
		const output = makePgArray(input);
		expect(output).toEqual('{{"1","2","3"},{"","5","6"},{"7","8","9"}}');
	});

	it('parses empty array', ({ expect }) => {
		const input: string[] = [];
		const output = makePgArray(input);
		expect(output).toEqual('{}');
	});

	it('parses empty nested array', ({ expect }) => {
		const input = [[]];
		const output = makePgArray(input);
		expect(output).toEqual('{{}}');
	});

	it('parses single-level array with strings', ({ expect }) => {
		const input = ['one', 'two', 'three'];
		const output = makePgArray(input);
		expect(output).toEqual('{"one","two","three"}');
	});

	it('parses single-level array with mixed values', ({ expect }) => {
		const input = ['1', 'two', '3'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","two","3"}');
	});

	it('parses single-level array with commas inside quotes', ({ expect }) => {
		const input = ['1', 'two, three', '4'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","two, three","4"}');
	});

	it('parses single-level array with escaped quotes inside quotes', ({ expect }) => {
		const input = ['1', 'two "three", four', '5'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","two \\"three\\", four","5"}');
	});

	it('parses two-dimensional array with strings', ({ expect }) => {
		const input = [
			['one', 'two', 'three'],
			['four', 'five', 'six'],
			['seven', 'eight', 'nine'],
		];
		const output = makePgArray(input);
		expect(output).toEqual('{{"one","two","three"},{"four","five","six"},{"seven","eight","nine"}}');
	});

	it('parses two-dimensional array with mixed values and escaped quotes', ({ expect }) => {
		const input = [
			['1', 'two "and a half", three', '3'],
			['four', 'five "and a half", six', '6'],
			['seven', 'eight', 'nine'],
		];
		const output = makePgArray(input);
		expect(output).toEqual(
			'{{"1","two \\"and a half\\", three","3"},{"four","five \\"and a half\\", six","6"},{"seven","eight","nine"}}',
		);
	});

	it('parses an array with null values', ({ expect }) => {
		const input = ['1', null, '3'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1",null,"3"}');
	});

	it('parses an array with null values in nested arrays', ({ expect }) => {
		const input = [
			['1', '2', '3'],
			[null, '5', '6'],
			['7', '8', '9'],
		];
		const output = makePgArray(input);
		expect(output).toEqual('{{"1","2","3"},{null,"5","6"},{"7","8","9"}}');
	});

	it('parses string array with empty strings', ({ expect }) => {
		const input = ['1', '', '3'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","","3"}');
	});

	it('parses string array with backlash strings', ({ expect }) => {
		const input = ['1', '\n', '3\\'];
		const output = makePgArray(input);
		expect(output).toEqual('{"1","\n","3\\\\"}');
	});
});
