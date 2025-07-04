import { string } from 'drizzle-orm/cockroach-core';
import { configIntrospectCliSchema } from 'src/cli/validations/common';
import { trimChar } from 'src/utils';
import type { Column, ForeignKey } from './ddl';
import type { Import } from './typescript';

const namedCheckPattern = /CONSTRAINT\s*["']?(\w+)["']?\s*CHECK\s*\((.*?)\)/gi;
const unnamedCheckPattern = /CHECK\s*\((.*?)\)/gi;
const viewAsStatementRegex = new RegExp(`\\bAS\\b\\s+(SELECT.+)$`, 'i');

export const nameForForeignKey = (fk: Pick<ForeignKey, 'table' | 'columns' | 'tableTo' | 'columnsTo'>) => {
	return `fk_${fk.table}_${fk.columns.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`;
};

export const nameForUnique = (table: string, columns: string[]) => {
	return `${table}_${columns.join('_')}_unique`;
};

export interface SqlType<MODE = unknown> {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, mode?: MODE): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	defaultToSQL(value: Column['default']): string;
	defaultToTS(value: Column['default']): string;
}

const intAffinities = [
	'int',
	'integer',
	'tiniint',
	'smallint',
	'mediumint',
	'bigint',
	'unsigned big int',
	'int2',
	'int8',
];

export const Int: SqlType<'timestamp' | 'timestamp_ms'> = {
	is(type) {
		return intAffinities.indexOf(type.toLowerCase()) >= 0;
	},
	drizzleImport: function(): Import {
		return 'integer';
	},
	defaultFromDrizzle(value, mode) {
		if (typeof value === 'boolean') {
			return { value: value ? '1' : '0', isExpression: true };
		}

		if (typeof value === 'bigint') {
			return { value: `'${value.toString()}'`, isExpression: true };
		}

		if (value instanceof Date) {
			const v = mode === 'timestamp' ? value.getTime() / 1000 : value.getTime();
			return { value: v.toFixed(0), isExpression: true };
		}

		return { value: String(value), isExpression: true };
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		const it = trimChar(value, "'");
		const check = Number(it);
		if (Number.isNaN(check)) return { value, isExpression: true }; // unknown
		if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return { value: it, isExpression: true };
		return { value: it, isExpression: true }; // bigint
	},
	defaultToSQL: function(value: Column['default']): string {
		return value ? value.value : ''; // as is?
	},
	defaultToTS: function(value: Column['default']): string {
		if (!value) return '';
		const check = Number(value.value);

		if (Number.isNaN(check)) return `sql\`${value.value}\``; // unknown
		if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return value.value;
		return `${value.value}n`; // bigint
	},
};

const realAffinities = [
	'real',
	'double',
	'double precision',
	'float',
];

export const Real: SqlType = {
	is: function(type: string): boolean {
		return realAffinities.indexOf(type.toLowerCase()) >= 0;
	},
	drizzleImport: function(): Import {
		return 'real';
	},
	defaultFromDrizzle: function(value: unknown): Column['default'] {
		return { value: String(value), isExpression: true };
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return { value, isExpression: true };
	},
	defaultToSQL: function(value: Column['default']): string {
		return value?.value ?? '';
	},
	defaultToTS: function(value: Column['default']): string {
		return value?.value ?? '';
	},
};

const numericAffinities = [
	'numeric',
	'decimal',
	'boolean',
	'date',
	'datetime',
];
export const Numeric: SqlType = {
	is: function(type: string): boolean {
		const lowered = type.toLowerCase();

		return numericAffinities.indexOf(lowered) >= 0
			|| lowered.startsWith('numeric(')
			|| lowered.startsWith('decimal(');
	},
	drizzleImport: function(): Import {
		return 'numeric';
	},
	defaultFromDrizzle: function(value: unknown, mode?: unknown): Column['default'] {
		if (typeof value === 'string') return { value: `'${value}'`, isExpression: true };
		if (typeof value === 'bigint') return { value: `'${value.toString()}'`, isExpression: true };
		if (typeof value === 'number') return { value: `${value.toString()}`, isExpression: true };
		throw new Error(`unexpected: ${value} ${typeof value}`);
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return { value, isExpression: true };
	},
	defaultToSQL: function(value: Column['default']): string {
		return value?.value ?? '';
	},
	defaultToTS: function(value: Column['default']): string {
		if (!value) return '';
		const check = Number(value.value);

		if (Number.isNaN(check)) return value.value; // unknown
		if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return value.value;
		return `${value.value}n`; // bigint
	},
};

