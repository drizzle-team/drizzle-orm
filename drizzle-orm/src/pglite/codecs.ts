import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	genericPgCodecs,
	parseGeometryTuple,
	parseGeometryXY,
	parsePgArrayAndNormalize,
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
	},
	jsonb: {
		// Driver handles objects, other types need to be stringified
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
	},
	'geometry(point)': {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, _column, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	'geometry(point):tuple': {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, _column, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	halfvec: {
		castParam: (name) => `${name}::halfvec`,
		castArrayParam: (name, _column, dimensions) => `${name}::halfvec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	vector: {
		castParam: (name) => `${name}::vector`,
		castArrayParam: (name, _column, dimensions) => `${name}::vector${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	sparsevec: {
		normalizeArray: parsePgArray,
		castParam: (name) => `${name}::sparsevec`,
		castArrayParam: (name, _column, dimensions) => `${name}::sparsevec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
});
