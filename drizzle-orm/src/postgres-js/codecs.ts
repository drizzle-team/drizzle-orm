import type { Sql } from 'postgres';
import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	makeBoxArray,
	makeGeometryArray,
	parseGeometryArrayAndNormalize,
	parseGeometryTuple,
	parseGeometryXY,
	parseLineABC,
	parseLineTuple,
	parsePgArrayAndNormalize,
	parsePgArrayOfStrings,
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	refineGenericPgCodecs,
	textToDate,
	textToDatePgArray,
	textToDateWithTz,
	textToDateWithTzPgArray,
} from '~/pg-core/codecs.ts';

/** JSON param marker exists only on client and isn't importable outside of it */
export const postgresJsCodecs = (client: Sql) => {
	// `postgres.js` 4 serializes array params element by element, through the element type's serializer (JSON-encoding
	// a prebuilt array literal), recursing into nested arrays unless an element is a typed parameter. 3 sends a prebuilt
	// literal as is and infers the param type from typed elements - so each version gets its own form
	const jsonParamArray = typeof (client as { batch?: unknown }).batch === 'function'
		? arrayCompatNormalizeInput((v) => client.json(v as any))
		: arrayCompatNormalizeInput((v) => JSON.stringify(v), true);

	return refineGenericPgCodecs({
		interval: {
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayOfStrings,
		},
		point: {
			normalize: parsePointXY,
			normalizeArray: arrayCompatNormalize(parsePointXY),
			normalizeParamArray: (v) => makePgArray(v),
		},
		'point:tuple': {
			normalize: parsePointTuple,
			normalizeArray: arrayCompatNormalize(parsePointTuple),
			normalizeParamArray: (v) => makePgArray(v),
		},
		line: {
			normalize: parseLineABC,
			normalizeArray: arrayCompatNormalize(parseLineABC),
			normalizeParamArray: (v) => makePgArray(v),
		},
		'line:tuple': {
			normalize: parseLineTuple,
			normalizeArray: arrayCompatNormalize(parseLineTuple),
			normalizeParamArray: (v) => makePgArray(v),
		},
		macaddr8: { normalizeParamArray: (v) => makePgArray(v) },
		json: {
			normalizeParam: (value) => client.json(value),
			normalizeParamArray: jsonParamArray,
		},
		jsonb: {
			normalizeParam: (value) => client.json(value),
			normalizeParamArray: jsonParamArray,
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
		halfvec: {
			normalize: parsePgVector,
			normalizeArray: arrayCompatNormalize(parsePgVector),
			normalizeParamArray: (v) => makePgArray(v),
		},
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
		sparsevec: { normalizeParamArray: (v) => makePgArray(v) },
		text: { normalizeParamArray: (v) => makePgArray(v) },
		time: {
			normalizeParamArray: (v) => makePgArray(v),
		},
		timetz: {
			normalizeParamArray: (v) => makePgArray(v),
		},
		tsmultirange: { normalizeParamArray: (v) => makePgArray(v) },
		tsquery: { normalizeParamArray: (v) => makePgArray(v) },
		tsrange: { normalizeParamArray: (v) => makePgArray(v) },
		tstzmultirange: { normalizeParamArray: (v) => makePgArray(v) },
		tstzrange: { normalizeParamArray: (v) => makePgArray(v) },
		tsvector: { normalizeParamArray: (v) => makePgArray(v) },
		varbit: { normalizeParamArray: (v) => makePgArray(v) },
		varchar: { normalizeParamArray: (v) => makePgArray(v) },
		vector: {
			normalize: parsePgVector,
			normalizeArray: arrayCompatNormalize(parsePgVector),
			normalizeParamArray: (v) => makePgArray(v),
		},
		xml: { normalizeParamArray: (v) => makePgArray(v) },
		bytea: { normalizeParamArray: (v) => makePgArray(v) },
		enum: {
			// parsed only for enums `postgres.js` fetched the types of on connection, others come back as array literals
			normalizeArray: (v: string | string[]) => typeof v === 'string' ? parsePgArray(v) : v,
			normalizeParamArray: (v) => makePgArray(v),
		},
		'geometry(point)': {
			normalize: parseGeometryXY,
			normalizeParamArray: makeGeometryArray,
			normalizeArray: parseGeometryArrayAndNormalize(parseGeometryXY),
		},
		'geometry(point):tuple': {
			normalize: parseGeometryTuple,
			normalizeParamArray: makeGeometryArray,
			normalizeArray: parseGeometryArrayAndNormalize(parseGeometryTuple),
		},
		numeric: {
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayOfStrings,
		},
		'numeric:number': {
			normalize: Number,
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayAndNormalize(Number),
		},
		'numeric:bigint': {
			normalize: BigInt,
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayAndNormalize(BigInt),
		},
		bigint: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: BigInt,
			normalizeArray: arrayCompatNormalize(BigInt),
		},
		'bigint:number': {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: Number,
			normalizeArray: arrayCompatNormalize(Number),
		},
		'bigint:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: String,
			normalizeArray: arrayCompatNormalize(String),
		},
		bigserial: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: BigInt,
			normalizeArray: arrayCompatNormalize(BigInt),
		},
		'bigserial:number': {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: Number,
			normalizeArray: arrayCompatNormalize(Number),
		},
		float4: { normalizeParamArray: (v) => makePgArray(v) },
		int: { normalizeParamArray: (v) => makePgArray(v) },
		uuid: { normalizeParamArray: (v) => makePgArray(v) },
		date: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: textToDate,
			normalizeArray: textToDatePgArray,
		},
		'date:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayOfStrings,
		},
		timestamp: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: textToDateWithTz,
			normalizeArray: textToDateWithTzPgArray,
		},
		timestamptz: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: textToDate,
			normalizeArray: textToDatePgArray,
		},
		'timestamp:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayOfStrings,
		},
		'timestamptz:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayOfStrings,
		},
	});
};
