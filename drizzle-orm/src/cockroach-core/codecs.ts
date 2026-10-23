import type { CastArrayCodec, CastCodec, Codecs, NormalizeArrayCodec, NormalizeCodec } from '~/codecs.ts';
import { refineCodecs } from '~/codecs.ts';
import { sql } from '~/sql/sql.ts';
import type { PartialWithUndefined } from '~/utils.ts';
import { makeCockroachArray, parseCockroachArray } from './array.ts';
import { parseEWKB } from './columns/utils.ts';

export type CockroachType =
	// Numeric
	| 'int2'
	| 'int4'
	| 'int8'
	| 'int8:number'
	| 'decimal'
	| 'decimal:number'
	| 'decimal:bigint'
	| 'float'
	| 'real'
	// Boolean
	| 'bool'
	// Text
	| 'char'
	| 'varchar'
	| 'string'
	| 'enum'
	// Bit
	| 'bit'
	| 'varbit'
	// Datetime
	| 'date'
	| 'date:string'
	| 'time'
	| 'timestamp'
	| 'timestamp:string'
	| 'timestamptz'
	| 'timestamptz:string'
	| 'interval'
	// Structured
	| 'jsonb'
	| 'uuid'
	| 'inet'
	| 'vector'
	| 'geometry'
	| 'geometry:xy';

const COCKROACH_ALIAS_TO_TYPE_MAP = {
	smallint: 'int2',
	int2: 'int2',
	integer: 'int4',
	int: 'int4',
	int4: 'int4',
	bigint: 'int8',
	int64: 'int8',
	int8: 'int8',
	numeric: 'decimal',
	dec: 'decimal',
	float8: 'float',
	'double precision': 'float',
	float4: 'real',
	boolean: 'bool',
	character: 'char',
	'character varying': 'varchar',
	text: 'string',
	timestamptz: 'timestamptz',
	timetz: 'time',
	'bit varying': 'varbit',
} as const satisfies Record<string, CockroachType>;

export type CockroachAliasType = keyof typeof COCKROACH_ALIAS_TO_TYPE_MAP;

export type CockroachColumnType =
	| CockroachType
	| CockroachAliasType;

export function resolveCockroachTypeAlias(type: string) {
	return (COCKROACH_ALIAS_TO_TYPE_MAP as Record<string, CockroachType | undefined>)[type] ?? type;
}

export type CockroachCodecs = Codecs<CockroachType>;

export const castToText: CastCodec = (name) => sql`${name}::text`;
export const castToTextArr: CastArrayCodec = (name, arrayDimensions) =>
	sql`${name}::text${sql.raw('[]'.repeat(arrayDimensions))}`;

export const arrayCompatNormalize = (normalize: NormalizeCodec) => {
	const loop: NormalizeArrayCodec = (value, arrayDimensions) => {
		if (value === null) return value;

		const innerDimensions = arrayDimensions - 1;
		if (arrayDimensions > 1) {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				loop((value as unknown[][])[i]!, innerDimensions);
			}
		} else {
			for (let i = 0; i < (value as unknown[]).length; ++i) {
				value[i] = value[i] === null ? null : normalize(value[i]);
			}
		}

		return value;
	};

	return loop;
};

export const parseArrayAndNormalize = (normalize: NormalizeCodec, delim?: string): NormalizeArrayCodec => {
	const codec = arrayCompatNormalize(normalize);
	return (value, arrayDimensions) =>
		codec(typeof value === 'string' ? parseCockroachArray(value, delim) : value, arrayDimensions);
};

export const parseGeometryArrayAndNormalize = (normalize: NormalizeCodec): NormalizeArrayCodec =>
	parseArrayAndNormalize(normalize, ':');
export const makeGeometryArray: NormalizeArrayCodec = (value) => makeCockroachArray(value, ':');

export const parseArray: NormalizeArrayCodec = (value) => parseCockroachArray(value);

export const parseCockroachVector = (v: string): number[] => {
	const body = v.slice(1, -1);
	if (!body.length) return [];
	return body.split(',').map(Number.parseFloat);
};

export const parseGeometryTuple = (v: string): [number, number] => parseEWKB(v).point;
export const parseGeometryXY = (v: string): { x: number; y: number } => {
	const parsed = parseEWKB(v);
	return { x: parsed.point[0], y: parsed.point[1] };
};

export const textToDate = (v: string): Date => new Date(v);
export const textToDateWithTz = (v: string): Date => new Date(v + '+0000');

export const genericCockroachCodecs = {
	int2: {
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	int4: {
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	real: {
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	float: {
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	int8: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
	},
	'int8:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	decimal: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	'decimal:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	'decimal:bigint': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
	},
	date: {
		normalizeInJson: textToDate,
		normalizeArrayInJson: arrayCompatNormalize(textToDate),
	},
	timestamp: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: textToDateWithTz,
		normalizeArrayInJson: arrayCompatNormalize(textToDateWithTz),
	},
	'timestamp:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	timestamptz: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: textToDate,
		normalizeArrayInJson: arrayCompatNormalize(textToDate),
	},
	'timestamptz:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	geometry: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parseGeometryTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryTuple),
	},
	'geometry:xy': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parseGeometryXY,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryXY),
	},
	vector: {
		normalizeInJson: parseCockroachVector,
		normalizeArrayInJson: arrayCompatNormalize(parseCockroachVector),
	},
} as const satisfies CockroachCodecs;

