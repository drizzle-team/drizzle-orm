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
import { makePgArray, parsePgArray } from './array.ts';
import { parseEWKB } from './columns/postgis_extension/utils.ts';

export type PostGISType =
	| 'geometry(point)'
	| 'geometry(pointz)'
	| 'geometry(pointm)'
	| 'geometry(pointzm)'
	| 'geometry(linestring)'
	| 'geometry(linestringz)'
	| 'geometry(linestringm)'
	| 'geometry(linestringzm)'
	| 'geometry(polygon)'
	| 'geometry(polygonz)'
	| 'geometry(polygonm)'
	| 'geometry(polygonzm)'
	| 'geometry(multipoint)'
	| 'geometry(multipointz)'
	| 'geometry(multipointm)'
	| 'geometry(multipointzm)'
	| 'geometry(multilinestring)'
	| 'geometry(multilinestringz)'
	| 'geometry(multilinestringm)'
	| 'geometry(multilinestringzm)'
	| 'geometry(multipolygon)'
	| 'geometry(multipolygonz)'
	| 'geometry(multipolygonm)'
	| 'geometry(multipolygonzm)'
	| 'geometry(geometrycollection)'
	| 'geometry(geometrycollectionz)'
	| 'geometry(geometrycollectionm)'
	| 'geometry(geometrycollectionzm)'
	| 'geometry(circularstring)'
	| 'geometry(circularstringz)'
	| 'geometry(circularstringm)'
	| 'geometry(circularstringzm)'
	| 'geometry(compoundcurve)'
	| 'geometry(compoundcurvez)'
	| 'geometry(compoundcurvem)'
	| 'geometry(compoundcurvezm)'
	| 'geometry(curvepolygon)'
	| 'geometry(curvepolygonz)'
	| 'geometry(curvepolygonm)'
	| 'geometry(curvepolygonzm)'
	| 'geometry(multicurve)'
	| 'geometry(multicurvez)'
	| 'geometry(multicurvem)'
	| 'geometry(multicurvezm)'
	| 'geometry(multisurface)'
	| 'geometry(multisurfacez)'
	| 'geometry(multisurfacem)'
	| 'geometry(multisurfacezm)'
	| 'geometry(polyhedralsurface)'
	| 'geometry(polyhedralsurfacez)'
	| 'geometry(polyhedralsurfacem)'
	| 'geometry(polyhedralsurfacezm)'
	| 'geometry(tin)'
	| 'geometry(tinz)'
	| 'geometry(tinm)'
	| 'geometry(tinzm)'
	| 'geometry(triangle)'
	| 'geometry(trianglez)'
	| 'geometry(trianglem)'
	| 'geometry(trianglezm)'
	| 'geography(point)'
	| 'geography(linestring)'
	| 'geography(polygon)'
	| 'geography(multipoint)'
	| 'geography(multilinestring)'
	| 'geography(multipolygon)'
	| 'geography(geometrycollection)'
	| 'box2d'
	| 'box3d'
	| 'raster';

export type PostgresType =
	// Numeric
	| 'smallint'
	| 'int'
	| 'bigint'
	| 'bigint:number'
	| 'bigint:string'
	| 'numeric'
	| 'numeric:number'
	| 'numeric:bigint'
	| 'float4'
	| 'float8'
	| 'money'
	| 'smallserial'
	| 'serial'
	| 'bigserial'
	| 'bigserial:number'
	// Text
	| 'char'
	| 'varchar'
	| 'text'
	// Binary
	| 'bytea'
	// Datetime
	| 'date'
	| 'date:string'
	| 'time'
	| 'timetz'
	| 'timestamp'
	| 'timestamptz'
	| 'timestamp:string'
	| 'timestamptz:string'
	| 'interval'
	| 'interval:tuple'
	// Boolean
	| 'bool'
	// Enumerated
	| 'enum'
	// Geometric
	| 'point'
	| 'point:tuple'
	| 'line'
	| 'line:tuple'
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
	| PostGISType
	| `${PostGISType}:tuple`
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
	| 'time without time zone' // timetz
	| 'timestamp with time zone' // timestamptz
	| 'timestamp without time zone' // timestamptz
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
	'time without time zone': 'time',
	'timestamp with time zone': 'timestamptz',
	'timestamp without time zone': 'timestamp',
	boolean: 'bool',
	'bit varying': 'varbit',
};

