import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
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

export const nodePgCodecs = refineGenericPgCodecs({
	bigint: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigint:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	bigserial: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigserial:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	bit: {
		normalizeArray: (v) => parsePgArray(v),
	},
	numeric: {
		cast: castToText,
		castArray: castToTextArr,
	},
	'numeric:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'numeric:bigint': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	date: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	time: {
		cast: castToText,
		castArray: castToTextArr,
	},
	timetz: {
		cast: castToText,
		castArray: castToTextArr,
	},
	timestamp: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		cast: castToText,
		castArray: castToTextArr,
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
	interval: {
		cast: castToText,
		castArray: castToTextArr,
	},
	// driver handles objects, other types need to be stringified
	json: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: JSON.parse,
		normalizeArray: arrayCompatNormalize(JSON.parse),
		normalizeParam: (v) =>
			typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array)
				? v
				: JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: JSON.parse,
		normalizeArray: arrayCompatNormalize(JSON.parse),
		normalizeParam: (v) =>
			typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array)
				? v
				: JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
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
		normalizeArray: (v) => parsePgArray(v),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
	},
});
