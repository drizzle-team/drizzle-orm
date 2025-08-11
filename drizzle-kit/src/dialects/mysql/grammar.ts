import { assertUnreachable, trimChar } from '../../utils';
import { parse, stringify } from '../../utils/when-json-met-bigint';
import { escapeForSqlDefault, escapeForTsLiteral, parseParams, unescapeFromSqlDefault } from '../utils';
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

export interface SqlType<MODE = unknown> {
	is(type: string): boolean;
	drizzleImport(vendor?: 'singlestore' | 'mysql'): Import;
	defaultFromDrizzle(value: unknown, mode?: MODE): Column['default'];
	defaultFromIntrospect(value: string): Column['default'];
	toTs(type: string, value: Column['default']): { options?: Record<string, unknown>; default: string } | string;
}

const IntOps: Pick<SqlType, 'defaultFromDrizzle' | 'defaultFromIntrospect'> = {
	defaultFromDrizzle: function(value: unknown): Column['default'] {
		if (typeof value === 'number') {
			return String(value);
		}
		return String(value);
	},
	defaultFromIntrospect: function(value: string): Column['default'] {
		return value;
	},
};

export const Int: SqlType = {
	is: (type: string) => /^(?:int)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'int',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : undefined;
		const check = Number(value);
		if (Number.isNaN(check)) return { options, default: `sql\`${value}\`` };
		return { options, default: value ?? '' };
	},
};

export const Boolean: SqlType = {
	is: (type) => type === 'tinyint(1)' || type === 'boolean',
	drizzleImport: () => 'boolean',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		return value === '1' || value === 'true' ? 'true' : 'false';
	},
	toTs: (_, value) => {
		return value ?? '';
	},
};

export const TinyInt: SqlType = {
	is: (type: string) => /^(?:tinyint)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'tinyint',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	toTs: Int.toTs,
};

export const SmallInt: SqlType = {
	is: (type: string) => /^(?:smallint)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'smallint',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	toTs: Int.toTs,
};

export const MediumInt: SqlType = {
	is: (type: string) => /^(?:mediumint)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'mediumint',
	defaultFromDrizzle: IntOps.defaultFromDrizzle,
	defaultFromIntrospect: IntOps.defaultFromIntrospect,
	toTs: Int.toTs,
};

export const BigInt: SqlType = {
	is: (type: string) => /^(?:bigint)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'bigint',
	defaultFromDrizzle: (value) => {
		if (typeof value === 'bigint') {
			return `${value}`;
		}
		if (typeof value === 'number') {
			return value.toString();
		}
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const options = type.includes('unsigned') ? { unsigned: true } : {};
		if (value === null) return { options: { ...options, mode: 'number' }, default: '' };

		const trimmed = trimChar(value, "'");
		const numType = checkNumber(trimmed);
		if (numType === 'NaN') return { options: { ...options, mode: 'number' }, default: `sql\`${value}\`` };
		if (numType === 'number') return { options: { ...options, mode: 'number' }, default: trimmed };
		if (numType === 'bigint') return { options: { ...options, mode: 'bigint' }, default: `${trimmed}n` };
		assertUnreachable(numType);
	},
};

export const Serial: SqlType = {
	is: (type: string) => /^(?:serial)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'serial',
	defaultFromDrizzle: (value) => {
		throw new Error(`Unexpected default for serial type: ${value}`);
	},
	defaultFromIntrospect: (value) => value,
	toTs: (type, value) => {
		return { default: '' };
	},
};

export const Decimal: SqlType = {
	// NUMERIC|DECIMAL[(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:numeric|decimal)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'decimal',
	defaultFromDrizzle: (value) => {
		return `(${String(value)})`;
	},
	defaultFromIntrospect: (value) => value,
	toTs: (type, value) => {
		const options: any = type.includes('unsigned') || type.includes('UNSIGNED') ? { unsigned: true } : {};
		const [precision, scale] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };

		const numType = checkNumber(value);
		if (numType === 'NaN') return { options: options, default: `sql\`${value}\`` };
		if (numType === 'number') return { options: { ...options, mode: 'number' }, default: value };
		if (numType === 'bigint') return { options: { ...options, mode: 'bigint' }, default: `${value}n` };
		assertUnreachable(numType);
	},
};

