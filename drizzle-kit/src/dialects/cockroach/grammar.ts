import { Temporal } from '@js-temporal/polyfill';
import type { possibleIntervals } from '../../utils';
import {
	dateExtractRegex,
	hasTimeZoneSuffix,
	parseEWKB,
	parseIntervalFields,
	stringifyArray,
	stringifyTuplesArray,
	timeTzRegex,
	timezoneSuffixRegexp,
	trimChar,
	wrapWith,
} from '../../utils';
import { parseArray } from '../../utils/parse-pgarray';
import { parse, stringify } from '../../utils/when-json-met-bigint';
import { hash } from '../common';
import { numberForTs, parseParams } from '../utils';
import type { CockroachEntities, Column, DiffEntities } from './ddl';
import type { Import } from './typescript';

export const splitSqlType = (sqlType: string) => {
	const toMatch = sqlType.replaceAll('[]', '');
	const match = toMatch.match(/^(\w+(?:\s+\w+)*)\(([^)]*)\)?$/i);
	let type = match ? match[1] : toMatch;
	let options = match ? match[2].replaceAll(', ', ',') : null;

	return { type, options };
};

export const vectorOps = [
	'vector_l2_ops',
	'vector_ip_ops',
	'vector_cosine_ops',
	'vector_l1_ops',
	'bit_hamming_ops',
	'bit_jaccard_ops',
	'halfvec_l2_ops',
	'sparsevec_l2_ops',
];

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export function stringFromIdentityProperty(field: string | number | undefined): string | undefined {
	return typeof field === 'string' ? (field as string) : typeof field === 'undefined' ? undefined : String(field);
}

export function maxRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'int4' ? '2147483647' : columnType === 'int8' ? '9223372036854775807' : '32767';
}

export function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'int4' ? '-2147483648' : columnType === 'int8' ? '-9223372036854775808' : '-32768';
}

export function stringFromDatabaseIdentityProperty(field: any): string | null {
	return typeof field === 'string'
		? (field as string)
		: typeof field === 'undefined' || field === null
		? null
		: typeof field === 'bigint'
		? field.toString()
		: String(field);
}

export type OnAction = CockroachEntities['fks']['onUpdate'];
export const parseOnType = (type: string): OnAction => {
	switch (type) {
		case 'a':
			return 'NO ACTION';
		case 'r':
			return 'RESTRICT';
		case 'n':
			return 'SET NULL';
		case 'c':
			return 'CASCADE';
		case 'd':
			return 'SET DEFAULT';
		default:
			throw new Error(`Unknown foreign key type: ${type}`);
	}
};

export const systemNamespaceNames = ['crdb_internal', 'information_schema', 'pg_catalog', 'pg_extension'];
export const isSystemNamespace = (name: string) => {
	return systemNamespaceNames.indexOf(name) >= 0;
};

export const systemRoles = ['admin', 'root', 'node'];
export const isSystemRole = (name: string) => {
	return systemRoles.indexOf(name) >= 0;
};

/*
	CHECK (((email)::text <> 'test@gmail.com'::text))
	Where (email) is column in table
*/
export const parseCheckDefinition = (value: string): string => {
	return value.replace(/^CHECK\s*\(\(/, '').replace(/\)\)\s*$/, '');
};

export const parseViewDefinition = (value: string | null | undefined): string | null => {
	if (!value) return null;
	return value.replace(/\s+/g, ' ').replace(';', '').trim();
};

export const defaultNameForIdentitySequence = (table: string, column: string) => {
	return `${table}_${column}_seq`;
};

export const defaultNameForPK = (table: string) => {
	return `${table}_pkey`;
};

export const defaultNameForFK = (table: string, columns: string[], tableTo: string, columnsTo: string[]) => {
	const desired = `${table}_${columns.join('_')}_${tableTo}_${columnsTo.join('_')}_fkey`;
	const res = desired.length > 63
		? table.length < 63 - 18 // _{hash(12)}_fkey
			? `${table}_${hash(desired)}_fkey`
			: `${hash(desired)}_fkey` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForUnique = (table: string, ...columns: string[]) => {
	return `${table}_${columns.join('_')}_key`;
};

export const defaultNameForIndex = (table: string, columns: string[]) => {
	return `${table}_${columns.join('_')}_idx`;
};

// ::text, ::varchar(256), ::text::varchar(256)
export function trimDefaultValueSuffix(defaultValue: string) {
	let res = defaultValue.endsWith('[]') ? defaultValue.slice(0, -2) : defaultValue;
	res = res.replace(/(::[a-zA-Z_][\w\s.]*?(?:\([^()]*\))?(?:\[\])?)+$/g, '');
	return res;
}

export const defaultForColumn = (
	type: string,
	def: string | boolean | number | null | undefined,
	dimensions: number,
	isEnum: boolean,
): Column['default'] => {
	if (def === null || def === undefined) {
		return null;
	}

	// trim ::type and []
	let value = trimDefaultValueSuffix(String(def));

	const grammarType = typeFor(type, isEnum);
	if (grammarType) {
		if (dimensions > 0) return grammarType.defaultArrayFromIntrospect(value);
		return grammarType.defaultFromIntrospect(String(value));
	}

	throw Error();
};

export const defaultToSQL = (it: Pick<Column, 'default' | 'dimensions' | 'type' | 'typeSchema'>) => {
	if (!it.default) return '';

	const { type: columnType, dimensions, typeSchema } = it;
	const value = it.default;

	if (typeSchema) {
		const schemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
		return `${value}::${schemaPrefix}"${columnType}"${dimensions > 0 ? '[]' : ''}`;
	}

	//   const { type: rawType } = splitSqlType(columnType);
	const suffix = dimensions > 0 ? `::${columnType}[]` : '';

	const grammarType = typeFor(columnType, Boolean(typeSchema));

	if (grammarType) {
		const value = it.default ?? '';
		return `${value}${suffix}`;
	}

	throw Error();

	// assertUnreachable(defaultType);
};

const dateTimeRegex =
	/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)$/;
