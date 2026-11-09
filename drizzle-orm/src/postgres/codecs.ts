import { refineCodecs } from '~/codecs.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	byteaFromPgHex,
	castToEpochMs,
	castToJsonText,
	castToText,
	castToTextArr,
	epochMsToDate,
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
	type PostgresType,
	textToDateArray,
	textToDateWithTzArray,
} from '~/pg-core/codecs.ts';

const jsonStringify = (value: any) => JSON.stringify(value);

export const postgresShapeCodecs: PgCodecs = {
	json: { normalizeParam: jsonStringify, normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true) },
	jsonb: { normalizeParam: jsonStringify, normalizeParamArray: arrayCompatNormalizeInput(jsonStringify, true) },
	bytea: {
		normalizeInJson: byteaFromPgHex,
		normalizeArrayInJson: arrayCompatNormalize(byteaFromPgHex),
	},
	date: { castArray: castToJsonText, normalizeArray: textToDateArray },
	timestamp: { castArray: castToJsonText, normalizeArray: textToDateWithTzArray },
	timestamptz: { castArray: castToJsonText, normalizeArray: textToDateArray },
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

/** Variant of {@link postgresShapeCodecs} for text-only transports (HTTP), where scalars are text too */
export const postgresHttpShapeCodecs: PgCodecs = refineCodecs<PostgresType>(postgresShapeCodecs, {
	date: { cast: castToEpochMs, normalize: epochMsToDate },
	timestamp: { cast: castToEpochMs, normalize: epochMsToDate },
	timestamptz: { cast: castToEpochMs, normalize: epochMsToDate },
});
