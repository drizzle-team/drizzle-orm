import { assertUnreachable } from '../../utils';
import { hash } from '../common';
import { CockroachDbEntities, Column } from './ddl';

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
	const match = sqlType.match(/^(\w+)\(([^)]*)\)(?:\s+with time zone)?$/i);
	let type = match ? (match[1] + (match[3] ?? '')) : sqlType;
	let options = match ? match[2].replaceAll(', ', ',') : null;

	if (options && type === 'numeric') {
		options = options.replace(',0', ''); // trim numeric (4,0)->(4), compatibility with Drizzle
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
export function fixNumeric(value: string, scale?: number) {
	const [integerPart, decimalPart] = value.split('.');

	if (typeof scale === 'undefined') return value;
	if (!decimalPart) return value;
	if (scale === 0) return integerPart;
	if (scale === decimalPart.length) return value;

	const fixedDecimal = scale > decimalPart.length
		? decimalPart.padEnd(scale, '0')
		: decimalPart.slice(0, scale);

	return `${integerPart}.${fixedDecimal}`;
}

export function buildArrayString(array: any[], sqlType: string, scale?: number): string {
	// we check if array consists only of empty arrays down to 5th dimension
	if (array.flat(5).length === 0) {
		return '{}';
	}

	const values = array
		.map((value) => {
			if (sqlType.startsWith('numeric')) {
				return fixNumeric(String(value), scale);
			}

			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			}

			if (typeof value === 'boolean') {
				return value ? 'true' : 'false';
			}

			if (Array.isArray(value)) {
				return buildArrayString(value, sqlType, scale);
			}

			if (value instanceof Date) {
				if (sqlType === 'date') {
					return `"${value.toISOString().split('T')[0]}"`;
				} else if (sqlType === 'timestamp') {
					return `"${value.toISOString().replace('T', ' ').slice(0, 23)}"`;
				} else {
					return `"${value.toISOString()}"`;
				}
			}

			if (typeof value === 'object') {
				return `"${JSON.stringify(value).replaceAll('"', '\\"')}"`;
			}

			if (typeof value === 'string') {
				if (/^[a-zA-Z0-9./_':-]+$/.test(value)) return value.replaceAll("'", "''");
				return `"${value.replaceAll("'", "''").replaceAll('"', '\\"')}"`;
			}

			return `"${value}"`;
		})
		.join(',');

	return `{${values}}`;
}

export type OnAction = CockroachDbEntities['fks']['onUpdate'];
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

export const trimDefaultValueSuffix = (value: string) => {
	let res = value.endsWith('[]') ? value.slice(0, -2) : value;
	res = res.replace(/::(.*?)(?<![^\w"])(?=$)/, '');
	return res;
};

export const defaultForColumn = (
	type: string,
	def: string | boolean | number | null | undefined,
	dimensions: number,
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
	value = type === 'numeric' || type.startsWith('numeric(') ? trimChar(value, "'") : value;

	if (dimensions > 0) {
		value = value.trimChar("'"); // '{10,20}' -> {10,20}
	}

	if (type === 'jsonb') {
		const removedEscape = value.startsWith("e'")
			? value.replace("e'", "'").replaceAll("\\'", "''").replaceAll('\\"', '"')
			: value;
		const res = JSON.stringify(JSON.parse(removedEscape.slice(1, removedEscape.length - 1).replaceAll("''", "'")));
		return {
			value: res,
			type: 'json',
		};
	}

	const trimmed = value.trimChar("'"); // '{10,20}' -> {10,20}

	if (/^true$|^false$/.test(trimmed)) {
		return { value: trimmed, type: 'boolean' };
	}

	// null or NULL
	if (/^NULL$/i.test(trimmed)) {
		return { value: trimmed.toUpperCase(), type: 'null' };
	}

	// previous /^-?[\d.]+(?:e-?\d+)?$/
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed) && !type.startsWith('bit')) {
		const num = Number(trimmed);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: trimmed, type: big ? 'bigint' : 'number' };
	}

	// for 'text' and e'text\'text'
	if (/^(e|E)?'(?:[^'\\]|\\.|'')*'$/.test(value)) {
		// e'text\'text' -> text'text
		const removedEscape = value.startsWith("e'")
			? value.replace("e'", "'").replaceAll("\\'", "''").replaceAll('\\"', '"')
			: value;
		const res = removedEscape.substring(1, removedEscape.length - 1);

		if (type === 'json' || type === 'jsonb') {
			return { value: JSON.stringify(JSON.parse(res.replaceAll("''", "'"))), type: 'json' };
		}

		return { value: res, type: 'string' };
	}

	return { value: value, type: 'unknown' };
};

export const defaultToSQL = (
	it: Pick<Column, 'default' | 'dimensions' | 'type' | 'typeSchema'>,
	isEnum: boolean = false,
) => {
	if (!it.default) return '';

	const { type: columnType, dimensions, typeSchema } = it;
	const { type, value } = it.default;

	const arrsuffix = dimensions > 0 ? '[]' : '';
	if (typeSchema) {
		const schemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
		return `'${value}'::${schemaPrefix}"${columnType}"${arrsuffix}`;
	}

	const suffix = arrsuffix ? `::${columnType}${arrsuffix}` : '';

	if (type === 'string') {
		return `'${value}'${suffix}`;
	}

	if (type === 'json') {
		return `'${value.replaceAll("'", "''")}'${suffix}`;
	}

	if (type === 'bigint' || type === 'jsonb') {
		return `'${value}'`;
	}

	if (type === 'boolean' || type === 'null' || type === 'number' || type === 'func' || type === 'unknown') {
		return value;
	}

	assertUnreachable(type);
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
		method: 'prefix',
	},
} as const;
