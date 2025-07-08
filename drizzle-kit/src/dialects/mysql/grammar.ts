import { assertUnreachable, trimChar } from '../../utils';
import { escapeForSqlDefault, escapeForTsLiteral, unescapeFromSqlDefault } from '../utils';
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

const checkNumber = (it: string) => {
	const check = Number(it);

	if (Number.isNaN(check)) return 'NaN';
	if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return 'number';
	return 'bigint';
};

export const parseParams = (type: string) => {
	return type.match(/\(([0-9,\s]+)\)/)?.[1].split(',').map((x) => x.trim()) ?? [];
};

export interface SqlType<MODE = unknown> {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, mode?: MODE): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	defaultToSQL(value: Column['default']): string;
	toTs(type: string, value: Column['default']): { options?: Record<string, unknown>; default: string };
}

const IntOps: Pick<SqlType, 'defaultFromDrizzle' | 'defaultFromIntrospect' | 'defaultToSQL'> = {
	defaultFromDrizzle: function(value: unknown, mode?: unknown): Column['default'] {
		if (typeof value === 'number') {
			return { value: String(value), type: 'unknown' };
		}
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return { value, type: 'unknown' };
	},
	defaultToSQL: function(value: Column['default']): string {
		return value ? value.value : '';
	},
};

export const Boolean: SqlType = {
	is: (type) => type === 'tinyint(1)' || type === 'boolean',
	drizzleImport: () => 'boolean',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: value === '1' ? 'true' : 'false', type: 'unknown' };
	},
	defaultToSQL: (value) => value ? value.value : '',
	toTs: (_, value) => {
		return { default: value !== null ? value.value : '' };
	},
};

export const TinyInt: SqlType = {
	is: (type: string) => type === 'tinyint' || type === 'tinyint unsigned' || type.startsWith('tinyint'),
	drizzleImport: () => 'tinyint',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	defaultToSQL: IntOps.defaultToSQL,
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : undefined;
		return { options, default: value ? value.value : '' };
	},
};

export const SmallInt: SqlType = {
	is: (type: string) => type === 'smallint' || type === 'smallint unsigned',
	drizzleImport: () => 'smallint',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	defaultToSQL: IntOps.defaultToSQL,
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : undefined;
		return { options, default: value ? value.value : '' };
	},
};

export const MediumInt: SqlType = {
	is: (type: string) => type === 'mediumint',
	drizzleImport: () => 'mediumint',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	defaultToSQL: IntOps.defaultToSQL,
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : undefined;
		return { options, default: value ? value.value : '' };
	},
};

export const Int: SqlType = {
	is: (type: string) => type === 'int',
	drizzleImport: () => 'int',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	defaultToSQL: IntOps.defaultToSQL,
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : undefined;
		return { options, default: value ? value.value : '' };
	},
};

export const BigInt: SqlType = {
	is: (type: string) => type === 'bigint' || type === 'bigint unsigned',
	drizzleImport: () => 'bigint',
	defaultFromDrizzle: (value) => {
		if (typeof value === 'bigint') {
			return { value: `${value}`, type: 'unknown' };
		}
		if (typeof value === 'number') {
			return { value: value.toString(), type: 'unknown' };
		}
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value, type: 'unknown' };
	},
	defaultToSQL: (value) => {
		return value ? value.value : '';
	},
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : {};
		if (value === null) return { options: { ...options, mode: 'number' }, default: '' };

		const trimmed = trimChar(value.value, "'");
		const numType = checkNumber(trimmed);
		if (numType === 'NaN') return { options: { ...options, mode: 'number' }, default: `sql\`${value.value}\`` };
		if (numType === 'number') return { options: { ...options, mode: 'number' }, default: trimmed };
		if (numType === 'bigint') return { options: { ...options, mode: 'bigint' }, default: `${trimmed}n` };
		assertUnreachable(numType);
	},
};

export const Decimal: SqlType = {
	// NUMERIC|DECIMAL[(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:numeric|decimal)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'decimal',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		const trimmed = trimChar(trimChar(trimChar(value, '('), ')'), "'");
		return { value: trimmed, type: 'unknown' };
	},
	defaultToSQL: (value) => {
		return value ? `(${value.value})` : '';
	},
	toTs: (type, value) => {
		const options: any = type.includes('unsigned') || type.includes('UNSIGNED') ? { unsigned: true } : {};
		const [precision, scale] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };

		const numType = checkNumber(value.value);
		if (numType === 'NaN') return { options: options, default: `sql\`${value.value}\`` };
		if (numType === 'number') return { options: { ...options, mode: 'number' }, default: value.value };
		if (numType === 'bigint') return { options: { ...options, mode: 'bigint' }, default: `${value.value}n` };
		assertUnreachable(numType);
	},
};

export const Real: SqlType = {
	// REAL[(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:real)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'real',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		const trimmed = trimChar(trimChar(trimChar(value, '('), ')'), "'");
		return { value: trimmed, type: 'unknown' };
	},
	defaultToSQL: (value) => {
		return value ? `${value.value}` : '';
	},
	toTs: (type, value) => {
		const options: any = type.includes('unsigned') || type.includes('UNSIGNED') ? { unsigned: true } : {};
		const [precision, scale] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };

		const numType = checkNumber(value.value);
		if (numType === 'NaN') return { options, default: `sql\`${value.value}\`` };
		if (numType === 'number') return { options, default: value.value };
		if (numType === 'bigint') return { options, default: `${value.value}n` };
		assertUnreachable(numType);
	},
};

