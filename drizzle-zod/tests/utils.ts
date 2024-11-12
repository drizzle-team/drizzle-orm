import { expect, type TaskContext } from 'vitest';
import { z } from 'zod';

export function expectSchemaShape<T extends z.ZodRawShape>(t: TaskContext, expected: z.ZodObject<T>) {
	return {
		from(actual: z.ZodObject<T>) {
			expect(Object.keys(actual.shape)).toStrictEqual(Object.keys(expected.shape));

			for (const key of Object.keys(actual.shape)) {
				expect(actual.shape[key]!._def.typeName).toStrictEqual(expected.shape[key]?._def.typeName);
				if (actual.shape[key]?._def.typeName === 'ZodOptional') {
					expect(actual.shape[key]!._def.innerType._def.typeName).toStrictEqual(
						actual.shape[key]!._def.innerType._def.typeName,
					);
				}
			}
		},
	};
}

export function expectEnumValues<T extends [string, ...string[]]>(t: TaskContext, expected: z.ZodEnum<T>) {
	return {
		from(actual: z.ZodEnum<T>) {
			expect(actual._def.values).toStrictEqual(expected._def.values);
		}
	};
}
