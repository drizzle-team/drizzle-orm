import { assertUnreachable, trimChar } from '../../utils';
import { parse, stringify } from '../../utils/when-json-met-bigint';
import { hash } from '../common';
import { escapeForSqlDefault, escapeForTsLiteral, parseParams, unescapeFromSqlDefault } from '../utils';
import type { DefaultConstraint, MssqlEntities } from './ddl';
import type { Import } from './typescript';

const getDefaultOptions = (x: keyof typeof defaults.options): string | null => {
	return defaults.options[x as keyof typeof defaults.options]
		? Object.values(defaults.options[x as keyof typeof defaults.options]).join(',')
		: null;
};
const getFloatPrecisionFrom = (x: number) => {
	return 1 <= x && x <= 24 ? 24 : 25 <= x && x <= 53 ? 53 : x;
};
export const defaults = {
	options: {
		numeric: {
			precision: 18,
			scale: 0,
		},
		decimal: {
			precision: 18,
			scale: 0,
		},
		time: {
			precision: 7,
		},
		float: {
			precision: 53,
		},
		varchar: {
			length: 1,
		},
		char: {
			length: 1,
		},
		nvarchar: {
			length: 1,
		},
		nchar: {
			length: 1,
		},
		datetime2: {
			precision: 7,
		},
		datetimeoffset: {
			precision: 7,
		},
		binary: {
			length: 1,
		},
		varbinary: {
			length: 1,
		},
	},
	max_int_value: 2147483647,
	min_int_value: -2147483648,
} as const;

