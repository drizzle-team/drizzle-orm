import { type CastCodec, type Codecs, refineCodecs } from '~/codecs.ts';
import { sql } from '~/sql/sql.ts';
import type { PartialWithUndefined } from '~/utils.ts';

export type MySqlType =
	// Numeric
	| 'tinyint'
	| 'smallint'
	| 'mediumint'
	| 'int'
	| 'bigint'
	| 'bigint:number'
	| 'bigint:string'
	| 'serial'
	| 'decimal'
	| 'decimal:number'
	| 'decimal:bigint'
	| 'float'
	| 'double'
	| 'real'
	| 'bit'
	// Boolean
	| 'boolean'
	// Text
	| 'char'
	| 'varchar'
	| 'tinytext'
	| 'text'
	| 'mediumtext'
	| 'longtext'
	// Enumerated
	| 'enum'
	| 'set'
	// Binary
	| 'binary'
	| 'varbinary'
	| 'tinyblob'
	| 'tinyblob:buffer'
	| 'blob'
	| 'blob:buffer'
	| 'mediumblob'
	| 'mediumblob:buffer'
	| 'longblob'
	| 'longblob:buffer'
	// Datetime
	| 'date'
	| 'date:string'
	| 'datetime'
	| 'datetime:string'
	| 'time'
	| 'timestamp'
	| 'timestamp:string'
	| 'year'
	// JSON
	| 'json'
	// Spatial
	| 'geometry'
	| 'point'
	| 'linestring'
	| 'polygon'
	| 'multipoint'
	| 'multilinestring'
	| 'multipolygon'
	| 'geometrycollection';

// Some originals were swapped with aliases for simpler keys
export type MySqlAliasType =
	// Numeric
	| 'integer' // int
	| 'int1' // tinyint
	| 'int2' // smallint
	| 'int3' // mediumint
	| 'middleint' // mediumint
	| 'int4' // int
	| 'int8' // bigint
	| 'dec' // decimal
	| 'fixed' // decimal
	| 'numeric' // decimal
	| 'double precision' // double
	// Boolean
	| 'bool' // boolean
	// Text
	| 'character' // char
	| 'nchar' // char
	| 'national char' // char
	| 'national character' // char
	| 'character varying' // varchar
	| 'char varying' // varchar
	| 'nvarchar' // varchar
	| 'national varchar' // varchar
	| 'national character varying' // varchar
	| 'long varchar' // mediumtext
	| 'long' // mediumtext
	// Binary
	| 'long varbinary'; // mediumblob

export type MySqlColumnType =
	| MySqlType
	| MySqlAliasType;

const MYSQL_ALIAS_TO_TYPE_MAP: Record<MySqlAliasType, MySqlType> = {
	integer: 'int',
	int1: 'tinyint',
	int2: 'smallint',
	int3: 'mediumint',
	middleint: 'mediumint',
	int4: 'int',
	int8: 'bigint',
	dec: 'decimal',
	fixed: 'decimal',
	numeric: 'decimal',
	'double precision': 'double',
	bool: 'boolean',
	character: 'char',
	nchar: 'char',
	'national char': 'char',
	'national character': 'char',
	'character varying': 'varchar',
	'char varying': 'varchar',
	nvarchar: 'varchar',
	'national varchar': 'varchar',
	'national character varying': 'varchar',
	'long varchar': 'mediumtext',
	long: 'mediumtext',
	'long varbinary': 'mediumblob',
};

export function resolveMySqlTypeAlias(type: string) {
	return (MYSQL_ALIAS_TO_TYPE_MAP as Record<string, MySqlType | undefined>)[type] ?? type;
}

export type MySqlCodecs = Codecs<MySqlType>;

export const castToText: CastCodec = (name) => sql`cast(${name} as char)`;

/** Recover float32 casted to double
 *
 * Needed to avoid db\driver-side rounding
 */
export const floatFromDouble = (value: number): number => {
	const f = Math.fround(value);
	if (!Number.isFinite(f)) return f;

	for (let precision = 1; precision <= 9; precision++) {
		const candidate = Number(f.toPrecision(precision));
		if (Math.fround(candidate) === f) return candidate;
	}

	return f;
};

/** Recover float32 casted to double -> string
 *
 * Needed to avoid db\driver-side rounding
 */
export const floatFromDoubleString = (value: string): number => {
	const f = Math.fround(Number(value));
	if (!Number.isFinite(f)) return f;

	for (let precision = 1; precision <= 9; precision++) {
		const candidate = Number(f.toPrecision(precision));
		if (Math.fround(candidate) === f) return candidate;
	}

	return f;
};

export const genericMySqlCodecs = {
	// TODO: codecs for set operators
	// tinyint: {
	// 	normalize: (v) => typeof v === 'number' ? v : Number(v),
	// },
	// smallint: {
	// 	normalize: (v) => typeof v === 'number' ? v : Number(v),
	// },
	// mediumint: {
	// 	normalize: (v) => typeof v === 'number' ? v : Number(v),
	// },
	// int: {
	// 	normalize: (v) => typeof v === 'number' ? v : Number(v),
	// },
	// serial: {
	// 	normalize: (v) => typeof v === 'number' ? v : Number(v),
	// },

	boolean: {
		normalizeInJson: Boolean,
	},
	date: {
		normalizeInJson: (value: string) => new Date(value),
	},
	float: {
		normalizeInJson: floatFromDoubleString,
	},
	bigint: {
		castInJson: castToText,
		normalizeInJson: BigInt,
	},
	'bigint:number': {
		castInJson: castToText,
		normalizeInJson: Number,
	},
	'bigint:string': {
		castInJson: castToText,
	},
	time: {
		castInJson: castToText,
	},
	timestamp: {
		castInJson: castToText,
		normalizeInJson: (v: string): Date => new Date(v + '+0000'),
	},
	'timestamp:string': {
		castInJson: castToText,
	},
	datetime: {
		castInJson: castToText,
		normalizeInJson: (value: string) => new Date(value.replace(' ', 'T') + 'Z'),
	},
	'datetime:string': {
		castInJson: castToText,
	},
	decimal: {
		castInJson: castToText,
	},
	'decimal:number': {
		castInJson: castToText,
		normalizeInJson: Number,
	},
	'decimal:bigint': {
		castInJson: castToText,
		normalizeInJson: BigInt,
	},
	binary: {
		castInJson: castToText,
	},
	varbinary: {
		castInJson: castToText,
	},
	tinyblob: {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: atob,
	},
	'tinyblob:buffer': {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: (value: string) => Buffer.from(value, 'base64'),
	},
	blob: {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: atob,
	},
	'blob:buffer': {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: (value: string) => Buffer.from(value, 'base64'),
	},
	mediumblob: {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: atob,
	},
	'mediumblob:buffer': {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: (value: string) => Buffer.from(value, 'base64'),
	},
	longblob: {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: atob,
	},
	'longblob:buffer': {
		castInJson: (name) => sql`to_base64(${name})`,
		normalizeInJson: (value: string) => Buffer.from(value, 'base64'),
	},
} as const satisfies MySqlCodecs;

export const refineGenericMySqlCodecs = (extension?: PartialWithUndefined<MySqlCodecs>): MySqlCodecs =>
	refineCodecs<MySqlType>(genericMySqlCodecs, extension);
