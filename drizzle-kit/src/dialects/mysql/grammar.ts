import { assertUnreachable, trimChar } from '../../utils';
import { parse, stringify } from '../../utils/when-json-met-bigint';
import { hash } from '../common';
import { escapeForSqlDefault, escapeForTsLiteral, parseParams, unescapeFromSqlDefault } from '../utils';
import type { Column, ForeignKey } from './ddl';
import type { Import } from './typescript';

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
	toTs(
		type: string,
		value: Column['default'],
	): { options?: Record<string, unknown>; default: string; customType?: string }; // customType for Custom
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
		return { default: value ?? '' };
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
	defaultFromDrizzle: (_value) => {
		return ''; // handled in interim to ddl
	},
	defaultFromIntrospect: (value) => value,
	toTs: (_type, _value) => {
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

		const escaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(value, "'")));
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
		const escaped = value ? escapeForTsLiteral(unescapeFromSqlDefault(trimmed)) : '';
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

export const TinyBlob: SqlType = {
	is: (type) => /^\s*tinyblob\s*$/i.test(type),
	drizzleImport: () => 'tinyblob',
	defaultFromDrizzle: (value) => {
		if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(value)) {
			return `(0x${value.toString('hex').toLowerCase()})`;
		}
		if (Array.isArray(value) || typeof value === 'object' || typeof value === 'string') {
			return Text.defaultFromDrizzle(value);
		}
		throw new Error('unexpected');
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		if (value === null) return { default: '' };

		if (typeof Buffer !== 'undefined' && value.startsWith('0x')) {
			const parsed = Buffer.from(value.slice(2, value.length), 'hex').toString('utf-8');
			const escaped = parsed.replaceAll('\\', '\\\\').replace('"', '\\"');
			return { options: { mode: 'buffer' }, default: `Buffer.from("${escaped}")` };
		}

		const { default: stringDef } = Text.toTs(type, value);

		return { default: stringDef, options: { mode: 'string' } };
	},
};

export const MediumBlob: SqlType = {
	is: (type) => /^\s*mediumblob\s*$/i.test(type),
	drizzleImport: () => 'mediumblob',
	defaultFromDrizzle: TinyBlob.defaultFromDrizzle,
	defaultFromIntrospect: TinyBlob.defaultFromIntrospect,
	toTs: TinyBlob.toTs,
};

export const LongBlob: SqlType = {
	is: (type) => /^\s*longblob\s*$/i.test(type),
	drizzleImport: () => 'longblob',
	defaultFromDrizzle: TinyBlob.defaultFromDrizzle,
	defaultFromIntrospect: TinyBlob.defaultFromIntrospect,
	toTs: TinyBlob.toTs,
};

export const Blob: SqlType = {
	is: (type) => /^\s*blob\s*$/i.test(type),
	drizzleImport: () => 'blob',
	defaultFromDrizzle: TinyBlob.defaultFromDrizzle,
	defaultFromIntrospect: TinyBlob.defaultFromIntrospect,
	toTs: TinyBlob.toTs,
};

