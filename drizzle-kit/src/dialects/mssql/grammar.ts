import { is, SQL } from 'drizzle-orm';
import { MsSqlDialect } from 'drizzle-orm/mssql-core';
import { assertUnreachable } from '../../utils';
import { escapeForSqlDefault, escapeForTsLiteral, unescapeFromSqlDefault } from '../utils';
import { Column, DefaultConstraint, MssqlEntities } from './ddl';
import { Import } from './typescript';
import { hash } from './utils';

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
	const match = sqlType.match(/^(\w+(?:\s+\w+)*)\(([^)]*)\)(\s+with time zone)?$/i);
	let type = match ? (match[1] + (match[3] ?? '')) : sqlType;
	let options = match ? match[2].replaceAll(', ', ',') : null;

	if (options && type === 'decimal') {
		options = options.replace(',0', ''); // trim decimal (4,0)->(4), compatibility with Drizzle
	}

	if (type === 'real') options = null;

	if (type === 'float' && options) options = `${defaults.options.getFloatPrecisionFrom(Number(options))}`;

	// add scale 0 for numeric and decimal
	if (options && (type === 'decimal' || type === 'numeric') && options.split(',').length !== 2) {
		options = `${options.split(',')[0]},0`;
	}

	if (!options) options = defaults.options.getDefaultOptions(type);

	return { type, options };
};

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

const viewAsStatementRegex = /\bAS\b\s*\(?(SELECT[\s\S]*)\)?;?$/i;
export const parseViewSQL = (sql: string | null): string | null => {
	if (!sql) return ''; // this means that used is_encrypted

	const match = sql.match(viewAsStatementRegex);
	return match ? match[1] : null;
};

const viewMetadataRegex = /(\bwith\s+view_metadata\b)/i;
export const parseViewMetadataFlag = (sql: string | null): boolean => {
	if (!sql) return false;

	const match = sql.match(viewMetadataRegex);
	return match ? true : false;
};

export const bufferToBinary = (str: Buffer) => {
	return '0x' + (str.toString('hex')).toUpperCase();
};

export const defaultForColumn = (
	type: string,
	def: string | null | undefined,
): DefaultConstraint['default'] => {
	if (
		def === null
		|| def === undefined
	) {
		return null;
	}

	// ('hey') -> 'hey'
	let value = def.slice(1, def.length - 1);

	const grammarType = typeFor(type);
	if (grammarType) return grammarType.defaultFromIntrospect(value);

	// ((value)) -> value
	const typesToExtraTrim = ['int', 'smallint', 'bigint', 'numeric', 'decimal', 'real', 'float', 'bit', 'tinyint'];
	if (typesToExtraTrim.find((it) => type.startsWith(it))) {
		value = value.slice(1, value.length - 1);

		// for numeric and decimals after some value mssql adds . in the end
		if (type.startsWith('bigint') || type.startsWith('numeric') || type.startsWith('decimal')) {
			value = value.endsWith('.') ? value.replace('.', '') : value;
		}
	}

	// 'text', potentially with escaped double quotes ''
	if (/^'(?:[^']|'')*'$/.test(value)) {
		const res = value.substring(1, value.length - 1);

		return { value: res, type: 'string' };
	}

	if (type === 'bit') {
		return { value, type: 'boolean' };
	}

	// previous /^-?[\d.]+(?:e-?\d+)?$/
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
		const num = Number(value);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: value, type: big ? 'bigint' : 'number' };
	}

	return { value: value, type: 'unknown' };
};

export const defaultToSQL = (
	type: string,
	def: DefaultConstraint['default'] | null,
) => {
	if (!def) return '';

	const grammarType = typeFor(type);
	if (grammarType) return grammarType.defaultToSQL(def);

	const { type: defaultType, value } = def;

	if (defaultType === 'string' || defaultType === 'text') {
		return `'${value}'`;
	}

	if (defaultType === 'json') {
		return `'${value.replaceAll("'", "''")}'`;
	}

	if (defaultType === 'bigint') {
		return `'${value}'`;
	}

	if (
		defaultType === 'boolean' || defaultType === 'number'
		|| defaultType === 'unknown' || defaultType === 'binary'
	) {
		return value;
	}

	assertUnreachable(defaultType);
};

