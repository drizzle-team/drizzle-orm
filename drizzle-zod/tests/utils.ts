import { expect, type TestContext } from 'vitest';
import type { z } from 'zod/v4';
import type { $ZodEnumDef } from 'zod/v4/core';

export function expectSchemaShape<T extends z.ZodObject<z.ZodRawShape>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual.shape)).toStrictEqual(Object.keys(expected.shape));

			for (const key of Object.keys(actual.shape)) {
				const actualDef = actual.shape[key]?._zod.def;
				const expectedDef = expected.shape[key]?._zod.def;

				expect({
					key,
					type: actualDef?.type,
					checks: actualDef?.checks?.map((check) => check._zod.def),
				}).toStrictEqual({
					key,
					type: expectedDef?.type,
					checks: expectedDef?.checks?.map((check) => check._zod.def),
				});
			}
		},
	};
}

export function expectEnumValues<T extends z.ZodEnum<any>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual.def).toStrictEqual(expected.def as $ZodEnumDef<any>);
		},
	};
}

export function Expect<_ extends true>() {}
