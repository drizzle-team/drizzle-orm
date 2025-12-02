import type { JsonBigIntOptions } from './lib';
import { Cache, CONSTRUCTOR_ACTIONS, error, ignore, isNonNullObject, preserve, PROTO_ACTIONS } from './lib';

const bigint = `bigint`;
const number = `number`;

// regexpxs extracted from
// (c) BSD-3-Clause
// https://github.com/fastify/secure-json-parse/graphs/contributors and https://github.com/hapijs/bourne/graphs/contributors
const SUSPECT_PROTO_RX =
	/(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])/;
const SUSPECT_CONSTRUCTOR_RX =
	/(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)/;

const ESCAPEE = {
	'"': `"`,
	'\\': `\\`,
	'/': `/`,
	b: `\b`,
	f: `\f`,
	n: `\n`,
	r: `\r`,
	t: `\t`,
} as const;

type StringOrNumberOrSymbol = string | number | symbol;
type SimpleSchema =
	| `number`
	| `bigint`
	| ((n: number | bigint) => `number` | `bigint`);
type InternalSchema =
	| SimpleSchema
	| (InternalSchema | null)[]
	| { [key: StringOrNumberOrSymbol]: InternalSchema | undefined };
export type Schema<T = unknown> = unknown extends T ? InternalSchema
	: T extends number | number | bigint ? SimpleSchema
	: T extends (infer E)[] ? (Schema<E> | null)[]
	// unknown wouldn't work for interface, have to be any, see https://github.com/microsoft/TypeScript/issues/42825
	: T extends Record<StringOrNumberOrSymbol, any> ? {
			[
				K in keyof T as K extends symbol ? never
					// This is originally to filter out the keys that don't need
					// schema, but somehow mysteriously make the compiler always omit
					// keys that have generic type itself, for example:
					// const f = <T>() => {
					//     const sch: Schema<{ a: T, b: string }>
					// }
					// gives sch type {}
					// It is not the type of sch extends Record<StringOrNumberOrSymbol, never>.
					// When trying something like this
					//   : Schema<T[K]> extends Record<StringOrNumberOrSymbol, never>
					//   ? K | symbol
					//   K | symbol]?: Schema<T[K]>;
					// the type of sch is still { b?: undefined } only.
					// Meaning the key 'a' is always removed for some reason.

					//   : Schema<T[K]> extends Record<StringOrNumberOrSymbol, never>
					//   ? never
					: K | symbol
			]?: Schema<T[K]>;
		}
	: never;

// TODO: Infer parsed type when schema generic parameter is known
// type Parsed<S> = S extends SchemaNumberOrBigIntOrFn
//     ? number | bigint | string
//     : S extends (infer E | null)[]
//     ? Parsed<E>[]
//     : S extends Record<string | number | symbol, infer E>
//     ? { [K in keyof S as K extends symbol ? string : K]: Parsed<E> } & Record<
//           string | number | symbol,
//           unknown
//       >
//     : any;
type JsonValue =
	| { [key: string]: JsonValue }
	| JsonValue[]
	| string
	| number
	| bigint
	| boolean
	| null;
