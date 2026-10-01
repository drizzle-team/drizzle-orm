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
	textToDateWithTz,
} from '~/cockroach-core/codecs.ts';

export const nodeCockroachCodecs = refineGenericCockroachCodecs({
	int2: {
		normalize: Number,
		normalizeArray: parseArrayAndNormalize(Number),
	},
	int4: {
		normalize: Number,
		normalizeArray: parseArrayAndNormalize(Number),
	},
	real: {
		normalize: Number,
		normalizeArray: parseArrayAndNormalize(Number),
	},
	float: {
		normalize: Number,
		normalizeArray: parseArrayAndNormalize(Number),
	},
	int8: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'int8:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
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
		normalizeArray: parseArrayAndNormalize(textToDate),
	},
	timestamp: {
		normalize: textToDateWithTz,
		normalizeArray: parseArrayAndNormalize(textToDateWithTz),
	},
	timestamptz: {
		normalize: textToDate,
		normalizeArray: parseArrayAndNormalize(textToDate),
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
		normalizeArray: parseArray,
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
		normalizeArray: parseArray,
	},
	'date:string': {
		normalizeArray: parseArray,
	},
	'timestamp:string': {
		normalizeArray: parseArray,
	},
	'timestamptz:string': {
		normalizeArray: parseArray,
	},
});
