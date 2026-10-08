import type { VineEnum, VineObject } from '@vinejs/vine';
import { expect } from 'vitest';

/**
 * Recursively walks a VineJS schema instance and returns a normalized
 * description that can be compared between two schemas.
 */
function describeSchema(schema: any): Record<string, unknown> {
	const name: string = schema?.constructor?.name ?? 'unknown';

	const isNullable = name === 'NullableModifier';
	const isOptional = name === 'OptionalModifier';

	if (isNullable || isOptional) {
		const inner = describeSchema(schema['#schema'] ?? schema['schema'] ?? schema['parent']);
		return {
			...inner,
			['nullable']: isNullable || inner['nullable'],
			['optional']: isOptional || inner['optional'],
		};
	}

	const base: Record<string, unknown> = { type: name, ['nullable']: false, ['optional']: false };

	const validations: any[] = schema['validations'] ?? [];
	for (const v of validations) {
		const vName: string = v?.rule?.validator?.name ?? v?.constructor?.name ?? '';
		if (vName === 'minRule' || vName === 'min') base['min'] = v.options?.min ?? v.min;
		if (vName === 'maxRule' || vName === 'max') base['max'] = v.options?.max ?? v.max;
		if (vName === 'withoutDecimalsRule' || vName === 'withoutDecimals') base['integer'] = true;
		if (vName === 'maxLengthRule' || vName === 'maxLength') base['maxLength'] = v.options?.maxLength ?? v.maxLength;
		if (vName === 'fixedLengthRule' || vName === 'fixedLength') {
			base['fixedLength'] = v.options?.size ?? v.options?.fixedLength ?? v.fixedLength;
		}
		if (vName === 'uuidRule' || vName === 'uuid') base['uuid'] = true;
		if (vName === 'regexRule' || vName === 'regex') base['regex'] = String(v.options?.pattern ?? v.pattern ?? '');
	}

	return base;
}

/**
 * Compare two VineObject schemas – checks that:
 * 1. The property key sets are identical.
 * 2. Each property has the same VineJS schema type (and nullable / optional modifiers).
 */
export function expectSchemaShape(_t: unknown, expected: VineObject<any, any, any, any>) {
	return {
		from(actual: VineObject<any, any, any, any>) {
			const actualProps = actual.getProperties();
			const expectedProps = expected.getProperties();

			expect(Object.keys(actualProps).sort()).toStrictEqual(Object.keys(expectedProps).sort());

			for (const key of Object.keys(expectedProps)) {
				const actualDesc = describeSchema(actualProps[key]);
				const expectedDesc = describeSchema(expectedProps[key]);
				expect(actualDesc, `property "${key}"`).toStrictEqual(expectedDesc);
			}
		},
	};
}

/**
 * Compare two VineEnum schemas by their allowed values.
 */
export function expectEnumValues(_t: unknown, expected: VineEnum<any>) {
	return {
		from(actual: VineEnum<any>) {
			const getChoices = (s: any): unknown[] =>
				s['#choices'] ?? s['choices'] ?? s['values'] ?? s['options']?.choices ?? [];
			expect(getChoices(actual)).toStrictEqual(getChoices(expected));
		},
	};
}

/** Compile-time assertion helper — never called at runtime. */
export function Expect<_ extends true>() {}
