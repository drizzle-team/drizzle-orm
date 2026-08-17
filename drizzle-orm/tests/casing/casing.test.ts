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

	it('preserves Korean characters in snake case', ({ expect }) => {
		expect(toSnakeCase('사용자이름')).toEqual('사용자이름');
	});

	it('preserves Chinese characters in snake case', ({ expect }) => {
		expect(toSnakeCase('用户名称')).toEqual('用户名称');
	});

	it('preserves Japanese characters in snake case', ({ expect }) => {
		expect(toSnakeCase('ユーザー名')).toEqual('ユーザー名');
	});

	it('handles mixed ASCII and Korean in snake case', ({ expect }) => {
		expect(toSnakeCase('userId사용자')).toEqual('user_id_사용자');
	});

	it('preserves Korean characters in camel case', ({ expect }) => {
		expect(toCamelCase('사용자이름')).toEqual('사용자이름');
	});
});
