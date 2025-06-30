import { Temporal } from '@js-temporal/polyfill';
import { assertUnreachable } from '../../utils';
import { hash } from '../common';
import { CockroachEntities, Column, DiffEntities } from './ddl';

export const trimChar = (str: string, char: string) => {
	let start = 0;
	let end = str.length;

	while (start < end && str[start] === char) ++start;
	while (end > start && str[end - 1] === char) --end;

	const res = start > 0 || end < str.length ? str.substring(start, end) : str;
	return res;
};

export const splitSqlType = (sqlType: string) => {
	// timestamp(6) with time zone -> [timestamp, 6, with time zone]
	const match = sqlType.match(/^(\w+(?:\s+\w+)*)\(([^)]*)\)(\s+with time zone)?$/i);
	let type = match ? (match[1] + (match[3] ?? '')) : sqlType;
	let options = match ? match[2].replaceAll(', ', ',') : null;

	if (options && type === 'decimal') {
		options = options.replace(',0', ''); // trim decimal (4,0)->(4), compatibility with Drizzle
	}
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

const NativeTypes = [
	'uuid',
	'int2',
	'int4',
	'int8',
	'boolean',
	'text',
	'varchar',
	'decimal',
	'numeric',
	'real',
	'json',
	'jsonb',
	'time',
	'time with time zone',
	'time without time zone',
	'time',
	'timestamp',
	'timestamp with time zone',
	'timestamp without time zone',
	'date',
	'interval',
	'double precision',
	'interval year',
	'interval month',
	'interval day',
	'interval hour',
	'interval minute',
	'interval second',
	'interval year to month',
	'interval day to hour',
	'interval day to minute',
	'interval day to second',
	'interval hour to minute',
	'interval hour to second',
	'interval minute to second',
	'char',
	'vector',
	'geometry',
];

export const parseType = (schemaPrefix: string, type: string) => {
	const arrayDefinitionRegex = /\[\d*(?:\[\d*\])*\]/g;
	const arrayDefinition = (type.match(arrayDefinitionRegex) ?? []).join('');
	const withoutArrayDefinition = type.replace(arrayDefinitionRegex, '');
	return NativeTypes.some((it) => type.startsWith(it))
		? `${withoutArrayDefinition}${arrayDefinition}`
		: `${schemaPrefix}"${withoutArrayDefinition}"${arrayDefinition}`;
};

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

/*
	Cockroach db does not have serial by its nature
	Cockroach understands 'serial' and under the hood parses this as int8 + default as unique_rowid()
 */
export const isSerialExpression = (expr: string) => {
	return expr === 'unique_rowid()';
};

export function stringFromDatabaseIdentityProperty(field: any): string | null {
	return typeof field === 'string'
		? (field as string)
		: typeof field === undefined || field === null
		? null
		: typeof field === 'bigint'
		? field.toString()
		: String(field);
}

// CockroachDb trims and pads defaults under the hood
export function fixDecimal(value: string, options: string | null) {
	const [integerPart, decimalPart] = value.split('.');

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
	if (!decimalPart) return value;
	if (scale === 0) return integerPart;
	if (scale === decimalPart.length) return value;

	const fixedDecimal = scale > decimalPart.length
		? decimalPart.padEnd(scale, '0')
		: decimalPart.slice(0, scale);

	return `${integerPart}.${fixedDecimal}`;
}

