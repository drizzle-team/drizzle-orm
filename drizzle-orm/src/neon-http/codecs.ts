import { parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	parseGeometryTuple,
	parseGeometryXY,
	parsePgArrayAndNormalize,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';

export const neonHttpCodecs = refineGenericPgCodecs({
	bigint: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	bit: {
		normalizeArray: parsePgArray,
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
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
	},
	interval: {
		castArray: castToTextArr,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
	},
	line: {
		cast: castToText,
		castArray: castToTextArr,
	},
	'line:tuple': {
		cast: castToText,
		castArray: castToTextArr,
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	point: {
		cast: castToText,
		castArray: castToTextArr,
	},
	'point:tuple': {
		cast: castToText,
		castArray: castToTextArr,
	},
	sparsevec: {
		normalizeArray: parsePgArray,
	},
});
