import { expect, type TaskContext } from 'vitest';
import type { z } from 'zod/v4';

export function expectSchemaShape<T extends z.ZodObject<z.ZodRawShape>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual.shape)).toStrictEqual(Object.keys(expected.shape));
			for (const key in Object.keys(actual.shape)) {
				expect(actual.shape[key]?._zod.def).toStrictEqual(expected.shape[key]?._zod.def);
			}
		},
	};
}

export function expectEnumValues<T extends z.ZodEnum<any>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual.def).toStrictEqual(expected.def);
		},
	};
}

export function Expect<_ extends true>() {}
