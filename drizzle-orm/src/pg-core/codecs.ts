import {
	type CastArrayCodec,
	type CastCodec,
	type Codecs,
	type NormalizeArrayCodec,
	type NormalizeCodec,
	refineCodecs,
} from '~/codecs.ts';
import { type Name, sql, type SQLChunk } from '~/sql/sql.ts';
import type { PartialWithUndefined } from '~/utils.ts';
import { makePgArray, parsePgArray } from './utils/array.ts';

export type PostgresType =
	// Numeric
	| 'smallint'
	| 'int'
	| 'bigint'
	| 'numeric'
	| 'float4'
	| 'float8'
	| 'money'
	| 'smallserial'
	| 'serial'
	| 'bigserial'
	// Text
	| 'char'
	| 'varchar'
	| 'text'
	// Binary
	| 'bytea'
	// Datetime
	| 'date'
	| 'time'
	| 'timetz'
	| 'timestamp'
	| 'timestamptz'
	| 'interval'
	// Boolean
	| 'bool'
	// Enumerated
	| 'enum'
	// Geometric
	| 'point'
	| 'line'
	| 'lseg'
	| 'box'
	| 'path'
	| 'polygon'
	| 'circle'
	// Network Address
	| 'cidr'
	| 'inet'
	| 'macaddr'
	| 'macaddr8'
	// Bit String
	| 'bit'
	| 'varbit'
	// Full-Text Search
	| 'tsvector'
	| 'tsquery'
	// UUID
	| 'uuid'
	// XML
	| 'xml'
	// JSON
	| 'json'
	| 'jsonb'
	// Range
	| 'int4range'
	| 'int8range'
	| 'numrange'
	| 'tsrange'
	| 'tstzrange'
	| 'daterange'
	// Multirange
	| 'int4multirange'
	| 'int8multirange'
	| 'nummultirange'
	| 'tsmultirange'
	| 'tstzmultirange'
	| 'datemultirange'
	// Object Identifier / System Reference
	| 'oid'
	| 'regproc'
	| 'regprocedure'
	| 'regoper'
	| 'regoperator'
	| 'regclass'
	| 'regtype'
	| 'regrole'
	| 'regnamespace'
	| 'regconfig'
	| 'regdictionary'
	// PostGIS
	| 'geometry'
	| 'geography'
	| 'box2d'
	| 'box3d'
	| 'raster'
	// pgvector
	| 'halfvec'
	| 'sparsevec'
	| 'vector';

// Some originals were swapped with aliases for simpler keys
export type PostgresAliasType =
	// Numeric
	| 'int2' // smallint
	| 'integer' // int
	| 'int4' // int
	| 'int8' // bigint
	| 'decimal' // numeric
	| 'real' // float4
	| 'double' // float8
	| 'double precision' // float8
	| 'serial2' // smallserial
	| 'serial4' // serial
	| 'serial8' // bigserial
	// Text
	| 'character' // char
	| 'character varying' // varchar
	// Datetime
	| 'time with time zone' // timetz
	| 'timestamp with time zone' // timestamptz
	// Boolean
	| 'boolean' // bool
	// Bit String
	| 'bit varying'; // varbit;

export type PostgresColumnType =
	| PostgresType
	| PostgresAliasType;

const PG_ALIAS_TO_TYPE_MAP: Record<PostgresAliasType, PostgresType> = {
	int2: 'smallint',
	integer: 'int',
	int4: 'int',
	int8: 'bigint',
	decimal: 'numeric',
	real: 'float4',
	double: 'float8',
	'double precision': 'float8',
	serial2: 'smallserial',
	serial4: 'serial',
	serial8: 'bigserial',
	character: 'char',
	'character varying': 'varchar',
	'time with time zone': 'timetz',
	'timestamp with time zone': 'timestamptz',
	boolean: 'bool',
	'bit varying': 'varbit',
};