export const typeToSql = (
	column: Column,
): string => {
	const {
		type: columnType,
		options,
	} = column;
	const optionSuffix = options ? `(${options})` : '';

	const isTimeWithTZ = columnType === 'timestamp with time zone' || columnType === 'time with time zone';

	let finalType: string;

	if (optionSuffix && isTimeWithTZ) {
		const [baseType, ...rest] = columnType.split(' ');
		finalType = `${baseType}${optionSuffix} ${rest.join(' ')}`;
	} else {
		finalType = `${columnType}${optionSuffix}`;
	}

	return finalType;
};

export const defaults = {
	options: {
		getDefaultOptions: (x: string): string | null => {
			return defaults.options[x as keyof typeof defaults.options]
				? Object.values(defaults.options[x as keyof typeof defaults.options]).join(',')
				: null;
		},
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
		getFloatPrecisionFrom: (x: number) => {
			return 1 <= x && x <= 24 ? 24 : 25 <= x && x <= 53 ? 53 : x;
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
} as const;

const checkNumber = (it: string) => {
	const check = Number(it);

	if (Number.isNaN(check)) return 'NaN';
	if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return 'number';
	return 'bigint';
};

const extractNumber = (str: string): string | null => {
	const match = str.match(/-?\d+(\.\d+)?|-?\d+(?=\.)/);
	if (!match) return null;

	// remove dot if no decimal part
	return match[0].endsWith('.') ? match[0].slice(0, -1) : match[0];
};

export interface SqlType<MODE = unknown> {
	is(type: string): boolean;
	drizzleImport(): Import;
	defaultFromDrizzle(value: unknown, mode?: MODE): DefaultConstraint['default'];
	defaultFromIntrospect(value: string): DefaultConstraint['default'];
	defaultToSQL(value: DefaultConstraint['default']): string;
	toTs(
		incomOptions: string | null,
		value: DefaultConstraint['default'],
	): { options?: Record<string, unknown>; default: string; raw?: boolean };
}

export const Int: SqlType = {
	is: (type: string) => type === 'int',
	drizzleImport: () => 'int',
	defaultFromDrizzle: (value: unknown) => {
		return { value: String(value), type: 'number' };
	},
	defaultFromIntrospect: (value: string) => {
		return { value: trimChar(trimChar(value, '('), ')'), type: 'number' };
	},
	defaultToSQL: (value: DefaultConstraint['default']): string => {
		return value ? value.value : '';
	},
	toTs: (_type, value) => {
		return { default: value ? value.value : '' };
	},
};
export const TinyInt: SqlType = {
	is: (type: string) => type === 'tinyint',
	drizzleImport: () => 'tinyint',
	defaultFromDrizzle: Int.defaultFromDrizzle,
	defaultFromIntrospect: Int.defaultFromIntrospect,
	defaultToSQL: Int.defaultToSQL,
	toTs: Int.toTs,
};
export const SmallInt: SqlType = {
	is: (type: string) => type === 'smallint',
	drizzleImport: () => 'smallint',
	defaultFromDrizzle: Int.defaultFromDrizzle,
	defaultFromIntrospect: Int.defaultFromIntrospect,
	defaultToSQL: Int.defaultToSQL,
	toTs: Int.toTs,
};
export const BigInt: SqlType = {
	is: (type: string) => type === 'bigint',
	drizzleImport: () => 'bigint',
	defaultFromDrizzle: Int.defaultFromDrizzle,
	defaultFromIntrospect: (value: string) => {
		/**
		 * create table t1 (
				[bigint] bigint default '9223372036854775807' -> returns ('9223372036854775807')
			);

			create table t1 (
				[bigint] bigint default 9223372036854775807 -> returnes ((9223372036854775807.))
			);
		 */
		const extractedNumber = extractNumber(value);
		if (!extractedNumber) return { type: 'unknown', value: value };

		const numType = checkNumber(extractedNumber);
		if (numType === 'NaN') return { type: 'unknown', value: value };
		if (numType === 'number') return { type: 'number', value: extractedNumber };
		if (numType === 'bigint') return { type: 'bigint', value: extractedNumber };
		assertUnreachable(numType);
	},
	defaultToSQL: (value: DefaultConstraint['default']): string => {
		return value ? value.value : '';
	},
	toTs: (_type, value) => {
		if (value === null) return { options: { mode: 'number' }, default: '' };

		const numType = checkNumber(value.value);
		if (numType === 'NaN') return { options: { mode: 'number' }, default: `sql\`${value.value}\`` };
		if (numType === 'number') return { options: { mode: 'number' }, default: value.value };
		if (numType === 'bigint') return { options: { mode: 'bigint' }, default: `${value.value}n` };
		assertUnreachable(numType);
	},
};

export const Bit: SqlType = {
	is: (type) => type === 'bit',
	drizzleImport: () => 'bit',
	defaultFromDrizzle: (value: unknown) => {
		return { value: String(value) === 'true' ? '1' : '0', type: 'boolean' };
	},
	defaultFromIntrospect: (value: string) => {
		const trimmed = trimChar(trimChar(value, '('), ')');
		return { value: trimmed, type: 'boolean' };
	},
	defaultToSQL: (value) => value ? value.value : '',
	toTs: (_, value) => {
		if (value === null) return { default: '' };

		return { default: value.value === '1' ? 'true' : 'false' };
	},
};

export const Char: SqlType = {
	is: (type: string) => type === 'char' || type.startsWith('char('),
	drizzleImport: () => 'char',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'string' }; // TODO escape quotes?
	},
	defaultFromIntrospect: (value) => {
		return { value: unescapeFromSqlDefault(trimChar(value, "'")), type: 'string' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';
		return value ? `'${escapeForSqlDefault(value.value)}'` : '';
	},
	toTs: (options, value) => {
		const optionsToSet: any = {};
		if (options) optionsToSet['length'] = options === 'max' ? '"max"' : Number(options);
		const escaped = value ? `"${escapeForTsLiteral(trimChar(value.value, "'"))}"` : '';
		return { options: optionsToSet, default: escaped };
	},
};
export const NChar: SqlType = {
	is: (type: string) => type === 'nchar' || type.startsWith('nchar('),
	drizzleImport: () => 'nchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultToSQL: Char.defaultToSQL,
	toTs: Char.toTs,
};
export const Varchar: SqlType = {
	is: (type) => {
		return /^(?:varchar)(?:[\s(].*)?$/i.test(type);
	},
	drizzleImport: () => 'varchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultToSQL: Char.defaultToSQL,
	toTs: Char.toTs,
};
export const NVarchar: SqlType = {
	is: (type: string) => type === 'nvarchar' || type.startsWith('nvarchar('),
	drizzleImport: () => 'nvarchar',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultToSQL: Char.defaultToSQL,
	toTs: Char.toTs,
};
export const Text: SqlType = {
	is: (type: string) => type === 'text' || type.startsWith('text('),
	drizzleImport: () => 'text',
	defaultFromDrizzle: Char.defaultFromDrizzle,
	defaultFromIntrospect: Char.defaultFromIntrospect,
	defaultToSQL: Char.defaultToSQL,
	toTs: (_options, value) => ({ default: value ? `"${escapeForTsLiteral(value.value)}"` : '' }),
};
export const NText: SqlType = {
	is: (type: string) => type === 'ntext' || type.startsWith('ntext('),
	drizzleImport: () => 'ntext',
	defaultFromDrizzle: Text.defaultFromDrizzle,
	defaultFromIntrospect: Text.defaultFromIntrospect,
	defaultToSQL: Text.defaultToSQL,
	toTs: Text.toTs,
};

export const Decimal: SqlType = {
	is: (type: string) => type === 'decimal' || type.startsWith('decimal('),
	drizzleImport: () => 'decimal',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'number' };
	},
	defaultFromIntrospect: (value) => {
		/**
		 *
		 * create table t2 (
			[numeric1] numeric default '7.52', -> returns ('7.52')
			[numeric2] numeric default 7.52 -> returns ((7.52))
		  );
		 *
		 *
		 */
		const extractedNumber = extractNumber(value);
		if (!extractedNumber) return { type: 'unknown', value: value };

		const numType = checkNumber(extractedNumber);
		if (numType === 'NaN') return { type: 'unknown', value: value };
		if (numType === 'number') return { type: 'number', value: extractedNumber };
		if (numType === 'bigint') return { type: 'bigint', value: extractedNumber };
		assertUnreachable(numType);
	},
	defaultToSQL: (value) => {
		return value ? value.value : '';
	},
	toTs: (incomOptions, value) => {
		const optionsToSet: any = {};
		if (incomOptions) {
			const [p, s] = incomOptions.split(',');
			if (p) optionsToSet['precision'] = Number(p);
			if (s) optionsToSet['scale'] = Number(s);
		}

		if (!value) return { options: optionsToSet, default: '' };

		const numType = checkNumber(value.value);
		if (numType === 'NaN') return { options: optionsToSet, default: `sql\`${value.value}\`` };
		if (numType === 'number') return { options: { ...optionsToSet, mode: 'number' }, default: value.value };
		if (numType === 'bigint') return { options: { ...optionsToSet, mode: 'bigint' }, default: `${value.value}n` };
		assertUnreachable(numType);
	},
};
export const Numeric: SqlType = {
	is: (type: string) => type === 'numeric' || type.startsWith('numeric('),
	drizzleImport: () => 'numeric',
	defaultFromDrizzle: Decimal.defaultFromDrizzle,
	defaultFromIntrospect: Decimal.defaultFromIntrospect,
	defaultToSQL: Decimal.defaultToSQL,
	toTs: Decimal.toTs,
};

