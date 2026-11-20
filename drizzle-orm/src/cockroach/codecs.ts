import {
	arrayCompatNormalize,
	makeGeometryArray,
	parseArray,
	parseArrayAndNormalize,
	parseCockroachVector,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	refineGenericCockroachCodecs,
	textToDate,
	textToDateArray,
	textToDateWithTz,
	textToDateWithTzArray,
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
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'int8:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
	},
	decimal: {
		normalizeArray: parseArray,
	},
	'decimal:number': {
		normalize: Number,
		normalizeArray: parseArrayAndNormalize(Number),
	},
	'decimal:bigint': {
		normalize: BigInt,
		normalizeArray: parseArrayAndNormalize(BigInt),
	},
	date: {
		normalize: textToDate,
		normalizeArray: textToDateArray,
	},
	'date:string': {
		normalizeArray: parseArray,
	},
	timestamp: {
		normalize: textToDateWithTz,
		normalizeArray: textToDateWithTzArray,
	},
	timestamptz: {
		normalize: textToDate,
		normalizeArray: textToDateArray,
	},
	'timestamp:string': {
		normalizeArray: parseArray,
	},
	'timestamptz:string': {
		normalizeArray: parseArray,
	},
	interval: {
		normalizeArray: parseArray,
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
	bit: {
		normalizeArray: parseArray,
	},
	varbit: {
		normalizeArray: parseArray,
	},
	enum: {
		normalizeArray: parseArray,
	},
});
