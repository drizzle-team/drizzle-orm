import { type CastCodec, type Codecs, refineCodecs } from '~/codecs.ts';
import { sql } from '~/sql/sql.ts';
import type { PartialWithUndefined } from '~/utils.ts';

export type SQLiteType =
	// Integer
	| 'integer'
	| 'integer:boolean'
	| 'integer:timestamp'
	| 'integer:timestamp_ms'
	// Real
	| 'real'
	// Text
	| 'text'
	| 'text:json'
	// Blob
	| 'blob'
	| 'blob:json'
	| 'blob:bigint'
	// Numeric
	| 'numeric'
	| 'numeric:number'
	| 'numeric:bigint';

const SQLITE_ALIAS_TO_TYPE_MAP = {
	int: 'integer',
	int2: 'integer',
	int8: 'integer',
	tinyint: 'integer',
	smallint: 'integer',
	mediumint: 'integer',
	bool: 'integer:boolean',
	boolean: 'integer:boolean',
	float: 'real',
	double: 'real',
	'double precision': 'real',
	decimal: 'numeric',
	character: 'text',
	varchar: 'text',
	'varying character': 'text',
	nchar: 'text',
	'native character': 'text',
	nvarchar: 'text',
	clob: 'text',
	json: 'text:json',
} as const satisfies Record<string, SQLiteType>;

export type SQLiteAliasType = keyof typeof SQLITE_ALIAS_TO_TYPE_MAP;

export type SQLiteColumnType =
	| SQLiteType
	| SQLiteAliasType;

export function resolveSQLiteTypeAlias(type: string) {
	return (SQLITE_ALIAS_TO_TYPE_MAP as Record<string, SQLiteType | undefined>)[type] ?? type;
}

export type SQLiteCodecs = Codecs<SQLiteType>;

export const castToText: CastCodec = (name) => sql`cast(${name} as text)`;
export const castToHex: CastCodec = (name) => sql`hex(${name})`;

const uint8ArrayFromHex = (value: string): Uint8Array => {
	const bytes = new Uint8Array(value.length >> 1);
	for (let i = 0; i < bytes.length; ++i) bytes[i] = Number.parseInt(value.substring(i * 2, i * 2 + 2), 16);
	return bytes;
};

export const bufferFromHex = typeof Buffer === 'undefined'
	? uint8ArrayFromHex
	: (value: string): Buffer => Buffer.from(value, 'hex');

export const bufferFromBytes = (value: Uint8Array): Buffer =>
	Buffer.from(value.buffer, value.byteOffset, value.byteLength);
export const bufferFromBytesIfAvailable = typeof Buffer === 'undefined' ? undefined : bufferFromBytes;
export const bufferFromBinary = (value: ArrayBuffer | ArrayLike<number>): Buffer => Buffer.from(value as ArrayBuffer);
export const bufferFromBinaryIfAvailable = typeof Buffer === 'undefined'
	? (value: ArrayBuffer | ArrayLike<number>): Uint8Array => new Uint8Array(value as ArrayBuffer)
	: bufferFromBinary;

const utf8Encoder = typeof Buffer === 'undefined' ? new TextEncoder() : undefined;
export const bytesFromUtf8 = utf8Encoder
	? (value: string): Buffer => utf8Encoder.encode(value) as Buffer
	: (value: string): Buffer => Buffer.from(value);

export const dateFromSeconds = (value: number): Date => new Date(value * 1000);
export const dateFromMilliseconds = (value: number): Date => new Date(value);
// Sqlite picks a storage class per row, so the two scenarios only separate on the value itself
export const dateFromStoredSeconds = (value: number | string): Date =>
	typeof value === 'string' ? new Date(value.replaceAll('"', '')) : new Date(value * 1000);
export const dateFromStoredMilliseconds = (value: number | string): Date =>
	typeof value === 'string' ? new Date(value.replaceAll('"', '')) : new Date(value);
export const booleanFromInteger = (value: number): boolean => value === 1;

