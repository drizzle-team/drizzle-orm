import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	makeGeometryArray,
	parseArray,
	parseArrayAndNormalize,
	parseCockroachVector,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	refineGenericCockroachCodecs,
	textToDate,
	textToDateWithTz,
} from '~/cockroach-core/codecs.ts';

export const nodeCockroachCodecs = refineGenericCockroachCodecs({
	int2: {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	int4: {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	real: {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	float: {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	int8: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'int8:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'decimal:number': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	'decimal:bigint': {
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
	geometry: {
		normalize: parseGeometryTuple,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryTuple),
		normalizeParamArray: makeGeometryArray,
	},
	'geometry:xy': {
		normalize: parseGeometryXY,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryXY),
		normalizeParamArray: makeGeometryArray,
	},
	vector: {
		normalize: parseCockroachVector,
		normalizeArray: parseArrayAndNormalize(parseCockroachVector),
	},
	decimal: {
		cast: castToText,
		castArray: castToTextArr,
	},
	bit: {
		normalizeArray: parseArray,
	},
	varbit: {
		normalizeArray: parseArray,
	},
	enum: {
		normalizeArray: parseArray,
	},
	interval: {
		cast: castToText,
		castArray: castToTextArr,
	},
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	'timestamp:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	'timestamptz:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	time: {
		cast: castToText,
		castArray: castToTextArr,
	},
	jsonb: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: JSON.parse,
		normalizeArray: arrayCompatNormalize(JSON.parse),
	},
});