export function buildArrayString(array: any[], sqlType: string, options: string | null): string {
	// we check if array consists only of empty arrays down to 5th dimension
	if (array.flat(5).length === 0) {
		return '{}';
	}

	const values = array
		.map((value) => {
			if (sqlType.startsWith('decimal')) {
				return fixDecimal(String(value), options);
			}

			if (sqlType.startsWith('timestamp') && sqlType.includes('with time zone')) {
				return `"${formatTimestampWithTZ(value, options ? Number(options) : undefined)}"`;
			}

			if (sqlType.startsWith('time') && sqlType.includes('with time zone')) {
				return `${value.replace('Z', '+00').replace('z', '+00')}`;
			}

			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			}

			if (typeof value === 'boolean') {
				return value ? 'true' : 'false';
			}

			if (Array.isArray(value)) {
				return buildArrayString(value, sqlType, options);
			}

			if (value instanceof Date) {
				if (sqlType === 'date') {
					return `${value.toISOString().split('T')[0]}`;
				} else if (sqlType.startsWith('timestamp')) {
					let res;
					if (sqlType.includes('with time zone')) {
						res = formatTimestampWithTZ(value, options ? Number(options) : undefined);
					} else {
						res = value.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23);
					}

					return `"${res}"`;
				} else {
					return `"${value.toISOString()}"`;
				}
			}

			if (typeof value === 'object') {
				return `"${JSON.stringify(value).replaceAll('"', '\\"')}"`;
			}

			if (typeof value === 'string') {
				if (/^[a-zA-Z0-9./_':-]+$/.test(value)) return value.replaceAll("'", "''");
				return `"${value.replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('"', '\\"')}"`;
			}

			return `"${value}"`;
		})
		.join(',');

	return `{${values}}`;
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

export const wrapRecord = (it: Record<string, string>) => {
	return {
		bool: (key: string) => {
			if (key in it) {
				if (it[key] === 'true') {
					return true;
				}
				if (it[key] === 'false') {
					return false;
				}

				throw new Error(`Invalid options boolean value for ${key}: ${it[key]}`);
			}
			return null;
		},
		num: (key: string) => {
			if (key in it) {
				const value = Number(it[key]);
				if (isNaN(value)) {
					throw new Error(`Invalid options number value for ${key}: ${it[key]}`);
				}
				return value;
			}
			return null;
		},
		str: (key: string) => {
			if (key in it) {
				return it[key];
			}
			return null;
		},
		literal: <T extends string>(key: string, allowed: T[]): T | null => {
			if (!(key in it)) return null;
			const value = it[key];

			if (allowed.includes(value as T)) {
				return value as T;
			}
			throw new Error(`Invalid options literal value for ${key}: ${it[key]}`);
		},
	};
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
	if (
		def === null
		|| def === undefined
	) {
		return null;
	}

	if (type.startsWith('bit')) {
		def = String(def).replace("B'", "'");
	}

	if (typeof def === 'boolean') {
		return { type: 'boolean', value: String(def) };
	}

	if (typeof def === 'number') {
		return { type: 'number', value: String(def) };
	}

	// trim ::type and []
	let value = trimDefaultValueSuffix(def);

	// numeric stores 99 as '99'::numeric
	value = type === 'decimal' || type.startsWith('decimal(') ? trimChar(value, "'") : value;

	if (dimensions > 0) {
		value = trimChar(value, "'"); // '{10,20}' -> {10,20}
	}

	if (type === 'jsonb') {
		const removedEscape = value.startsWith("e'")
			? value.replace("e'", "'").replaceAll("\\'", "''").replaceAll('\\"', '"').replaceAll('\\\\', '\\')
			: value;
		const res = JSON.stringify(JSON.parse(removedEscape.slice(1, removedEscape.length - 1).replaceAll("''", "'")));
		return {
			value: res,
			type: 'json',
		};
	}

	const trimmed = trimChar(value, "'"); // '{10,20}' -> {10,20}

	if (/^true$|^false$/.test(trimmed)) {
		return { value: trimmed, type: 'boolean' };
	}

	// null or NULL
	if (/^NULL$/i.test(trimmed)) {
		return { value: trimmed.toUpperCase(), type: 'null' };
	}

	// previous /^-?[\d.]+(?:e-?\d+)?$/
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed) && !type.startsWith('bit')) {
		let value = trimmed;
		if (type === 'float' || type === 'double precision' || type === 'real') {
			value = value.replace('.0', '');
		}

		const num = Number(value);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: value, type: big ? 'bigint' : 'number' };
	}

	// e'text\'text' and 'text'
	if (/^e'|'(?:[^']|'')*'$/.test(value)) {
		let removedEscape = value.startsWith("e'") ? value.replace("e'", "'") : value;
		removedEscape = removedEscape.replaceAll("\\'", "''").replaceAll('\\"', '"').replaceAll('\\\\', '\\');

		const res = removedEscape.substring(1, removedEscape.length - 1);

		if (type === 'jsonb') {
			return { value: JSON.stringify(JSON.parse(res.replaceAll("''", "'"))), type: 'json' };
		}

		return { value: res, type: 'string' };
	}

	// CREATE TYPE myEnum1 AS ENUM ('hey', 'te''text');
	// CREATE TABLE "table22" (
	//    "column" myEnum1[] DEFAULT '{hey, te''text}'::myEnum1[]
	// );
	// '{hey,"e''te\\''text''"}' -> '{hey,"'te\\''text'"}' - this will replace e'<VALUE>' to <VALUE>
	if (isEnum && dimensions > 0 && value.includes("e'")) {
		value = value.replace(/"\be''((?:["']|[^'])*)''"/g, '"$1"').replaceAll("\\\\'", "'"); // .replaceAll('"', '\\"');
	}

	return { value: value, type: 'unknown' };
};

