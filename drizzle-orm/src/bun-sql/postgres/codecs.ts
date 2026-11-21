/// <reference types="bun-types" />

import type { SQL } from 'bun';
import { unsupportedCodec } from '~/codecs.ts';
import { entityKind, is } from '~/entity.ts';
import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToTextArr,
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
	pgDateTextFromUtcDate,
	pgTimestampTextFromUtcDate,
	refineGenericPgCodecs,
	shortestFloat32,
	shortestFloat32Array,
} from '~/pg-core/codecs.ts';

/** `sql.json(value)` for bun < v1.4.4 */
export class BunSqlJsonParam {
	static readonly [entityKind]: string = 'BunSqlJsonParam';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(readonly value: unknown) {}

	toJSON(key: string): unknown {
		const value = this.value as { toJSON?: (key: string) => unknown } | null | undefined;
		return typeof value?.toJSON === 'function' ? value.toJSON(key) : value;
	}
}

// bun < v1.4.4 has no `sql.json(value)` and doesn't stringigy JSON by itself with `prepare: false`
const makeJsonParamNormalizer = (client: SQL): (v: unknown) => unknown =>
	typeof client.json === 'function'
		? (value) => client.json(value)
		: client.options.prepare === false
		? (value) => JSON.stringify(value)
		: (value) => new BunSqlJsonParam(value);

const driver = 'bun-sql';

// `bun` decodes `infinity` / `-infinity` dates and timestamps to `Infinity` / `-Infinity` numbers
const invalidDate = new Date(Number.NaN);
const dateFromBun = (value: Date | number): Date =>
	value === Infinity || value === -Infinity ? invalidDate : value as Date;
const timeZoneReason = 'the driver decodes `timestamptz` values to `Date`s, dropping the offset the server formats in '
	+ "the session's time zone, and accepts no per-query parsers";
const timestampText = pgTimestampTextFromUtcDate(false);
const dateTextFromBun = (value: Date | number): string =>
	value === Infinity ? 'infinity' : value === -Infinity ? '-infinity' : pgDateTextFromUtcDate(value as Date);

/** JSON param marker exists only on client and isn't importable outside of it */
export const bunSqlPgCodecs = (client: SQL) => {
	const normalizeJsonParam = makeJsonParamNormalizer(client);

	return refineGenericPgCodecs({
		date: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: dateFromBun,
			normalizeArray: arrayCompatNormalize(dateFromBun),
		},
		'date:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: dateTextFromBun,
			normalizeArray: arrayCompatNormalize(dateTextFromBun),
		},
		uuid: {
			normalizeParamArray: (v) => makePgArray(v),
		},
		timestamp: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: dateFromBun,
			normalizeArray: arrayCompatNormalize(dateFromBun),
		},
		timestamptz: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: dateFromBun,
			normalizeArray: arrayCompatNormalize(dateFromBun),
		},
		'timestamp:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: timestampText,
			normalizeArray: arrayCompatNormalize(timestampText),
		},
		'timestamptz:string': {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: unsupportedCodec('timestamp with time zone', driver, timeZoneReason),
			normalizeArray: unsupportedCodec('timestamp with time zone', driver, timeZoneReason),
		},
		float4: {
			normalizeParamArray: (v) => makePgArray(v),
			normalize: shortestFloat32,
			normalizeArray: shortestFloat32Array,
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
		int: {
			normalizeArray: (
				value: any,
				dimensions: number,
			) => {
				// Bun hands over the innermost level as `Int32Array` - an empty array of any dimensions is that level
				if (value instanceof Int32Array) return Array.from(value) as any;
				if (dimensions <= 1) return value;

				const stack: { arr: any; depth: number }[] = [{ arr: value, depth: 1 }];

				while (stack.length > 0) {
					const { arr, depth } = stack.pop()!;

					if (depth === dimensions - 1) {
						for (let i = 0; i < arr.length; i++) {
							const leaf = arr[i];
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
		xml: { normalizeParamArray: (v) => makePgArray(v) },
		bytea: { normalizeParamArray: (v) => makePgArray(v) },
		enum: {
			normalizeParamArray: (v) => makePgArray(v),
			normalizeArray: parsePgArrayOfStrings,
		},
		json: {
			normalizeParam: normalizeJsonParam,
			normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
		},
		jsonb: {
			normalizeParam: normalizeJsonParam,
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
		macaddr8: {
			castArrayInJson: castToTextArr,
			normalizeParamArray: (v) => makePgArray(v),
		},
		numeric: {
			normalizeParamArray: (v) => makePgArray(v),
		},
		'numeric:number': {
			normalize: Number,
			normalizeArray: arrayCompatNormalize(Number),
			normalizeParamArray: (v) => makePgArray(v),
		},
		'numeric:bigint': {
			normalize: BigInt,
			normalizeArray: arrayCompatNormalize(BigInt),
			normalizeParamArray: (v) => makePgArray(v),
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
};
