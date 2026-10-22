import { describe, it } from 'vitest';
import { CasingCache, toCamelCase, toSnakeCase } from '~/casing';
import { pgTable, text } from '~/pg-core';

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
		expect(toSnakeCase('칼럼1')).toEqual('칼럼1');
		expect(toSnakeCase('사용자ID')).toEqual('사용자_id');
		expect(toSnakeCase('日本語Test')).toEqual('日本語_test');
		expect(toSnakeCase('한글colName')).toEqual('한글_col_name');
		expect(toSnakeCase('имяПользователя')).toEqual('имя_пользователя');
	});

	it('preserves non-Latin identifiers in camel case', ({ expect }) => {
		expect(toCamelCase('칼럼명')).toEqual('칼럼명');
		expect(toCamelCase('칼럼_명')).toEqual('칼럼명');
		expect(toCamelCase('привет_мир')).toEqual('приветМир');
		expect(toCamelCase('año_nuevo')).toEqual('añoNuevo');
	});

	it('handles accented Latin characters', ({ expect }) => {
		expect(toSnakeCase('café')).toEqual('café');
		expect(toSnakeCase('userNaïve')).toEqual('user_naïve');
		expect(toSnakeCase('añoNuevo')).toEqual('año_nuevo');
		expect(toCamelCase('café_au_lait')).toEqual('caféAuLait');
	});

	it('preserves non-Latin column names in CasingCache', ({ expect }) => {
		const users = pgTable('users', {
			칼럼명: text(),
		});
		const cache = new CasingCache('snake_case');
		expect(cache.getColumnCasing(users.칼럼명)).toEqual('칼럼명');
	});
});
