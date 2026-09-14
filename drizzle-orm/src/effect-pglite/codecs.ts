import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	genericPgCodecs,
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
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';
import { base64ToUint8Array } from '~/utils.ts';

export const effectPgliteCodecs = refineGenericPgCodecs({
	bigint: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	bigserial: { normalize: BigInt },
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'bigserial:number': { normalize: Number },
	date: {
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
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
	line: {
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
	},
	'line:tuple': {
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
	},
	point: {
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
	},
	'point:tuple': {
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
	},
	timestamp: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'timestamp:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	'timestamptz:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	box: { normalizeParamArray: makeBoxArray },
	box2d: { normalizeParamArray: (v) => makePgArray(v) },
	box3d: { normalizeParamArray: (v) => makePgArray(v) },
	circle: { normalizeParamArray: (v) => makePgArray(v) },
	datemultirange: { normalizeParamArray: (v) => makePgArray(v) },
	daterange: { normalizeParamArray: (v) => makePgArray(v) },
	'geography(point)': { normalizeParamArray: makeGeometryArray },
	'geography(point):tuple': { normalizeParamArray: makeGeometryArray },
	int4multirange: { normalizeParamArray: (v) => makePgArray(v) },
	int4range: { normalizeParamArray: (v) => makePgArray(v) },
	int8multirange: { normalizeParamArray: (v) => makePgArray(v) },
	int8range: { normalizeParamArray: (v) => makePgArray(v) },
	lseg: { normalizeParamArray: (v) => makePgArray(v) },
	money: { normalizeParamArray: (v) => makePgArray(v) },
	nummultirange: { normalizeParamArray: (v) => makePgArray(v) },
	numrange: { normalizeParamArray: (v) => makePgArray(v) },
	oid: { normalizeParamArray: (v) => makePgArray(v) },
	path: { normalizeParamArray: (v) => makePgArray(v) },
	polygon: { normalizeParamArray: (v) => makePgArray(v) },
	raster: { normalizeParamArray: (v) => makePgArray(v) },
	regclass: { normalizeParamArray: (v) => makePgArray(v) },
	regconfig: { normalizeParamArray: (v) => makePgArray(v) },
	regdictionary: { normalizeParamArray: (v) => makePgArray(v) },
	regnamespace: { normalizeParamArray: (v) => makePgArray(v) },
	regoper: { normalizeParamArray: (v) => makePgArray(v) },
	regoperator: { normalizeParamArray: (v) => makePgArray(v) },
	regproc: { normalizeParamArray: (v) => makePgArray(v) },
	regprocedure: { normalizeParamArray: (v) => makePgArray(v) },
	regrole: { normalizeParamArray: (v) => makePgArray(v) },
	regtype: { normalizeParamArray: (v) => makePgArray(v) },
	timetz: { normalizeParamArray: (v) => makePgArray(v) },
	tsmultirange: { normalizeParamArray: (v) => makePgArray(v) },
	tsquery: { normalizeParamArray: (v) => makePgArray(v) },
	tsrange: { normalizeParamArray: (v) => makePgArray(v) },
	tstzmultirange: { normalizeParamArray: (v) => makePgArray(v) },
	tstzrange: { normalizeParamArray: (v) => makePgArray(v) },
	tsvector: { normalizeParamArray: (v) => makePgArray(v) },
	varbit: { normalizeParamArray: (v) => makePgArray(v) },
	xml: { normalizeParamArray: (v) => makePgArray(v) },
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
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'numeric:bigint': {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
	sparsevec: {
		normalizeArray: (v) => parsePgArray(v),
		normalizeParamArray: (v) => makePgArray(v),
	},
});
