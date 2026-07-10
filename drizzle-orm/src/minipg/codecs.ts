import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgArrayAndNormalize,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';

const stringifyBigint = (value: bigint) => value.toString();

// For arrays
const pgTextToBool = (value: string) => value === 't' || value === 'true';
const pgTextToBuffer = (value: string) => Buffer.from(value.slice(2), 'hex');
const bufferToPgHex = (value: any) => `\\x${Buffer.from(value).toString('hex')}`;

const jsonStringify = (value: any) => JSON.stringify(value);
const jsonParse = (value: string) => JSON.parse(value);

export const miniPgCodecs = refineGenericPgCodecs({
	smallint: {
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	int: {
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	serial: {
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	smallserial: {
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	float4: {
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	float8: {
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	bigint: {
		normalize: BigInt,
		normalizeArray: parsePgArrayAndNormalize(BigInt),
		normalizeParam: stringifyBigint,
		normalizeParamArray: makePgArray,
	},
	'bigint:number': {
		normalize: Number,
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	'bigint:string': {
		normalize: String,
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	bigserial: {
		normalize: BigInt,
		normalizeArray: parsePgArrayAndNormalize(BigInt),
		normalizeParam: stringifyBigint,
		normalizeParamArray: makePgArray,
	},
	'bigserial:number': {
		normalize: Number,
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	numeric: {
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	'numeric:number': {
		normalize: Number,
		normalizeArray: parsePgArrayAndNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	'numeric:bigint': {
		normalize: BigInt,
		normalizeArray: parsePgArrayAndNormalize(BigInt),
		normalizeParamArray: makePgArray,
	},
	money: {
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	char: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	varchar: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	text: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	xml: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	bytea: {
		normalizeArray: parsePgArrayAndNormalize(pgTextToBuffer),
		normalizeParamArray: arrayCompatNormalizeInput(bufferToPgHex, true),
	},
	date: {
		normalize: textToDate,
		normalizeArray: parsePgArrayAndNormalize(textToDate),
		normalizeParamArray: makePgArray,
	},
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	time: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	timetz: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	timestamp: {
		normalize: textToDateWithTz,
		normalizeArray: parsePgArrayAndNormalize(textToDateWithTz),
		normalizeParamArray: makePgArray,
	},
	timestamptz: {
		normalize: textToDate,
		normalizeArray: parsePgArrayAndNormalize(textToDate),
		normalizeParamArray: makePgArray,
	},
	'timestamp:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	'timestamptz:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	interval: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	bool: {
		normalizeArray: parsePgArrayAndNormalize(pgTextToBool),
		normalizeParamArray: makePgArray,
	},
	enum: {
		castArray: castToTextArr,
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	point: {
		normalize: parsePointXY,
		normalizeArray: parsePgArrayAndNormalize(parsePointXY),
		normalizeParamArray: makePgArray,
	},
	'point:tuple': {
		normalize: parsePointTuple,
		normalizeArray: parsePgArrayAndNormalize(parsePointTuple),
		normalizeParamArray: makePgArray,
	},
	line: {
		normalize: parseLineABC,
		normalizeArray: parsePgArrayAndNormalize(parseLineABC),
		normalizeParamArray: makePgArray,
	},
	'line:tuple': {
		normalize: parseLineTuple,
		normalizeArray: parsePgArrayAndNormalize(parseLineTuple),
		normalizeParamArray: makePgArray,
	},
	lseg: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	box: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	path: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	polygon: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	circle: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	cidr: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	inet: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	macaddr: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	macaddr8: {
		castArray: castToTextArr,
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	bit: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	varbit: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	tsvector: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	tsquery: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	uuid: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	json: {
		normalizeArray: parsePgArrayAndNormalize(jsonParse),
		normalizeParam: jsonStringify,
		normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true),
	},
	jsonb: {
		normalizeArray: parsePgArrayAndNormalize(jsonParse),
		normalizeParam: jsonStringify,
		normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true),
	},
	int4range: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	int8range: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	numrange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	tsrange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	tstzrange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	daterange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	int4multirange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	int8multirange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	nummultirange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	tsmultirange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	tstzmultirange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	datemultirange: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	oid: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regproc: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regprocedure: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regoper: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regoperator: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regclass: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regtype: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regrole: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regnamespace: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regconfig: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	regdictionary: { normalizeArray: parsePgArray, normalizeParamArray: makePgArray },
	'geometry(point)': {
		normalize: parseGeometryXY,
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
		normalizeParamArray: makePgArray,
	},
	'geometry(point):tuple': {
		normalize: parseGeometryTuple,
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
		normalizeParamArray: makePgArray,
	},
	'geography(point)': { normalizeParamArray: makePgArray },
	'geography(point):tuple': { normalizeParamArray: makePgArray },
	box2d: { normalizeParamArray: makePgArray },
	box3d: { normalizeParamArray: makePgArray },
	raster: { normalizeParamArray: makePgArray },
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: makePgArray,
	},
	sparsevec: {
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: makePgArray,
	},
});