export const Double: SqlType = {
	// DOUBLE [PRECISION][(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:double)(?:[\s(].*)?$/i.test(type) || /^(?:double precision)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'double',
	defaultFromDrizzle: Real.defaultFromDrizzle,
	defaultFromIntrospect: Real.defaultFromIntrospect,
	defaultToSQL: Real.defaultToSQL,
	toTs: Real.toTs,
};

export const Float: SqlType = {
	// FLOAT[(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:float)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'float',
	defaultFromDrizzle: Real.defaultFromDrizzle,
	defaultFromIntrospect: Real.defaultFromIntrospect,
	defaultToSQL: Real.defaultToSQL,
	toTs: Real.toTs,
};

export const Char: SqlType = {
	is: (type) => /^(?:char)(?:[\s(].*)?$/i.test(type) || /^(?:character)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'char',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		return { value: unescapeFromSqlDefault(value), type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';
		if (value.value.startsWith('(') && value.value.endsWith(')')) return value.value;

		return value ? `'${escapeForSqlDefault(value.value)}'` : '';
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		const escaped = value ? `"${escapeForTsLiteral(value.value)}"` : '';
		return { options, default: escaped };
	},
};

export const Varchar: SqlType = {
	is: (type) => {
		return /^(?:varchar)(?:[\s(].*)?$/i.test(type)
			|| /^(?:nvarchar)(?:[\s(].*)?$/i.test(type)
			|| /^(?:character varying)(?:[\s(].*)?$/i.test(type);
	},
	drizzleImport: () => 'varchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultToSQL: Char.defaultToSQL,
	toTs: Char.toTs,
};

export const TinyText: SqlType = {
	is: (type) => /^\s*tinytext\s*$/i.test(type),
	drizzleImport: () => 'tinytext',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'unknown' };
	},
	defaultFromIntrospect: (value) => {
		if (value.startsWith('(') && value.endsWith(')')) return { value: value, type: 'unknown' };
		return { value: unescapeFromSqlDefault(trimChar(value, "'")), type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';
		if (value.value.startsWith('(') && value.value.endsWith(')')) return value.value;

		return value ? `('${escapeForSqlDefault(value.value)}')` : '';
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		const escaped = value ? `"${escapeForTsLiteral(value.value)}"` : '';
		return { options, default: escaped };
	},
};

export const MediumText: SqlType = {
	is: (type) => /^\s*mediumtext\s*$/i.test(type),
	drizzleImport: () => 'mediumtext',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	defaultToSQL: TinyText.defaultToSQL,
	toTs: TinyText.toTs,
};

export const Text: SqlType = {
	is: (type) => /^\s*text\s*$/i.test(type),
	drizzleImport: () => 'text',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	defaultToSQL: TinyText.defaultToSQL,
	toTs: TinyText.toTs,
};

export const LongText: SqlType = {
	is: (type) => /^\s*longtext\s*$/i.test(type),
	drizzleImport: () => 'longtext',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	defaultToSQL: TinyText.defaultToSQL,
	toTs: TinyText.toTs,
};

export const Binary: SqlType = {
	is: (type) => /^(?:binary)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'binary',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	defaultToSQL: TinyText.defaultToSQL,
	toTs: TinyText.toTs,
};

export const typeFor = (sqlType: string): SqlType | null => {
	if (Boolean.is(sqlType)) return Boolean;
	if (TinyInt.is(sqlType)) return TinyInt;
	if (SmallInt.is(sqlType)) return SmallInt;
	if (MediumInt.is(sqlType)) return MediumInt;
	if (Int.is(sqlType)) return Int;
	if (BigInt.is(sqlType)) return BigInt;
	if (Decimal.is(sqlType)) return Decimal;
	if (Real.is(sqlType)) return Real;
	if (Double.is(sqlType)) return Double;
	if (Float.is(sqlType)) return Float;
	if (Char.is(sqlType)) return Char;
	if (Varchar.is(sqlType)) return Varchar;
	if (TinyText.is(sqlType)) return TinyText;
	if (MediumText.is(sqlType)) return MediumText;
	if (Text.is(sqlType)) return Text;
	if (LongText.is(sqlType)) return LongText;
	if (Binary.is(sqlType)) return Binary;
	return null;
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

export const parseEnum = (it: string) => {
	return Array.from(it.matchAll(/'((?:[^']|'')*)'/g), (m) => m[1]);
};

export const parseDefaultValue = (
	columnType: string,
	value: string | undefined,
	collation: string | undefined,
): Column['default'] => {
	if (value === null || typeof value === 'undefined') return null;

	value = stripCollation(value, collation);

	const grammarType = typeFor(columnType);
	if (grammarType) return grammarType.defaultFromIntrospect(value);

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

export const defaultToSQL = (type: string, it: Column['default']) => {
	if (!it) return null;
	const grammarType = typeFor(type);
	if (grammarType) return grammarType.defaultToSQL(it);

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
