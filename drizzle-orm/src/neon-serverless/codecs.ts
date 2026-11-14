import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToTextArr,
	makeGeometryArray,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgArrayAndNormalize,
	parsePgArrayOfStrings,
	parsePgVector,
	refineGenericPgCodecs,
	textToDate,
	textToDatePgArray,
	textToDateWithTz,
	textToDateWithTzPgArray,
} from '~/pg-core/codecs.ts';

const pointToTuple = ({ x, y }: { x: number; y: number }): [number, number] => [x, y];

export const neonServerlessCodecs = refineGenericPgCodecs({
	bigint: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'bigint:string': {
		normalize: String,
		normalizeArray: arrayCompatNormalize(String),
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
		normalizeArray: parsePgArrayOfStrings,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	enum: {
		normalizeArray: parsePgArrayOfStrings,
		normalizeParamArray: (v) => makePgArray(v),
	},
	line: {
		normalize: parseLineABC,
		normalizeArray: parsePgArrayAndNormalize(parseLineABC),
	},
	'line:tuple': {
		normalize: parseLineTuple,
		normalizeArray: parsePgArrayAndNormalize(parseLineTuple),
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		normalizeArray: parsePgArrayOfStrings,
	},
	'point:tuple': {
		normalize: pointToTuple,
		normalizeArray: arrayCompatNormalize(pointToTuple),
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