export const defaultNameForPK = (table: string) => {
	const desired = `${table}_pkey`;
	const res = desired.length > 128
		? `${hash(desired)}_pkey` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForUnique = (table: string, column: string[]) => {
	const desired = `${table}_${column.join('_')}_key`;
	const res = desired.length > 128
		? table.length < 128 - 18 // _{hash(12)}_key
			? `${table}_${hash(desired)}_key`
			: `${hash(desired)}_key` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForFK = (table: string, columns: string[], tableTo: string, columnsTo: string[]) => {
	const desired = `${table}_${columns.join('_')}_${tableTo}_${columnsTo.join('_')}_fk`;
	const res = desired.length > 128
		? table.length < 128 - 18 // _{hash(12)}_fkey
			? `${table}_${hash(desired)}_fk`
			: `${hash(desired)}_fk` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForDefault = (table: string, column: string) => {
	const desired = `${table}_${column}_default`;
	const res = desired.length > 128
		? table.length < 128 - 18 // _{hash(12)}_default
			? `${table}_${hash(desired)}__default`
			: `${hash(desired)}__default` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export type OnAction = MssqlEntities['fks']['onUpdate'];
export const parseFkAction = (type: string): OnAction => {
	switch (type) {
		case 'NO_ACTION':
			return 'NO ACTION';
		case 'SET_NULL':
			return 'SET NULL';
		case 'CASCADE':
			return 'CASCADE';
		case 'SET_DEFAULT':
			return 'SET DEFAULT';
		default:
			throw new Error(`Unknown foreign key type: ${type}`);
	}
};

const viewAsStatementRegex =
	/\bAS\b\s*\(?\s*(WITH[\s\S]+?SELECT[\s\S]*?|SELECT[\s\S]*?)\)?(?=\s+WITH CHECK OPTION\b|\s*;?$)/i;
export const parseViewSQL = (sql: string | null): string | null => {
	if (!sql) return ''; // this means that used is_encrypted

	const match = sql.match(viewAsStatementRegex);
	return match ? match[1] : null;
};

const viewMetadataRegex = /\bwith\b\s+([^)]*\bview_metadata\b[^)]*)(\s+as\b|\s*,)/i;
export const parseViewMetadataFlag = (sql: string | null): boolean => {
	if (!sql) return false;

	const match = sql.match(viewMetadataRegex);
	return match ? true : false;
};

export const bufferToBinary = (str: Buffer) => {
	return '0x' + (str.toString('hex')).toUpperCase();
};

export const parseDefault = (type: string, def: string) => {
	const grammarType = typeFor(type);
	return grammarType.defaultFromIntrospect(def);
};

const commutativeTypes = [
	['char', `char(${getDefaultOptions('char')})`],
	['nchar', `nchar(${getDefaultOptions('nchar')})`],
	['varchar', `varchar(${getDefaultOptions('varchar')})`],
	['nvarchar', `nvarchar(${getDefaultOptions('nvarchar')})`],
	['datetime2', `datetime2(${getDefaultOptions('datetime2')})`],
	['datetimeoffset', `datetimeoffset(${getDefaultOptions('datetimeoffset')})`],
	['time', `time(${getDefaultOptions('time')})`],
	['binary', `binary(${getDefaultOptions('binary')})`],
	['varbinary', `varbinary(${getDefaultOptions('varbinary')})`],
	['decimal', `decimal(${getDefaultOptions('decimal')})`],
	['numeric', `numeric(${getDefaultOptions('numeric')})`],
	['float', `float(${getDefaultOptions('float')})`],
];
export const typesCommutative = (
	left: string,
	right: string,
	mode: 'push' | 'default',
) => {
	for (const it of commutativeTypes) {
		const leftIn = it.some((x) => x === left);
		const rightIn = it.some((x) => x === right);

		if (leftIn && rightIn) return true;
	}

	if (mode === 'push') {
		if (left.replace(',0)', ')') === right.replace(',0)', ')')) return true; // { from: 'decimal(19,0)', to: 'decimal(19)' }

		// SQL Server treats n as one of two possible values. If 1<=n<=24, n is treated as 24. If 25<=n<=53, n is treated as 53
		// https://learn.microsoft.com/en-us/sql/t-sql/data-types/float-and-real-transact-sql?view=sql-server-ver16
		// SQL Server treats float(24) as real
		if (left === 'real' && right.startsWith('float')) {
			const rightOptions = parseParams(right).join(',');

			if (Number(rightOptions) <= 24) return true;
		}
		if (right.startsWith('float') && right === 'float') {
			const leftOptions = parseParams(left).join(',');

			if (Number(leftOptions) <= 24) return true;
		}
		if (right.startsWith('float') && right.startsWith('float')) {
			const leftOptions = parseParams(left).join(',');
			const rightOptions = parseParams(right).join(',');

			if (getFloatPrecisionFrom(Number(leftOptions)) === getFloatPrecisionFrom(Number(rightOptions))) return true;
		}
	}
	return false;
};

const checkNumber = (it: string) => {
	const check = Number(it);

	if (Number.isNaN(check)) return 'NaN';
	if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return 'number';
	return 'bigint';
};

export interface SqlType {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown): DefaultConstraint['default'];
	defaultFromIntrospect(value: string): DefaultConstraint['default'];
	toTs(
		type: string,
		value: DefaultConstraint['default'],
	): { options?: Record<string, unknown>; default: string; customType?: string };
}

export const Int: SqlType = {
	is: (type: string) => type === 'int',
	drizzleImport: () => 'int',
	defaultFromDrizzle: (value: unknown) => {
		const stringified = String(value);

		// mssql wraps each number in extra ()
		return `((${stringified}))`;
	},
	defaultFromIntrospect: (value: string) => {
		// mssql stores values that are bigger than `int` with dots
		const tmp = value.replace('.))', '))');
		const checked = checkNumber(trimChar(trimChar(tmp, ['(', ')']), ['(', ')']));
		if (checked === 'NaN') return value;
		return tmp;
	},
	toTs: (_type, value) => {
		if (!value) return { default: '' };

		// cases from introspect:
		// int DEFAULT '10' --> ('10')
		// int DEFAULT 10  --> ((10))
		value = value.substring(1, value.length - 1);

		const trimmed = trimChar(value, ['(', ')']);

		const numType = checkNumber(trimmed);
		if (numType === 'NaN') return { default: `sql\`${value}\`` };
		return { default: trimmed };
	},
};
export const TinyInt: SqlType = {
	is: (type: string) => type === 'tinyint',
	drizzleImport: () => 'tinyint',
	defaultFromDrizzle: Int.defaultFromDrizzle,
	defaultFromIntrospect: Int.defaultFromIntrospect,
	toTs: Int.toTs,
};
export const SmallInt: SqlType = {
	is: (type: string) => type === 'smallint',
	drizzleImport: () => 'smallint',
	defaultFromDrizzle: Int.defaultFromDrizzle,
	defaultFromIntrospect: Int.defaultFromIntrospect,
	toTs: Int.toTs,
};
export const BigInt: SqlType = {
	is: (type: string) => type === 'bigint',
	drizzleImport: () => 'bigint',
	defaultFromDrizzle: (value: unknown) => {
		return `((${String(value)}))`;
	},
	defaultFromIntrospect: Int.defaultFromIntrospect,
	toTs: (_type, value) => {
		if (value === null) return { options: { mode: 'number' }, default: '' };

		// cases from introspect:
		// bigintint DEFAULT '10' --> ('10')
		// bigintint DEFAULT '9007199254740994' --> ('9007199254740994')
		// bigintint DEFAULT '9007199254740994.' --> ('9007199254740994.')
		// bigintint DEFAULT 9007199254740994 --> ((9007199254740994.))
		// bigintint DEFAULT 10  --> ((10))
		value = value.substring(1, value.length - 1);

		const tmp = value.replaceAll('.)', ')');
		const trimmed = trimChar(tmp, ['(', ')']);

		const numType = checkNumber(trimmed);

		if (numType === 'NaN') return { options: { mode: 'bigint' }, default: `sql\`${value}\`` };
		if (numType === 'number') return { options: { mode: 'number' }, default: trimmed };
		if (numType === 'bigint') return { options: { mode: 'bigint' }, default: `${trimmed}n` };
		assertUnreachable(numType);
	},
};

export const Bit: SqlType = {
	is: (type) => type === 'bit',
	drizzleImport: () => 'bit',
	defaultFromDrizzle: (value: unknown) => {
		return String(value) === 'true' ? '((1))' : '((0))';
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	toTs: (_type, value) => {
		if (value === null) return { default: '' };

		// cases
		// bit 1 -> ((1))
		// bit 1. -> ((1.)) -> edge case
		// bit '1' -> ('1') -> edge case
		// bit '1.' -> ('1.') -> this is not valid syntax to insert
		value = value.substring(1, value.length - 1);
		if (value === '(1)') return { default: 'true' };
		if (value === '(0)') return { default: 'false' };

		return { default: `sql\`${value}\`` };
	},
};

export const Char: SqlType = {
	is: (type: string) => type === 'char' || type.startsWith('char('),
	drizzleImport: () => 'char',
	defaultFromDrizzle: (value) => {
		const val = String(value);

		return `('${escapeForSqlDefault(val)}')`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		// for text compatibility
		let optionsToSet: { length: number | 'max' } | undefined;

		const param = parseParams(type)[0];
		if (param) optionsToSet = { length: param === 'max' ? 'max' : Number(param) };

		if (!value) return { default: '', options: optionsToSet };

		// ('text')
		// remove outer ( and )
		value = value.substring(1, value.length - 1);
		const isTSQLStringLiteral = (str: string) => {
			// Trim and check if string starts and ends with a single quote
			if (!/^'.*'$/.test(str.trim())) return false;

			// Remove the surrounding quotes
			const inner = str.trim().slice(1, -1);

			// Check for valid internal quote escaping: only doubled single quotes are allowed
			return !/[^']'[^']/.test(inner); // there should be no unescaped (lonely) single quotes
		};

		if (isTSQLStringLiteral(value)) {
			// remove extra ' and '
			value = value.substring(1, value.length - 1);
			const unescaped = unescapeFromSqlDefault(value);
			const escaped = escapeForTsLiteral(unescaped);

			return { options: optionsToSet, default: escaped };
		}

		return { options: optionsToSet, default: `sql\`${value}\`` };
	},
};
export const NChar: SqlType = {
	is: (type: string) => type === 'nchar' || type.startsWith('nchar('),
	drizzleImport: () => 'nchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	toTs: Char.toTs,
};
export const Varchar: SqlType = {
	is: (type) => type === 'varchar' || type.startsWith('varchar('),
	drizzleImport: () => 'varchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	toTs: Char.toTs,
};
export const NVarchar: SqlType = {
	is: (type: string) => type === 'nvarchar' || type.startsWith('nvarchar('),
	drizzleImport: () => 'nvarchar',
	defaultFromDrizzle: (value: unknown) => {
		let result: string;

		if (typeof value === 'string') result = escapeForSqlDefault(value);
		else if (typeof value === 'object' || Array.isArray(value)) {
			result = stringify(value, (_, value) => {
				if (typeof value !== 'string') return value;
				return value.replaceAll("'", "''");
			});
		} else {
			throw new Error(`unexpected default: ${value}`);
		}

		return `('${result}')`;
	},
	defaultFromIntrospect: Char.defaultFromIntrospect,
	toTs: (type, value) => {
		// for text compatibility
		let optionsToSet: { length: number | 'max' } | undefined;

		const param = parseParams(type)[0];
		if (param) optionsToSet = { length: param === 'max' ? 'max' : Number(param) };

		if (!value) return { default: '', options: optionsToSet };

		// ('text')
		// remove outer ( and )
		value = value.substring(1, value.length - 1);
		const isTSQLStringLiteral = (str: string) => {
			// Trim and check if string starts and ends with a single quote
			if (!/^'.*'$/.test(str.trim())) return false;

			// Remove the surrounding quotes
			const inner = str.trim().slice(1, -1);

			// Check for valid internal quote escaping: only doubled single quotes are allowed
			// 'text'+'text' - not pass
			// 'text''text' - pass
			return !/[^']'[^']/.test(inner); // there should be no unescaped (lonely) single quotes
		};

		if (!isTSQLStringLiteral(value)) {
			return { options: optionsToSet, default: `sql\`${value}\`` };
		}

		try {
			const parsed = parse(trimChar(value, "'"), (_, v) => {
				if (typeof v === 'string') {
					return unescapeFromSqlDefault(v);
				}
				return v;
			});

			return {
				default: stringify(parsed, undefined, undefined, true)!,
				options: { mode: 'json', ...optionsToSet },
			};
		} catch {}

		// remove extra ' and '
		value = value.substring(1, value.length - 1);
		const unescaped = unescapeFromSqlDefault(value);
		const escaped = escapeForTsLiteral(unescaped);

		return { options: optionsToSet, default: escaped };
	},
};
export const Text: SqlType = {
	is: (type: string) => type === 'text' || type.startsWith('text('),
	drizzleImport: () => 'text',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	toTs: Char.toTs,
};
export const NText: SqlType = {
	is: (type: string) => type === 'ntext' || type.startsWith('ntext('),
	drizzleImport: () => 'ntext',
	defaultFromDrizzle: Text.defaultFromDrizzle,
	defaultFromIntrospect: Text.defaultFromIntrospect,
	toTs: Text.toTs,
};

export const Decimal: SqlType = {
	is: (type: string) => type === 'decimal' || type.startsWith('decimal('),
	drizzleImport: () => 'decimal',
	defaultFromDrizzle: (value) => {
		return `((${String(value)}))`;
	},
	defaultFromIntrospect: (value) => {
		// mssql stores values that are bigger than `int` with dots
		const tmp = value.replace('.))', '))');
		const checked = checkNumber(trimChar(trimChar(tmp, ['(', ')']), ['(', ')']));
		if (checked === 'NaN') return value;
		return tmp;
	},
	toTs: (type, value) => {
		const optionsToSet: any = {};

		const params = parseParams(type);
		if (params.length) {
			const [p, s] = params;
			if (p) optionsToSet['precision'] = Number(p);
			if (s) optionsToSet['scale'] = Number(s);
		}

		if (!value) return { options: optionsToSet, default: '' };
		// cases:
		// [column] decimal DEFAULT '6.32' --> ('6.32') -> edge case
		// [column1] decimal DEFAULT '6.' --> ('6.') -> edge case
		// [column2] decimal DEFAULT '6' --> ('6') -> edge case
		// [column3] decimal DEFAULT 6.32 --> ((6.32))
		// [column5] decimal DEFAULT 6 --> ((6))
		value = value.substring(1, value.length - 1);

		const trimmed = trimChar(value, ['(', ')']);

		const numType = checkNumber(trimmed);

		if (numType === 'NaN') return { options: { ...optionsToSet, mode: 'bigint' }, default: `sql\`${value}\`` };
		if (numType === 'number') return { options: { ...optionsToSet, mode: 'number' }, default: trimmed };
		if (numType === 'bigint') return { options: { ...optionsToSet, mode: 'bigint' }, default: `${trimmed}n` };
		assertUnreachable(numType);
	},
};
export const Numeric: SqlType = {
	is: (type: string) => type === 'numeric' || type.startsWith('numeric('),
	drizzleImport: () => 'numeric',
	defaultFromDrizzle: Decimal.defaultFromDrizzle,
	defaultFromIntrospect: Decimal.defaultFromIntrospect,
	toTs: Decimal.toTs,
};

export const Float: SqlType = {
	is: (type: string) => type === 'float' || type.startsWith('float('),
	drizzleImport: () => 'float',
	defaultFromDrizzle: (value) => {
		return `((${String(value)}))`;
	},
	defaultFromIntrospect: (value) => {
		// mssql stores values that are bigger than `int` with dots
		const tmp = value.replace('.))', '))');
		const checked = checkNumber(trimChar(trimChar(tmp, ['(', ')']), ['(', ')']));
		if (checked === 'NaN') return value;
		return tmp;
	},
	toTs: (type, value) => {
		const param = parseParams(type)[0];
		const optionsToSet = { precision: Number(param) };

		if (!value) return { default: '', options: optionsToSet };

		// cases:
		// [column] float DEFAULT '6.32' --> ('6.32') -> mapped to ((6.32))
		// [column2] float DEFAULT '6' --> ('6') -> mapped to ((6))
		// [column3] float DEFAULT 6.32 --> ((6.32))
		// [column5] float DEFAULT 6 --> ((6))
		value = value.substring(1, value.length - 1);

		const trimmed = trimChar(value, ['(', ')']);

		const numType = checkNumber(trimmed);

		if (numType === 'NaN') return { options: optionsToSet, default: `sql\`${value}\`` };
		return { options: optionsToSet, default: trimmed };
	},
};
export const Real: SqlType = {
	is: (type: string) => type === 'real' || type.startsWith('real('),
	drizzleImport: () => 'real',
	defaultFromDrizzle: Float.defaultFromDrizzle,
	defaultFromIntrospect: Float.defaultFromIntrospect,
	toTs: (_type, value) => {
		if (!value) return { default: '' };

		// cases:
		// [column] float DEFAULT '6.32' --> ('6.32') -> edge case
		// [column1] float DEFAULT '6.' --> ('6.') -> edge case
		// [column2] float DEFAULT '6' --> ('6') -> edge case
		// [column3] float DEFAULT 6.32 --> ((6.32))
		// [column5] float DEFAULT 6 --> ((6))
		value = value.substring(1, value.length - 1);

		const trimmed = trimChar(value, ['(', ')']);

		const numType = checkNumber(trimmed);
		if (numType === 'NaN') return { default: `sql\`${value}\`` };
		if (numType === 'number') return { default: trimmed };
		if (numType === 'bigint') return { default: `${trimmed}n` };
		assertUnreachable(numType);
	},
};

export const Datetime: SqlType = {
	is: (type) => type === 'datetime' || type.startsWith('datetime('),
	drizzleImport: () => 'datetime',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `('${value.toISOString().replace('T', ' ').replace('Z', '')}')`;
		}

		return `('${String(value)}')`;
	},
	defaultFromIntrospect: (value: string) => {
		return value;
	},
	toTs: (_type, value) => {
		const options: { mode: string } = { mode: 'string' };

		if (!value) return { default: '', options };

		if (value === '(getdate())') return { default: '.defaultGetDate()', options };

		// remove ( and )
		// ('2024-12-42 12:00:00')
		value = value.substring(1, value.length - 1);
		// check for valid date
		if (isNaN(Date.parse(value.substring(1, value.length - 1)))) {
			return { default: `sql\`${value}\``, options };
		}

		return { default: value, options };
	},
};
export const DateType: SqlType = {
	is: (type) => type === 'date' || type.startsWith('date('),
	drizzleImport: () => 'date',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `('${value.toISOString().split('T')[0]}')`;
		}

		return `('${String(value)}')`;
	},
	defaultFromIntrospect: Datetime.defaultFromIntrospect,
	toTs: Datetime.toTs,
};
export const Datetime2: SqlType = {
	is: (type) => type === 'datetime2' || type.startsWith('datetime2('),
	drizzleImport: () => 'datetime2',
	defaultFromDrizzle: Datetime.defaultFromDrizzle,
	defaultFromIntrospect: Datetime.defaultFromIntrospect,
	toTs: (type, value) => {
		const options: { mode: string; precision: number } = {
			mode: 'string',
			precision: defaults.options.datetime2.precision,
		};

		const param = parseParams(type)[0];
		if (param) options['precision'] = Number(param);

		if (!value) return { default: '', options };

		// remove ( and )
		// ('2024-12-42 12:00:00')
		value = value.substring(1, value.length - 1);
		// check for valid date
		if (isNaN(Date.parse(value.substring(1, value.length - 1)))) {
			return { default: `sql\`${value}\``, options };
		}

		return { default: value, options };
	},
};
export const Datetimeoffset: SqlType = {
	is: (type) => type === 'datetimeoffset' || type.startsWith('datetimeoffset('),
	drizzleImport: () => 'datetimeoffset',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `('${value.toISOString()}')`;
		}

		return `('${String(value)}')`;
	},
	defaultFromIntrospect: Datetime.defaultFromIntrospect,
	toTs: (type, value) => {
		const options: { mode: string; precision: number } = {
			mode: 'string',
			precision: defaults.options.datetimeoffset.precision,
		};

		const param = parseParams(type)[0];
		if (param) options['precision'] = Number(param);

		if (!value) return { default: '', options };

		if (value === '(getdate())') return { default: '.defaultGetDate()', options };

		// remove ( and )
		// ('2024-12-42 12:00:00')
		value = value.substring(1, value.length - 1);
		// check for valid date
		if (isNaN(Date.parse(value.substring(1, value.length - 1)))) {
			return { default: `sql\`${value}\``, options };
		}

		return { default: value, options };
	},
};
export const Time: SqlType = {
	is: (type) => type === 'time' || type.startsWith('time('),
	drizzleImport: () => 'time',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return `('${value.toISOString().split('T')[1].replace('Z', '')}')`;
		}

		return `('${String(value)}')`;
	},
	defaultFromIntrospect: Datetime.defaultFromIntrospect,
	toTs: (type, value) => {
		const options: { mode: string; precision: number } = {
			mode: 'string',
			precision: defaults.options.time.precision,
		};

		const param = parseParams(type)[0];
		if (param) options['precision'] = Number(param);

		if (!value) return { default: '', options };

		// remove ( and )
		// ('2024-12-42 12:00:00')
		value = value.substring(1, value.length - 1);
		// check for valid date
		if (isNaN(Date.parse(value.substring(1, value.length - 1)))) {
			return { default: `sql\`${value}\``, options };
		}

		return { default: value, options };
	},
};

