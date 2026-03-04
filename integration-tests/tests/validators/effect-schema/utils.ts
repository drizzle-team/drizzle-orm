import { Equal, Schema as s } from 'effect';
import { AST } from 'effect/SchemaAST';
import { expect, type TestContext } from 'vitest';

export function expectSchemaShape<T extends s.Schema.Any | s.optional<s.Schema.Any>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(s.make(actual.ast as AST).toString()).toStrictEqual(s.make(expected.ast as AST).toString());
		},
	};
}

export function expectEnumValues<T extends s.Literal<any>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(s.make(actual.ast as AST).toString()).toStrictEqual(s.make(expected.ast as AST).toString());
		},
	};
}
