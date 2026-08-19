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

	it('preserves non-Latin identifiers instead of dropping them (snake case)', ({ expect }) => {
		// https://github.com/drizzle-team/drizzle-orm/issues/6082
		expect(toSnakeCase('칼럼명')).toEqual('칼럼명');
		expect(toSnakeCase('日本語Test')).toEqual('日本語_test');
		expect(toSnakeCase('한글colName')).toEqual('한글_col_name');
	});

	it('preserves non-Latin identifiers instead of dropping them (camel case)', ({ expect }) => {
		expect(toCamelCase('칼럼명')).toEqual('칼럼명');
		expect(toCamelCase('칼럼_명')).toEqual('칼럼명');
	});

	it('does not regress accented Latin letters', ({ expect }) => {
		expect(toSnakeCase('café')).toEqual('café');
		expect(toSnakeCase('userNaïve')).toEqual('user_naïve');
	});
});