export const Binary: SqlType = {
	is: (type) => type === 'binary' || type.startsWith('binary('),
	drizzleImport: () => 'binary',
	defaultFromDrizzle: (value) => {
		if (Buffer.isBuffer(value)) {
			return `(${bufferToBinary(value)})`;
		}
		throw Error('unexpected binary default');
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		const optionsToSet: { length: number | 'max' } = { length: defaults.options.binary.length };

		const param = parseParams(type)[0];
		if (param) optionsToSet['length'] = param === 'max' ? 'max' : Number(param);

		// (0x...)
		const def = value ? `sql\`${value.substring(1, value.length - 1)}\`` : '';
		return { options: optionsToSet, default: def };
	},
};
export const Varbinary: SqlType = {
	is: (type) => type === 'varbinary' || type.startsWith('varbinary('),
	drizzleImport: () => 'varbinary',
	defaultFromDrizzle: Binary.defaultFromDrizzle,
	defaultFromIntrospect: Binary.defaultFromIntrospect,
	toTs: Binary.toTs,
};

export const Custom: SqlType = {
	is: () => {
		throw Error('Mocked');
	},
	drizzleImport: () => 'customType',
	defaultFromDrizzle: (value) => {
		return `('${String(value)}')`;
	},
	defaultFromIntrospect: (value) => {
		return value;
	},
	toTs: (type, value) => {
		return { default: `sql\`${value}\``, customType: type };
	},
};

