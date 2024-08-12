import type { TSchema } from '@sinclair/typebox';
import { expect, type TaskContext } from 'vitest';

export function expectSchemaShape<T extends TSchema>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual)).toStrictEqual(Object.keys(expected));

			for (const key of Object.keys(actual)) {
				expect(actual[key].type).toStrictEqual(expected[key]?.type);
				if (actual[key].optional) {
					expect(actual[key].optional).toStrictEqual(expected[key]?.optional);
				}
			}
		},
	};
}
