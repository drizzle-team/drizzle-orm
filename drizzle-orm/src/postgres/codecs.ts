import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	byteaFromPgHex,
	castToText,
	castToTextArr,
	makeBoxArray,
	makeGeometryArray,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgArrayAndNormalize,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	type PgCodecs,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';

const stringifyBigint = (value: bigint) => value.toString();

// For arrays
const bufferToPgHex = (value: any) => `\\x${Buffer.from(value).toString('hex')}`;

const jsonStringify = (value: any) => JSON.stringify(value);

/** Unused by driver functional set of codecs provided for extension
 *
 * Assumes the default type config
 */
export const minipgCodecs = refineGenericPgCodecs({
	smallint: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	int: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	serial: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	smallserial: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	float4: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	float8: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	bigint: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParam: stringifyBigint,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: String,
		normalizeArray: arrayCompatNormalize(String),
		normalizeParamArray: (v) => makePgArray(v),
	},
	bigserial: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParam: stringifyBigint,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigserial:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	numeric: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:bigint': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: (v) => makePgArray(v),
	},
	money: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	char: { normalizeParamArray: (v) => makePgArray(v) },
	varchar: { normalizeParamArray: (v) => makePgArray(v) },
	text: { normalizeParamArray: (v) => makePgArray(v) },
	xml: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	bytea: {
		normalizeParamArray: arrayCompatNormalizeInput(bufferToPgHex, true),
	},
	date: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	time: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	timetz: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	timestamp: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
		normalizeParamArray: (v) => makePgArray(v),
	},
	timestamptz: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'timestamp:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'timestamptz:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	interval: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	bool: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	point: {
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'point:tuple': {
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	line: {
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'line:tuple': {
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	lseg: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	box: { normalizeArray: (v) => parsePgArray(v, ';'), normalizeParamArray: makeBoxArray },
	path: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	polygon: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	circle: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	cidr: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	inet: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	macaddr: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	macaddr8: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	bit: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	varbit: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	tsvector: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	tsquery: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	uuid: { normalizeParamArray: (v) => makePgArray(v) },
	json: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: JSON.parse,
		normalizeArray: arrayCompatNormalize(JSON.parse),
		normalizeParam: jsonStringify,
		normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true),
	},
	jsonb: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: JSON.parse,
		normalizeArray: arrayCompatNormalize(JSON.parse),
		normalizeParam: jsonStringify,
		normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true),
	},
	int4range: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	int8range: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	numrange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	tsrange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	tstzrange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	daterange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	int4multirange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	int8multirange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	nummultirange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	tsmultirange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	tstzmultirange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	datemultirange: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	oid: { normalizeParamArray: (v) => makePgArray(v) },
	regproc: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regprocedure: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regoper: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regoperator: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regclass: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regtype: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regrole: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regnamespace: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regconfig: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	regdictionary: { normalizeArray: (v) => parsePgArray(v), normalizeParamArray: (v) => makePgArray(v) },
	'geometry(point)': {
		normalize: parseGeometryXY,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryXY),
		normalizeParamArray: makeGeometryArray,
	},
	'geometry(point):tuple': {
		normalize: parseGeometryTuple,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryTuple),
		normalizeParamArray: makeGeometryArray,
	},
	'geography(point)': { normalizeParamArray: makeGeometryArray },
	'geography(point):tuple': { normalizeParamArray: makeGeometryArray },
	box2d: { normalizeParamArray: (v) => makePgArray(v) },
	box3d: { normalizeParamArray: (v) => makePgArray(v) },
	raster: { normalizeParamArray: (v) => makePgArray(v) },
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
	sparsevec: {
		normalizeArray: (v) => parsePgArray(v),
		normalizeParamArray: (v) => makePgArray(v),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
});

/** Set of codecs statically linked to driver-side mapper shape generator intended to cover shape generator's gaps
 *
 * Useless for overrides or on their own
 */
export const minipgShapeCodecs: PgCodecs = {
	json: { normalizeParam: jsonStringify, normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true) },
	jsonb: { normalizeParam: jsonStringify, normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true) },
	bytea: {
		normalizeInJson: byteaFromPgHex,
		normalizeArrayInJson: arrayCompatNormalize(byteaFromPgHex),
	},
	'timestamp:string': { castInJson: castToText, castArrayInJson: castToTextArr },
	'timestamptz:string': { castInJson: castToText, castArrayInJson: castToTextArr },
	point: {
		normalizeInJson: parsePointXY,
		normalizeArrayInJson: arrayCompatNormalize(parsePointXY),
	},
	'point:tuple': {
		normalizeInJson: parsePointTuple,
		normalizeArrayInJson: arrayCompatNormalize(parsePointTuple),
	},
	line: {
		normalizeInJson: parseLineABC,
		normalizeArrayInJson: arrayCompatNormalize(parseLineABC),
	},
	'line:tuple': {
		normalizeInJson: parseLineTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseLineTuple),
	},
	box: { normalizeParamArray: makeBoxArray },
	'geometry(point)': {
		normalizeParamArray: makeGeometryArray,
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parseGeometryXY,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		normalizeParamArray: makeGeometryArray,
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parseGeometryTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryTuple),
	},
	'geography(point)': { normalizeParamArray: makeGeometryArray },
	'geography(point):tuple': { normalizeParamArray: makeGeometryArray },
	halfvec: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
	vector: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
};
