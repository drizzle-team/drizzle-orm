import { type ExecutionContext } from 'ava';
import { z } from 'zod';

export function assertSchemasEqual<T extends z.SomeZodObject>(t: ExecutionContext, actual: T, expected: T) {
	t.deepEqual(Object.keys(actual.shape), Object.keys(expected.shape));

	Object.keys(actual.shape).forEach((key) => {
		t.deepEqual(actual.shape[key]!._def.typeName, expected.shape[key]?._def.typeName);
		if (actual.shape[key] instanceof z.ZodOptional) {
			t.deepEqual(actual.shape[key]!._def.innerType._def.typeName, expected.shape[key]!._def.innerType._def.typeName);
		}
	});
}