export const defaultToSQL = (
	it: Column,
	isEnum: boolean = false,
) => {
	if (!it.default) return '';

	const { type: columnType, dimensions, typeSchema } = it;
	const { type: defaultType, value } = it.default;

	const arrsuffix = dimensions > 0 ? '[]' : '';
	if (typeSchema) {
		const schemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
		return `'${value}'::${schemaPrefix}"${columnType}"${arrsuffix}`;
	}

	const suffix = arrsuffix ? `::${typeToSql(it)}` : '';
	if (defaultType === 'string') {
		return `'${value}'${suffix}`;
	}

	if (defaultType === 'json') {
		return `'${value.replaceAll("'", "''")}'${suffix}`;
	}

	if (defaultType === 'bigint' || defaultType === 'jsonb') {
		return `'${value}'`;
	}

	if (
		defaultType === 'boolean' || defaultType === 'null' || defaultType === 'number' || defaultType === 'func'
		|| defaultType === 'unknown'
	) {
		return value;
	}

	assertUnreachable(defaultType);
};

export const typeToSql = (
	column: Column,
	diff?: DiffEntities['columns'],
	wasEnum = false,
	isEnum = false,
): string => {
	const {
		type: columnType,
		typeSchema: columnTypeSchema,
		dimensions,
		options,
		name: columnName,
	} = column;

	const schemaPrefix = columnTypeSchema && columnTypeSchema !== 'public'
		? `"${columnTypeSchema}".`
		: '';

	// enum1::text::enum2
	const textProxy = wasEnum && isEnum ? 'text::' : '';
	const arraySuffix = dimensions > 0 ? '[]'.repeat(dimensions) : '';
	const optionSuffix = options ? `(${options})` : '';

	const isTimeWithTZ = columnType === 'timestamp with time zone' || columnType === 'time with time zone';

	let finalType: string;

	if (diff?.type) {
		const newType = diff.type.to;
		const newSchema = diff.typeSchema?.to;

		const newSchemaPrefix = newSchema && newSchema !== 'public' ? `"${newSchema}".` : '';

		finalType = isEnum
			? `"${newType}"`
			: `${newSchemaPrefix}${newType}`;
	} else {
		if (optionSuffix && isTimeWithTZ) {
			const [baseType, ...rest] = columnType.split(' ');
			const base = columnTypeSchema ? `"${baseType}"` : baseType;
			finalType = `${schemaPrefix}${base}${optionSuffix} ${rest.join(' ')}`;
		} else {
			const base = columnTypeSchema ? `"${columnType}"` : columnType;
			finalType = `${schemaPrefix}${base}${optionSuffix}`;
		}
	}

	finalType += arraySuffix;

	finalType += isEnum
		? ` USING "${columnName}"::${textProxy}${finalType}`
		: '';

	return finalType;
};

function hasTimeZoneSuffix(s: string): boolean {
	return /([+-]\d{2}(:?\d{2})?|Z)$/.test(s);
}
export function formatTimestampWithTZ(date: Date | string, precision: number = 3) {
	// Convert to Temporal.Instant
	let instant;

	if (date instanceof Date) {
		instant = Temporal.Instant.from(date.toISOString());
	} else {
		instant = hasTimeZoneSuffix(date) ? Temporal.Instant.from(date) : Temporal.Instant.from(date + 'Z');
	}

	const iso = instant.toString();

	const fractionalDigits = iso.split('.')[1]!.replace('Z', '').length;

	// decide whether to limit precision
	const formatted = fractionalDigits > precision
		// @ts-expect-error
		? instant.toString({ fractionalSecondDigits: precision })
		: iso;

	return formatted.replace('T', ' ').replace('Z', '+00');
}

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