export function resolvePgTypeAlias(type: string) {
	return (PG_ALIAS_TO_TYPE_MAP as Record<string, PostgresType | undefined>)[type] ?? type;
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
export const arrayCompatNormalize = (normalize: NormalizeCodec) => {
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

	return loop;
};

/** Doesn't mutate original data - used for insertions */
export const arrayCompatNormalizeInput = (normalize: NormalizeCodec, transformToPgArray = false) => {
	const loop: NormalizeArrayCodec = (value, arrayDimensions): any => {
		const innerDimensions = arrayDimensions - 1;
		const out = Array.from({ length: value.length });
		if (arrayDimensions > 1) {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				out[i] = loop((value as unknown[][])[i]!, innerDimensions);
			}
		} else {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				out[i] = normalize((value as unknown[][])[i]!);
			}
		}

		return out;
	};

	return transformToPgArray ? (v: any, d: number) => makePgArray(loop(v, d)) : loop;
};

/** Parses a raw PG array text representation, then applies a per-item normalizer */
export const parsePgArrayAndNormalize = (normalize: NormalizeCodec): NormalizeArrayCodec => {
	const codec = arrayCompatNormalize(normalize);
	return (value, arrayDimensions) => codec(parsePgArray(value), arrayDimensions);
};

export const parseLineTuple = (v: string): [number, number, number] => {
	const [a, b, c] = v.slice(1, -1).split(',');
	return [Number.parseFloat(a!), Number.parseFloat(b!), Number.parseFloat(c!)];
};

export const parseLineABC = (v: string): { a: number; b: number; c: number } => {
	const [a, b, c] = v.slice(1, -1).split(',');
	return { a: Number.parseFloat(a!), b: Number.parseFloat(b!), c: Number.parseFloat(c!) };
};

export const parsePointTuple = (v: string): [number, number] => {
	const [x, y] = v.slice(1, -1).split(',');
	return [Number.parseFloat(x!), Number.parseFloat(y!)];
};

export const parsePointXY = (v: string): { x: number; y: number } => {
	const [x, y] = v.slice(1, -1).split(',');
	return { x: Number.parseFloat(x!), y: Number.parseFloat(y!) };
};

export const parseGeometryTuple = (v: string): [number, number] => parseEWKB(v).point;

export const parseGeometryXY = (v: string): { x: number; y: number } => {
	const parsed = parseEWKB(v);
	return { x: parsed.point[0], y: parsed.point[1] };
};

export const textToDate = (v: string): Date => new Date(v);
export const textToDateWithTz = (v: string): Date => new Date(v + '+0000');

export const parsePgVector = (v: string): number[] => {
	const body = v.slice(1, -1);
	if (body.length === 0) return [];
	return body.split(',').map(Number.parseFloat);
};

export const genericPgCodecs = {
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
	},
	'bigint:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	'bigint:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	bigserial: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigserial:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	date: {
		normalizeInJson: textToDate,
		normalizeArrayInJson: arrayCompatNormalize(textToDate),
	},
	'date:string': {},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	'geometry(point)': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseGeometryXY,
		normalizeArray: arrayCompatNormalize(parseGeometryXY),
		normalizeInJson: parseGeometryXY,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseGeometryTuple,
		normalizeArray: arrayCompatNormalize(parseGeometryTuple),
		normalizeInJson: parseGeometryTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryTuple),
	},
	interval: {
		castArrayInJson: castToTextArr,
	},
	json: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	line: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
		normalizeInJson: parseLineABC,
		normalizeArrayInJson: arrayCompatNormalize(parseLineABC),
	},
	'line:tuple': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
		normalizeInJson: parseLineTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseLineTuple),
	},
	numeric: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	'numeric:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	'numeric:bigint': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
	},
	point: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
		normalizeInJson: parsePointXY,
		normalizeArrayInJson: arrayCompatNormalize(parsePointXY),
	},
	'point:tuple': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
		normalizeInJson: parsePointTuple,
		normalizeArrayInJson: arrayCompatNormalize(parsePointTuple),
	},
	timestamp: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: textToDateWithTz,
		normalizeArrayInJson: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: textToDate,
		normalizeArrayInJson: arrayCompatNormalize(textToDate),
	},
	'timestamp:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	'timestamptz:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
} as const satisfies PgCodecs;

export const refineGenericPgCodecs = (extension?: PartialWithUndefined<PgCodecs>): PgCodecs =>
	refineCodecs<PostgresType>(genericPgCodecs, extension);
