import { expect, test } from 'vitest';
import { sqlCommenter } from '~/sql/sql.ts';

test('simple encode', () => {
	const result = sqlCommenter({
		route: '/users',
	});

	expect(result).toBe("/*route='%2Fusers'*/");
});

test('sort keys lexicographically', () => {
	const result = sqlCommenter({
		b: '2',
		a: '1',
	});

	expect(result).toBe("/*a='1',b='2'*/");
});

test('skip null, undefined and empty string values', () => {
	const result = sqlCommenter({
		a: '1',
		b: null,
		c: undefined,
		d: 0,
		e: '',
	});

	expect(result).toBe("/*a='1',d='0'*/");
});

test('encode special characters', () => {
	const result = sqlCommenter({
		email: 'john@example.com',
	});

	expect(result).toBe("/*email='john%40example.com'*/");
});

test('escape single quotes', () => {
	const result = sqlCommenter({
		name: "O'Reilly",
	});

	expect(result).toBe("/*name='O\\'Reilly'*/");
});

test('encode slashes', () => {
	const result = sqlCommenter({
		test: '*/',
	});

	expect(result).toBe("/*test='*%2F'*/");
});

test('prevent comment closure injection', () => {
	const result = sqlCommenter({
		attack: 'abc*/DROP TABLE users--',
	});

	expect(result).not.toContain('*/DROP');
	expect(result).toContain('*%2FDROP');
});

test('encode commas and equals signs', () => {
	const result = sqlCommenter({
		tricky: 'a,b=c',
	});

	expect(result).toBe("/*tricky='a%2Cb%3Dc'*/");
});

test('encode keys', () => {
	const result = sqlCommenter({
		'user id': '123',
	});

	expect(result).toBe("/*user%20id='123'*/");
});

test('handle boolean and number values', () => {
	const result = sqlCommenter({
		flag: true,
		count: 42,
		bigint: 25n,
	});

	expect(result).toBe("/*bigint='25',count='42',flag='true'*/");
});

test('return empty string for empty input', () => {
	const result = sqlCommenter({});
	expect(result).toBe('');
});

test('never emit raw single quote', () => {
	const result = sqlCommenter({
		test: "a'b",
	});

	expect(result).not.toContain("'a'b'");
	expect(result).toContain("'a\\'b'");
});

test('never emit comment terminator', () => {
	const result = sqlCommenter({
		test: '*/',
	}).slice(2, -2);

	expect(result).not.toContain('*/');
	expect(result).toContain('*%2F');
});

test('decode', () => {
	const input = {
		key: "a'b*/c",
	};

	const encoded = sqlCommenter(input);

	const match = encoded.match(/key='(.*)'/);
	expect(match).not.toBeNull();

	const decoded = decodeURIComponent(match?.[1] ?? '');
	expect(decoded).toBe("a\\'b*/c");
});

test('merge strings', () => {
	const encoded = sqlCommenter.merge('somestr*/', 'str2');

	expect(encoded).toStrictEqual(`/*somestr* /,str2*/`);
});

test('merge objects', () => {
	const encoded = sqlCommenter.merge({ a: 1, c: '3' }, {
		b: 2,
		x: 9,
	});

	expect(encoded).toStrictEqual(`/*a='1',b='2',c='3',x='9'*/`);
});

test('merge string with object', () => {
	const encoded = sqlCommenter.merge('somestr*/', {
		b: 2,
		x: 9,
	});

	expect(encoded).toStrictEqual(`/*somestr* /,b='2',x='9'*/`);
});

test('merge object with string', () => {
	const encoded = sqlCommenter.merge({ a: 1, c: '3' }, 'str2');

	expect(encoded).toStrictEqual(`/*a='1',c='3',str2*/`);
});

test('merge undefined with string', () => {
	const encoded = sqlCommenter.merge(undefined, 'str2');

	expect(encoded).toStrictEqual(`/*str2*/`);
});

test('merge undefined with object', () => {
	const encoded = sqlCommenter.merge(undefined, {
		b: 2,
		x: 9,
	});

	expect(encoded).toStrictEqual(`/*b='2',x='9'*/`);
});

test('merge empty string with object', () => {
	const encoded = sqlCommenter.merge('', {
		b: 2,
		x: 9,
	});

	expect(encoded).toStrictEqual(`/*b='2',x='9'*/`);
});

test('merge empty string with string', () => {
	const encoded = sqlCommenter.merge('', 'str2');

	expect(encoded).toStrictEqual(`/*str2*/`);
});

test('merge string with undefined', () => {
	const encoded = sqlCommenter.merge('str2', undefined);

	expect(encoded).toStrictEqual(`/*str2*/`);
});

test('merge object with undefined', () => {
	const encoded = sqlCommenter.merge({
		b: 2,
		x: 9,
	}, undefined);

	expect(encoded).toStrictEqual(`/*b='2',x='9'*/`);
});

test('merge object with empty string', () => {
	const encoded = sqlCommenter.merge({
		b: 2,
		x: 9,
	}, '');

	expect(encoded).toStrictEqual(`/*b='2',x='9'*/`);
});

test('merge string with empty string', () => {
	const encoded = sqlCommenter.merge('str2', '');

	expect(encoded).toStrictEqual(`/*str2*/`);
});

test('escape comments in string', () => {
	const encoded = sqlCommenter('com*/*//*ment');

	expect(encoded).toStrictEqual('/*com* / * // *ment*/');
});