const dateRegex =
	/^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?|\d{4}-\d{2}-\d{2})$/;
// TODO write descriptions for all functions
// why that was made, etc.

export function formatTimestamp(date: string, modify: boolean, precision?: number) {
	if (!dateTimeRegex.test(date)) return date;

	// Convert to Temporal.Instant
	const instant = hasTimeZoneSuffix(date) ? Temporal.Instant.from(date) : Temporal.Instant.from(date + 'Z');

	const iso = instant.toString();

	const fractionalDigits = iso.replace('Z', '').split('.')[1]?.length ?? 0;

	if (!precision && fractionalDigits > 6) precision = 6;

	if (!precision) return iso;

	// decide whether to limit precision
	const formattedPrecision = fractionalDigits > precision
		// @ts-expect-error
		? instant.toString({ fractionalSecondDigits: precision })
		: iso;

	return modify ? formattedPrecision : iso;
}
export function formatTime(date: string, modify: boolean, precision: number = 0) {
	const match = date.match(timeTzRegex);
	if (!match) return date;
	const time: string = match[0];

	const timestampInstant = hasTimeZoneSuffix(time)
		? Temporal.Instant.from(`1970-01-01T${time}`)
		: Temporal.Instant.from(`1970-01-01T${time}` + 'Z');
	const iso = timestampInstant.toString();

	// 2024-05-23T14:20:33.123Z
	const fractionalDigits = iso.replace('Z', '').split('.')[1]?.length ?? 0;

	if (!precision && fractionalDigits > 6) precision = 6;

	if (!precision) return iso;
	// decide whether to limit precision
	const formattedPrecision = fractionalDigits > precision
		// @ts-expect-error
		? timestampInstant.toString({ fractionalSecondDigits: precision })
		: iso;

	return modify ? formattedPrecision : iso;
}
export function formatDate(date: string) {
	if (!dateRegex.test(date)) return date; // invalid format
	const match = date.match(dateExtractRegex);
	if (!match) return date;

	const extractedDate: string = match[0];

	return extractedDate;
}
// CockroachDb trims and pads defaults under the hood
export function formatDecimal(type: string, value: string) {
	const { options } = splitSqlType(type);
	const [integerPart, dp] = value.split('.');
	const decimalPart = dp ?? '';

	let scale: number | undefined;

	// if precision exists and scale not -> scale = 0
	// if scale exists -> scale = scale
	// if options does not exists (p,s are not present) -> scale is undefined
	if (options) {
		// if option exists we have 2 possible variants
		// 1. p exists
		// 2. p and s exists
		const [_, s] = options.split(',');

		// if scale exists - use scale
		// else use 0 (cause p exists)
		scale = s !== undefined ? Number(s) : 0;
	}

	if (typeof scale === 'undefined') return value;
	if (scale === 0) return integerPart;
	if (scale === decimalPart.length) return value;

	const fixedDecimal = scale > decimalPart.length ? decimalPart.padEnd(scale, '0') : decimalPart.slice(0, scale);

	return `${integerPart}.${fixedDecimal}`;
}
export function formatBit(type: string, value?: string | null, trimToOneLength: boolean = false) {
	if (!value) return value;

	const { options } = splitSqlType(type);

	const length = !options ? (trimToOneLength ? 1 : Number(options)) : Number(options);
	if (value.length > length) return value.substring(0, length);
	return value.padEnd(length, '0');
}
export function formatString(type: string, value: string, mode: 'default' | 'arr' = 'default') {
	if (!value) return value;

	const { options } = splitSqlType(type);

	if (!options && mode === 'default') {
		return value;
	}

	const length = !options ? 1 : Number(options);

	if (value.length <= length) return value;
	value = value.substring(0, length);

	return value;
}

