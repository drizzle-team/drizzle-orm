class AssertionError extends Error {
	actual: unknown;
	expected: unknown;
	operator: string;

	constructor(options: { message?: string; actual: unknown; expected: unknown; operator: string }) {
		super(
			options.message || `${JSON.stringify(options.actual)} ${options.operator} ${JSON.stringify(options.expected)}`,
		);
		this.name = 'AssertionError';
		this.actual = options.actual;
		this.expected = options.expected;
		this.operator = options.operator;
	}
}

type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];

function deepStrictEqualInternal(actual: JSONValue, expected: JSONValue): boolean {
	// Strict equality for primitives (string, number, boolean, null)
	if (actual === expected) {
		return true;
	}

	// If either is null or not an object, they're not equal (already checked ===)
	if (actual === null || expected === null) {
		return false;
	}

	if (typeof actual !== 'object' || typeof expected !== 'object') {
		return false;
	}

	// Handle Arrays
	if (Array.isArray(actual) && Array.isArray(expected)) {
		if (actual.length !== expected.length) {
			return false;
		}
		for (let i = 0; i < actual.length; i++) {
			if (!deepStrictEqualInternal(actual[i], expected[i])) {
				return false;
			}
		}
		return true;
	}

	// One is array, other is not
	if (Array.isArray(actual) !== Array.isArray(expected)) {
		return false;
	}

	// Handle plain objects
	const actualObj = actual as JSONObject;
	const expectedObj = expected as JSONObject;

	const actualKeys = Object.keys(actualObj);
	const expectedKeys = Object.keys(expectedObj);

	if (actualKeys.length !== expectedKeys.length) {
		return false;
	}

	for (const key of actualKeys) {
		if (!Object.prototype.hasOwnProperty.call(expectedObj, key)) {
			return false;
		}
		if (!deepStrictEqualInternal(actualObj[key], expectedObj[key])) {
			return false;
		}
	}

	return true;
}

/**
 * Tests for deep strict equality between two JSON-compatible values.
 * Supports: objects, arrays, strings, numbers, booleans, null.
 *
 * @param actual - The actual value to test
 * @param expected - The expected value
 * @param message - Optional message for the assertion error
 * @throws {AssertionError} If actual and expected are not deeply strictly equal
 */
export function deepStrictEqual<T extends JSONValue>(
	actual: JSONValue,
	expected: T,
	message?: string | Error,
): asserts actual is T {
	if (!deepStrictEqualInternal(actual, expected)) {
		if (message instanceof Error) {
			throw message;
		}
		throw new AssertionError({
			message: message || `Expected values to be strictly deep-equal`,
			actual,
			expected,
			operator: 'deepStrictEqual',
		});
	}
}

export { AssertionError };
export type { JSONArray, JSONObject, JSONValue };
export default { deepStrictEqual, AssertionError };