export const Float: SqlType = {
	is: (type: string) => type === 'float' || type.startsWith('float('),
	drizzleImport: () => 'float',
	defaultFromDrizzle: (value) => {
		return { value: String(value), type: 'number' };
	},
	defaultFromIntrospect: (value) => {
		/**
		 *
			create table t3 (
				[float1] float default '7.52', -> returns ('7.52')
				[float2] float default 7.52, -> returns ((7.52))
			);
		 *
		 */
		const extractedNumber = extractNumber(value);
		if (!extractedNumber) return { type: 'unknown', value: value };

		const numType = checkNumber(extractedNumber);
		if (numType === 'NaN') return { type: 'unknown', value: value };

		return { type: 'number', value: extractedNumber };
	},
	defaultToSQL: (value) => {
		return value ? value.value : '';
	},
	toTs: (incomOptions, value) => {
		if (!value) return { default: '' };

		let options = {
			precision: incomOptions
				? defaults.options.getFloatPrecisionFrom(Number(incomOptions))
				: defaults.options.float.precision,
		};

		const numType = checkNumber(value.value);
		if (numType === 'NaN') return { options, default: `sql\`${value.value}\`` };
		if (numType === 'number') return { options, default: value.value };
		if (numType === 'bigint') return { options, default: `${value.value}n` };
		assertUnreachable(numType);
	},
};
export const Real: SqlType = {
	is: (type: string) => type === 'real' || type.startsWith('real('),
	drizzleImport: () => 'real',
	defaultFromDrizzle: Float.defaultFromDrizzle,
	defaultFromIntrospect: Float.defaultFromIntrospect,
	defaultToSQL: Float.defaultToSQL,
	toTs: (_incomOptions, value) => {
		if (!value) return { default: '' };

		const numType = checkNumber(value.value);
		if (numType === 'NaN') return { default: `sql\`${value.value}\`` };
		if (numType === 'number') return { default: value.value };
		if (numType === 'bigint') return { default: `${value.value}n` };
		assertUnreachable(numType);
	},
};

