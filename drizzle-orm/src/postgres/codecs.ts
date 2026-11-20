import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	byteaFromPgHex,
	castToText,
	castToTextArr,
	makeBoxArray,
	makeGeometryArray,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	type PgCodecs,
} from '~/pg-core/codecs.ts';

const jsonStringify = (value: any) => JSON.stringify(value);

export const postgresCodecs: PgCodecs = {
	json: { normalizeParam: jsonStringify, normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true) },
	jsonb: { normalizeParam: jsonStringify, normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true) },
	bytea: {
		normalizeInJson: byteaFromPgHex,
		normalizeArrayInJson: arrayCompatNormalize(byteaFromPgHex),
	},
	'timestamp:string': { castInJson: castToText, castArrayInJson: castToTextArr },
	'timestamptz:string': { castInJson: castToText, castArrayInJson: castToTextArr },
	point: {
		normalizeInJson: parsePointXY,
		normalizeArrayInJson: arrayCompatNormalize(parsePointXY),
	},
	'point:tuple': {
		normalizeInJson: parsePointTuple,
		normalizeArrayInJson: arrayCompatNormalize(parsePointTuple),
	},
	line: {
		normalizeInJson: parseLineABC,
		normalizeArrayInJson: arrayCompatNormalize(parseLineABC),
	},
	'line:tuple': {
		normalizeInJson: parseLineTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseLineTuple),
	},
	box: { normalizeParamArray: makeBoxArray },
	'geometry(point)': {
		normalizeParamArray: makeGeometryArray,
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parseGeometryXY,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		normalizeParamArray: makeGeometryArray,
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parseGeometryTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryTuple),
	},
	'geography(point)': { normalizeParamArray: makeGeometryArray },
	'geography(point):tuple': { normalizeParamArray: makeGeometryArray },
	halfvec: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
	vector: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
};
