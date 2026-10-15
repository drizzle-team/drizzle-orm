import { type CastCodec, type Codecs, refineCodecs } from '~/codecs.ts';
import { sql } from '~/sql/sql.ts';
import type { PartialWithUndefined } from '~/utils.ts';

export type MsSqlType =
	// Numeric
	| 'tinyint'
	| 'smallint'
	| 'int'
	| 'bigint'
	| 'bigint:number'
	| 'bigint:string'
	| 'decimal'
	| 'decimal:number'
	| 'decimal:bigint'
	| 'numeric'
	| 'numeric:number'
	| 'numeric:bigint'
	| 'float'
	| 'real'
	// Boolean
	| 'bit'
	// Text
	| 'char'
	| 'varchar'
	| 'varchar:json'
	| 'text'
	// Binary
	| 'binary'
	| 'varbinary'
	// Datetime
	| 'date'
	| 'date:string'
	| 'datetime'
	| 'datetime:string'
	| 'datetime2'
	| 'datetime2:string'
	| 'datetimeoffset'
	| 'datetimeoffset:string'
	| 'time'
	| 'time:string';

const MSSQL_ALIAS_TO_TYPE_MAP = {
	dec: 'decimal',
	'national char': 'char',
	nchar: 'char',
	'national character': 'char',
	'character varying': 'varchar',
	'char varying': 'varchar',
	character: 'char',
	nvarchar: 'varchar',
	'national char varying': 'varchar',
	'national character varying': 'varchar',
	ntext: 'text',
	'binary varying': 'varbinary',
	rowversion: 'varbinary',
	timestamp: 'varbinary',
	smalldatetime: 'datetime',
	smallmoney: 'decimal',
	money: 'decimal',
	'double precision': 'float',
} as const satisfies Record<string, MsSqlType>;

export type MsSqlAliasType = keyof typeof MSSQL_ALIAS_TO_TYPE_MAP;

export type MsSqlColumnType =
	| MsSqlType
	| MsSqlAliasType;

export function resolveMsSqlTypeAlias(type: string) {
	return (MSSQL_ALIAS_TO_TYPE_MAP as Record<string, MsSqlType | undefined>)[type] ?? type;
}

export type MsSqlCodecs = Codecs<MsSqlType>;

export const castToText: CastCodec = (name) => sql`cast(${name} as varchar(max))`;
export const bufferFromBase64 = (value: string): Buffer => Buffer.from(value, 'base64');
export const dateFromZonelessJson = (value: string): Date => new Date(`${value}Z`);

export const genericMsSqlCodecs = {
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
	numeric: {
		castInJson: castToText,
	},
	'numeric:number': {
		castInJson: castToText,
		normalizeInJson: Number,
	},
	'numeric:bigint': {
		castInJson: castToText,
		normalizeInJson: BigInt,
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
	datetime: {
		normalizeInJson: dateFromZonelessJson,
	},
	'datetime:string': {
		normalizeInJson: (value: string) => dateFromZonelessJson(value).toISOString(),
	},
	datetime2: {
		normalizeInJson: dateFromZonelessJson,
	},
	'datetime2:string': {
		normalizeInJson: (value: string) => dateFromZonelessJson(value).toISOString(),
	},
	datetimeoffset: {
		normalizeInJson: (value: string) => new Date(value),
	},
	date: {
		normalizeInJson: (value: string) => new Date(value),
	},
	time: {
		normalizeInJson: (value: string) => new Date(`1970-01-01T${value}Z`),
	},
	'time:string': {
		// `for json path` trims trailing fractional zeros
		normalizeInJson: (value: string) => {
			const [time, fraction] = value.split('.');
			return `${time}.${(fraction ?? '').padEnd(3, '0').slice(0, 3)}`;
		},
	},
	binary: {
		normalizeInJson: bufferFromBase64,
	},
	varbinary: {
		normalizeInJson: bufferFromBase64,
	},
} as const satisfies MsSqlCodecs;

export const refineGenericMsSqlCodecs = (extension?: PartialWithUndefined<MsSqlCodecs>): MsSqlCodecs =>
	refineCodecs<MsSqlType>(genericMsSqlCodecs, extension);

// MSSQL resolves set operator results by type's rank regardless of union order
const TYPE_PRECEDENCE: readonly MsSqlType[][] = [
	['datetimeoffset', 'datetimeoffset:string'],
	['datetime2', 'datetime2:string'],
	['datetime', 'datetime:string'],
	['date', 'date:string'],
	['time', 'time:string'],
	['float'],
	['real'],
	['decimal', 'decimal:number', 'decimal:bigint', 'numeric', 'numeric:number', 'numeric:bigint'],
	['bigint', 'bigint:number', 'bigint:string'],
	['int'],
	['smallint'],
	['tinyint'],
	['bit'],
	['text'],
	['varchar', 'varchar:json'],
	['char'],
	['varbinary'],
	['binary'],
];

const TYPE_RANK: Partial<Record<MsSqlType, number>> = Object.fromEntries(
	TYPE_PRECEDENCE.flatMap((group, rank) => group.map((type) => [type, rank])),
);

export function resolveUnionType(left: MsSqlType, right: MsSqlType): MsSqlType | undefined {
	const l = TYPE_RANK[left];
	const r = TYPE_RANK[right];
	if (l === undefined || r === undefined) return undefined;

	return r < l ? right : left;
}
