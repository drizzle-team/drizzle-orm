import { describe, it } from 'vitest';
import { toCamelCase, toSnakeCase } from '~/casing';

describe.concurrent('casing', () => {
	it('transforms to snake case', ({ expect }) => {
		expect(toSnakeCase('drizzleKit')).toEqual('drizzle_kit');
	});

	it('transforms an uppercase acronym/abbreviation to snake case', ({ expect }) => {
		expect(toSnakeCase('drizzleORM')).toEqual('drizzle_orm');
	});

	it('transforms a camel case acronym/abbreviation to snake case', ({ expect }) => {
		expect(toSnakeCase('drizzleOrm')).toEqual('drizzle_orm');
	});

	it('transforms an uppercase acronym/abbreviation followed by a word to snake case', ({ expect }) => {
		expect(toSnakeCase('drizzleORMAndKit')).toEqual('drizzle_orm_and_kit');
	});

	it('transforms a camel case acronym/abbreviation followed by a word to snake case', ({ expect }) => {
		expect(toSnakeCase('drizzleOrmAndKit')).toEqual('drizzle_orm_and_kit');
	});

	it('transforms to camel case 1', ({ expect }) => {
		expect(toCamelCase('drizzle_kit')).toEqual('drizzleKit');
	});

	it('preserves non-Latin identifiers in snake case', ({ expect }) => {
		expect(toSnakeCase('칼럼명')).toEqual('칼럼명');
		expect(toSnakeCase('用户名')).toEqual('用户名');
	});

	it('preserves non-Latin identifiers in camel case', ({ expect }) => {
		expect(toCamelCase('칼럼명')).toEqual('칼럼명');
		expect(toCamelCase('用户名')).toEqual('用户名');
	});

	it('splits words on case boundaries in non-Latin cased scripts', ({ expect }) => {
		expect(toSnakeCase('пользовательИмя')).toEqual('пользователь_имя');
		expect(toCamelCase('пользователь_имя')).toEqual('пользовательИмя');
	});
});
