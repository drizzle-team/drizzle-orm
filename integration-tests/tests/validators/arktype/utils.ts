import type { Type } from 'arktype';
import { expect, type TestContext } from 'vitest';

export function expectSchemaShape<T extends Type<any, any>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual.json).toStrictEqual(expected.json);
			expect(actual.expression).toStrictEqual(expected.expression);
		},
	};
}

export const expectEnumValues = expectSchemaShape;

export function Expect<_ extends true>() {}
