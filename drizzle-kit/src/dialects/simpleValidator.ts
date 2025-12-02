import type { Simplify } from '../utils';

export const array = <T>(validate: (it: unknown) => boolean) => {
	return {
		type: {} as T,
		validate,
	};
};

type StringLiteral<T> = T extends string[] ? (string extends T[number] ? never : T[number]) : never;

type SchemaType =
	| 'string'
	| 'string[]'
	| 'number'
	| 'boolean'
	| 'array'
	| 'record'
	| number
	| string[]
	| ReturnType<typeof array>
	| { [key: string]: SchemaType };

type InferType<T> = T extends 'string' ? string
	: T extends 'number' ? number
	: T extends 'boolean' ? boolean
	: T extends 'array' ? Array<any>
	: T extends 'record' ? Record<string, string>
	: T extends Array<string> ? StringLiteral<T>
	: T extends string ? T
	: T extends number ? T
	: T extends boolean ? T
	: T extends ReturnType<typeof array<infer I>> ? I[]
	: T extends Record<string, SchemaType> ? { [K in keyof T]: InferType<T[K]> } | null
	: never;

type ResultShape<S extends Record<string, SchemaType>> = Simplify<
	{
		[K in keyof S]: InferType<S[K]>;
	}
>;

type ValidationResult<T> = {
	success: boolean;
	data: T | null;
	errors?: string[];
};

const validatorFor = (schema: Record<string, any>, path: string | undefined) => {
	const validators = {} as Record<string, (it: unknown, path: string | undefined) => string | string[] | null>;
	for (const [key, value] of Object.entries(schema)) {
		if (value === 'string') {
			validators[key] = (it: unknown) => {
				return typeof it === 'string' ? null : `Field '${path}${key}' must be a string`;
			};
		} else if (value === 'number') {
			validators[key] = (it: unknown) => {
				return typeof it === 'number' ? null : `Field '${path}${key}' must be a number`;
			};
		} else if (value === 'boolean') {
			validators[key] = (it: unknown) => {
				return typeof it === 'boolean' ? null : `Field '${path}${key}' must be a boolean`;
			};
		} else if (value === 'array') {
			validators[key] = (it: unknown) => {
				return Array.isArray(it) ? null : `Field '${path}${key}' must be an array`;
			};
		} else if (value === 'record') {
			validators[key] = (it: unknown) => {
				return typeof it === 'object' ? null : `Field '${path}${key}' must be an object`;
			};
		} else if (Array.isArray(value)) {
			// literal ["v1", "v2"] or [10, 20]
			validators[key] = (it: unknown) => {
				const msg = value.length === 1
					? `Field '${key}' must be exactly '${path}${value[0]}'`
					: `Field '${key}' must be exactly either of ['${value.join(', ')}']`;
				return value.some((entry) => entry === it) ? null : msg;
			};
		} else if (typeof value === 'object') {
			if ('type' in value && typeof value['type'] === 'object' && Object.keys(value['type']).length === 0) {
				validators[key] = (it: unknown) => {
					if (!Array.isArray(it)) return `Field '${path}${key}' must be an array`;

					for (let item of it) {
						const res = value['validate'](item);
						if (!res) return `${path}${key} array contains invalid value:\n${JSON.stringify(item, null, 2)}`;
					}

					return null;
				};
			} else {
				const validateRecord = validatorFor(value as Record<string, any>, `${key}.`);
				validators[key] = (it: unknown) => {
					if (it === null) return null;
					return validateRecord(it as any);
				};
			}
		}
	}

	const validate = (input: Record<string, unknown>): string[] => {
		const errors: string[] = [];
		for (const [key, validate] of Object.entries(validators)) {
			const value = input[key];
			if (value === undefined) {
				errors.push(`Missing required field: ${path}${key}`);
				continue;
			}

			const res = validate(value, path);
			if (!res) continue;

			if (typeof res === 'string') {
				errors.push(res);
			} else {
				errors.push(...res);
			}
		}
		return errors;
	};

	return validate;
};

export function validator<S extends Record<string, SchemaType>>(
	schema: S,
): {
	shape: ResultShape<S>;
	parse: (obj: unknown) => Simplify<ValidationResult<ResultShape<S>>>;
	strict: (obj: unknown) => Simplify<ResultShape<S>>;
} {
	const validate = validatorFor(schema, '');

	return {
		shape: {} as any,
		strict: (input: unknown) => {
			const errors = validate(input as any);
			if (errors.length > 0) {
				throw new Error('Validation failed');
			}
			return input as any;
		},
		parse: (input: unknown) => {
			const errors = validate(input as any);
			const success = errors.length === 0;
			return {
				success,
				data: success ? input as any : null,
				errors: errors.length > 0 ? errors : undefined,
			};
		},
	};
}