export const Real: SqlType = {
	// REAL[(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:real)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'real',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		const trimmed = trimChar(trimChar(trimChar(value, '('), ')'), "'");
		return trimmed;
	},
	toTs: (type, value) => {
		const options: any = type.includes('unsigned') || type.includes('UNSIGNED') ? { unsigned: true } : {};
		const [precision, scale] = parseParams(type);
		if (precision) options['precision'] = Number(precision);
		if (scale) options['scale'] = Number(scale);

		if (!value) return { options, default: '' };

		const numType = checkNumber(value);
		if (numType === 'NaN') return { options, default: `sql\`${value}\`` };
		if (numType === 'number') return { options, default: value };
		if (numType === 'bigint') return { options, default: `${value}n` };
		assertUnreachable(numType);
	},
};

export const Double: SqlType = {
	// DOUBLE [PRECISION][(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:double)(?:[\s(].*)?$/i.test(type) || /^(?:double precision)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'double',
	defaultFromDrizzle: Real.defaultFromDrizzle,
	defaultFromIntrospect: Real.defaultFromIntrospect,
	toTs: Real.toTs,
};

export const Float: SqlType = {
	// FLOAT[(1,1)] [UNSIGNED] [ZEROFILL]
	is: (type) => /^(?:float)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'float',
	defaultFromDrizzle: Real.defaultFromDrizzle,
	defaultFromIntrospect: Real.defaultFromIntrospect,
	toTs: Real.toTs,
};

export const Char: SqlType = {
	is: (type) => /^(?:char)(?:[\s(].*)?$/i.test(type) || /^(?:character)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'char',
	defaultFromDrizzle: (value) => {
		return `'${escapeForSqlDefault(String(value))}'`;
	},
	// 'text''text' -> text'text, we need to make match on introspect
	defaultFromIntrospect: (value) => {
		if (value.startsWith('(')) return value;

		const trimmed = trimChar(value, "'");
		return `'${escapeForSqlDefault(trimmed)}'`;
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };
		if (value.startsWith('(')) return { options, default: `sql\`${value}\`` };

		const escaped = `"${escapeForTsLiteral(unescapeFromSqlDefault(trimChar(value, "'")))}"`;
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
	toTs: Char.toTs,
};

export const TinyText: SqlType = {
	is: (type) => /^\s*tinytext\s*$/i.test(type),
	drizzleImport: () => 'tinytext',
	defaultFromDrizzle: (value) => {
		return `('${escapeForSqlDefault(value as string)}')`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);
		if (!value) return { options, default: '' };
		if (value.startsWith('(') || !value.startsWith("'")) return { options, default: `sql\`${value}\`` };

		const trimmed = trimChar(value, "'");
		const escaped = value ? `"${escapeForTsLiteral(unescapeFromSqlDefault(trimmed))}"` : '';
		return { options, default: escaped };
	},
};

export const MediumText: SqlType = {
	is: (type) => /^\s*mediumtext\s*$/i.test(type),
	drizzleImport: () => 'mediumtext',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	toTs: TinyText.toTs,
};

export const Text: SqlType = {
	is: (type) => /^\s*text\s*$/i.test(type),
	drizzleImport: () => 'text',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	toTs: TinyText.toTs,
};

export const LongText: SqlType = {
	is: (type) => /^\s*longtext\s*$/i.test(type),
	drizzleImport: () => 'longtext',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	toTs: TinyText.toTs,
};

export const Binary: SqlType = {
	is: (type) => /^(?:binary)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'binary',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: TinyText.defaultFromIntrospect,
	toTs: TinyText.toTs,
};