export const DateType: SqlType = {
	is: (type) => type === 'date' || type.startsWith('date('),
	drizzleImport: () => 'date',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return {
				value: value.toISOString().split('T')[0],
				type: 'string',
			};
		}

		if (is(value, SQL)) {
			let sql = new MsSqlDialect().sqlToQuery(value).sql;

			return {
				value: sql,
				type: 'unknown',
			};
		}

		return { value: String(value), type: 'string' };
	},
	defaultFromIntrospect: (value: string) => {
		return { value: trimChar(value, "'"), type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';

		if (value.type === 'unknown') return value.value;

		return `'${value.value}'`;
	},
	toTs: (_incomOptions, value) => {
		if (!value) return { default: '' };

		const def = value.value;

		const options: { mode: string } = { mode: 'string' };

		if (def === 'getdate()') return { default: '.defaultGetDate()', raw: true, options };

		if (/^\d{4}-\d{2}-\d{2}$/.test(def)) return { default: `'${def}'`, options };

		return { default: `sql\`${def}\``, options };
	},
};
export const Datetime: SqlType = {
	is: (type) => type === 'datetime' || type.startsWith('datetime('),
	drizzleImport: () => 'datetime',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return {
				value: value.toISOString().replace('T', ' ').replace('Z', ''),
				type: 'string',
			};
		}

		if (is(value, SQL)) {
			let sql = new MsSqlDialect().sqlToQuery(value).sql;

			return {
				value: sql,
				type: 'unknown',
			};
		}

		return { value: String(value), type: 'string' };
	},
	defaultFromIntrospect: (value: string) => {
		return { value: trimChar(value, "'"), type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';

		if (value.type === 'unknown') return value.value;

		return `'${value.value}'`;
	},
	toTs: (_incomOptions, value) => {
		if (!value) return { default: '' };

		const def = value.value;

		const options: { mode: string } = { mode: 'string' };

		if (def === 'getdate()') return { default: '.defaultGetDate()', raw: true, options };

		return { default: `'${def}'`, options };
	},
};
export const Datetime2: SqlType = {
	is: (type) => type === 'datetime2' || type.startsWith('datetime2('),
	drizzleImport: () => 'datetime2',
	defaultFromDrizzle: Datetime.defaultFromDrizzle,
	defaultFromIntrospect: Datetime.defaultFromIntrospect,
	defaultToSQL: Datetime.defaultToSQL,
	toTs: (incomOptions, value) => {
		if (!value) return { default: '' };

		const def = value.value;

		const options: { mode: string; precision: number } = {
			mode: 'string',
			precision: defaults.options.datetime2.precision,
		};
		if (incomOptions) options['precision'] = Number(incomOptions);

		if (def === 'getdate()') return { default: '.defaultGetDate()', raw: true, options };

		return { default: `'${def}'`, options };
	},
};
export const Datetimeoffset: SqlType = {
	is: (type) => type === 'datetimeoffset' || type.startsWith('datetimeoffset('),
	drizzleImport: () => 'datetimeoffset',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return {
				value: value.toISOString(),
				type: 'string',
			};
		}

		if (is(value, SQL)) {
			let sql = new MsSqlDialect().sqlToQuery(value).sql;

			return {
				value: sql,
				type: 'unknown',
			};
		}

		return { value: String(value), type: 'string' };
	},
	defaultFromIntrospect: (value: string) => {
		return { value: trimChar(value, "'"), type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';

		if (value.type === 'unknown') return value.value;

		return `'${value.value}'`;
	},
	toTs: (incomOptions, value) => {
		if (!value) return { default: '' };

		const def = value.value;

		const options: { mode: string; precision: number } = {
			mode: 'string',
			precision: defaults.options.datetimeoffset.precision,
		};
		if (incomOptions) options['precision'] = Number(incomOptions);

		if (def === 'getdate()') return { default: '.defaultGetDate()', raw: true, options };

		return { default: `'${def}'`, options };
	},
};
export const Time: SqlType = {
	is: (type) => type === 'time' || type.startsWith('time('),
	drizzleImport: () => 'time',
	defaultFromDrizzle: (value: unknown) => {
		if (value instanceof Date) {
			return {
				value: value.toISOString().split('T')[1].replace('Z', ''),
				type: 'string',
			};
		}

		if (is(value, SQL)) {
			let sql = new MsSqlDialect().sqlToQuery(value).sql;

			return {
				value: sql,
				type: 'unknown',
			};
		}

		return { value: String(value), type: 'string' };
	},
	defaultFromIntrospect: (value: string) => {
		return { value: trimChar(value, "'"), type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';

		if (value.type === 'unknown') return value.value;

		return `'${value.value}'`;
	},
	toTs: (incomOptions, value) => {
		if (!value) return { default: '' };

		const def = value.value;

		const options: { mode: string; precision: number } = {
			mode: 'string',
			precision: defaults.options.time.precision,
		};
		if (incomOptions) options['precision'] = Number(incomOptions);

		return { default: `'${def}'`, options };
	},
};

export const Binary: SqlType = {
	is: (type) => type === 'binary' || type.startsWith('binary('),
	drizzleImport: () => 'binary',
	defaultFromDrizzle: (value) => {
		if (Buffer.isBuffer(value)) {
			return { value: bufferToBinary(value), type: 'binary' };
		}
		throw Error('unexpected binary default');
	},
	defaultFromIntrospect: (value) => {
		return { value: value, type: 'unknown' };
	},
	defaultToSQL: (value) => {
		if (!value) return '';
		return value ? value.value : '';
	},
	toTs: (options, value) => {
		const optionsToSet: { length: number | 'max' } = { length: defaults.options.binary.length };
		if (options) optionsToSet['length'] = options === 'max' ? 'max' : Number(options);

		const def = value ? `sql\`${value.value}\`` : '';
		return { options: optionsToSet, default: def };
	},
};
export const Varbinary: SqlType = {
	is: (type) => type === 'varbinary' || type.startsWith('varbinary('),
	drizzleImport: () => 'varbinary',
	defaultFromDrizzle: Binary.defaultFromDrizzle,
	defaultFromIntrospect: Binary.defaultFromIntrospect,
	defaultToSQL: Binary.defaultToSQL,
	toTs: Binary.toTs,
};

export const typeFor = (sqlType: string): SqlType | null => {
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
	return null;
};
