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

export type OnAction = 'NO ACTION' | 'RESTRICT' | 'SET NULL' | 'CASCADE' | 'SET DEFAULT';
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
	return name.startsWith('pg_toast') || name.startsWith('pg_temp_') || systemNamespaceNames.indexOf(name) >= 0;
};

export const splitExpressions = (input: string | null): string[] => {
	if (!input) return [];

	// This regex uses three alternatives:
	// 1. Quoted strings that allow escaped quotes: '([^']*(?:''[^']*)*)'
	// 2. Parenthesized expressions that support one level of nesting:
	//      \((?:[^()]+|\([^()]*\))*\)
	// 3. Any character that is not a comma, quote, or parenthesis: [^,'()]
	//
	// It also trims optional whitespace before and after each token,
	// requiring that tokens are followed by a comma or the end of the string.
	const regex = /\s*((?:'[^']*(?:''[^']*)*'|\((?:[^()]+|\([^()]*\))*\)|[^,'()])+)\s*(?:,|$)/g;
	const result: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(input)) !== null) {
		result.push(match[1].trim());
	}

	return result;
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

export const defaultForColumn = (
	type: string,
	def: string | null | undefined,
	dimensions: number,
): { value: string; expression: boolean } | null => {
	if (
		def === null
		|| def === undefined
		|| type === 'serial'
		|| type === 'smallserial'
		|| type === 'bigserial'
	) {
		return null;
	}

	let defaultValue = def.endsWith('[]') ? def.slice(0, -2) : def;
	defaultValue = defaultValue.replace(/::(.*?)(?<![^\w"])(?=$)/, '');

	if (dimensions > 0) {
		return {
			value: `'{${
				defaultValue
					.slice(2, -2)
					.split(/\s*,\s*/g)
					.map((value) => {
						if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(type.slice(0, -2))) {
							return value;
						} else if (type.startsWith('timestamp')) {
							return `${value}`;
						} else if (type.slice(0, -2) === 'interval') {
							return value.replaceAll('"', `\"`);
						} else if (type.slice(0, -2) === 'boolean') {
							return value === 't' ? 'true' : 'false';
						} else if (['json', 'jsonb'].includes(type.slice(0, -2))) {
							return JSON.stringify(JSON.stringify(JSON.parse(JSON.parse(value)), null, 0));
						} else {
							return `\"${value}\"`;
						}
					})
					.join(',')
			}}'`,
			expression: false,
		};
	}

	if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(type)) {
		if (/^-?[\d.]+(?:e-?\d+)?$/.test(defaultValue)) {
			return { value: defaultValue, expression: false };
		} else {
			// expression
			return { value: defaultValue, expression: true };
		}
	} else if (type.includes('numeric')) {
		// if numeric(1,1) and used '99' -> psql stores like '99'::numeric
		return { value: defaultValue.includes("'") ? defaultValue : `'${defaultValue}'`, expression: false };
	} else if (type === 'json' || type === 'jsonb') {
		const jsonWithoutSpaces = JSON.stringify(JSON.parse(defaultValue.slice(1, -1)));
		return { value: `'${jsonWithoutSpaces}'::${type}`, expression: false };
	} else if (type === 'boolean') {
		return { value: defaultValue, expression: false };
	} else if (defaultValue === 'NULL') {
		return { value: `NULL`, expression: false };
	} else if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
		return { value: defaultValue, expression: false };
	} else {
		return { value: `${defaultValue.replace(/\\/g, '`\\')}`, expression: false };
	}
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
} as const;