export const Varbinary: SqlType = {
	is: (type) => /^(?:varbinary)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'varbinary',
	defaultFromDrizzle: (value) => {
		return `(0x${Buffer.from(value as string).toString('hex').toLowerCase()})`;
	},
	defaultFromIntrospect: (value) => value,
	toTs: (type, value) => {
		if (!value) return '';

		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);

		let trimmed = value.startsWith('(') ? value.substring(1, value.length - 1) : value;
		trimmed = trimChar(value, "'");
		if (trimmed.startsWith('0x')) {
			trimmed = Buffer.from(trimmed.slice(2), 'hex').toString('utf-8');
			return { options, default: `"${trimmed.replaceAll('"', '\\"')}"` };
		} else {
			return { options, default: `sql\`${value}\`` };
		}
	},
};

export const Json: SqlType = {
	is: (type) => /^\s*json\s*$/i.test(type),
	drizzleImport: () => 'json',
	defaultFromDrizzle: (value) => {
		const stringified = stringify(value, (key, value) => {
			if (typeof value !== 'string') return value;
			return value.replaceAll("'", "''");
		});
		return `('${stringified}')`;
	},
	defaultFromIntrospect: (value) => value,
	toTs: (_, def) => {
		if (!def) return { default: '' };
		const trimmed = trimChar(def, "'");
		try {
			const parsed = parse(trimmed);
			const stringified = stringify(
				parsed,
				(_, value) => {
					if (typeof value !== 'string') return value;
					return value.replaceAll("''", "'");
				},
				undefined,
				true,
			)!;
			return { default: stringified };
		} catch {}
		return { default: `sql\`${def}\`` };
	},
};

export const Timestamp: SqlType = {
	is: (type) => /^(?:timestamp)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'timestamp',
	defaultFromDrizzle: (value) => {
		if (value instanceof Date) {
			const converted = value.toISOString().replace('T', ' ').slice(0, 23);
			return `'${converted}'`;
		}
		// TODO: we can handle fsp 6 here too
		return `'${value}'`;
	},
	defaultFromIntrospect: (value) => {
		if (!isNaN(Date.parse(value))) {
			return `'${value}'`;
		}
		return value;
	},
	toTs: (type, def) => {
		const options: any = {};
		const [fsp] = parseParams(type);
		if (fsp) options['fsp'] = Number(fsp);

		if (!def) return { options, default: '' };
		const trimmed = trimChar(def, "'");
		if (trimmed === 'now()' || trimmed === '(now())' || trimmed === '(CURRENT_TIMESTAMP)') {
			return { options, default: '.defaultNow()' };
		}

		if (fsp && Number(fsp) > 3) return { options, default: `sql\`'${trimmed}'\`` };
		// TODO: we can handle fsp 6 here too, using sql``
		return { options, default: `new Date("${trimmed}Z")` };
	},
};

export const DateTime: SqlType = {
	is: (type) => /^(?:datetime)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'datetime',
	defaultFromDrizzle: Timestamp.defaultFromDrizzle,
	defaultFromIntrospect: Timestamp.defaultFromIntrospect,
	toTs: Timestamp.toTs,
};

export const Time: SqlType = {
	is: (type) => /^(?:time)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'time',
	defaultFromDrizzle: (value) => {
		return `'${String(value)}'`;
	},
	defaultFromIntrospect: (value) => {
		if (!value.startsWith("'")) return `'${value}'`;
		return value;
	},
	toTs: (type, def) => {
		const options: any = {};
		const [fsp] = parseParams(type);
		if (fsp) options['fsp'] = Number(fsp);

		if (!def) return { options, default: '' };

		const trimmed = trimChar(def, "'");
		return { options, default: `"${trimmed}"` };
	},
};

