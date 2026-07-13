import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
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

export const neonHttpCodecs = refineGenericPgCodecs({
	bigint: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigserial:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	bit: {
		normalizeArray: parsePgArray,
	},
	numeric: {
		castArray: castToTextArr,
	},
	'numeric:number': {
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'numeric:bigint': {
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	bytea: {
		normalizeParam: String,
	},
	date: {
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'date:string': {
		castArray: castToTextArr,
	},
	timestamp: {
		castArray: castToTextArr,
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'timestamp:string': {
		castArray: castToTextArr,
	},
	'timestamptz:string': {
		castArray: castToTextArr,
	},
	'geometry(point)': {
		normalize: parseGeometryXY,
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		normalize: parseGeometryTuple,
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
	},
	interval: {
		castArray: castToTextArr,
	},
	// driver handles objects, other types need to be stringified
	json: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	line: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
	},
	'line:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	point: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
	},
	'point:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
	},
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
	},
	sparsevec: {
		normalizeArray: parsePgArray,
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
	},
});