export const escapeForSqlDefault = (input: string, mode: 'default' | 'arr' | 'enum-arr' = 'default') => {
	let value = input.replace(/\\/g, '\\\\');
	if (mode === 'arr') value = value.replace(/'/g, "''").replaceAll('"', '\\"');
	else if (mode === ('enum-arr')) value = value.replace(/'/g, "''").replaceAll('"', '\\"').replace(',', '\\,');
	else value = value.replace(/'/g, "\\'");

	return value;
};
// export const escapeJsonbForSqlDefault = (input: string) => {
// 	let value = input.replace(/\\/g, '\\\\');
// 	if (mode === 'arr') value = value.replace(/'/g, "''").replaceAll('"', '\\"');
// 	else value = value.replace(/'/g, "\\'");

// 	return value;
// };

export const unescapeFromSqlDefault = (input: string) => {
	// starts with e' and ends with '
	input = /^e'.*'$/s.test(input) ? input.replace(/e'/g, "'") : input;

	input = trimChar(input, "'");

	let res = input.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');

	// if (mode === 'arr') return res;
	return res;
};

export const escapeForTsLiteral = (input: string) => {
	return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

export const isDefaultAction = (action: string) => {
	return action.toLowerCase() === 'no action';
};

export const defaults = {
	identity: {
		startWith: '1',
		increment: '1',
		min: '1',
		maxFor: (type: string) => {
			if (type === 'int2') return '32767';
			if (type === 'int4') return '2147483647';
			if (type === 'int8') return '9223372036854775807';
			throw new Error(`Unknow identity column type: ${type}`);
		},
		cache: 1,
	},
	index: {
		method: 'btree',
	},
} as const;

// from -> db
// to -> code
// TODO write description
export const defaultsCommutative = (
	diffDef: DiffEntities['columns']['default'],
	type: string,
	dimensions: number,
	isEnum: boolean,
): boolean => {
	if (!diffDef) return false;

	if (diffDef.from === diffDef.to) return true;

	let from = diffDef.from;
	let to = diffDef.to;

	if (from === to) return true;

	const commutativeTypes = [
		['current_timestamp', 'now', 'now()', 'current_timestamp()'],
	];
	for (const it of commutativeTypes) {
		const leftIn = it.some((x) => x === from);
		const rightIn = it.some((x) => x === to);

		if (leftIn && rightIn) return true;
	}

	if (dimensions > 0 && from && to) {
		from = trimChar(from, "'");
		to = trimChar(to, "'");
	}

	if (isEnum && dimensions > 0 && from && to) {
		try {
			to = stringifyArray(parseArray(to), 'ts', (v) => `"${v}"`);
			from = stringifyArray(parseArray(from), 'ts', (v) => {
				v = unescapeFromSqlDefault(v);

				return `"${v}"`;
			});

			if (to === from) return true;
		} catch {}
		return false;
	}

	if ((type.startsWith('bit') || type.startsWith('varbit')) && from && to) {
		if (
			formatBit(type, diffDef.from, true) === formatBit(type, diffDef?.to, true)
		) {
			return true;
		}

		try {
			const stringify = (v: any) => {
				return `${formatBit(type, v, true)}`;
			};
			const toArray = stringifyArray(parseArray(to), 'sql', stringify);
			if (from === toArray) return true;
		} catch {}

		return false;
	}

	// only if array
	if (type.startsWith('decimal') && dimensions > 0 && from && to) {
		try {
			const stringify = (v: any) => {
				return `${formatDecimal(type, v)}`;
			};
			const toArray = stringifyArray(parseArray(to), 'sql', stringify);
			if (from === toArray) return true;
		} catch {}
		return false;
	}

	if (type.startsWith('timestamp')) {
		// "Z" can be inserted in mode:string
		from = from?.replace('Z', '+00') ?? null;
		to = to?.replace('Z', '+00') ?? null;
		if (from === to) return true;

		const { options } = splitSqlType(type);
		const precision = options ? Number(options) : undefined; // def precision

		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (dimensions > 0) {
				try {
					const stringify = (v: any, modify: boolean) => {
						v = trimChar(v, '"');
						if (!type.includes('tz')) v = v.replace(timezoneSuffixRegexp, '');

						const formatted = formatTimestamp(v, modify, precision);
						return `"${type.includes('tz') ? formatted : formatted.replace(timezoneSuffixRegexp, '')}"`;
					};
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => stringify(v, true));

					const fromArrayOriginal = stringifyArray(parseArray(from), 'sql', (v) => stringify(v, false));

					if (fromArrayOriginal === toArray) return true;
				} catch {
				}

				return false;
			}

			const trimTz = (value: string, type: string) => {
				return type.includes('tz') ? value : value.replace(timezoneSuffixRegexp, '');
			};

			from = trimTz(from, type);
			to = trimTz(to, type);
			const formattedTo = trimTz(formatTimestamp(to, true, precision), type);
			const formattedFromOriginal = trimTz(formatTimestamp(from, false, precision), type);
			if (formattedFromOriginal === formattedTo) return true;
		}

		return false;
	}

	if (type.startsWith('time')) {
		from = from?.replace('Z', '+00') ?? null;
		to = to?.replace('Z', '+00') ?? null;

		if (from === to) return true;

		const { options } = splitSqlType(type);
		const precision = options ? Number(options) : undefined; // def precision

		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (dimensions > 0) {
				try {
					const stringify = (v: any, modify: boolean) => {
						if (!type.includes('tz')) v = v.replace(timezoneSuffixRegexp, '');

						const formatted = formatTime(v, modify, precision);
						return `"${type.includes('tz') ? formatted : formatted.replace(timezoneSuffixRegexp, '')}"`;
					};
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => stringify(v, true));

					const fromArrayOriginal = stringifyArray(parseArray(from), 'sql', (v) => stringify(v, false));

					if (fromArrayOriginal === toArray) return true;
				} catch {}

				return false;
			}

			const trimTz = (value: string, type: string) => {
				return type.includes('tz') ? value : value.replace(timezoneSuffixRegexp, '');
			};

			from = trimTz(from, type);
			to = trimTz(to, type);

			const formattedTo = trimTz(formatTime(to, true, precision), type);
			const formattedFromOriginal = trimTz(formatTime(from, false, precision), type);
			if (formattedFromOriginal === formattedTo) return true;
		}

		return false;
	}

	if (type.startsWith('date')) {
		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (dimensions > 0) {
				try {
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => formatDate(v));
					if (from === toArray) return true;
				} catch {}

				return false;
			}

			if (from === formatDate(to)) return true;
		}

		return false;
	}

	if (type.startsWith('char') || type.startsWith('varchar') || type.startsWith('text') || type.startsWith('string')) {
		if (from && to) {
			if (dimensions > 0) {
				try {
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => formatString(type, v, 'arr'));

					// parse to identical format
					const fromArrayOriginal = stringifyArray(parseArray(from), 'sql', (v) => String(v));
					if (fromArrayOriginal === toArray) return true;
				} catch {}

				return false;
			}
		}
		return false;
	}

	// const timeCommutatives = [['now', 'now()', 'current_timestamp', 'current_timestamp()']];
	// if (type.startsWith('timestamp')) {
	// 	for (const it of timeCommutatives) {
	// 		const leftIn = it.some((x) => x === diffDef.from);
	// 		const rightIn = it.some((x) => x === diffDef.to);

	// 		if (leftIn && rightIn) return true;
	// 	}
	// }

	if (type.startsWith('vector')) {
		if (from?.replaceAll('.0', '') === to) return true;
		if (to?.replaceAll('.0', '') === from) return true;
	}

	// real and float adds .0 to the end for the numbers
	// 100 === 100.0
	const dataTypesWithExtraZero = ['real', 'float'];
	if (
		dataTypesWithExtraZero.find((dataType) => type.startsWith(dataType))
		&& (from?.replace('.0', '') === to || to === from?.replace('.0', ''))
	) {
		return true;
	}

	if (type === 'jsonb' && from && to) {
		const left = stringify(parse(trimChar(from, "'")));
		const right = stringify(parse(trimChar(to, "'")));
		if (left === right) return true;
	}

	return false;
};

