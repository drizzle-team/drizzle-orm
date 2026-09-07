import { makePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	genericPgCodecs,
	makeBoxArray,
	makeGeometryArray,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';
import { base64ToUint8Array } from '~/utils.ts';

const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true });

export const effectPgCodecs = refineGenericPgCodecs({
	bit: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	date: {
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'date:string': { normalizeParamArray: (v) => makePgArray(v) },
	'geometry(point)': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseGeometryXY,
		normalizeArray: arrayCompatNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseGeometryTuple,
		normalizeArray: arrayCompatNormalize(parseGeometryTuple),
	},
	interval: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	line: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'line:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	macaddr: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	macaddr8: {
		cast: castToText,
		castArray: castToTextArr,
		castArrayInJson: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	point: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'point:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
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
	json: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	box: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makeBoxArray,
	},
	box2d: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	box3d: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	cidr: { normalizeParamArray: (v) => makePgArray(v) },
	circle: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	datemultirange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	daterange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'geography(point)': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makeGeometryArray,
	},
	'geography(point):tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makeGeometryArray,
	},
	inet: { normalizeParamArray: (v) => makePgArray(v) },
	int4multirange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int4range: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int8multirange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int8range: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	lseg: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	money: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	nummultirange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	numrange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	oid: { normalizeParamArray: (v) => makePgArray(v) },
	path: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	polygon: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	raster: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regclass: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regconfig: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regdictionary: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regnamespace: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regoper: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regoperator: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regproc: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regprocedure: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regrole: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regtype: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	time: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	timetz: { normalizeParamArray: (v) => makePgArray(v) },
	tsmultirange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsquery: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsrange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tstzmultirange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tstzrange: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsvector: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	varbit: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	xml: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	bytea: {
		normalizeInJson: typeof Buffer === 'undefined' ? base64ToUint8Array : genericPgCodecs.bytea?.normalizeInJson,
		normalizeArrayInJson: typeof Buffer === 'undefined'
			? arrayCompatNormalize(base64ToUint8Array)
			: genericPgCodecs.bytea?.normalizeArrayInJson,
		normalize: typeof Buffer === 'undefined'
			? undefined
			: (v: Uint8Array) => Buffer.from(v),
		normalizeArray: typeof Buffer === 'undefined'
			? undefined
			: arrayCompatNormalize((v: Uint8Array) => Buffer.from(v)),
	},
	enum: {
		normalize: (value: string | Uint8Array) => typeof value === 'string' ? value : textDecoder.decode(value),
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	numeric: { normalizeParamArray: (v) => makePgArray(v) },
	'numeric:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:bigint': {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:string': {
		normalize: String,
		normalizeArray: arrayCompatNormalize(String),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigserial:number': { normalize: Number },
	// Binary `float4` is widened to float64
	float4: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	uuid: { normalizeParamArray: (v) => makePgArray(v) },
	halfvec: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePgVector,
		normalizeArray: arrayCompatNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
	sparsevec: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	vector: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePgVector,
		normalizeArray: arrayCompatNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
});