// Closure for internal state variables.
// Parser's internal state variables are prefixed with p_, methods are prefixed with p
export const newParse = (
	p_user_options?: JsonBigIntOptions,
): <T>(
	text: string,
	reviver?: Parameters<typeof JSON.parse>[1] | null,
	schema?: Schema<T>,
) => ReturnType<typeof JSON.parse> => {
	// This returns a function that can parse a JSON text, producing a JavaScript
	// data structure. It is a simple, recursive descent parser. It does not use
	// eval or regular expressions, so it can be used as a model for implementing
	// a JSON parser in other languages.

	let p_current_char_index: number, // Index of current character
		p_current_char: string, // Current character
		p_text: string; // Text being parsed

	// Default options.
	const p_options: JsonBigIntOptions = {
		errorOnBigIntDecimalOrScientific: false,
		errorOnDuplicatedKeys: false,
		parseBigIntAsString: false,
		alwaysParseAsBigInt: false, // Toggles whether all numbers should be BigInt
		protoAction: preserve,
		constructorAction: preserve,
	};

	// If there are options, then use them to override the default options.
	// These checks are for JS users with no type checking.
	if (p_user_options) {
		if (
			p_user_options.strict === true
			|| p_user_options.errorOnBigIntDecimalOrScientific === true
		) {
			p_options.errorOnBigIntDecimalOrScientific = true;
		}
		if (
			p_user_options.strict === true
			|| p_user_options.errorOnDuplicatedKeys === true
		) {
			p_options.errorOnDuplicatedKeys = true;
		}
		if (p_user_options.parseBigIntAsString === true) {
			p_options.parseBigIntAsString = true;
		}
		if (p_user_options.alwaysParseAsBigInt === true) {
			p_options.alwaysParseAsBigInt = true;
		}

		if (p_user_options.protoAction) {
			if (PROTO_ACTIONS.includes(p_user_options.protoAction)) {
				p_options.protoAction = p_user_options.protoAction;
			} else {
				throw new Error(
					// This case is possible in JS but not TS.
					`Incorrect value for protoAction option, must be ${
						PROTO_ACTIONS.map(
							(a) => `"${a}"`,
						).join(` or `)
					} but passed ${p_user_options.protoAction}`,
				);
			}
		}
		if (p_user_options.constructorAction) {
			if (CONSTRUCTOR_ACTIONS.includes(p_user_options.constructorAction)) {
				p_options.constructorAction = p_user_options.constructorAction;
			} else {
				throw new Error(
					// This case is possible in JS but not TS.
					`Incorrect value for constructorAction option, must be ${
						CONSTRUCTOR_ACTIONS.map(
							(a) => `"${a}"`,
						).join(` or `)
					} but passed ${p_user_options.constructorAction}`,
				);
			}
		}
	}

	const pError = (m: string) => {
		// Call error when something is wrong.
		throw {
			name: `SyntaxError`,
			message: m,
			at: p_current_char_index,
			text: p_text,
		};
	};
	const pCurrentCharIs = (c: string) => {
		// Verify that it matches the current character.
		if (c !== p_current_char) {
			return pError(`Expected '` + c + `' instead of '` + p_current_char + `'`);
		}
	};
	const pNext = (c?: string) => {
		// Get the next character. When there are no more characters,
		// return the empty string.
		p_current_char = p_text.charAt(++p_current_char_index);
		// If a c parameter is provided, verify that it matches the next character.
		if (c) pCurrentCharIs(c);
		return p_current_char;
	};
	const pSkipWhite = () => {
		// Skip whitespace.
		while (p_current_char && p_current_char <= ` `) {
			pNext();
		}
	};

	const pObject = (schema?: InternalSchema) => {
		// Parse an object value.

		const result = (
			p_options.protoAction === preserve ? Object.create(null) : {}
		) as Record<string, JsonValue>;

		if (p_current_char === `{`) {
			pNext();
			pSkipWhite();
			// @ts-expect-error next() change ch
			if (p_current_char === `}`) {
				pNext();
				return result; // empty object
			}
			while (p_current_char) {
				const key = pString();
				const sub_schema = isNonNullObject(schema) && !Array.isArray(schema)
					? schema[key] || schema[Symbol.for(`any`)]
					: undefined;
				pSkipWhite();
				pCurrentCharIs(`:`);
				pNext();
				if (
					p_options.errorOnDuplicatedKeys === true
					&& Object.hasOwnProperty.call(result, key)
				) {
					pError(`Duplicate key "${key}"`);
				}

				if (SUSPECT_PROTO_RX.test(key) === true) {
					if (p_options.protoAction === error) {
						pError(`Object contains forbidden prototype property`);
					} else if (p_options.protoAction === ignore) {
						pJsonValue();
					} else {
						result[key] = pJsonValue(sub_schema);
					}
				} else if (SUSPECT_CONSTRUCTOR_RX.test(key) === true) {
					if (p_options.constructorAction === error) {
						pError(`Object contains forbidden constructor property`);
					} else if (p_options.constructorAction === ignore) {
						pJsonValue();
					} else {
						result[key] = pJsonValue(sub_schema);
					}
				} else {
					result[key] = pJsonValue(sub_schema);
				}

				pSkipWhite();
				// @ts-expect-error next() change ch
				if (p_current_char === `}`) {
					pNext();
					if (p_options.protoAction === preserve) {
						Object.setPrototypeOf(result, Object.prototype);
					}
					return result;
				}
				pCurrentCharIs(`,`);
				pNext();
				pSkipWhite();
			}
		}
		return pError(`Bad object`);
	};

	const pArray = (schema?: InternalSchema) => {
		// Parse an array value.

		const result: JsonValue[] = [];

		if (p_current_char === `[`) {
			pNext();
			pSkipWhite();
			// @ts-expect-error next() change ch.
			if (p_current_char === `]`) {
				pNext();
				return result; // empty array
			}
			const is_array = Array.isArray(schema);
			const is_tuple_like = is_array && schema.length > 1;
			while (p_current_char) {
				result.push(
					pJsonValue(
						(is_tuple_like
							? schema[result.length]
							: is_array
							? schema[0]
							: undefined) as undefined, // It's ok to cast null to undefined
					),
				);
				pSkipWhite();
				// @ts-expect-error next() change ch
				if (p_current_char === `]`) {
					pNext();
					return result;
				}
				pCurrentCharIs(`,`);
				pNext();
				pSkipWhite();
			}
		}
		return pError(`Bad array`);
	};

	const pString = () => {
		// Parse a string value.

		let result = ``;

		// When parsing for string values, we must look for " and \ characters.

		if (p_current_char === `"`) {
			let start_at = p_current_char_index + 1;
			while (pNext()) {
				if (p_current_char === `"`) {
					if (p_current_char_index > start_at) {
						result += p_text.substring(start_at, p_current_char_index);
					}
					pNext();
					return result;
				}
				if (p_current_char === `\\`) {
					if (p_current_char_index > start_at) {
						result += p_text.substring(start_at, p_current_char_index);
					}
					pNext();
					if (p_current_char === `u`) {
						let uffff = 0;
						for (let i = 0; i < 4; i += 1) {
							const hex = parseInt(pNext(), 16);
							if (!isFinite(hex)) {
								break;
							}
							uffff = uffff * 16 + hex;
						}
						result += String.fromCharCode(uffff);
					} else if (typeof ESCAPEE[p_current_char] === `string`) {
						result += ESCAPEE[p_current_char];
					} else {
						break;
					}
					start_at = p_current_char_index + 1;
				}
			}
		}
		return pError(`Bad string`);
	};

	const pNumber = (() => {
		// TODO: Add test
		const cache = new Cache<
			string,
			Map<SimpleSchema | undefined | null, number | bigint | string>
		>();
		return (schema?: SimpleSchema | null) => {
			// Parse a number value.

			let result_string = ``;
			let is_positive = true; // for Infinity

			if (p_current_char === `-`) {
				result_string = p_current_char;
				is_positive = false;
				pNext();
			}
			if (p_current_char === `0`) {
				result_string += p_current_char;
				pNext();
				if (p_current_char >= `0` && p_current_char <= `9`) {
					pError(`Bad number`);
				}
			}
			while (p_current_char >= `0` && p_current_char <= `9`) {
				result_string += p_current_char;
				pNext();
			}
			if (p_current_char === `.`) {
				result_string += p_current_char;
				while (pNext() && p_current_char >= `0` && p_current_char <= `9`) {
					result_string += p_current_char;
				}
			}
			if (p_current_char === `e` || p_current_char === `E`) {
				result_string += p_current_char;
				pNext();
				// @ts-expect-error next() change ch
				if (p_current_char === `-` || p_current_char === `+`) {
					result_string += p_current_char;
					pNext();
				}
				while (p_current_char >= `0` && p_current_char <= `9`) {
					result_string += p_current_char;
					pNext();
				}
			}
			const raw_schema = schema;
			const cache_string = cache.get(result_string);
			if (!cache_string || !cache_string.has(raw_schema)) {
				const cache_schema = cache_string || cache.set(result_string, new Map());
				const result_number = Number(result_string);
				if (Number.isNaN(result_number)) {
					cache_schema.set(raw_schema, NaN);
				} else if (!Number.isFinite(result_number)) {
					cache_schema.set(raw_schema, is_positive ? Infinity : -Infinity);
				} else {
					// Decimal or scientific notation
					// cannot be BigInt, aka BigInt("1.79e+308") will throw.
					const is_decimal_or_scientific = /[.eE]/.test(result_string);
					if (Number.isSafeInteger(result_number) || is_decimal_or_scientific) {
						if (typeof schema === `function`) schema = schema(result_number);
						cache_schema.set(
							raw_schema,
							schema === number
								|| (!p_options.alwaysParseAsBigInt && schema !== bigint)
								|| (is_decimal_or_scientific
									&& !p_options.errorOnBigIntDecimalOrScientific)
								? result_number
								: is_decimal_or_scientific
								? pError(`Decimal and scientific notation cannot be bigint`)
								: BigInt(result_string),
						);
					} else {
						let result_bigint;
						if (typeof schema === `function`) {
							result_bigint = BigInt(result_string);
							schema = schema(result_bigint);
						}
						if (schema === number) cache_schema.set(raw_schema, result_number);
						else {
							cache_schema.set(
								raw_schema,
								p_options.parseBigIntAsString
									? result_string
									: result_bigint || BigInt(result_string),
							);
						}
					}
				}
			}
			const result = cache.get(result_string)!.get(raw_schema)!; // Cannot be undefined
			return Number.isNaN(result) ? pError(`Bad number`) : result;
		};
	})();

	const pBooleanOrNull = () => {
		// true, false, or null.
		switch (p_current_char) {
			case `t`:
				pNext(`r`);
				pNext(`u`);
				pNext(`e`);
				pNext();
				return true;
			case `f`:
				pNext(`a`);
				pNext(`l`);
				pNext(`s`);
				pNext(`e`);
				pNext();
				return false;
			case `n`:
				pNext(`u`);
				pNext(`l`);
				pNext(`l`);
				pNext();
				return null;
		}
		return pError(`Unexpected '${p_current_char}'`);
	};

	const pJsonValue = (schema?: InternalSchema): JsonValue => {
		// Parse a JSON value. It could be an object, an array, a string, a number,
		// or boolean or null.

		pSkipWhite();
		switch (p_current_char) {
			case `{`:
				return pObject(schema);
			case `[`:
				return pArray(schema);
			case `"`:
				return pString();
			case `-`:
				return pNumber(schema as SimpleSchema);
			default:
				return p_current_char >= `0` && p_current_char <= `9`
					? pNumber(schema as SimpleSchema)
					: pBooleanOrNull();
		}
	};

	// Return the parse function.
	return (text, reviver, schema) => {
		// Reset state.
		p_current_char_index = -1; // next char will begin at 0
		p_current_char = ` `;
		p_text = String(text);

		const result = pJsonValue(schema);
		pSkipWhite();
		if (p_current_char) {
			pError(`Syntax error`);
		}

		// If there is a reviver function, we recursively walk the new structure,
		// passing each name/value pair to the reviver function for possible
		// transformation, starting with a temporary root object that holds the result
		// in an empty key. If there is not a reviver function, we simply return the
		// result.

		if (typeof reviver === `function`) {
			return (function walk(
				object_or_array: Record<string, JsonValue> | JsonValue[],
				key: string,
			) {
				// @ts-expect-error index array with string
				const value = object_or_array[key] as JsonValue;
				if (isNonNullObject(value)) {
					const revived_keys = new Set<string>();
					for (const reviving_key in value) {
						const next_object_or_array = !Array.isArray(value)
							? { ...value }
							: [...value];
						// @ts-expect-error index array with string
						revived_keys.forEach((rk) => delete next_object_or_array[rk]);
						const v = walk(next_object_or_array, reviving_key);
						revived_keys.add(reviving_key);
						if (v !== undefined) {
							// @ts-expect-error index array with string
							value[reviving_key] = v;
						} else {
							// @ts-expect-error index array with string
							delete value[reviving_key];
						}
					}
				}
				return reviver.call(object_or_array, key, value);
			})({ '': result }, ``) as JsonValue;
		}
		return result;
	};
};