const commutativeTypes = [['char(1)', 'char']];
export const typesCommutative = (left: string, right: string) => {
	for (const it of commutativeTypes) {
		const leftIn = it.some((x) => x === left);
		const rightIn = it.some((x) => x === right);

		if (leftIn && rightIn) return true;
	}
};

export interface SqlType {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, mode?: string, config?: unknown): Column['default'];
	defaultArrayFromDrizzle(value: any[], mode?: string, config?: unknown): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	defaultArrayFromIntrospect(value: string): Column['default']; // todo: remove?
	toTs(type: string, value: string | null): { options?: Record<string, unknown>; default: string; customType?: string };
	toArrayTs(
		type: string,
		value: string | null,
	): { options?: Record<string, unknown>; default: string; customType?: string };
}

export const Int2: SqlType = {
	is: (type: string) => /^\s*int2(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'int2',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultArrayFromDrizzle: (value) => {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value) => {
		return value; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (_, value) => ({ default: value ?? '' }),
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `${v}`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Int4: SqlType = {
	is: (type: string) => /^\s*int4(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'int4',
	defaultFromDrizzle: Int2.defaultFromDrizzle,
	defaultArrayFromDrizzle: Int2.defaultArrayFromDrizzle,
	defaultFromIntrospect: Int2.defaultFromIntrospect,
	defaultArrayFromIntrospect: Int2.defaultArrayFromIntrospect,
	toTs: Int2.toTs,
	toArrayTs: Int2.toArrayTs,
};

export const Int8: SqlType = {
	is: (type: string) => /^\s*int8(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'int8',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultArrayFromDrizzle: (value) => {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value) => {
		return value; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return value;
	},
	toTs: (_, value) => {
		if (!value) return { options: { mode: 'number' }, default: '' };
		const { mode, value: def } = numberForTs(value);
		return { options: { mode }, default: def };
	},
	toArrayTs: (_, value) => {
		if (!value) return { options: { mode: 'number' }, default: '' };
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);
			return {
				options: { mode: 'bigint' },
				default: stringifyArray(res, 'ts', (v) => `${v}n`),
			};
		} catch {
			return { options: { mode: 'bigint' }, default: `sql\`${value}\`` };
		}
	},
};

export const Bool: SqlType = {
	is: (type: string) => /^\s*bool(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'bool',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultArrayFromDrizzle: (value) => {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value) => {
		return trimChar(value, "'");
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (_, value) => ({ default: value ?? '' }),
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return v === 'true' ? 'true' : 'false';
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Uuid: SqlType = {
	is: (type: string) => /^\s*uuid(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'uuid',
	defaultFromDrizzle: (value) => {
		return `'${value}'`;
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v !== 'string') throw new Error();
			return v;
		});
		return `'${res}'`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		value = trimChar(value, "'");
		if (value === 'gen_random_uuid()') {
			return { options, default: '.defaultRandom()' };
		}
		return { options, default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Real: SqlType = {
	is: (type: string) => /^\s*real(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'real',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultArrayFromDrizzle: (value) => {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value) => {
		// 100 will be stored as 100.0
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (_, value) => ({ default: value ?? '' }),
	toArrayTs: (_, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					return `${v}`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Float: SqlType = {
	is: (type: string) => /^\s*float(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'float',
	defaultFromDrizzle: Real.defaultFromDrizzle,
	defaultArrayFromDrizzle: Real.defaultArrayFromDrizzle,
	defaultFromIntrospect: Real.defaultFromIntrospect,
	defaultArrayFromIntrospect: Real.defaultArrayFromIntrospect,
	toTs: Real.toTs,
	toArrayTs: Real.toArrayTs,
};

export const Decimal: SqlType = {
	// decimal OR decimal(1)[] OR decimal(2,1)[]
	is: (type: string) => /^\s*decimal(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'decimal',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultArrayFromDrizzle: (value) => {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const [precision, scale] = parseParams(type);
		const options = {} as any;
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };

		const { mode, value: def } = numberForTs(value);

		if (mode === 'number') return { options, default: `"${def}"` };

		return { default: def, options: { mode, ...options } };
	},
	toArrayTs: (type, value) => {
		const [precision, scale] = parseParams(type);
		const options = {} as any;
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };
		/*
			If we'd want it to be smart - we need to check if decimal array has
			any bigints recuresively, it's waaaaay easier to just do sql``
		 */
		// try {
		// 	const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
		// 	const res = parseArray(trimmed);

		// 	return {
		// 		options: { mode: 'bigint', ...options },
		// 		default: stringifyArray(res, 'ts', (v) => {

		// 			return `${v}`;
		// 		}),
		// 	};
		// } catch {
		return { options, default: `sql\`${value}\`` };
		// }
	},
};

export const Bit: SqlType = {
	is: (type: string) => /^\s*bit(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'bit',
	defaultFromDrizzle: (value) => {
		return `'${value}'`;
	},
	defaultArrayFromDrizzle: (value) => {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value) => {
		// it is stored as B'<value>'
		return value.replace(/^B'/, "'");
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const [length] = parseParams(type);
		const options = length ? { length: Number(length) } : {};

		if (!value) return { options, default: '' };

		if (/^'[01]+'$/.test(value)) {
			return { options, default: value };
		}

		return { options, default: `sql\`${value}\`` };
	},
	toArrayTs: (type, value) => {
		const [length] = parseParams(type);
		const options = length ? { length: Number(length) } : {};

		if (!value) return { options, default: '' };
		let isDrizzleSql: boolean = false;
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			const def = stringifyArray(res, 'ts', (v) => {
				if (!/^[01]+$/.test(v)) isDrizzleSql = true;
				return `"${v}"`;
			});

			return {
				options,
				default: isDrizzleSql ? `sql\`${value}\`` : def,
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};
export const VarBit: SqlType = {
	is: (type: string) => /^\s*varbit(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'varbit',
	defaultFromDrizzle: Bit.defaultFromDrizzle,
	defaultArrayFromDrizzle: Bit.defaultArrayFromDrizzle,
	defaultFromIntrospect: Bit.defaultFromIntrospect,
	defaultArrayFromIntrospect: Bit.defaultArrayFromIntrospect,
	toTs: Bit.toTs,
	toArrayTs: Bit.toArrayTs,
};

export const Timestamp: SqlType = {
	is: (type) => /^\s*timestamp(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'timestamp',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
		}

		return `'${String(value)}'`;
	},
	defaultArrayFromDrizzle(value) {
		return `'${
			stringifyArray(value, 'sql', (v) => {
				if (v instanceof Date) {
					return `"${v.toISOString().replace('T', ' ').replace('Z', '')}"`;
				}

				return `"${String(v)}"`;
			})
		}'`;
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const options: { mode: string; precision?: number } = { mode: 'string' };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') {
			return { default: '.defaultNow()', options };
		}

		// check for valid date
		if (isNaN(Date.parse(value.substring(1, value.length - 1)))) {
			return { default: `sql\`${value}\``, options };
		}

		return { default: value, options };
	},
	toArrayTs: (type, value) => {
		const options: { mode: string; precision?: number } = { mode: 'string' };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => `"${v}"`),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};
export const TimestampTZ: SqlType = {
	is: (type) => /^\s*timestamptz(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'timestamp',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `'${value.toISOString().replace('T', ' ').replace('Z', '+00')}'`;
		}

		return `'${String(value)}'`;
	},
	defaultArrayFromDrizzle(value) {
		return `'${
			stringifyArray(value, 'sql', (v) => {
				if (v instanceof Date) {
					return `"${v.toISOString().replace('T', ' ').replace('Z', '+00')}"`;
				}

				return `"${String(v)}"`;
			})
		}'`;
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const options: { mode: string; withTimezone: boolean; precision?: number } = { mode: 'string', withTimezone: true };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') {
			return { default: '.defaultNow()', options };
		}

		// check for valid date
		if (isNaN(Date.parse(value.substring(1, value.length - 1)))) {
			return { default: `sql\`${value}\``, options };
		}

		return { default: value, options };
	},
	toArrayTs: (type, value) => {
		const options: { mode: string; withTimezone: boolean; precision?: number } = { withTimezone: true, mode: 'string' };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => `"${v}"`),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Time: SqlType = {
	is: (type) => /^\s*time(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'time',
	defaultFromDrizzle: (value: unknown) => {
		return `'${String(value)}'`;
	},
	defaultArrayFromDrizzle(value) {
		return `'${stringifyArray(value, 'sql', (v) => String(v))}'`;
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const options: { precision?: number } = {};

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') {
			return { default: '.defaultNow()', options };
		}

		// check for valid date
		try {
			Temporal.PlainTime.from(value.substring(1, value.length - 1));
			return { default: value, options };
		} catch {
			return { default: `sql\`${value}\``, options };
		}
	},
	toArrayTs: (type, value) => {
		const options: { precision?: number } = {};

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => `"${v}"`),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};
export const TimeTz: SqlType = {
	is: (type) => /^\s*timetz(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'time',
	defaultFromDrizzle: Time.defaultFromDrizzle,
	defaultArrayFromDrizzle: Time.defaultArrayFromDrizzle,
	defaultFromIntrospect: Time.defaultFromIntrospect,
	defaultArrayFromIntrospect: Time.defaultArrayFromIntrospect,
	toTs: (type, value) => {
		const options: { withTimezone: boolean; precision?: number } = {
			withTimezone: true,
		};

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') {
			return { default: '.defaultNow()', options };
		}

		// check for valid date
		try {
			Temporal.PlainTime.from(value.substring(1, value.length - 1));
			return { default: value, options };
		} catch {
			return { default: `sql\`${value}\``, options };
		}
	},
	toArrayTs: (type, value) => {
		const options: { withTimezone: boolean; precision?: number } = {
			withTimezone: true,
		};

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => `"${v}"`),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const DateType: SqlType = {
	is: (type) => /^\s*date(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'date',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `'${value.toISOString().split('T')[0]}'`;
		}

		return `'${String(value)}'`;
	},
	defaultArrayFromDrizzle(value) {
		return `'${
			stringifyArray(value, 'sql', (v) => {
				if (v instanceof Date) {
					return v.toISOString().split('T')[0];
				}

				return String(v);
			})
		}'`;
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value;
	},
	toTs: (_, value) => {
		const options: { mode: string } = { mode: 'string' };

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') {
			return { default: '.defaultNow()', options };
		}

		// check for valid date
		try {
			Temporal.PlainDate.from(value.substring(1, value.length - 1));
			return { default: value, options };
		} catch {
			return { default: `sql\`${value}\``, options };
		}
	},
	toArrayTs: (type, value) => {
		const options: { mode: string; precision?: number } = { mode: 'string' };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => `"${v}"`),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Char: SqlType = {
	is: (type: string) => /^\s*char|character(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'char',
	defaultFromDrizzle: (value) => {
		const escaped = escapeForSqlDefault(String(value));
		const result = String(value).includes('\\') || String(value).includes("'")
			? `e'${escaped}'`
			: `'${escaped}'`;

		return result;
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v !== 'string') throw new Error();
			const escaped = escapeForSqlDefault(v, 'arr');
			if (v.includes('\\') || v.includes('"') || v.includes(',')) {
				return `"${escaped}"`;
			}

			return escaped;
		});
		return `'${res}'`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };
		const escaped = escapeForTsLiteral(unescapeFromSqlDefault(value));
		return { options, default: `"${escaped}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					const escaped = escapeForTsLiteral(unescapeFromSqlDefault(v));
					return `"${escaped}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};
export const Varchar: SqlType = {
	is: (type: string) => /^\s*varchar|character varying(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'varchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultArrayFromDrizzle: Char.defaultArrayFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultArrayFromIntrospect: Char.defaultArrayFromIntrospect,
	toTs: Char.toTs,
	toArrayTs: Char.toArrayTs,
};
// export const Text: SqlType = {
// 	is: (type: string) => /^\s*(?:text)(?:[\s(].*)*\s*$/i.test(type),
// 	drizzleImport: () => 'text',
// 	defaultFromDrizzle: Char.defaultFromDrizzle,
// 	defaultArrayFromDrizzle: Char.defaultArrayFromDrizzle,
// 	defaultFromIntrospect: Char.defaultFromIntrospect,
// 	defaultArrayFromIntrospect: Char.defaultArrayFromIntrospect,
// 	toTs: Char.toTs,
// 	toArrayTs: Char.toArrayTs,
// };
export const StringType: SqlType = {
	is: (type: string) => /^\s*string(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'string',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultArrayFromDrizzle: Char.defaultArrayFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultArrayFromIntrospect: Char.defaultArrayFromIntrospect,
	toTs: Char.toTs,
	toArrayTs: Char.toArrayTs,
};

export const Jsonb: SqlType = {
	is: (type: string) => /^\s*jsonb\s*$/i.test(type),
	drizzleImport: () => 'jsonb',
	defaultFromDrizzle: (value) => {
		let shouldEscape = false;
		const stringified = stringify(
			value,
			(_, value) => {
				if (typeof value !== 'string') return value;
				if (value.includes("'") || value.includes('"') || value.includes('\\')) shouldEscape = true;
				return value;
			},
			undefined,
			undefined,
		);
		return shouldEscape
			? `e'${stringified.replaceAll("'", "\\'").replaceAll('\\"', '\\\\"')}'`
			: `'${stringified}'`;
	},
	// not supported
	defaultArrayFromDrizzle: () => {
		return `'[]'`;
	},
	/*
		TODO: make less hacky,
		from: { type: 'unknown', value: `'{"key": "value"}'` },
		to:   { type: 'unknown', value: `'{"key":"value"}'` }
	 */
	defaultFromIntrospect: (value) => value.replaceAll(`": "`, `":"`),
	// not supported
	defaultArrayFromIntrospect: () => {
		return `'[]'`;
	},
	toTs: (_, value) => {
		if (!value) return { default: '' };

		const trimmed = trimChar(unescapeFromSqlDefault(value), "'");

		try {
			const parsed = parse(trimmed);
			const stringified = stringify(
				parsed,
				(_, value) => {
					return value;
				},
				undefined,
				true,
			)!;
			return { default: stringified };
		} catch {
			/*(e: any)*/
			// console.log('error: ', e);
		}
		return { default: `sql\`${value}\`` };
	},
	// not supported
	toArrayTs: () => {
		return {
			default: '',
			options: {},
		};
	},
};

// This is not handled the way cockroach stores it
// since user can pass `1 2:3:4` and it will be stored as `1 day 02:03:04`
// so we just compare row values
export const Interval: SqlType = {
	is: (type: string) =>
		/^interval(\s+(year|month|day|hour|minute|second)(\s+to\s+(month|day|hour|minute|second))?)?(?:\((\d+)\))?(\[\])?$/i
			.test(type),
	drizzleImport: () => 'interval',
	defaultFromDrizzle: (value) => {
		return `'${value}'`;
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v !== 'string') throw new Error();
			return `"${v}"`;
		});

		return `'${res}'`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const options: {
			precision?: number;
			fields?: (typeof possibleIntervals)[number];
		} = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		const fields = parseIntervalFields(type);
		if (fields.fields) options['fields'] = fields.fields;

		if (!value) return { options, default: '' };

		return { options, default: `"${trimChar(value, "'")}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		const [precision] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		const fields = parseIntervalFields(type);
		if (fields.fields) options['fields'] = fields.fields;

		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Vector: SqlType = {
	is: (type: string) => /^\s*vector(?:\(\d+(?:,\d+)?\))?(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'vector',
	defaultFromDrizzle: (value) => {
		return `'[${String(value).replaceAll(' ', '')}]'`;
	},
	// not supported
	defaultArrayFromDrizzle: () => {
		return '';
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	// not supported
	defaultArrayFromIntrospect: () => {
		return '';
	},
	toTs: (type, value) => {
		const options: any = {};
		const [dimensions] = parseParams(type);
		if (dimensions) options['dimensions'] = Number(dimensions);

		if (!value) return { options, default: '' };

		return { options, default: trimChar(value, "'") };
	},
	// not supported
	toArrayTs: () => {
		return { default: '', options: {} };
	},
};

// Enums in cockroach are stored in strange way
// '{text\\text}' is parsed to '{"e''text\\\\text''"}'
// BUT if try to create table with default '{"e''text\\\\text''"}' query will fail
// so create in simplest way and check in diff
export const Enum: SqlType = {
	is: (_type: string) => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'cockroachEnum',
	defaultFromDrizzle: (value: string) => {
		if (!value) return '';

		if (value.includes("'") || value.includes('\\')) {
			return `e'${escapeForSqlDefault(value, 'default')}'`;
		}
		return `'${value}'`;
	},

	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				const escaped = escapeForSqlDefault(v, 'enum-arr');

				if (v.includes("'") || v.includes(',') || v.includes('\\') || v.includes('"')) return `"${escaped}"`;
				return escaped;
			},
		);

		return `'${res}'`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };

		const escaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(value, "'")));
		return { options, default: `"${escaped}"` };
	},
	toArrayTs: (type, value) => {
		if (!value) return { default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					const escaped = escapeForTsLiteral(unescapeFromSqlDefault(v));

					return `"${escaped}"`;
				}),
			};
		} catch {
			return { default: `sql\`${value}\`` };
		}
	},
};

export const Custom: SqlType = {
	is: (_type: string) => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'customType',
	defaultFromDrizzle: (value) => {
		if (!value) return '';
		return String(value);
	},
	defaultArrayFromDrizzle: (value) => {
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '', customType: type };
		const escaped = escapeForTsLiteral(value);
		return { default: `"${escaped}"`, customType: type };
	},
	toArrayTs: (type, value) => {
		if (!value) return { default: '', customType: type };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				default: stringifyArray(res, 'ts', (v) => {
					const escaped = escapeForTsLiteral(v);
					return `"${escaped}"`;
				}),
				customType: type,
			};
		} catch {
			return { default: `sql\`${value}\``, customType: type };
		}
	},
};

export const GeometryPoint: SqlType = {
	is: (type: string) => /^\s*geometry\(point(?:,\d+)?\)(?:\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'geometry',
	defaultFromDrizzle: (value, mode, config) => {
		if (!value) return '';

		const srid: number | undefined = config ? Number(config) : undefined;
		let sridPrefix = srid ? `SRID=${srid};` : '';
		if (mode === 'tuple') {
			const v: number[] = value as number[];
			return v.length > 0 ? `'${sridPrefix}POINT(${v[0]} ${v[1]})'` : '';
		}

		if (mode === 'object') {
			const v: { x: number; y: number } = value as { x: number; y: number };
			return Object.values(v).length > 0
				? `'${sridPrefix}POINT(${v.x} ${v.y})'`
				: '';
		}

		throw new Error('unknown geometry type');
	},
	defaultArrayFromDrizzle: function(value: any[], mode: string, config: unknown): Column['default'] {
		let res: string;
		const srid: number | undefined = config ? Number(config) : undefined;
		let sridPrefix = srid ? `SRID=${srid};` : '';

		if (mode === 'tuple') {
			res = stringifyTuplesArray(value, 'sql', (x: number[]) => {
				const res = `${sridPrefix}POINT(${x[0]} ${x[1]})`;
				return res;
			});
		} else if (mode === 'object') {
			res = stringifyArray(value, 'sql', (x: { x: number; y: number }, _depth: number) => {
				const res = `${sridPrefix}POINT(${x.x} ${x.y})`;
				return res;
			});
		} else throw new Error('unknown geometry type');

		return `'${res}'`;
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		try {
			const { point, srid } = parseEWKB(trimChar(value, "'"));
			value = `'${(srid ? `SRID=${srid};` : ``) + `POINT(${point[0]} ${point[1]})`}'`;
		} catch {}

		return value;
	},
	defaultArrayFromIntrospect: function(value: string): Column['default'] {
		try {
			const parsedArray = parseArray(trimChar(value, "'"));

			value = stringifyArray(parsedArray, 'sql', (v) => {
				const { srid, point } = parseEWKB(v);
				return (srid ? `SRID=${srid};` : ``) + `POINT(${point[0]} ${point[1]})`;
			});

			value = wrapWith(value, "'");
		} catch {}

		return value;
	},
	toTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		const options: { srid?: number; type: 'point' } = { type: 'point' };

		const sridOption = splitSqlType(type).options?.split(',')[1];
		if (sridOption) options.srid = Number(sridOption);
		if (!value) return { default: '', options };

		if (!value.includes('POINT(')) return { default: `sql\`${value}\``, options };

		const sridInDef = value.startsWith("'SRID=") ? Number(value.split('SRID=')[1].split(';')[0]) : undefined;
		if (!sridOption && sridInDef) {
			return { default: `sql\`${value}\``, options };
		}

		const [res1, res2] = value.split('POINT(')[1].split(')')[0].split(' ');

		return { default: `[${res1},${res2}]`, options };
	},
	toArrayTs: function(type: string, value: string | null): { options?: Record<string, unknown>; default: string } {
		const options: { srid?: number; type: 'point' } = { type: 'point' };
		const sridOption = splitSqlType(type).options?.split(',')[1];
		if (sridOption) options.srid = Number(sridOption);

		if (!value) return { default: '', options };

		let isDrizzleSql;
		const srids: number[] = [];
		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			const def = stringifyArray(res, 'ts', (v) => {
				if (v.includes('SRID=')) {
					srids.push(Number(v.split('SRID=')[1].split(';')[0]));
				}
				const [res1, res2] = value.split('POINT(')[1].split(')')[0].split(' ');
				if (!value.includes('POINT(')) isDrizzleSql = true;

				return `[${res1}, ${res2}]`;
			});

			if (!isDrizzleSql) isDrizzleSql = srids.some((it) => it !== srids[0]);
			// if there is no srid in type and user defines srids in default
			// we need to return point with srids
			if (!isDrizzleSql && !sridOption && srids.length > 0) isDrizzleSql = true;

			return {
				options,
				default: isDrizzleSql ? `sql\`${value}\`` : def,
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Inet: SqlType = {
	is: (type: string) => /^\s*inet(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'inet',
	defaultFromDrizzle: (value) => {
		return `'${value}'`;
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v !== 'string') throw new Error();
			return v;
		});
		return `'${res}'`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	defaultArrayFromIntrospect: (value) => {
		return value as string;
	},
	toTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		value = trimChar(value, "'");
		return { options, default: `"${value}"` };
	},
	toArrayTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		try {
			const trimmed = trimChar(trimChar(value, ['(', ')']), "'");
			const res = parseArray(trimmed);

			return {
				options,
				default: stringifyArray(res, 'ts', (v) => {
					return `"${v}"`;
				}),
			};
		} catch {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const typeFor = (type: string, isEnum: boolean): SqlType => {
	if (isEnum) return Enum;
	if (Int2.is(type)) return Int2;
	if (Int4.is(type)) return Int4;
	if (Int8.is(type)) return Int8;
	if (Bool.is(type)) return Bool;
	if (Uuid.is(type)) return Uuid;
	if (Real.is(type)) return Real;
	if (Float.is(type)) return Float;
	if (Decimal.is(type)) return Decimal;
	if (Bit.is(type)) return Bit;
	if (VarBit.is(type)) return VarBit;
	if (Timestamp.is(type)) return Timestamp;
	if (TimestampTZ.is(type)) return TimestampTZ;
	if (Time.is(type)) return Time;
	if (TimeTz.is(type)) return TimeTz;
	if (DateType.is(type)) return DateType;
	if (Char.is(type)) return Char;
	if (Varchar.is(type)) return Varchar;
	// if (Text.is(type)) return Text;
	if (StringType.is(type)) return StringType;
	if (Jsonb.is(type)) return Jsonb;
	if (Interval.is(type)) return Interval;
	if (Vector.is(type)) return Vector;
	if (GeometryPoint.is(type)) return GeometryPoint;
	if (Inet.is(type)) return Inet;
	return Custom;
};