export const Date_: SqlType = {
	is: (type) => /^\s*date\s*$/i.test(type),
	drizzleImport: () => 'date',
	defaultFromDrizzle: (value) => {
		if (value instanceof Date) {
			const converted = value.toISOString().split('T')[0];
			return `'${converted}'`;
		}
		return `'${value}'`;
	},
	defaultFromIntrospect: (value) => {
		if (!value.startsWith("'")) return `'${value}'`;
		return value;
	},
	toTs: (type, def) => {
		const options: any = {};
		const [fsp] = parseParams(type);
		if (fsp) options['fsp'] = Number(fsp);
		if (!def) return { options, default: '' };
		return { options, default: `new Date("${trimChar(def, "'")}")` };
	},
};

export const Year: SqlType = {
	is: (type) => /^\s*year\s*$/i.test(type),
	drizzleImport: () => 'year',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, def) => {
		const options: any = {};
		const [fsp] = parseParams(type);
		if (fsp) options['fsp'] = Number(fsp);

		if (!def) return { options, default: '' };
		return { options, default: `${def}` };
	},
};

export const Enum: SqlType = {
	is: (type) => /^(?:enum)(?:[\s(].*)?$/i.test(type),
	drizzleImport: (vendor) => vendor === 'mysql' ? 'mysqlEnum' : 'singlestoreEnum',
	defaultFromDrizzle: (value) => {
		return `'${escapeForSqlDefault(value as string)}'`;
	},
	defaultFromIntrospect: (value) => {
		return `'${escapeForSqlDefault(value)}'`;
	},
	toTs: (_, def) => {
		if (!def) return { default: '' };
		const unescaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(def, "'")));
		return { default: `"${unescaped}"` };
	},
};

export const typeFor = (sqlType: string): SqlType => {
	if (Boolean.is(sqlType)) return Boolean;
	if (TinyInt.is(sqlType)) return TinyInt;
	if (SmallInt.is(sqlType)) return SmallInt;
	if (MediumInt.is(sqlType)) return MediumInt;
	if (Int.is(sqlType)) return Int;
	if (BigInt.is(sqlType)) return BigInt;
	if (Serial.is(sqlType)) return Serial;
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
	if (Varbinary.is(sqlType)) return Varbinary;
	if (Json.is(sqlType)) return Json;
	if (Timestamp.is(sqlType)) return Timestamp;
	if (DateTime.is(sqlType)) return DateTime;
	if (Date_.is(sqlType)) return Date_;
	if (Time.is(sqlType)) return Time;
	if (Year.is(sqlType)) return Year;
	if (Enum.is(sqlType)) return Enum;
	throw new Error(`unknown sql type: ${sqlType}`);
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

	// if (
	// 	columnType.startsWith('binary') || columnType.startsWith('varbinary')
	// 	|| columnType === 'text' || columnType === 'tinytext' || columnType === 'longtext' || columnType === 'mediumtext'
	// ) {
	// 	if (/^'(?:[^']|'')*'$/.test(value)) {
	// 		return { value: trimChar(value, "'").replaceAll("''", "'"), type: 'text' };
	// 	}

	// 	const wrapped = value.startsWith('(') && value.endsWith(')') ? value : `(${value})`;
	// 	return { value: wrapped, type: 'unknown' };
	// }

	// if (columnType.startsWith('enum') || columnType.startsWith('varchar') || columnType.startsWith('char')) {
	// 	return { value, type: 'string' };
	// }

	// if (columnType === 'json') {
	// 	return { value: trimChar(value, "'").replaceAll("''", "'"), type: 'json' };
	// }

	// if (
	// 	columnType === 'date' || columnType.startsWith('datetime') || columnType.startsWith('timestamp')
	// 	|| columnType.startsWith('time')
	// ) {
	// 	return { value: value, type: 'string' };
	// }

	// if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
	// 	const num = Number(value);
	// 	const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
	// 	return { value: value, type: big ? 'bigint' : 'number' };
	// }

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