export function resolvePgType(type: string) {
	return PG_ALIAS_TO_TYPE_MAP[type as keyof typeof PG_ALIAS_TO_TYPE_MAP] ?? type;
}

export type PgCodecs = Codecs<PostgresType>;

export const castToText: CastCodec = (name) => sql`${name}::text`;
export const castToTextArr: CastArrayCodec = (name, arrayDimensions) =>
	sql`${name}::text${sql.raw('[]'.repeat(arrayDimensions))}`;

/** Used for cases when casting requires to unwrap and rebuild arrays
 *
 * @example
 * string_mtx::text[][] // can be casted to array directly
 *
 * encode(bytea_mtx, 'base64')[][] // invalid syntax, cast requires unwrapping and rebuilding array
 */
export const arrayCompatCast = (cast: CastCodec) =>
(
	name: SQLChunk,
	arrayDimensions: number | undefined,
): SQLChunk => {
	if (!arrayDimensions) return cast(name);

	const aliases: Name[] = [];
	for (let i = 0; i < arrayDimensions; i++) {
		aliases.push(sql.identifier(`s${i}`));
	}

	let indexed = name;
	for (const alias of aliases) {
		indexed = sql`${indexed}[${alias}]`;
	}

	let expression = sql`array(\
select ${cast(indexed)} \
from generate_subscripts(${name}, ${sql.raw(arrayDimensions.toString())}) ${aliases[arrayDimensions - 1]} \
order by ${aliases[arrayDimensions - 1]})`;

	for (let dim = arrayDimensions - 1; dim > 0; dim--) {
		expression = sql`array(\
select ${expression} \
from generate_subscripts(${name}, ${sql.raw(dim.toString())}) ${aliases[dim - 1]} \
order by ${aliases[dim - 1]})`;
	}

	// Otherwise null returns as []
	return sql`case when ${name} is null then null else ${expression} end`;
};

/** Used to recursively apply value normalizer to array of unknown dimensions */
export const arrayCompatNormalize = (normalize: NormalizeCodec, transformToPgArray = false) => {
	const loop: NormalizeArrayCodec = (value, arrayDimensions) => {
		const innerDimensions = arrayDimensions - 1;
		if (arrayDimensions > 1) {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				loop((value as unknown[][])[i]!, innerDimensions);
			}
		} else {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				value[i] = normalize((value as unknown[][])[i]!);
			}
		}

		return value;
	};

	return transformToPgArray ? (v: any, d: number) => makePgArray(loop(v, d)) : loop;
};

export const genericPgCodecs: PgCodecs = {
	bytea: {
		castInJson: (name) => sql`encode(${name}, 'base64')`,
		castArrayInJson: arrayCompatCast((name) => sql`encode(${name}, 'base64')`),
		normalizeInJson: (v: string) => Buffer.from(v, 'base64'),
		normalizeArrayInJson: arrayCompatNormalize((v: string) => Buffer.from(v, 'base64')),
	},
	bigint: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	bigserial: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	date: {
		castArray: castToTextArr,
	},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	geometry: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeArray: parsePgArray,
	},
	interval: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	json: {
		normalizeParam: (v) => typeof v === 'object' && !Array.isArray(v) ? v : JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalize((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => typeof v === 'object' && !Array.isArray(v) ? v : JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalize((v) => JSON.stringify(v), true),
	},
	line: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		cast: castToText,
		castArray: castToTextArr,
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	numeric: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	point: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		cast: castToText,
		castArray: castToTextArr,
	},
	timestamp: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	timestamptz: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	bit: {
		normalizeArray: parsePgArray,
	},
	halfvec: {
		normalizeArray: parsePgArray,
	},
	sparsevec: {
		normalizeArray: parsePgArray,
	},
	vector: {
		normalizeArray: parsePgArray,
	},
};

export const refineGenericPgCodecs = (extension?: PartialWithUndefined<PgCodecs>): PgCodecs =>
	refineCodecs<PostgresType>(genericPgCodecs, extension);
