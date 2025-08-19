import { Temporal } from '@js-temporal/polyfill';
import { parseArray } from 'src/utils/parse-pgarray';
import { parse, stringify } from 'src/utils/when-json-met-bigint';
import { stringifyArray, trimChar } from '../../utils';
import { hash } from '../common';
import { numberForTs, parseParams } from '../utils';
import { CockroachEntities, Column, DiffEntities } from './ddl';
import { Import } from './typescript';

export const splitSqlType = (sqlType: string) => {
	// timestamp(6) with time zone -> [timestamp, 6, with time zone]
	const toMatch = sqlType.replaceAll('[]', '');
	const match = toMatch.match(/^(\w+(?:\s+\w+)*)\(([^)]*)\)?$/i);
	let type = match ? match[1] : toMatch;
	let options = match ? match[2].replaceAll(', ', ',') : null;

	// if (options && type === 'decimal') {
	// 	options = options.replace(',0', ''); // trim decimal (4,0)->(4), compatibility with Drizzle
	// }
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
		: typeof field === undefined || field === null
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

export const splitExpressions = (input: string | null): string[] => {
	if (!input) return [];

	const expressions: string[] = [];
	let parenDepth = 0;
	let inSingleQuotes = false;
	let inDoubleQuotes = false;
	let currentExpressionStart = 0;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (char === "'" && input[i + 1] === "'") {
			i++;
			continue;
		}

		if (char === '"' && input[i + 1] === '"') {
			i++;
			continue;
		}

		if (char === "'") {
			if (!inDoubleQuotes) {
				inSingleQuotes = !inSingleQuotes;
			}
			continue;
		}
		if (char === '"') {
			if (!inSingleQuotes) {
				inDoubleQuotes = !inDoubleQuotes;
			}
			continue;
		}

		if (!inSingleQuotes && !inDoubleQuotes) {
			if (char === '(') {
				parenDepth++;
			} else if (char === ')') {
				parenDepth = Math.max(0, parenDepth - 1);
			} else if (char === ',' && parenDepth === 0) {
				expressions.push(input.substring(currentExpressionStart, i).trim());
				currentExpressionStart = i + 1;
			}
		}
	}

	if (currentExpressionStart < input.length) {
		expressions.push(input.substring(currentExpressionStart).trim());
	}

	return expressions.filter((s) => s.length > 0);
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

	const grammarType = typeFor(type);
	if (grammarType) {
		if (dimensions > 0) return grammarType.defaultArrayFromIntrospect(value);
		return grammarType.defaultFromIntrospect(String(value));
	}

	throw Error();
};

export const defaultToSQL = (it: Pick<Column, 'default' | 'dimensions' | 'type' | 'typeSchema'>) => {
	if (!it.default) return '';

	const { type: columnType, dimensions, typeSchema } = it;
	const { type, value } = it.default;

	//   const arrsuffix = dimensions > 0 ? "[]" : "";
	if (typeSchema) {
		const schemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
		return `'${value}'::${schemaPrefix}"${columnType}"`;
	}

	//   const { type: rawType } = splitSqlType(columnType);
	const suffix = dimensions > 0 ? `::${columnType}` : '';

	const grammarType = typeFor(columnType);

	if (grammarType) {
		const value = it.default.value ?? '';
		return `${value}${suffix}`;
	}

	throw Error();

	// assertUnreachable(defaultType);
};

const dateTimeRegex =
	/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)$/;
const timeTzRegex = /\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?/;
const dateRegex =
	/^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?|\d{4}-\d{2}-\d{2})$/;
