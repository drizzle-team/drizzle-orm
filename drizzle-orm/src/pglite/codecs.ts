import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	genericPgCodecs,
	makeGeometryArray,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgArrayAndNormalize,
	parsePgArrayOfStrings,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	refineGenericPgCodecs,
	textToDate,
	textToDatePgArray,
	textToDateWithTz,
	textToDateWithTzPgArray,
} from '~/pg-core/codecs.ts';
import { pgHexToUint8Array } from '~/utils.ts';

export const pgliteCodecs = refineGenericPgCodecs({
	// Otherwise outputs are inconsistent
	bigint: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	// Otherwise outputs are inconsistent
	'bigint:string': {
		normalize: String,
		normalizeArray: arrayCompatNormalize(String),
	},
	// Otherwise outputs are inconsistent
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	// Otherwise outputs are inconsistent
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	// Otherwise outputs are inconsistent
	'bigserial:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	bytea: {
		normalizeInJson: typeof Buffer === 'undefined' ? pgHexToUint8Array : genericPgCodecs.bytea?.normalizeInJson,
		normalizeArrayInJson: typeof Buffer === 'undefined'
			? arrayCompatNormalize(pgHexToUint8Array)
			: genericPgCodecs.bytea?.normalizeArrayInJson,
		normalize: typeof Buffer === 'undefined'
			? undefined
			: (v: Uint8Array) => Buffer.from(v),
		normalizeArray: typeof Buffer === 'undefined'
			? undefined
			: arrayCompatNormalize((v: Uint8Array) => Buffer.from(v)),
	},
	interval: {
		normalizeArray: parsePgArrayOfStrings,
	},
	date: {
		normalize: textToDate,
		normalizeArray: textToDatePgArray,
	},
	'date:string': {
		normalizeArray: parsePgArrayOfStrings,
	},
	timestamp: {
		normalize: textToDateWithTz,
		normalizeArray: textToDateWithTzPgArray,
	},
	timestamptz: {
		normalize: textToDate,
		normalizeArray: textToDatePgArray,
	},
	'timestamp:string': {
		normalizeArray: parsePgArrayOfStrings,
	},
	'timestamptz:string': {
		normalizeArray: parsePgArrayOfStrings,
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
		normalizeParamArray: (v) => makePgArray(v),
		normalizeArray: parsePgArrayOfStrings,
	},
	numeric: {
		normalizeArray: parsePgArrayOfStrings,
	},
	'numeric:number': {
		normalize: Number,
		normalizeArray: parsePgArrayAndNormalize(Number),
	},
	'numeric:bigint': {
		normalize: BigInt,
		normalizeArray: parsePgArrayAndNormalize(BigInt),
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
