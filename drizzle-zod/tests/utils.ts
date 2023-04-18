import { type ExecutionContext } from 'ava';
import { z } from 'zod';

export function assertSchemasEqual<T extends z.SomeZodObject>(t: ExecutionContext, actual: T, expected: T) {
	t.deepEqual(Object.keys(actual.shape), Object.keys(expected.shape));

	for (const key of Object.keys(actual.shape)) {
		t.deepEqual(actual.shape[key]!._def.typeName, expected.shape[key]?._def.typeName, `key: ${key}`);
		if (actual.shape[key] instanceof z.ZodOptional) {
			t.deepEqual(
				actual.shape[key]!._def.innerType._def.typeName,
				expected.shape[key]!._def.innerType._def.typeName,
				`key (optional): ${key}`,
			);
		}
	}
}
