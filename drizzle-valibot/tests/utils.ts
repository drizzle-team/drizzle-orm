import type { ExecutionContext } from 'ava';
import type { BaseIssue, BaseSchema } from 'valibot';

// TODO: `expected` is more specific than `actual`. Therefore, `expected` should extend from `actual`, but this only works if `actual` is used first. See the commented code below.
export function expectSchemaShape(t: ExecutionContext, expected: BaseSchema<unknown, unknown, BaseIssue<unknown>>) {
	return {
		from(actual: BaseSchema<unknown, unknown, BaseIssue<unknown>>) {
			// TODO: This check is very weak because it only checks for the existence of keys.
			t.deepEqual(Object.keys(actual), Object.keys(expected));
		},
	};
}

// export function expectSchemaShape<TEntries1 extends ObjectEntries>(t: ExecutionContext, actual: ObjectSchema<TEntries1, undefined>) {
// 	return {
// 		deepEqual<TEntries2 extends TEntries1>(expected: ObjectSchema<TEntries2, undefined>) {
// 			t.deepEqual(Object.keys(actual), Object.keys(expected));
// 		},
// 	};
// }
