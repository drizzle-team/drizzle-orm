import { stringifyArray, stringifyTuplesArray, trimChar } from '../../utils';
import { assertUnreachable } from '../../utils';
import { parseArray } from '../../utils/parse-pgarray';
import { hash } from '../common';
import { Column, PostgresEntities } from './ddl';

const columnUnknown = {
	drizzleImport() {
		return 'unknown';
	},
	canHandle(type: string) {
		return true;
	},

	defaultFromDrizzle(it: any, dimensions: number): Column['default'] {
		return { type: 'unknown', value: String(it).replaceAll("'", "''").replaceAll('\\', '\\\\') };
	},

	printToTypeScript(column: Column) {
		return `unknown('${column.name}').default(sql\`${column.default?.value.replaceAll("''","'").replaceAll('\\\\','\\')}\`)`;
	},
};

export const splitSqlType = (sqlType: string) => {
	// timestamp(6) with time zone -> [timestamp, 6, with time zone]
	const match = sqlType.match(/^(\w+(?:\s+\w+)*)\(([^)]*)\)(?:\s+with time zone)?$/i);
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

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export function stringFromIdentityProperty(field: string | number | undefined): string | undefined {
	return typeof field === 'string' ? (field as string) : typeof field === 'undefined' ? undefined : String(field);
}

export function maxRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '2147483647' : columnType === 'bigint' ? '9223372036854775807' : '32767';
}

export function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '-2147483648' : columnType === 'bigint' ? '-9223372036854775808' : '-32768';
}

/*
	we can't check for `nextval('${schemaPrefix}${table}_${column}_seq'::regclass)` perfect match
	since table or column might be renamed, while sequence preserve name and it will trigger
	subsequent ddl diffs
 */
export const isSerialExpression = (expr: string, schema: string) => {
	const schemaPrefix = schema === 'public' ? '' : `${schema}.`;
	return expr.startsWith(`nextval('${schemaPrefix}`) && expr.endsWith(`_seq'::regclass)`);
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

export function buildArrayString(array: any[], sqlType: string): string {
	// we check if array consists only of empty arrays down to 5th dimension
	if (array.flat(5).length === 0) {
		return '{}';
	}

	const values = array
		.map((value) => {
			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			}

			if (typeof value === 'boolean') {
				return value ? 't' : 'f';
			}

			if (Array.isArray(value)) {
				return buildArrayString(value, sqlType);
			}

			if (sqlType.startsWith('numeric')) {
				return String(value);
			}

			if (value instanceof Date) {
				if (sqlType === 'date') {
					return `${value.toISOString().split('T')[0]}`;
				} else if (sqlType === 'timestamp') {
					return `"${value.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23)}"`;
				} else {
					return `"${value.toISOString().replace('T', ' ').replace('Z', '')}"`;
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

export type OnAction = PostgresEntities['fks']['onUpdate'];
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

export const systemNamespaceNames = ['pg_toast', 'pg_catalog', 'information_schema'];
export const isSystemNamespace = (name: string) => {
	return name.startsWith('pg_toast') || name === 'pg_default' || name === 'pg_global' || name.startsWith('pg_temp_')
		|| systemNamespaceNames.indexOf(name) >= 0;
};

export const isSystemRole = (name: string) => {
	return name === 'postgres' || name.startsWith('pg_');
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

type DefaultMapper<IN> = (value: IN | IN[]) => Column['default'];

export const defaultForVector: DefaultMapper<[number, number, number]> = (value) => {
	const res = stringifyTuplesArray(value, 'sql', (x: number[], depth: number) => {
		const res = x.length > 0 ? `[${x[0]},${x[1]},${x[2]}]` : '{}';
		return depth === 0 ? res : `"${res}"`;
	});
	return { value: `'${res}'`, type: 'unknown' };
};

// TODO: check
// export const splitExpressions = (input: string | null): string[] => {
// 	if (!input) return [];

// 	const wrapped = input.startsWith('(') && input.endsWith(')');
// 	input = wrapped ? input.slice(1, input.length - 1) : input;

// 	// This regex uses three alternatives:
// 	// 1. Quoted strings that allow escaped quotes: '([^']*(?:''[^']*)*)'
// 	// 2. Parenthesized expressions that support one level of nesting:
// 	//      \((?:[^()]+|\([^()]*\))*\)
// 	// 3. Any character that is not a comma, quote, or parenthesis: [^,'()]
// 	//
// 	// It also trims optional whitespace before and after each token,
// 	// requiring that tokens are followed by a comma or the end of the string.
// 	// const regex = /\s*((?:'[^']*(?:''[^']*)*'|\((?:[^()]+|\([^()]*\))*\)|[^,'()])+)\s*(?:,|$)/g;
// 	const regex = /\s*((?:'(?:[^']|'')*'|\((?:[^()]+|\([^()]*\))*\)|[^,'()])+)\s*(?:,|$)/g;
// 	const result: string[] = [];
// 	let match: RegExpExecArray | null;

// 	while ((match = regex.exec(input)) !== null) {
// 		result.push(match[1].trim());
// 	}

// 	return result;
// };

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
	res = res.replaceAll(/::[\w\s]+(\([^\)]*\))?(\[\])*/g, '');
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
		|| type === 'serial'
		|| type === 'smallserial'
		|| type === 'bigserial'
	) {
		return null;
	}

	if (typeof def === 'boolean') {
		return { type: 'boolean', value: String(def) };
	}

	if (typeof def === 'number') {
		return { type: 'number', value: String(def) };
	}

	// trim ::type and []
	let value = trimDefaultValueSuffix(def);

	if (type.startsWith('vector')) {
		return { value: value, type: 'unknown' };
	}

	// numeric stores 99 as '99'::numeric
	value = type === 'numeric' || type.startsWith('numeric(') ? trimChar(value, "'") : value;

	if (type === 'json' || type === 'jsonb') {
		if (!value.startsWith("'") && !value.endsWith("'")) {
			return { value, type: 'unknown' };
		}
		if (dimensions > 0) {
			const res = stringifyArray(parseArray(value.slice(1, value.length - 1)), 'sql', (it) => {
				return `"${JSON.stringify(JSON.parse(it.replaceAll('\\"', '"'))).replaceAll('"', '\\"')}"`;
			}).replaceAll(`\\"}", "{\\"`, `\\"}","{\\"`); // {{key:val}, {key:val}} -> {{key:val},{key:val}}
			return {
				value: res,
				type: 'json',
			};
		}
		const res = JSON.stringify(JSON.parse(value.slice(1, value.length - 1).replaceAll("''", "'")));
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
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
		const num = Number(trimmed);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: trimmed, type: big ? 'bigint' : 'number' };
	}

	// 'text', potentially with escaped double quotes ''
	if (/^'(?:[^']|'')*'$/.test(value)) {
		const res = value.substring(1, value.length - 1);

		if (type === 'json' || type === 'jsonb') {
			return { value: JSON.stringify(JSON.parse(res.replaceAll("''", "'"))), type: 'json' };
		}
		return { value: res, type: 'string' };
	}

	return { value: value, type: 'unknown' };
};

