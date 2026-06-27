import { refineCodecs } from '~/codecs.ts';
import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	genericPgCodecs,
	parseGeometryTuple,
	parseGeometryXY,
	parsePgArrayAndNormalize,
} from '~/pg-core/codecs.ts';
import { base64ToUint8Array } from '~/utils.ts';
import { effectPgCodecs } from '../effect-postgres/codecs.ts';

export const effectPgliteCodecs = refineCodecs(effectPgCodecs, {
	bigint: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	'bigint:number': {
		cast: castToText,
		castArray: castToTextArr,
	},
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		cast: castToText,
		castArray: castToTextArr,
	},
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
	bit: {
		normalizeArray: undefined,
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
