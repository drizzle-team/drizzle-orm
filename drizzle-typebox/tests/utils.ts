import type { TSchema } from '@sinclair/typebox';
import type { ExecutionContext } from 'ava';

export function expectSchemaShape<T extends TSchema>(t: ExecutionContext, expected: T) {
	return {
		from(actual: T) {
			t.deepEqual(Object.keys(actual), Object.keys(expected));

			for (const key of Object.keys(actual)) {
				t.deepEqual(actual[key].type, expected[key]?.type, `key: ${key}`);
				if (actual[key].optional) {
					t.deepEqual(actual[key].optional, expected[key]?.optional, `key (optional): ${key}`);
				}
			}
		},
	};
}
