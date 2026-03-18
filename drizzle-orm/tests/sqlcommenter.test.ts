import { expect, it } from 'vitest';
import { sqlCommenterEncode } from '~/sql/sql.ts';

it('simple encode', () => {
	const result = sqlCommenterEncode({
		route: '/users',
	});

	expect(result).toBe("/*route='%2Fusers'*/");
});

it('sort keys lexicographically', () => {
	const result = sqlCommenterEncode({
		b: '2',
		a: '1',
	});

	expect(result).toBe("/*a='1',b='2'*/");
});

it('skip null, undefined and empty string values', () => {
	const result = sqlCommenterEncode({
		a: '1',
		b: null,
		c: undefined,
		d: 0,
		e: '',
	});

	expect(result).toBe("/*a='1',d='0'*/");
});

it('encode special characters', () => {
	const result = sqlCommenterEncode({
		email: 'john@example.com',
	});

	expect(result).toBe("/*email='john%40example.com'*/");
});

it('escape single quotes', () => {
	const result = sqlCommenterEncode({
		name: "O'Reilly",
	});

	expect(result).toBe("/*name='O\\'Reilly'*/");
});

it('encode slashes', () => {
	const result = sqlCommenterEncode({
		test: '*/',
	});

	expect(result).toBe("/*test='*%2F'*/");
});

it('prevent comment closure injection', () => {
	const result = sqlCommenterEncode({
		attack: 'abc*/DROP TABLE users--',
	});

	expect(result).not.toContain('*/DROP');
	expect(result).toContain('*%2FDROP');
});

it('encode commas and equals signs', () => {
	const result = sqlCommenterEncode({
		tricky: 'a,b=c',
	});

	expect(result).toBe("/*tricky='a%2Cb%3Dc'*/");
});

it('encode keys', () => {
	const result = sqlCommenterEncode({
		'user id': '123',
	});

	expect(result).toBe("/*user%20id='123'*/");
});

it('handle boolean and number values', () => {
	const result = sqlCommenterEncode({
		flag: true,
		count: 42,
		bigint: 25n,
	});

	expect(result).toBe("/*bigint='25',count='42',flag='true'*/");
});

it('return empty string for empty input', () => {
	const result = sqlCommenterEncode({});
	expect(result).toBe('');
});

it('never emit raw single quote', () => {
	const result = sqlCommenterEncode({
		test: "a'b",
	});

	expect(result).not.toContain("'a'b'");
	expect(result).toContain("'a\\'b'");
});

it('never emit comment terminator', () => {
	const result = sqlCommenterEncode({
		test: '*/',
	}).slice(2, -2);

	expect(result).not.toContain('*/');
	expect(result).toContain('*%2F');
});

it('decode', () => {
	const input = {
		key: "a'b*/c",
	};

	const encoded = sqlCommenterEncode(input);

	const match = encoded.match(/key='(.*)'/);
	expect(match).not.toBeNull();

	const decoded = decodeURIComponent(match?.[1] ?? '');
	expect(decoded).toBe("a\\'b*/c");
});
