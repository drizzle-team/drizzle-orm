import type { ExecutionContext } from 'ava';
import type { BaseSchema } from 'valibot';

export function expectSchemaShape<T extends BaseSchema<any, any>>(t: ExecutionContext, expected: T) {
	return {
		from(actual: T) {
			t.deepEqual(Object.keys(actual), Object.keys(expected));
		},
	};
}
