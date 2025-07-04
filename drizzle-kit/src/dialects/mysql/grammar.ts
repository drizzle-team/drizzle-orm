import { assertUnreachable, trimChar } from '../../utils';
import { Column, ForeignKey } from './ddl';
import { Import } from './typescript';

/*
	TODO: revise handling of float/double in both orm and kit
	in orm we can limit 0-23 precision for float and 24-53 in float/double types
	in kit we can trim default values based on scale param with .toFixed(scale ?? defaultScale)

	MySQL also supports this optional precision specification,
	but the precision value in FLOAT(p) is used only to determine storage size.
	A precision from 0 to 23 results in a 4-byte single-precision FLOAT column.
	A precision from 24 to 53 results in an 8-byte double-precision DOUBLE column.

	MySQL performs rounding when storing values, so if you insert 999.00009 into a FLOAT(7,4) column, the approximate result is 999.0001.
*/

/*
	TODO:
	Drizzle ORM allows real/double({ precision: 6 }) which is only allowed with scale
*/

export interface SqlType<MODE = unknown> {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, mode?: MODE): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	defaultToSQL(value: Column['default']): string;
	defaultToTS(value: Column['default']): string;
}

export const Int: SqlType = {
	is: (type: string) => type === 'int',
	drizzleImport: () => 'int',
	defaultFromDrizzle: (value: unknown, mode?: unknown) => {
		// if(typeof value === "number"){
		// return {}
		// }
		throw new Error('Function not implemented.');
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		throw new Error('Function not implemented.');
	},
	defaultToSQL: function(value: Column['default']): string {
		throw new Error('Function not implemented.');
	},
	defaultToTS: function(value: Column['default']): string {
		throw new Error('Function not implemented.');
	},
};

type InvalidDefault = 'text_no_parentecies';
export const checkDefault = (value: string, type: string): InvalidDefault | null => {
	if (
		(type === 'tinytext' || type === 'mediumtext' || type === 'text' || type === 'longtext'
			|| type === 'binary' || type === 'varbinary'
			|| type === 'json') && !value.startsWith('(') && !value.endsWith(')')
	) {
		return 'text_no_parentecies';
	}

	if (type === 'binary' || type === 'varbinary') {
	}

	return null;
};

export const nameForForeignKey = (fk: Pick<ForeignKey, 'table' | 'columns' | 'tableTo' | 'columnsTo'>) => {
	return `fk_${fk.table}_${fk.columns.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`;
};

export const nameForIndex = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

const stripCollation = (defaultValue: string, collation?: string): string => {
	const coll = collation ?? 'utf8mb4';
	const escaped = coll.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
	const regex = new RegExp(`_${escaped}(?=(?:\\\\['"]|['"]))`, 'g');
	const res = defaultValue.replace(regex, '').replaceAll("\\'", "'").replaceAll("\\\\'", "''");
	return res;
};

function trimCollation(defaultValue: string, collate: string = 'utf8mb4') {
	const collation = `_${collate}`;
	if (defaultValue.startsWith(collation)) {
		return defaultValue
			.substring(collation.length, defaultValue.length)
			.replace(/\\/g, '');
	}
	return defaultValue;
}

export const parseEnum = (it: string) => {
	return Array.from(it.matchAll(/'((?:[^']|'')*)'/g), (m) => m[1]);
};

export const parseDefaultValue = (
	columnType: string,
	value: string | undefined,
	collation: string | undefined,
): Column['default'] => {
	if (!value) return null;

	value = stripCollation(value, collation);

	if (columnType.startsWith('decimal')) {
		return { value: trimChar(value, "'"), type: 'decimal' };
	}

	if (
		columnType.startsWith('binary') || columnType.startsWith('varbinary')
		|| columnType === 'text' || columnType === 'tinytext' || columnType === 'longtext' || columnType === 'mediumtext'
	) {
		if (/^'(?:[^']|'')*'$/.test(value)) {
			return { value: trimChar(value, "'").replaceAll("''", "'"), type: 'text' };
		}

		const wrapped = value.startsWith('(') && value.endsWith(')') ? value : `(${value})`;
		return { value: wrapped, type: 'unknown' };
	}

	if (columnType.startsWith('enum') || columnType.startsWith('varchar') || columnType.startsWith('char')) {
		return { value, type: 'string' };
	}

	if (columnType === 'json') {
		return { value: trimChar(value, "'").replaceAll("''", "'"), type: 'json' };
	}

	if (
		columnType === 'date' || columnType.startsWith('datetime') || columnType.startsWith('timestamp')
		|| columnType.startsWith('time')
	) {
		return { value: value, type: 'string' };
	}

	if (columnType === 'tinyint(1)') {
		return { type: 'boolean', value: value === '1' ? 'true' : 'false' };
	}

	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
		const num = Number(value);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: value, type: big ? 'bigint' : 'number' };
	}

	console.error(`unknown default: ${columnType} ${value}`);
	return null;
};

const commutativeTypes = [
	['tinyint(1)', 'boolean'],
	['binary(1)', 'binary'],
	['now()', '(now())', 'CURRENT_TIMESTAMP', '(CURRENT_TIMESTAMP)', 'CURRENT_TIMESTAMP()'],
];

export const typesCommutative = (left: string, right: string, mode: 'push' | 'default' = 'default') => {
	for (const it of commutativeTypes) {
		const leftIn = it.some((x) => x === left);
		const rightIn = it.some((x) => x === right);

		if (leftIn && rightIn) return true;
	}

	if (mode === 'push') {
		if (left === 'double' && right === 'real') return true;
		if (left.startsWith('double(') && right.startsWith('real(') && right.replace('real', 'double') === left) {
			return true;
		}
		if (left.startsWith('real(') && right.startsWith('double(') && right.replace('double', 'real') === left) {
			return true;
		}
		if (left.replace(',0)', ')') === right.replace(',0)', ')')) return true; // { from: 'decimal(19,0)', to: 'decimal(19)' }
	}

	if (
		(left.startsWith('float(') && right === 'float')
		|| (right.startsWith('float(') && left === 'float')
	) {
		return true; // column type is float regardless of float(M,D), always stored as 7 digits precision
	}
	return false;
};

export const defaultToSQL = (it: Column['default']) => {
	if (!it) return null;

	if (it.type === 'bigint') {
		return `'${it.value}'`;
	}
	if (it.type === 'decimal') {
		return `('${it.value}')`;
	}

	if (it.type === 'boolean' || it.type === 'number' || it.type === 'unknown') {
		return it.value;
	}

	if (it.type === 'string') {
		return `'${it.value.replaceAll("'", "''")}'`;
	}

	if (it.type === 'text' || it.type === 'json') {
		return `('${it.value.replaceAll("'", "''")}')`;
	}

	assertUnreachable(it.type);
};