const dateExtractRegex = /^\d{4}-\d{2}-\d{2}/;
const timezoneSuffixRegexp = /([+-]\d{2}(:?\d{2})?|Z)$/i;
function hasTimeZoneSuffix(s: string): boolean {
	return timezoneSuffixRegexp.test(s);
}
// TODO write descriptions for all functions
// why that was made, etc.
export function formatTimestamp(date: string, precision: number = 3) {
	if (!dateTimeRegex.test(date)) return date;

	// Convert to Temporal.Instant
	const instant = hasTimeZoneSuffix(date) ? Temporal.Instant.from(date) : Temporal.Instant.from(date + 'Z');

	const iso = instant.toString();

	const fractionalDigits = iso.split('.')[1]!.length;

	// decide whether to limit precision
	const formattedPrecision = fractionalDigits > precision
		// @ts-expect-error
		? instant.toString({ fractionalSecondDigits: precision })
		: iso;

	return formattedPrecision.replace('T', ' ');
}
export function formatTime(date: string, precision: number = 3) {
	if (!dateTimeRegex.test(date)) return date; // invalid format
	const match = date.match(timeTzRegex);
	if (!match) return date;

	const time: string = match[0];

	const timestampInstant = hasTimeZoneSuffix(time)
		? Temporal.Instant.from(`1970-01-01T${time}`)
		: Temporal.Instant.from(`1970-01-01T${time}` + 'Z');
	const iso = timestampInstant.toString({ timeZone: 'UTC' });

	// 2024-05-23T14:20:33.123+00:00
	// 2024-05-23T14:20:33.123-00:00
	const fractionalDigits = iso.split('T')[1]!.split('+')[0].split('-')[0].length;

	// decide whether to limit precision
	const formattedPrecision = fractionalDigits > precision
		// @ts-expect-error
		? timestampInstant.toString({ fractionalSecondDigits: precision })
		: iso;

	return formattedPrecision;
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
export function formatString(type: string, value: string) {
	if (!value) return value;

	// for arrays
	// values can be wrapped in ""
	value = trimChar(value, '"');

	const { options } = splitSqlType(type);

	if (!options) return value;
	const length = Number(options);

	if (value.length <= length) return value;
	value = value.substring(0, length);

	return value;
}

export const escapeForSqlDefault = (input: string, mode: 'default' | 'arr' = 'default') => {
	let value = input.replace(/\\/g, '\\\\');
	if (mode === 'arr') value = value.replace(/'/g, "''").replaceAll('"', '\\"');
	else value = value.replace(/'/g, "\\'");

	return value;
};
// export const escapeJsonbForSqlDefault = (input: string) => {
// 	let value = input.replace(/\\/g, '\\\\');
// 	if (mode === 'arr') value = value.replace(/'/g, "''").replaceAll('"', '\\"');
// 	else value = value.replace(/'/g, "\\'");

// 	return value;
// };

export const unescapeFromSqlDefault = (input: string, mode: 'default' | 'arr' = 'default') => {
	// starts with e' and ends with '
	input = /^e'.*'$/s.test(input) ? input.replace(/e'/g, "'") : input;

	// array default can be wrapped in "", but not always
	const trimmed = mode === 'arr' ? trimChar(input, '"') : trimChar(input, "'");

	let res = trimmed.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

	if (mode === 'arr') return res;
	return res.replace(/\\'/g, "'");
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

export const defaultsCommutative = (diffDef: DiffEntities['columns']['default'], type: string): boolean => {
	if (!diffDef) return false;

	if (diffDef.from?.value === diffDef.to?.value) return true;

	let from = diffDef.from?.value;
	let to = diffDef.to?.value;

	if (from === to) return true;

	if (type.startsWith('bit')) {
		if (formatBit(type, diffDef.from?.value, true) === formatBit(type, diffDef?.to?.value, true)) return true;

		try {
			const from = stringifyArray(parseArray(trimChar(diffDef.from?.value!, "'")), 'sql', (v) => {
				return `${formatBit(type, v, true)}`;
			});
			const to = stringifyArray(parseArray(trimChar(diffDef.to?.value!, "'")), 'sql', (v) => {
				return `${formatBit(type, v, true)}`;
			});
			if (from === to) return true;
		} catch {}

		return false;
	}

	if (type.startsWith('bit')) {
		if (formatBit(type, diffDef.from?.value) === formatBit(type, diffDef?.to?.value)) return true;

		try {
			const from = stringifyArray(parseArray(trimChar(diffDef.from?.value!, "'")), 'sql', (v) => {
				return `${formatBit(type, v)}`;
			});
			const to = stringifyArray(parseArray(trimChar(diffDef.to?.value!, "'")), 'sql', (v) => {
				return `${formatBit(type, v)}`;
			});
			if (from === to) return true;
		} catch {}

		return false;
	}

	// only if array
	if (type.startsWith('decimal') && type.endsWith('[]')) {
		try {
			const from = stringifyArray(parseArray(trimChar(diffDef.from?.value!, "'")), 'sql', (v) => {
				return `${formatDecimal(type, v)}`;
			});
			const to = stringifyArray(parseArray(trimChar(diffDef.to?.value!, "'")), 'sql', (v) => {
				return `${formatDecimal(type, v)}`;
			});
			if (from === to) return true;
		} catch {}
		return false;
	}

	if (type.startsWith('timestamp')) {
		from = from?.replace('Z', '+00');
		to = to?.replace('Z', '+00');

		if (from === to) return true;

		const { options } = splitSqlType(type);
		const precision = options ? Number(options) : 3; // def precision

		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (type.endsWith('[]')) {
				try {
					const fromArray = stringifyArray(parseArray(from), 'sql', (v) => {
						v = trimChar(v, '"');
						if (!type.includes('tz')) v = v.replace(timezoneSuffixRegexp, '');

						return `"${formatTimestamp(v, precision)}"`;
					});
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => {
						v = trimChar(v, '"');
						if (!type.includes('tz')) v = v.replace(timezoneSuffixRegexp, '');

						return `"${formatTimestamp(v, precision)}"`;
					});
					if (fromArray === toArray) return true;
				} catch {
				}

				return false;
			}

			if (!type.includes('tz')) {
				from = from.replace(timezoneSuffixRegexp, '');
				to = to.replace(timezoneSuffixRegexp, '');
			}

			if (
				formatTimestamp(from, precision) === formatTimestamp(to, precision)
			) return true;
		}

		return false;
	}

	if (type.startsWith('time')) {
		from = from?.replace('Z', '+00');
		to = to?.replace('Z', '+00');

		if (from === to) return true;

		const { options } = splitSqlType(type);
		const precision = options ? Number(options) : 3; // def precision

		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (type.endsWith('[]')) {
				try {
					const fromArray = stringifyArray(parseArray(from), 'sql', (v) => {
						if (!type.includes('tz')) v = v.replace(timezoneSuffixRegexp, '');

						return formatTime(v, precision);
					});
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => {
						if (!type.includes('tz')) v = v.replace(timezoneSuffixRegexp, '');

						return formatTime(v, precision);
					});
					if (fromArray === toArray) return true;
				} catch {
				}

				return false;
			}

			if (!type.includes('tz')) {
				from = from.replace(timezoneSuffixRegexp, '');
				to = to.replace(timezoneSuffixRegexp, '');
			}

			if (
				formatTime(from, precision) === formatTime(to, precision)
			) return true;
		}

		return false;
	}

	if (type.startsWith('date')) {
		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (type.endsWith('[]')) {
				try {
					const fromArray = stringifyArray(parseArray(from), 'sql', (v) => formatDate(v));
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => formatDate(v));
					if (fromArray === toArray) return true;
				} catch {
				}

				return false;
			}

			if (formatDate(from) === formatDate(to)) return true;
		}

		return false;
	}

	if (type.startsWith('char') || type.startsWith('varchar') || type.startsWith('text') || type.startsWith('string')) {
		if (from && to) {
			from = trimChar(from, "'");
			to = trimChar(to, "'");

			if (type.endsWith('[]')) {
				try {
					const fromArray = stringifyArray(parseArray(from), 'sql', (v) => formatString(type, v));
					const toArray = stringifyArray(parseArray(to), 'sql', (v) => formatString(type, v));
					if (fromArray === toArray) return true;
				} catch {
				}

				return false;
			}

			if (formatDate(from) === formatDate(to)) return true;
		}
		return false;
	}

	const timeCommutatives = [['now', 'now()', 'current_timestamp', 'current_timestamp()']];
	if (type.startsWith('timestamp')) {
		for (const it of timeCommutatives) {
			const leftIn = it.some((x) => x === diffDef.from?.value);
			const rightIn = it.some((x) => x === diffDef.to?.value);

			if (leftIn && rightIn) return true;
		}
	}

	// real and float adds .0 to the end for the numbers
	// 100 === 100.0
	const dataTypesWithExtraZero = ['real', 'float'];
	if (
		dataTypesWithExtraZero.find((dataType) => type.startsWith(dataType))
		&& diffDef.from?.value.replace('.0', '') === diffDef.to?.value.replace('.0', '')
	) {
		return true;
	}

	return false;
};

