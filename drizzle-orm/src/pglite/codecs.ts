import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	genericPgCodecs,
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

export const pgliteCodecs = refineGenericPgCodecs({
	// Otherwise outputs are inconsistent
	bigint: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	// Otherwise outputs are inconsistent
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	// Otherwise outputs are inconsistent
	'bigint:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	// Otherwise outputs are inconsistent
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		cast: castToText,
		castArray: castToTextArr,
	},
	// Otherwise outputs are inconsistent
	'bigserial:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
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
	interval: {
		castArray: castToTextArr,
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
	json: {
		// Driver handles objects, other types need to be stringified
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		// Driver handles objects, other types need to be stringified
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
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
	'geometry(point)': {
		normalize: parseGeometryXY,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryXY),
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, _column, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makeGeometryArray,
	},
	'geometry(point):tuple': {
		normalize: parseGeometryTuple,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryTuple),
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, _column, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makeGeometryArray,
	},
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		castParam: (name) => `${name}::halfvec`,
		castArrayParam: (name, _column, dimensions) => `${name}::halfvec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		castParam: (name) => `${name}::vector`,
		castArrayParam: (name, _column, dimensions) => `${name}::vector${'[]'.repeat(dimensions)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	sparsevec: {
		normalizeArray: (v) => parsePgArray(v),
		castParam: (name) => `${name}::sparsevec`,
		castArrayParam: (name, _column, dimensions) => `${name}::sparsevec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
});
