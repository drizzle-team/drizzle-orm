import { Type } from 'arktype';
import { expect, type TaskContext } from 'vitest';

export function expectSchemaShape<T extends Type<any, any>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual.equals(expected as any)).toStrictEqual(true);
		},
	};
}

export const expectEnumValues = expectSchemaShape;

export function Expect<_ extends true>() {}
