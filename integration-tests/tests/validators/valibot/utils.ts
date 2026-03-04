import type * as v from 'valibot';
import { expect, type TestContext } from 'vitest';

function onlySpecifiedKeys(obj: Record<string, any>, keys: string[]) {
	return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export function expectSchemaShape<T extends v.ObjectSchema<v.ObjectEntries, undefined>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(Object.keys(actual.entries)).toStrictEqual(Object.keys(expected.entries));

			for (const key of Object.keys(actual.entries)) {
				const actualEntry = actual.entries[key] as any;
				const expectedEntry = expected.entries[key] as any;
				const keys = ['kind', 'type', 'expects', 'async', 'message'];
				actualEntry.pipe ??= [];
				expectedEntry.pipe ??= [];

				expect(onlySpecifiedKeys(actualEntry, keys)).toStrictEqual(onlySpecifiedKeys(expectedEntry, keys));
				expect(actualEntry.pipe.length).toStrictEqual(expectedEntry.pipe.length);

				for (let i = 0; i < actualEntry.pipe.length; i++) {
					const actualPipeElement = actualEntry.pipe[i];
					const expectedPipeElement = expectedEntry.pipe[i];
					expect(onlySpecifiedKeys(actualPipeElement, keys)).toStrictEqual(
						onlySpecifiedKeys(expectedPipeElement, keys),
					);
				}
			}
		},
	};
}

export function expectEnumValues<T extends v.EnumSchema<any, undefined>>(t: TestContext, expected: T) {
	return {
		from(actual: T) {
			expect(actual.enum).toStrictEqual(expected.enum);
		},
	};
}

export function Expect<_ extends true>() {}