export const Binary: SqlType = {
	is: (type) => /^(?:binary)(?:[\s(].*)?$/i.test(type),
	drizzleImport: () => 'binary',
	defaultFromDrizzle: TinyText.defaultFromDrizzle,
	defaultFromIntrospect: (value) => {
		// when you do `binary default 'text'` instead of `default ('text')`
		if (value.startsWith('0x')) {
			return `'${Buffer.from(value.slice(2), 'hex').toString('utf-8')}'`;
		}
		return value;
	},
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
		const options: any = {};
		const [length] = parseParams(type);
		if (length) options['length'] = Number(length);

		if (!value) return { default: '', options };

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
		if (
			trimmed === 'now()' || trimmed === '(now())' || trimmed === '(CURRENT_TIMESTAMP)'
			|| trimmed === 'CURRENT_TIMESTAMP'
		) {
			return { options, default: '.defaultNow()' };
		}

		if (trimmed.includes('now(') || trimmed.includes('CURRENT_TIMESTAMP(')) {
			return { options, default: `sql\`${trimmed}\`` };
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
	toTs: (type, def) => {
		const options: any = {};
		const [fsp] = parseParams(type);
		if (fsp) options['fsp'] = Number(fsp);

		if (!def) return { options, default: '' };
		const trimmed = trimChar(def, "'");

		if (trimmed.includes('now(') || trimmed.includes('CURRENT_TIMESTAMP(')) {
			return { options, default: `sql\`${trimmed}\`` };
		}

		if (fsp && Number(fsp) > 3) return { options, default: `sql\`'${trimmed}'\`` };
		// TODO: we can handle fsp 6 here too, using sql``
		return { options, default: `new Date("${trimmed}Z")` };
	},
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
		return { default: unescaped };
	},
};

export const Custom: SqlType = {
	is: () => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'customType',
	defaultFromDrizzle: (value) => {
		return String(value);
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, def) => {
		if (!def) return { default: '', customType: type };
		const unescaped = escapeForTsLiteral(unescapeFromSqlDefault(trimChar(def, "'")));
		return { default: unescaped, customType: type };
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
	if (TinyBlob.is(sqlType)) return TinyBlob;
	if (MediumBlob.is(sqlType)) return MediumBlob;
	if (LongBlob.is(sqlType)) return LongBlob;
	if (Blob.is(sqlType)) return Blob;
	return Custom;
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

export const defaultNameForFK = (fk: Pick<ForeignKey, 'table' | 'columns' | 'tableTo' | 'columnsTo'>) => {
	const desired = `${fk.table}_${fk.columns.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fkey`;
	const res = desired.length > 63
		? fk.table.length < 63 - 18 // _{hash(12)}_fkey
			? `${fk.table}_${hash(desired)}_fkey`
			: `${hash(desired)}_fkey` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const nameForUnique = (tableName: string, columns: string[]) => {
	return `${columns.join('_')}_unique`;
};

const stripCollation = (defaultValue: string): string => {
	const coll = 'utf8mb4';
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
): Column['default'] => {
	if (value === null || typeof value === 'undefined') return null;

	value = stripCollation(value);

	const grammarType = typeFor(columnType);
	if (grammarType) return grammarType.defaultFromIntrospect(value);

	console.error(`unknown default: ${columnType} ${value}`);
	return null;
};

const commutativeTypes = [
	['tinyint(1)', 'boolean'],
	['binary(1)', 'binary'],
	['char(1)', 'char'],
];
export const commutative = (left: string, right: string, mode: 'push' | 'default' = 'default') => {
	for (const it of commutativeTypes) {
		const leftIn = it.some((x) => x === left);
		const rightIn = it.some((x) => x === right);

		if (leftIn && rightIn) return true;
	}

	// commutativity for:
	// - now(4) and CURRENT_TIMESTAMP(4)
	// - (now()) and (CURRENT_TIMESTAMP
	// ...etc
	const timeDefaultValueRegex = /^\(?(?:now|CURRENT_TIMESTAMP)(?:\((\d*)\))?\)?$/;
	const leftMatch = left.match(timeDefaultValueRegex);
	const rightMatch = right.match(timeDefaultValueRegex);
	if (leftMatch && rightMatch) {
		const leftValue = leftMatch[1] ?? ''; // undefined becomes '' for comparison
		const rightValue = rightMatch[1] ?? '';
		if (leftValue === rightValue) return true;
	}

	const leftPatched = left.replace(', ', ',');
	const rightPatched = right.replace(', ', ',');
	if (leftPatched === rightPatched) return true;

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

const commutativeCharSetAndCollation: { charSet: string; collation: string; isDefault: boolean }[] = [
	{ collation: 'armscii8_bin', charSet: 'armscii8', isDefault: false },
	{ collation: 'armscii8_general_ci', charSet: 'armscii8', isDefault: true },
	{ collation: 'ascii_bin', charSet: 'ascii', isDefault: false },
	{ collation: 'ascii_general_ci', charSet: 'ascii', isDefault: true },
	{ collation: 'big5_bin', charSet: 'big5', isDefault: false },
	{ collation: 'big5_chinese_ci', charSet: 'big5', isDefault: true },
	{ collation: 'binary', charSet: 'binary', isDefault: true },
	{ collation: 'cp1250_bin', charSet: 'cp1250', isDefault: false },
	{ collation: 'cp1250_croatian_ci', charSet: 'cp1250', isDefault: false },
	{ collation: 'cp1250_czech_cs', charSet: 'cp1250', isDefault: false },
	{ collation: 'cp1250_general_ci', charSet: 'cp1250', isDefault: true },
	{ collation: 'cp1250_polish_ci', charSet: 'cp1250', isDefault: false },
	{ collation: 'cp1251_bin', charSet: 'cp1251', isDefault: false },
	{ collation: 'cp1251_bulgarian_ci', charSet: 'cp1251', isDefault: false },
	{ collation: 'cp1251_general_ci', charSet: 'cp1251', isDefault: true },
	{ collation: 'cp1251_general_cs', charSet: 'cp1251', isDefault: false },
	{ collation: 'cp1251_ukrainian_ci', charSet: 'cp1251', isDefault: false },
	{ collation: 'cp1256_bin', charSet: 'cp1256', isDefault: false },
	{ collation: 'cp1256_general_ci', charSet: 'cp1256', isDefault: true },
	{ collation: 'cp1257_bin', charSet: 'cp1257', isDefault: false },
	{ collation: 'cp1257_general_ci', charSet: 'cp1257', isDefault: true },
	{ collation: 'cp1257_lithuanian_ci', charSet: 'cp1257', isDefault: false },
	{ collation: 'cp850_bin', charSet: 'cp850', isDefault: false },
	{ collation: 'cp850_general_ci', charSet: 'cp850', isDefault: true },
	{ collation: 'cp852_bin', charSet: 'cp852', isDefault: false },
	{ collation: 'cp852_general_ci', charSet: 'cp852', isDefault: true },
	{ collation: 'cp866_bin', charSet: 'cp866', isDefault: false },
	{ collation: 'cp866_general_ci', charSet: 'cp866', isDefault: true },
	{ collation: 'cp932_bin', charSet: 'cp932', isDefault: false },
	{ collation: 'cp932_japanese_ci', charSet: 'cp932', isDefault: true },
	{ collation: 'dec8_bin', charSet: 'dec8', isDefault: false },
	{ collation: 'dec8_swedish_ci', charSet: 'dec8', isDefault: true },
	{ collation: 'eucjpms_bin', charSet: 'eucjpms', isDefault: false },
	{ collation: 'eucjpms_japanese_ci', charSet: 'eucjpms', isDefault: true },
	{ collation: 'euckr_bin', charSet: 'euckr', isDefault: false },
	{ collation: 'euckr_korean_ci', charSet: 'euckr', isDefault: true },
	{ collation: 'gb18030_bin', charSet: 'gb18030', isDefault: false },
	{ collation: 'gb18030_chinese_ci', charSet: 'gb18030', isDefault: true },
	{ collation: 'gb18030_unicode_520_ci', charSet: 'gb18030', isDefault: false },
	{ collation: 'gb2312_bin', charSet: 'gb2312', isDefault: false },
	{ collation: 'gb2312_chinese_ci', charSet: 'gb2312', isDefault: true },
	{ collation: 'gbk_bin', charSet: 'gbk', isDefault: false },
	{ collation: 'gbk_chinese_ci', charSet: 'gbk', isDefault: true },
	{ collation: 'geostd8_bin', charSet: 'geostd8', isDefault: false },
	{ collation: 'geostd8_general_ci', charSet: 'geostd8', isDefault: true },
	{ collation: 'greek_bin', charSet: 'greek', isDefault: false },
	{ collation: 'greek_general_ci', charSet: 'greek', isDefault: true },
	{ collation: 'hebrew_bin', charSet: 'hebrew', isDefault: false },
	{ collation: 'hebrew_general_ci', charSet: 'hebrew', isDefault: true },
	{ collation: 'hp8_bin', charSet: 'hp8', isDefault: false },
	{ collation: 'hp8_english_ci', charSet: 'hp8', isDefault: true },
	{ collation: 'keybcs2_bin', charSet: 'keybcs2', isDefault: false },
	{ collation: 'keybcs2_general_ci', charSet: 'keybcs2', isDefault: true },
	{ collation: 'koi8r_bin', charSet: 'koi8r', isDefault: false },
	{ collation: 'koi8r_general_ci', charSet: 'koi8r', isDefault: true },
	{ collation: 'koi8u_bin', charSet: 'koi8u', isDefault: false },
	{ collation: 'koi8u_general_ci', charSet: 'koi8u', isDefault: true },
	{ collation: 'latin1_bin', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_danish_ci', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_general_ci', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_general_cs', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_german1_ci', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_german2_ci', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_spanish_ci', charSet: 'latin1', isDefault: false },
	{ collation: 'latin1_swedish_ci', charSet: 'latin1', isDefault: true },
	{ collation: 'latin2_bin', charSet: 'latin2', isDefault: false },
	{ collation: 'latin2_croatian_ci', charSet: 'latin2', isDefault: false },
	{ collation: 'latin2_czech_cs', charSet: 'latin2', isDefault: false },
	{ collation: 'latin2_general_ci', charSet: 'latin2', isDefault: true },
	{ collation: 'latin2_hungarian_ci', charSet: 'latin2', isDefault: false },
	{ collation: 'latin5_bin', charSet: 'latin5', isDefault: false },
	{ collation: 'latin5_turkish_ci', charSet: 'latin5', isDefault: true },
	{ collation: 'latin7_bin', charSet: 'latin7', isDefault: false },
	{ collation: 'latin7_estonian_cs', charSet: 'latin7', isDefault: false },
	{ collation: 'latin7_general_ci', charSet: 'latin7', isDefault: true },
	{ collation: 'latin7_general_cs', charSet: 'latin7', isDefault: false },
	{ collation: 'macce_bin', charSet: 'macce', isDefault: false },
	{ collation: 'macce_general_ci', charSet: 'macce', isDefault: true },
	{ collation: 'macroman_bin', charSet: 'macroman', isDefault: false },
	{ collation: 'macroman_general_ci', charSet: 'macroman', isDefault: true },
	{ collation: 'sjis_bin', charSet: 'sjis', isDefault: false },
	{ collation: 'sjis_japanese_ci', charSet: 'sjis', isDefault: true },
	{ collation: 'swe7_bin', charSet: 'swe7', isDefault: false },
	{ collation: 'swe7_swedish_ci', charSet: 'swe7', isDefault: true },
	{ collation: 'tis620_bin', charSet: 'tis620', isDefault: false },
	{ collation: 'tis620_thai_ci', charSet: 'tis620', isDefault: true },
	{ collation: 'ucs2_bin', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_croatian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_czech_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_danish_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_esperanto_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_estonian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_general_ci', charSet: 'ucs2', isDefault: true },
	{ collation: 'ucs2_general_mysql500_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_german2_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_hungarian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_icelandic_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_latvian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_lithuanian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_persian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_polish_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_romanian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_roman_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_sinhala_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_slovak_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_slovenian_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_spanish2_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_spanish_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_swedish_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_turkish_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_unicode_520_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_unicode_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ucs2_vietnamese_ci', charSet: 'ucs2', isDefault: false },
	{ collation: 'ujis_bin', charSet: 'ujis', isDefault: false },
	{ collation: 'ujis_japanese_ci', charSet: 'ujis', isDefault: true },
	{ collation: 'utf16_bin', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_croatian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_czech_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_danish_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_esperanto_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_estonian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_general_ci', charSet: 'utf16', isDefault: true },
	{ collation: 'utf16_german2_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_hungarian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_icelandic_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_latvian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_lithuanian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_persian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_polish_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_romanian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_roman_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_sinhala_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_slovak_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_slovenian_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_spanish2_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_spanish_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_swedish_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_turkish_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_unicode_520_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_unicode_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16_vietnamese_ci', charSet: 'utf16', isDefault: false },
	{ collation: 'utf16le_bin', charSet: 'utf16le', isDefault: false },
	{ collation: 'utf16le_general_ci', charSet: 'utf16le', isDefault: true },
	{ collation: 'utf32_bin', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_croatian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_czech_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_danish_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_esperanto_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_estonian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_general_ci', charSet: 'utf32', isDefault: true },
	{ collation: 'utf32_german2_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_hungarian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_icelandic_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_latvian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_lithuanian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_persian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_polish_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_romanian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_roman_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_sinhala_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_slovak_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_slovenian_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_spanish2_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_spanish_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_swedish_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_turkish_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_unicode_520_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_unicode_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf32_vietnamese_ci', charSet: 'utf32', isDefault: false },
	{ collation: 'utf8mb3_bin', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_croatian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_czech_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_danish_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_esperanto_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_estonian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_general_ci', charSet: 'utf8mb3', isDefault: true },
	{ collation: 'utf8mb3_general_mysql500_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_german2_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_hungarian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_icelandic_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_latvian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_lithuanian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_persian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_polish_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_romanian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_roman_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_sinhala_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_slovak_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_slovenian_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_spanish2_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_spanish_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_swedish_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_tolower_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_turkish_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_unicode_520_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_unicode_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb3_vietnamese_ci', charSet: 'utf8mb3', isDefault: false },
	{ collation: 'utf8mb4_0900_ai_ci', charSet: 'utf8mb4', isDefault: true },
	{ collation: 'utf8mb4_0900_as_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_0900_bin', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_bg_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_bg_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_bin', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_bs_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_bs_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_croatian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_cs_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_cs_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_czech_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_danish_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_da_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_da_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_de_pb_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_de_pb_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_eo_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_eo_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_esperanto_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_estonian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_es_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_es_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_es_trad_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_es_trad_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_et_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_et_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_general_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_german2_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_gl_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_gl_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_hr_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_hr_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_hungarian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_hu_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_hu_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_icelandic_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_is_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_is_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_ja_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_ja_0900_as_cs_ks', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_latvian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_la_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_la_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_lithuanian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_lt_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_lt_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_lv_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_lv_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_mn_cyrl_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_mn_cyrl_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_nb_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_nb_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_nn_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_nn_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_persian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_pl_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_pl_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_polish_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_romanian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_roman_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_ro_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_ro_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_ru_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_ru_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sinhala_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sk_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sk_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_slovak_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_slovenian_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sl_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sl_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_spanish2_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_spanish_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sr_latn_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sr_latn_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sv_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_sv_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_swedish_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_tr_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_tr_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_turkish_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_unicode_520_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_unicode_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_vietnamese_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_vi_0900_ai_ci', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_vi_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
	{ collation: 'utf8mb4_zh_0900_as_cs', charSet: 'utf8mb4', isDefault: false },
];
export const charSetAndCollationCommutative = (
	left: { charSet: string | null; collation: string | null },
	right: { collation: string | null; charSet: string | null },
): boolean => {
	if (!left.charSet && !left.collation && !right.charSet && !right.collation) return true;

	const normalize = (input: { charSet: string | null; collation: string | null }) => {
		let { charSet, collation } = input;

		if (!charSet && collation) {
			const match = commutativeCharSetAndCollation.find((x) => x.collation === collation);
			if (!match) return null;
			charSet = match.charSet;
		}

		if (charSet && !collation) {
			const match = commutativeCharSetAndCollation.find((x) => x.charSet === charSet && x.isDefault);
			if (!match) return null;
			collation = match.collation;
		}

		if (charSet && collation) {
			const match = commutativeCharSetAndCollation.find((x) => x.charSet === charSet && x.collation === collation);
			if (!match) return null; // invalid combination
		}

		return { charSet, collation };
	};

	const leftNorm = normalize(left);
	const rightNorm = normalize(right);

	if (!leftNorm || !rightNorm) return false;

	return leftNorm.charSet === rightNorm.charSet && leftNorm.collation === rightNorm.collation;
};
