import type { BaseSchema } from 'valibot';
import { expect, type TaskContext } from 'vitest';

export function expectSchemaShape<T extends BaseSchema<any, any>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual)).toStrictEqual(Object.keys(expected));
		},
	};
}