export const genericSQLiteCodecs = {
	'integer:boolean': {
		normalizeInJson: booleanFromInteger,
	},
	'integer:timestamp': {
		normalizeInJson: dateFromStoredSeconds,
	},
	'integer:timestamp_ms': {
		normalizeInJson: dateFromStoredMilliseconds,
	},
	'text:json': {
		normalizeInJson: JSON.parse,
	},
	blob: {
		castInJson: castToHex,
		normalizeInJson: bufferFromHex,
	},
	'blob:json': {
		castInJson: castToText,
		normalizeInJson: JSON.parse,
	},
	'blob:bigint': {
		castInJson: castToText,
		normalizeInJson: BigInt,
	},
	numeric: {
		castInJson: castToText,
		normalizeInJson: String,
	},
	'numeric:number': {
		castInJson: castToText,
		normalizeInJson: Number,
	},
	'numeric:bigint': {
		castInJson: castToText,
		normalizeInJson: BigInt,
	},
} as const satisfies SQLiteCodecs;

export const unionsTypeTable = {
	integer: {
		integer: 'integer',
		'integer:boolean': 'integer',
		'integer:timestamp': 'integer',
		'integer:timestamp_ms': 'integer',
		real: 'integer',
		text: 'integer',
		'text:json': 'integer',
		blob: 'integer',
		'blob:json': 'integer',
		'blob:bigint': 'integer',
		numeric: 'integer',
		'numeric:number': 'integer',
		'numeric:bigint': 'integer',
	},
	'integer:boolean': {
		integer: 'integer:boolean',
		'integer:boolean': 'integer:boolean',
		'integer:timestamp': 'integer:boolean',
		'integer:timestamp_ms': 'integer:boolean',
		real: 'integer:boolean',
		text: 'integer:boolean',
		'text:json': 'integer:boolean',
		blob: 'integer:boolean',
		'blob:json': 'integer:boolean',
		'blob:bigint': 'integer:boolean',
		numeric: 'integer:boolean',
		'numeric:number': 'integer:boolean',
		'numeric:bigint': 'integer:boolean',
	},
	'integer:timestamp': {
		integer: 'integer:timestamp',
		'integer:boolean': 'integer:timestamp',
		'integer:timestamp': 'integer:timestamp',
		'integer:timestamp_ms': 'integer:timestamp',
		real: 'integer:timestamp',
		text: 'integer:timestamp',
		'text:json': 'integer:timestamp',
		blob: 'integer:timestamp',
		'blob:json': 'integer:timestamp',
		'blob:bigint': 'integer:timestamp',
		numeric: 'integer:timestamp',
		'numeric:number': 'integer:timestamp',
		'numeric:bigint': 'integer:timestamp',
	},
	'integer:timestamp_ms': {
		integer: 'integer:timestamp_ms',
		'integer:boolean': 'integer:timestamp_ms',
		'integer:timestamp': 'integer:timestamp_ms',
		'integer:timestamp_ms': 'integer:timestamp_ms',
		real: 'integer:timestamp_ms',
		text: 'integer:timestamp_ms',
		'text:json': 'integer:timestamp_ms',
		blob: 'integer:timestamp_ms',
		'blob:json': 'integer:timestamp_ms',
		'blob:bigint': 'integer:timestamp_ms',
		numeric: 'integer:timestamp_ms',
		'numeric:number': 'integer:timestamp_ms',
		'numeric:bigint': 'integer:timestamp_ms',
	},
	real: {
		integer: 'real',
		'integer:boolean': 'real',
		'integer:timestamp': 'real',
		'integer:timestamp_ms': 'real',
		real: 'real',
		text: 'real',
		'text:json': 'real',
		blob: 'real',
		'blob:json': 'real',
		'blob:bigint': 'real',
		numeric: 'real',
		'numeric:number': 'real',
		'numeric:bigint': 'real',
	},
	text: {
		integer: 'text',
		'integer:boolean': 'text',
		'integer:timestamp': 'text',
		'integer:timestamp_ms': 'text',
		real: 'text',
		text: 'text',
		'text:json': 'text',
		blob: 'text',
		'blob:json': 'text',
		'blob:bigint': 'text',
		numeric: 'numeric',
		'numeric:number': 'text',
		'numeric:bigint': 'text',
	},
	'text:json': {
		integer: 'text:json',
		'integer:boolean': 'text:json',
		'integer:timestamp': 'text:json',
		'integer:timestamp_ms': 'text:json',
		real: 'text:json',
		text: 'text:json',
		'text:json': 'text:json',
		blob: 'text:json',
		'blob:json': 'blob:json',
		'blob:bigint': 'text:json',
		numeric: 'text:json',
		'numeric:number': 'text:json',
		'numeric:bigint': 'text:json',
	},
	blob: {
		integer: 'blob',
		'integer:boolean': 'blob',
		'integer:timestamp': 'blob',
		'integer:timestamp_ms': 'blob',
		real: 'blob',
		text: 'blob',
		'text:json': 'blob',
		blob: 'blob',
		'blob:json': 'blob',
		'blob:bigint': 'blob',
		numeric: 'blob',
		'numeric:number': 'blob',
		'numeric:bigint': 'blob',
	},
	'blob:json': {
		integer: 'blob:json',
		'integer:boolean': 'blob:json',
		'integer:timestamp': 'blob:json',
		'integer:timestamp_ms': 'blob:json',
		real: 'blob:json',
		text: 'blob:json',
		'text:json': 'blob:json',
		blob: 'blob:json',
		'blob:json': 'blob:json',
		'blob:bigint': 'blob:json',
		numeric: 'blob:json',
		'numeric:number': 'blob:json',
		'numeric:bigint': 'blob:json',
	},
	'blob:bigint': {
		integer: 'blob:bigint',
		'integer:boolean': 'blob:bigint',
		'integer:timestamp': 'blob:bigint',
		'integer:timestamp_ms': 'blob:bigint',
		real: 'blob:bigint',
		text: 'blob:bigint',
		'text:json': 'blob:bigint',
		blob: 'blob:bigint',
		'blob:json': 'blob:bigint',
		'blob:bigint': 'blob:bigint',
		numeric: 'blob:bigint',
		'numeric:number': 'blob:bigint',
		'numeric:bigint': 'blob:bigint',
	},
	numeric: {
		integer: 'numeric',
		'integer:boolean': 'numeric',
		'integer:timestamp': 'numeric',
		'integer:timestamp_ms': 'numeric',
		real: 'numeric',
		text: 'numeric',
		'text:json': 'numeric',
		blob: 'numeric',
		'blob:json': 'numeric',
		'blob:bigint': 'numeric',
		numeric: 'numeric',
		'numeric:number': 'numeric',
		'numeric:bigint': 'numeric',
	},
	'numeric:number': {
		integer: 'numeric:number',
		'integer:boolean': 'numeric:number',
		'integer:timestamp': 'numeric:number',
		'integer:timestamp_ms': 'numeric:number',
		real: 'numeric:number',
		text: 'numeric:number',
		'text:json': 'numeric:number',
		blob: 'numeric:number',
		'blob:json': 'numeric:number',
		'blob:bigint': 'numeric:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
	},
	'numeric:bigint': {
		integer: 'numeric:bigint',
		'integer:boolean': 'numeric:bigint',
		'integer:timestamp': 'numeric:bigint',
		'integer:timestamp_ms': 'numeric:bigint',
		real: 'numeric:bigint',
		text: 'numeric:bigint',
		'text:json': 'numeric:bigint',
		blob: 'numeric:bigint',
		'blob:json': 'numeric:bigint',
		'blob:bigint': 'numeric:bigint',
		numeric: 'numeric:bigint',
		'numeric:number': 'numeric:bigint',
		'numeric:bigint': 'numeric:bigint',
	},
} as const satisfies Record<SQLiteType, Record<SQLiteType, SQLiteType>>;

export function resolveUnionType(left: SQLiteType, right: SQLiteType): SQLiteType | undefined {
	return (unionsTypeTable as Record<string, Record<string, SQLiteType> | undefined>)[left]?.[right];
}

export const refineSqliteCodecs = (extension?: PartialWithUndefined<SQLiteCodecs>): SQLiteCodecs =>
	refineCodecs<SQLiteType>(genericSQLiteCodecs, extension);
