import { assertUnreachable } from '../../utils';
import { Column, DefaultConstraint, MssqlEntities } from './ddl';
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
	def: DefaultConstraint['default'] | null,
) => {
	if (!def) return '';

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
