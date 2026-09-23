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

	// number-word boundary: digits attach to the word they follow, regardless of the
	// preceding letter casing (lowercase, uppercase abbreviation, or capitalized word)
	it('keeps a digit attached to a preceding capitalized word when transforming to snake case', ({ expect }) => {
		expect(toSnakeCase('testStuffM3')).toEqual('test_stuff_m3');
	});

	it('keeps a digit attached to a preceding uppercase abbreviation when transforming to snake case', ({ expect }) => {
		expect(toSnakeCase('userID2')).toEqual('user_id2');
	});

	it('keeps a digit attached to a preceding uppercase abbreviation followed by more words when transforming to snake case', ({ expect }) => {
		expect(toSnakeCase('totalUsageM3PerA')).toEqual('total_usage_m3_per_a');
	});

	it('keeps a digit attached to a mixed-case abbreviation when transforming to snake case', ({ expect }) => {
		expect(toSnakeCase('parentEN1Proof')).toEqual('parent_en1_proof');
	});

	it('leaves a digit already attached to a lowercase word unchanged when transforming to snake case', ({ expect }) => {
		expect(toSnakeCase('foo2Bar')).toEqual('foo2_bar');
	});

	it('leaves a digit already attached to a camel case abbreviation unchanged when transforming to snake case', ({ expect }) => {
		expect(toSnakeCase('parentEn1Proof')).toEqual('parent_en1_proof');
	});

	it('does not split an uppercase acronym followed by another word when a digit is not involved', ({ expect }) => {
		expect(toSnakeCase('drizzleORMAndKit')).toEqual('drizzle_orm_and_kit');
	});

	it('keeps a digit attached to a preceding capitalized word when transforming to camel case', ({ expect }) => {
		expect(toCamelCase('test_stuff_m3')).toEqual('testStuffM3');
	});

	it('keeps a digit attached to a preceding uppercase abbreviation when transforming to camel case', ({ expect }) => {
		expect(toCamelCase('user_id2')).toEqual('userId2');
	});

	it('leaves a digit already attached to a lowercase word unchanged when transforming to camel case', ({ expect }) => {
		expect(toCamelCase('foo2_bar')).toEqual('foo2Bar');
	});
});