export const defaultToSQL = (
	it: Pick<Column, 'default' | 'dimensions' | 'type' | 'typeSchema'>,
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

	if (type === 'bigint') {
		return `'${value}'${suffix}`;
	}

	if (type === 'boolean' || type === 'null' || type === 'number' || type === 'func' || type === 'unknown') {
		return `${value}${suffix}`;
	}

	assertUnreachable(type);
};

export const isDefaultAction = (action: string) => {
	return action.toLowerCase() === 'no action';
};

export const defaults = {
	/*
			By default, PostgreSQL uses the cluster’s default tablespace (which is named 'pg_default')

			This operation requires an exclusive lock on the materialized view (it rewrites the data file),
			and you must have CREATE privilege on the target tablespace.
			If you have indexes on the materialized view, note that moving the base table does not automatically move its indexes.
			Each index is a separate object and retains its original tablespace​.

			You should move indexes individually, for example:
			sql`ALTER INDEX my_matview_idx1 SET TABLESPACE pg_default`;
			sql`ALTER INDEX my_matview_idx2 SET TABLESPACE pg_default`;
		*/
	tablespace: 'pg_default',

	/*
		The table access method (the storage engine format) is chosen when the materialized view is created,
		 using the optional USING <method> clause.
		 If no method is specified, it uses the default access method (typically the regular heap storage)​

		sql`
			CREATE MATERIALIZED VIEW my_matview
			USING heap  -- storage access method; "heap" is the default
			AS SELECT ...;
		`

		Starting with PostgreSQL 15, you can alter a materialized view’s access method in-place.
		PostgreSQL 15 introduced support for ALTER MATERIALIZED VIEW ... SET ACCESS METHOD new_method
		*/
	accessMethod: 'heap',

	/*
		By default, NULL values are treated as distinct entries.
		Specifying NULLS NOT DISTINCT on unique indexes / constraints will cause NULL to be treated as not distinct,
		or in other words, equivalently.

		https://www.postgresql.org/about/featurematrix/detail/392/
	*/
	nullsNotDistinct: false,

	identity: {
		startWith: '1',
		increment: '1',
		min: '1',
		maxFor: (type: string) => {
			if (type === 'smallint') return '32767';
			if (type === 'integer') return '2147483647';
			if (type === 'bigint') return '9223372036854775807';
			throw new Error(`Unknow identity column type: ${type}`);
		},
		cache: 1,
		cycle: false,
	},

	index: {
		method: 'btree',
	},
} as const;
