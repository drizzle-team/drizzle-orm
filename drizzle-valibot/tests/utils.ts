import type { ExecutionContext } from 'ava';
import type { GenericSchema } from 'valibot';

export function expectSchemaShape<T extends GenericSchema>(t: ExecutionContext, expected: T) {
	return {
		from(actual: T) {
			t.deepEqual(Object.keys(actual), Object.keys(expected));
		},
	};
}
