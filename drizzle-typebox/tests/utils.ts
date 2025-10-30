import type * as t from '@sinclair/typebox';
import { expect, type TaskContext } from 'vitest';

function removeKeysFromObject(obj: Record<string, any>, keys: string[]) {
	for (const key of keys) {
		delete obj[key];
	}
	return obj;
}

export function expectSchemaShape<T extends t.TObject>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual.properties)).toStrictEqual(Object.keys(expected.properties));
			const keys = ['$id', '$schema', 'title', 'description', 'default', 'examples', 'readOnly', 'writeOnly'];

			for (const key of Object.keys(actual.properties)) {
				expect(removeKeysFromObject(actual.properties[key]!, keys)).toStrictEqual(
					removeKeysFromObject(expected.properties[key]!, keys),
				);
			}
		},
	};
}

export function expectEnumValues<T extends t.TEnum<any>>(t: TaskContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual.anyOf).toStrictEqual(expected.anyOf);
		},
	};
}

export function Expect<_ extends true>() {}
