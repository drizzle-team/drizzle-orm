import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	makeBoxArray,
	makeGeometryArray,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgArrayAndNormalize,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	refineGenericPgCodecs,
} from '~/pg-core/codecs.ts';

export const bunSqlPgCodecs = refineGenericPgCodecs({
	date: { normalizeParamArray: (v) => makePgArray(v) },
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	uuid: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	timestamp: { normalizeParamArray: (v) => makePgArray(v) },
	timestamptz: { normalizeParamArray: (v) => makePgArray(v) },
	'timestamp:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'timestamptz:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	float4: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	bigint: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigserial:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	int: {
		normalizeArray: (
			value: any,
			dimensions: number,
		) => {
			if (dimensions <= 1) {
				// eslint-disable-next-line drizzle-internal/no-instanceof
				if (value instanceof Int32Array) {
					return Array.from(value) as any;
				}
				return value;
			}

			const stack: { arr: any; depth: number }[] = [{ arr: value, depth: 1 }];

			while (stack.length > 0) {
				const { arr, depth } = stack.pop()!;

				if (depth === dimensions - 1) {
					for (let i = 0; i < arr.length; i++) {
						const leaf = arr[i];
						// eslint-disable-next-line drizzle-internal/no-instanceof
						if (leaf instanceof Int32Array) {
							arr[i] = Array.from(leaf);
						}
					}
				} else {
					for (let i = 0; i < arr.length; i++) {
						stack.push({ arr: arr[i], depth: depth + 1 });
					}
				}
			}

			return value;
		},
		normalizeParamArray: (v) => makePgArray(v),
	},

	bit: { normalizeParamArray: (v) => makePgArray(v) },
	bool: { normalizeParamArray: (v) => makePgArray(v) },
	box: { normalizeParamArray: makeBoxArray },
	box2d: { normalizeParamArray: (v) => makePgArray(v) },
	box3d: { normalizeParamArray: (v) => makePgArray(v) },
	char: { normalizeParamArray: (v) => makePgArray(v) },
	cidr: { normalizeParamArray: (v) => makePgArray(v) },
	circle: { normalizeParamArray: (v) => makePgArray(v) },
	datemultirange: { normalizeParamArray: (v) => makePgArray(v) },
	daterange: { normalizeParamArray: (v) => makePgArray(v) },
	float8: { normalizeParamArray: (v) => makePgArray(v) },
	'geography(point)': { normalizeParamArray: makeGeometryArray },
	'geography(point):tuple': { normalizeParamArray: makeGeometryArray },
	inet: { normalizeParamArray: (v) => makePgArray(v) },
	int4multirange: { normalizeParamArray: (v) => makePgArray(v) },
	int4range: { normalizeParamArray: (v) => makePgArray(v) },
	int8multirange: { normalizeParamArray: (v) => makePgArray(v) },
	int8range: { normalizeParamArray: (v) => makePgArray(v) },
	lseg: { normalizeParamArray: (v) => makePgArray(v) },
	macaddr: { normalizeParamArray: (v) => makePgArray(v) },
	money: { normalizeParamArray: (v) => makePgArray(v) },
	nummultirange: { normalizeParamArray: (v) => makePgArray(v) },
	numrange: { normalizeParamArray: (v) => makePgArray(v) },
	oid: { normalizeParamArray: (v) => makePgArray(v) },
	path: { normalizeParamArray: (v) => makePgArray(v) },
	polygon: { normalizeParamArray: (v) => makePgArray(v) },
	raster: { normalizeParamArray: (v) => makePgArray(v) },
	regclass: { normalizeParamArray: (v) => makePgArray(v) },
	regconfig: { normalizeParamArray: (v) => makePgArray(v) },
	regdictionary: { normalizeParamArray: (v) => makePgArray(v) },
	regnamespace: { normalizeParamArray: (v) => makePgArray(v) },
	regoper: { normalizeParamArray: (v) => makePgArray(v) },
	regoperator: { normalizeParamArray: (v) => makePgArray(v) },
	regproc: { normalizeParamArray: (v) => makePgArray(v) },
	regprocedure: { normalizeParamArray: (v) => makePgArray(v) },
	regrole: { normalizeParamArray: (v) => makePgArray(v) },
	regtype: { normalizeParamArray: (v) => makePgArray(v) },
	serial: { normalizeParamArray: (v) => makePgArray(v) },
	smallint: { normalizeParamArray: (v) => makePgArray(v) },
	smallserial: { normalizeParamArray: (v) => makePgArray(v) },
	text: { normalizeParamArray: (v) => makePgArray(v) },
	time: { normalizeParamArray: (v) => makePgArray(v) },
	timetz: { normalizeParamArray: (v) => makePgArray(v) },
	tsmultirange: { normalizeParamArray: (v) => makePgArray(v) },
	tsquery: { normalizeParamArray: (v) => makePgArray(v) },
	tsrange: { normalizeParamArray: (v) => makePgArray(v) },
	tstzmultirange: { normalizeParamArray: (v) => makePgArray(v) },
	tstzrange: { normalizeParamArray: (v) => makePgArray(v) },
	tsvector: { normalizeParamArray: (v) => makePgArray(v) },
	varbit: { normalizeParamArray: (v) => makePgArray(v) },
	varchar: { normalizeParamArray: (v) => makePgArray(v) },
	xml: { normalizeParamArray: (v) => makePgArray(v) },
	bytea: { normalizeParamArray: (v) => makePgArray(v) },
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	json: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
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
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	line: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'line:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	numeric: {
		castArray: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:number': {
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:bigint': {
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: (v) => makePgArray(v),
	},
	point: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'point:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
	sparsevec: {
		normalizeArray: (v) => parsePgArray(v),
		normalizeParamArray: (v) => makePgArray(v),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
});
