import { assertUnreachable } from 'src/global';
import { escapeSingleQuotes } from 'src/utils';
import { Column, PostgresEntities } from './ddl';

export const trimChar = (str: string, char: string) => {
	let start = 0;
	let end = str.length;

	while (start < end && str[start] === char) ++start;
	while (end > start && str[end - 1] === char) --end;

	const res = start > 0 || end < str.length ? str.substring(start, end) : str;
	return res;
};

export const parseType = (schemaPrefix: string, type: string) => {
	const NativeTypes = [
		'uuid',
		'smallint',
		'integer',
		'bigint',
		'boolean',
		'text',
		'varchar',
		'serial',
		'bigserial',
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
		'bigint',
		'bigserial',
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
	return columnType === 'integer' ? '2147483647' : columnType === 'bigint' ? '9223372036854775807' : '32767';
}

export function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '-2147483648' : columnType === 'bigint' ? '-9223372036854775808' : '-32768';
}

export const serialExpressionFor = (schema: string, table: string, column: string) => {
	const schemaPrefix = schema === 'public' ? '' : `${schema}.`;
	return `nextval('${schemaPrefix}${table}_${column}_seq'::regclass)`;
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
	sqlType = sqlType.split('[')[0];
	const values = array
		.map((value) => {
			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			} else if (typeof value === 'boolean') {
				return value ? 'true' : 'false';
			} else if (Array.isArray(value)) {
				return buildArrayString(value, sqlType);
			} else if (value instanceof Date) {
				if (sqlType === 'date') {
					return `"${value.toISOString().split('T')[0]}"`;
				} else if (sqlType === 'timestamp') {
					return `"${value.toISOString().replace('T', ' ').slice(0, 23)}"`;
				} else {
					return `"${value.toISOString()}"`;
				}
			} else if (typeof value === 'object') {
				return `"${JSON.stringify(value).replaceAll('"', '\\"')}"`;
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

// TODO: handle 63 bit key length limit
export const defaultNameForFK = (table: string, columns: string[], tableTo: string, columnsTo: string[]) => {
	return `${table}_${columns.join('_')}_${tableTo}_${columnsTo.join('_')}_fk`;
};

export const defaultNameForUnique = (table: string, column: string) => {
	return `${table}_${column}_key`;
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
	def: string | null | undefined,
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

	// trim ::type and []
	let value = trimDefaultValueSuffix(def);

	// numeric stores 99 as '99'::numeric
	value = type === 'numeric' || type.startsWith('numeric(') ? trimChar(value, "'") : value;

	if (dimensions > 0) {
		const values = value
			.slice(2, -2)
			.split(/\s*,\s*/g)
			.map((value) => {
				if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(type)) {
					return value;
				} else if (type.startsWith('timestamp')) {
					return value;
				} else if (type === 'interval') {
					return value.replaceAll('"', '\\"');
				} else if (type === 'boolean') {
					return value === 't' ? 'true' : 'false';
				} else if (['json', 'jsonb'].includes(type)) {
					return JSON.stringify(JSON.stringify(JSON.parse(JSON.parse(value)), null, 0));
				} else {
					return `\"${value}\"`;
				}
			});
		const res = `{${values.join(',')}}`;
		return { value: res, type: 'array' };
	}

	// 'text', potentially with escaped double quotes ''
	if (/^'(?:[^']|'')*'$/.test(value)) {
		const res = value.substring(1, value.length - 1).replaceAll("''", "'");

		if (type === 'json' || type === 'jsonb') {
			return { value: JSON.stringify(JSON.parse(res)), type };
		}
		return { value: res, type: 'string' };
	}

	if (/^true$|^false$/.test(value)) {
		return { value: value, type: 'boolean' };
	}

	// null or NULL
	if (/^NULL$/i.test(value)) {
		return { value: value.toUpperCase(), type: 'null' };
	}

	// previous /^-?[\d.]+(?:e-?\d+)?$/
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
		const num = Number(value);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: value, type: big ? 'bigint' : 'number' };
	}

	return { value: value, type: 'unknown' };
};

export const defaultToSQL = (it: Column['default']) => {
	if (!it) return '';

	const { value, type } = it;
	if (type === 'string') {
		return `'${escapeSingleQuotes(value)}'`;
	}
	if (type === 'array' || type === 'bigint' || type === 'json' || type === 'jsonb') {
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
} as const;
