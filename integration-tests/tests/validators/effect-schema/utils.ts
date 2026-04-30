import { Schema as s } from 'effect';
import { expect, type TestContext } from 'vitest';

const parseBigInt = (_: any, value: any) => (typeof value === 'bigint' ? `${value}n` : value);

export const stringifySchema = (schema: s.Top): string => JSON.stringify(schema.ast, parseBigInt, 2);

export function expectSchemaShape<T extends s.Top>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(stringifySchema(actual)).toStrictEqual(stringifySchema(expected));
		},
	};
}

export function expectEnumValues<T extends s.Top>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(stringifySchema(actual)).toStrictEqual(stringifySchema(expected));
		},
	};
}