export const typeFor = (sqlType: string): SqlType => {
	if (Int.is(sqlType)) return Int;
	if (TinyInt.is(sqlType)) return TinyInt;
	if (SmallInt.is(sqlType)) return SmallInt;
	if (BigInt.is(sqlType)) return BigInt;
	if (Bit.is(sqlType)) return Bit;
	if (Char.is(sqlType)) return Char;
	if (NChar.is(sqlType)) return NChar;
	if (Varchar.is(sqlType)) return Varchar;
	if (NVarchar.is(sqlType)) return NVarchar;
	if (Text.is(sqlType)) return Text;
	if (NText.is(sqlType)) return NText;
	if (Decimal.is(sqlType)) return Decimal;
	if (Numeric.is(sqlType)) return Numeric;
	if (Float.is(sqlType)) return Float;
	if (Real.is(sqlType)) return Real;
	if (DateType.is(sqlType)) return DateType;
	if (Datetime.is(sqlType)) return Datetime;
	if (Datetime2.is(sqlType)) return Datetime2;
	if (Datetimeoffset.is(sqlType)) return Datetimeoffset;
	if (Time.is(sqlType)) return Time;
	if (Binary.is(sqlType)) return Binary;
	if (Varbinary.is(sqlType)) return Varbinary;
	return Custom;
};
