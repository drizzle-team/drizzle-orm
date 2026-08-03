import { describe, it } from 'vitest';
import { toCamelCase, toSnakeCase } from '~/casing';
import { snakeCase, text } from '~/sqlite-core';

describe.concurrent('casing', () => {
	it('transforms to snake case', ({ expect }) => {
		expect(toSnakeCase('drizzleKit')).toEqual('drizzle_kit');
	});

	it('preserves non-Latin identifiers in snake case', ({ expect }) => {
		expect(toSnakeCase('칼럼명')).toEqual('칼럼명');
	});

	it('preserves non-Latin identifiers in snake case tables', ({ expect }) => {
		const table = snakeCase.table('a', { 칼럼명: text() });

		expect(table.칼럼명.name).toEqual('칼럼명');
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

	it('preserves non-Latin identifiers in camel case', ({ expect }) => {
		expect(toCamelCase('칼럼명')).toEqual('칼럼명');
	});
});
