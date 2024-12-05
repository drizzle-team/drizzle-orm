import type { BaseIssue, BaseSchema } from 'valibot';
import { expect } from 'vitest';

export function expectSchemaShape(
	expected: BaseSchema<unknown, unknown, BaseIssue<unknown>>,
) {
	return {
		from(actual: BaseSchema<unknown, unknown, BaseIssue<unknown>>) {
			expect(Object.keys(actual)).toStrictEqual(Object.keys(expected));
		},
	};
}
