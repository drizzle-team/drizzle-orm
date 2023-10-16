import type { ExecutionContext } from 'ava';
import type { z } from 'zod';

export function expectSchemaShape<T extends z.ZodRawShape>(t: ExecutionContext, expected: z.ZodObject<T>) {
	return {
		from(actual: z.ZodObject<T>) {
			t.deepEqual(Object.keys(actual.shape), Object.keys(expected.shape));

			for (const key of Object.keys(actual.shape)) {
				t.deepEqual(actual.shape[key]!._def.typeName, expected.shape[key]?._def.typeName, `key: ${key}`);
				if (actual.shape[key]?._def.typeName === 'ZodOptional') {
					t.deepEqual(
						actual.shape[key]!._def.innerType._def.typeName,
						expected.shape[key]!._def.innerType._def.typeName,
						`key (optional): ${key}`,
					);
				}
			}
		},
	};
}