export const unionsTypeTable = {
	int2: {
		int2: 'int2',
		int4: 'int4',
		int8: 'int8:number',
		'int8:number': 'int8:number',
		decimal: 'decimal:number',
		'decimal:number': 'decimal:number',
		'decimal:bigint': 'decimal:number',
		float: 'float',
		real: 'real',
	},
	int4: {
		int2: 'int4',
		int4: 'int4',
		int8: 'int8:number',
		'int8:number': 'int8:number',
		decimal: 'decimal:number',
		'decimal:number': 'decimal:number',
		'decimal:bigint': 'decimal:number',
		float: 'float',
		real: 'real',
	},
	int8: {
		int2: 'int8',
		int4: 'int8',
		int8: 'int8',
		'int8:number': 'int8',
		decimal: 'decimal:bigint',
		'decimal:number': 'decimal:bigint',
		'decimal:bigint': 'decimal:bigint',
		float: 'float',
		real: 'real',
	},
	'int8:number': {
		int2: 'int8:number',
		int4: 'int8:number',
		int8: 'int8:number',
		'int8:number': 'int8:number',
		decimal: 'decimal:number',
		'decimal:number': 'decimal:number',
		'decimal:bigint': 'decimal:number',
		float: 'float',
		real: 'real',
	},
	decimal: {
		int2: 'decimal',
		int4: 'decimal',
		int8: 'decimal',
		'int8:number': 'decimal',
		decimal: 'decimal',
		'decimal:number': 'decimal',
		'decimal:bigint': 'decimal',
		float: 'decimal',
		real: 'decimal',
	},
	'decimal:number': {
		int2: 'decimal:number',
		int4: 'decimal:number',
		int8: 'decimal:number',
		'int8:number': 'decimal:number',
		decimal: 'decimal:number',
		'decimal:number': 'decimal:number',
		'decimal:bigint': 'decimal:number',
		float: 'decimal:number',
		real: 'decimal:number',
	},
	'decimal:bigint': {
		int2: 'decimal:bigint',
		int4: 'decimal:bigint',
		int8: 'decimal:bigint',
		'int8:number': 'decimal:bigint',
		decimal: 'decimal:bigint',
		'decimal:number': 'decimal:bigint',
		'decimal:bigint': 'decimal:bigint',
		float: 'decimal:bigint',
		real: 'decimal:bigint',
	},
	float: {
		int2: 'float',
		int4: 'float',
		int8: 'float',
		'int8:number': 'float',
		decimal: 'decimal:number',
		'decimal:number': 'decimal:number',
		'decimal:bigint': 'decimal:number',
		float: 'float',
		real: 'float',
	},
	real: {
		int2: 'real',
		int4: 'real',
		int8: 'real',
		'int8:number': 'real',
		decimal: 'decimal:number',
		'decimal:number': 'decimal:number',
		'decimal:bigint': 'decimal:number',
		float: 'float',
		real: 'real',
	},
	bool: {
		bool: 'bool',
	},
	char: {
		char: 'char',
		varchar: 'varchar',
		string: 'char',
	},
	varchar: {
		char: 'varchar',
		varchar: 'varchar',
		string: 'varchar',
	},
	string: {
		char: 'char',
		varchar: 'varchar',
		string: 'string',
	},
	enum: {
		enum: 'enum',
	},
	bit: {
		bit: 'bit',
		varbit: 'varbit',
	},
	varbit: {
		bit: 'varbit',
		varbit: 'varbit',
	},
	date: {
		date: 'date',
		'date:string': 'date',
	},
	'date:string': {
		date: 'date:string',
		'date:string': 'date:string',
	},
	time: {
		time: 'time',
	},
	timestamp: {
		timestamp: 'timestamp',
		'timestamp:string': 'timestamp',
	},
	'timestamp:string': {
		timestamp: 'timestamp:string',
		'timestamp:string': 'timestamp:string',
	},
	timestamptz: {
		timestamptz: 'timestamptz',
		'timestamptz:string': 'timestamptz',
	},
	'timestamptz:string': {
		timestamptz: 'timestamptz:string',
		'timestamptz:string': 'timestamptz:string',
	},
	interval: {
		interval: 'interval',
	},
	jsonb: {
		jsonb: 'jsonb',
	},
	uuid: {
		uuid: 'uuid',
	},
	inet: {
		inet: 'inet',
	},
	vector: {
		vector: 'vector',
	},
	geometry: {
		geometry: 'geometry',
		'geometry:xy': 'geometry',
	},
	'geometry:xy': {
		geometry: 'geometry:xy',
		'geometry:xy': 'geometry:xy',
	},
} as const satisfies Record<string, Partial<Record<CockroachType, CockroachType>>>;

export function resolveUnionType(left: CockroachType, right: CockroachType): CockroachType | undefined {
	return (unionsTypeTable as Record<string, Record<string, CockroachType> | undefined>)[left]?.[right];
}

export const refineGenericCockroachCodecs = (extension?: PartialWithUndefined<CockroachCodecs>): CockroachCodecs =>
	refineCodecs<CockroachType>(genericCockroachCodecs, extension);