const textAffinities = [
	'text',
	'character',
	'varchar',
	'varying character',
	'nchar',
	'native character',
	'nvarchar',
	'clob',
];

export const Text: SqlType = {
	is: function(type: string): boolean {
		const lowered = type.toLowerCase();
		return textAffinities.indexOf(lowered) >= 0
			|| lowered.startsWith('character(')
			|| lowered.startsWith('varchar(')
			|| lowered.startsWith('varying character(')
			|| lowered.startsWith('nchar(')
			|| lowered.startsWith('native character(')
			|| lowered.startsWith('nvarchar(');
	},
	drizzleImport: function(): Import {
		return 'text';
	},
	defaultFromDrizzle: function(value: unknown, mode?: unknown): Column['default'] {
		if (typeof value === 'string') return { value: value, isExpression: true };

		if (typeof value === 'object' || Array.isArray(value)) {
			const escaped = JSON.stringify(value, (key, value) => {
				if (typeof value !== 'string') return value;
				return value.replaceAll("'", "''");
			});
			return { value: `${escaped}`, isExpression: true };
		}

		throw new Error(`unexpected default: ${value}`);
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		const unescaped = trimChar(value, "'").replaceAll("''", "'").replaceAll('\\\\', '\\');
		return { value: unescaped, isExpression: true };
	},
	defaultToSQL: function(value: Column['default']): string {
		if (value === null) return '';
		const escaped = value.value.replaceAll('\\', '\\\\').replaceAll("'", "''");
		return `'${escaped}'`;
	},
	defaultToTS: function(value: Column['default']): string {
		if (value === null) return '';

		const escaped = value.value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
		return `"${escaped}"`;
	},
};

export const Blob: SqlType = {
	is: function(type: string): boolean {
		const lowered = type.toLowerCase();
		return lowered === 'blob' || lowered.startsWith('blob');
	},
	drizzleImport: function(): Import {
		return 'blob';
	},
	defaultFromDrizzle: function(value: unknown): Column['default'] {
		if (typeof value === 'bigint') return { value: `'${value.toString()}'`, isExpression: true };
		if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(value)) {
			return { value: `X'${value.toString('hex').toUpperCase()}'`, isExpression: true };
		}
		if (Array.isArray(value) || typeof value === 'object') {
			const escaped = JSON.stringify(value, (key, value) => {
				if (typeof value !== 'string') return value;
				return value.replaceAll("'", "''");
			});
			return { value: `'${escaped}'`, isExpression: true };
		}
		throw new Error('unexpected');
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return { value, isExpression: true };
	},
	defaultToSQL: function(value: Column['default']): string {
		return value ? value.value : '';
	},
	defaultToTS: function(it: Column['default']): string {
		if (it === null) return '';

		const { value } = it;
		if (typeof Buffer !== 'undefined' && it.value.startsWith("X'")) {
			const parsed = Buffer.from(value.slice(2, value.length - 1), 'hex').toString('utf-8');
			const escaped = parsed.replaceAll('\\', '\\\\').replace('"', '\\"');
			return `Buffer.from("${escaped}")`;
		}

		try {
			const trimmed = trimChar(value, "'");
			const num = Number(trimmed);
			if (!Number.isNaN(num)) {
				if (num >= Number.MIN_SAFE_INTEGER && num <= Number.MAX_SAFE_INTEGER) {
					return String(num);
				} else {
					return `${trimmed}n`;
				}
			}

			const json = JSON.parse(trimmed);
			return JSON.stringify(json).replaceAll("''", "'");
		} catch {}

		const unescaped = value.replaceAll('\\', '\\\\');
		return `sql\`${unescaped}\``;
	},
};

