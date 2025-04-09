import { expect, type TaskContext } from 'vitest';
import type { z } from 'zod';

export function expectSchemaShape<T extends z.ZodObject<z.ZodRawShape>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual.shape)).toStrictEqual(Object.keys(expected.shape));

			for (const key of Object.keys(actual.shape)) {
				expect(actual.shape[key]!._def.typeName).toStrictEqual(expected.shape[key]?._def.typeName);
				expect(actual.shape[key]!._def?.checks).toEqual(expected.shape[key]?._def?.checks);
				expect(actual.shape[key]!._def?.coerce).toEqual(expected.shape[key]?._def?.coerce);
				if (actual.shape[key]?._def.typeName === 'ZodOptional') {
					expect(actual.shape[key]!._def.innerType._def.typeName).toStrictEqual(
						actual.shape[key]!._def.innerType._def.typeName,
					);
				}
			}
		},
	};
}

export function expectEnumValues<T extends z.ZodEnum<[string, ...string[]]>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual._def.values).toStrictEqual(expected._def.values);
		},
	};
}

export function Expect<_ extends true>() {}
