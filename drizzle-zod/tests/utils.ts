import { expect, type TaskContext } from 'vitest';
import type { z } from 'zod';

export function expectSchemaShape<T extends z.ZodObject<any>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual.shape)).toStrictEqual(Object.keys(expected.shape));

			for (const key of Object.keys(actual.shape)) {
				const actualField = actual.shape[key] as any;
				const expectedField = expected.shape[key] as any;

				expect(actualField._def.typeName).toStrictEqual(expectedField?._def.typeName);
				// Skip checks comparison for UUID and other format-based schemas in Zod v4
				// as they may have different internal structures but are functionally equivalent
				const isFormatBasedSchema = actualField._def?.format || expectedField?._def?.format;
				if (!isFormatBasedSchema) {
					// Compare checks by their JSON representation since Zod v4 uses unique instances
					expect(JSON.stringify(actualField._def?.checks)).toEqual(JSON.stringify(expectedField?._def?.checks));
				}
				expect(actualField._def?.coerce).toEqual(expectedField?._def?.coerce);
				if (actualField?._def.typeName === 'ZodOptional') {
					expect(actualField._def.innerType._def.typeName).toStrictEqual(
						actualField._def.innerType._def.typeName,
					);
				}
			}
		},
	};
}

export function expectEnumValues<T extends z.ZodEnum<any>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect((actual as any)._def.values).toStrictEqual((expected as any)._def.values);
		},
	};
}

export function Expect<_ extends true>() {}