export const typeFor = (sqlType: string): SqlType => {
	if (Int.is(sqlType)) return Int;
	if (Real.is(sqlType)) return Real;
	if (Numeric.is(sqlType)) return Numeric;
	if (Text.is(sqlType)) return Text;
	if (Blob.is(sqlType)) return Blob;

	throw new Error(`No grammar type for ${sqlType}`);
};

export function sqlTypeFrom(sqlType: string): string {
	const lowered = sqlType.toLowerCase();
	if (
		[
			'int',
			// 'integer', redundant
			// 'integer auto_increment', redundant
			'tinyint',
			'smallint',
			'mediumint',
			'bigint',
			'unsigned big int',
			// 'int2', redundant
			// 'int8', redundant
		].some((it) => lowered.startsWith(it))
	) {
		return 'integer';
	}

	if (
		[
			'character',
			'varchar',
			'varying character',
			'national varying character',
			'nchar',
			'native character',
			'nvarchar',
			'text',
			'clob',
		].some((it) => lowered.startsWith(it))
	) {
		const match = lowered.match(/\d+/);

		if (match) {
			return `text(${match[0]})`;
		}

		return 'text';
	}

	if (lowered.startsWith('blob')) {
		return 'blob';
	}

	if (
		['real', 'double', 'double precision', 'float'].some((it) => lowered.startsWith(it))
	) {
		return 'real';
	}

	return 'numeric';
}

export const parseDefault = (type: string, it: string): Column['default'] => {
	if (it === null) return null;
	const grammarType = typeFor(type);

	if (grammarType) return grammarType.defaultFromIntrospect(it);

	const trimmed = trimChar(it, "'");

	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
		const n = Number(it);

		if (n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER) {
			return { value: trimmed, isExpression: true };
		}
		return { value: `'${trimmed}'`, isExpression: true };
	}

	// TODO: handle where and need tests??
	if (['CURRENT_TIME', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(it)) {
		return { value: `(${it})`, isExpression: true };
	}
	return { value: `(${it})`, isExpression: true };
};

export const parseTableSQL = (sql: string) => {
	const namedChecks = [...sql.matchAll(namedCheckPattern)].map((it) => {
		const [_, name, value] = it;
		return { name, value: value.trim() };
	});
	const unnamedChecks = [...sql.matchAll(unnamedCheckPattern)].map((it) => {
		const [_, value] = it;
		return { name: null, value: value.trim() };
	}).filter((it) => !namedChecks.some((x) => x.value === it.value));

	return {
		checks: [...namedChecks, ...unnamedChecks],
	};
};

export const parseViewSQL = (sql: string) => {
	const match = sql.match(viewAsStatementRegex);
	return match ? match[1] : null;
};

export interface Generated {
	as: string;
	type: 'stored' | 'virtual';
}

export function extractGeneratedColumns(input: string): Record<string, Generated> {
	const columns: Record<string, Generated> = {};
	const lines = input.split(/,\s*(?![^()]*\))/); // Split by commas outside parentheses

	for (const line of lines) {
		if (line.includes('GENERATED ALWAYS AS')) {
			const parts = line.trim().split(/\s+/);
			const columnName = parts[0].replace(/[`'"]/g, ''); // Remove quotes around the column name
			const expression = line
				.substring(line.indexOf('('), line.indexOf(')') + 1)
				.trim();

			// Extract type ensuring to remove any trailing characters like ')'
			const typeIndex = parts.findIndex((part) => part.match(/(stored|virtual)/i));
			let type: Generated['type'] = 'virtual';
			if (typeIndex !== -1) {
				type = parts[typeIndex]
					.replace(/[^a-z]/gi, '')
					.toLowerCase() as Generated['type'];
			}

			columns[columnName] = {
				as: expression,
				type,
			};
		}
	}
	return columns;
}

export const omitSystemTables = () => {
	['__drizzle_migrations', `'\\_cf\\_%'`, `'\\_litestream\\_%'`, `'libsql\\_%'`, `'sqlite\\_%'`];
	return true;
};