export interface SqlType {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, type: string): Column['default'];
	defaultArrayFromDrizzle(value: any[], type: string): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	defaultArrayFromIntrospect(value: string): Column['default']; // todo: remove?
	toTs(type: string, value: string | null): { options?: Record<string, unknown>; default: string };
	toArrayTs(type: string, value: string | null): { options?: Record<string, unknown>; default: string };
}

export const Int2: SqlType = {
	is: (type: string) => /^\s*int2(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'int2',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' }; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
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
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return {
			value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' }; // 10, but '-10'
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
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
			return { options: { mode: 'bigint' }, default: stringifyArray(res, 'ts', (v) => `${v}n`) };
		} catch {
			return { options: { mode: 'bigint' }, default: `sql\`${value}\`` };
		}
	},
};

export const Bool: SqlType = {
	is: (type: string) => /^\s*bool(?:\s*\[\s*\])*\s*$/i.test(type),
	drizzleImport: () => 'bool',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => (v === true ? 'true' : 'false'))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: trimChar(value, "'"), type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
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
		return { value: `'${value}'`, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(value, 'sql', (v) => {
			if (typeof v !== 'string') throw new Error();
			return v;
		});
		return { value: `'${res}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: any = {};
		if (!value) return { options, default: '' };

		value = trimChar(value, "'");
		if (value === 'gen_random_uuid()') return { options, default: '.defaultRandom()' };
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
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		// 100 will be stored as 100.0
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
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
		return { value: String(value), type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value, type) => {
		return {
			value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
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
	defaultFromDrizzle: (value, _) => {
		return { type: 'unknown', value: `B'${value}'` };
	},
	defaultArrayFromDrizzle: (value, type) => {
		return { value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		// it is stored as B'<value>'
		return { value: value.replace("B'", "'"), type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
	},
	toTs: (type, value) => {
		const [length] = parseParams(type);
		const options = length ? { length: Number(length) } : {};

		return { options, default: value ?? '' };
	},
	toArrayTs: (type, value) => {
		if (!value) return { default: '' };

		const [length] = parseParams(type);
		const options = length ? { length: Number(length) } : {};

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
			return { type: 'unknown', value: `'${value.toISOString().replace('T', ' ').replace('Z', '')}'` };
		}

		return { type: 'unknown', value: `'${String(value)}'` };
	},
	defaultArrayFromDrizzle(value, type) {
		return {
			value: `'${
				stringifyArray(value, 'sql', (v) => {
					if (v instanceof Date) {
						return `"${v.toISOString().replace('T', ' ').replace('Z', '')}"`;
					}

					return `"${String(v)}"`;
				})
			}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value: string) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: { mode: string; precision?: number } = { mode: 'string' };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') return { default: '.defaultNow()', options };

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
			return { type: 'unknown', value: `'${value.toISOString().replace('T', ' ').replace('Z', '+00')}'` };
		}

		return { type: 'unknown', value: `'${String(value)}'` };
	},
	defaultArrayFromDrizzle(value, type) {
		return {
			value: `'${
				stringifyArray(value, 'sql', (v) => {
					if (v instanceof Date) {
						return `"${v.toISOString().replace('T', ' ').replace('Z', '+00')}"`;
					}

					return `"${String(v)}"`;
				})
			}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value: string) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: { mode: string; withTimezone: boolean; precision?: number } = { mode: 'string', withTimezone: true };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') return { default: '.defaultNow()', options };

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
		return { type: 'unknown', value: `'${String(value)}'` };
	},
	defaultArrayFromDrizzle(value, type) {
		return {
			value: `'${stringifyArray(value, 'sql', (v) => String(v))}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value: string) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	toTs: (type, value) => {
		const options: { precision?: number } = {};

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') return { default: '.defaultNow()', options };

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
		const options: { withTimezone: boolean; precision?: number } = { withTimezone: true };

		const [precision] = parseParams(type);
		if (precision) options.precision = Number(precision);

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') return { default: '.defaultNow()', options };

		// check for valid date
		try {
			Temporal.PlainTime.from(value.substring(1, value.length - 1));
			return { default: value, options };
		} catch {
			return { default: `sql\`${value}\``, options };
		}
	},
	toArrayTs: (type, value) => {
		const options: { withTimezone: boolean; precision?: number } = { withTimezone: true };

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
			return { type: 'unknown', value: `'${value.toISOString().split('T')[0]}'` };
		}

		return { type: 'unknown', value: `'${String(value)}'` };
	},
	defaultArrayFromDrizzle(value, type) {
		return {
			value: `'${
				stringifyArray(value, 'sql', (v) => {
					if (v instanceof Date) {
						return v.toISOString().split('T')[0];
					}

					return String(v);
				})
			}'`,
			type: 'unknown',
		};
	},
	defaultFromIntrospect: (value: string) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	toTs: (_, value) => {
		const options: { mode: string } = { mode: 'string' };

		if (!value) return { default: '', options };

		if (value === 'now()' || value === 'current_timestamp()') return { default: '.defaultNow()', options };

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
		const result = String(value).includes('\\') || String(value).includes("'") ? `e'${escaped}'` : `'${escaped}'`;

		return { value: result, type: 'unknown' };
	},
	defaultArrayFromDrizzle: (value) => {
		const res = stringifyArray(
			value,
			'sql',
			(v) => {
				if (typeof v !== 'string') throw new Error();
				const escaped = escapeForSqlDefault(v, 'arr');
				if (v.includes('\\') || v.includes('"') || v.includes(',')) return `"${escaped}"`;

				return escaped;
			},
		);

		return { value: `'${res}'`, type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultArrayFromIntrospect: (value) => {
		return { value: value as string, type: 'unknown' };
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
					const escaped = escapeForTsLiteral(unescapeFromSqlDefault(v, 'arr'));
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
		// const escaped = escapeForSqlDefault(String(value));
		// const result = String(value).includes('\\') || String(value).includes("'") ? `e'${escaped}'` : `'${escaped}'`;

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
			', ',
		);
		return {
			type: 'unknown',
			// cockroach escapes " inside of jsonb as \\"
			value: shouldEscape ? `e'${stringified.replaceAll("'", "\\'").replaceAll('\\"', '\\\\"')}'` : `'${stringified}'`,
		};
	},
	// not supported
	defaultArrayFromDrizzle: () => {
		return {
			value: `'[]'`,
			type: 'unknown',
		};
	},
	/*
		TODO: make less hacky,
		from: { type: 'unknown', value: `'{"key": "value"}'` },
		to:   { type: 'unknown', value: `'{"key":"value"}'` }
	 */
	defaultFromIntrospect: (value) => ({ type: 'unknown', value: value.replaceAll(`": "`, `":"`) }),
	// not supported
	defaultArrayFromIntrospect: () => {
		return {
			value: `'[]'`,
			type: 'unknown',
		};
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
		} catch (e: any) {
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

export const typeFor = (type: string): SqlType | null => {
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
	// no sql type
	return null;
};
