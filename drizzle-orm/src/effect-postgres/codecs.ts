import { unsupportedCodec } from '~/codecs.ts';
import { makePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToTextArr,
	genericPgCodecs,
	makeBoxArray,
	makeGeometryArray,
	pgTimestampTextFromUtcDate,
	refineGenericPgCodecs,
	shortestFloat32,
	shortestFloat32Array,
	textToDate,
} from '~/pg-core/codecs.ts';
import { pgHexToUint8Array } from '~/utils.ts';

const bytesToPgHex = (value: Uint8Array): string => {
	let hex = '\\x';
	for (const byte of value) hex += byte.toString(16).padStart(2, '0');
	return hex;
};

const driver = '@effect/sql-pg';
const binaryReason = 'the driver decodes the binary format of this type as text, corrupting it, '
	+ 'and its `Effect` client accepts no per-query result formats';
const timeZoneReason = 'the driver decodes `timestamptz` values to `Date`s, dropping the offset the server formats in '
	+ "the session's time zone, and its `Effect` client accepts no per-query result formats";
const timestampText = pgTimestampTextFromUtcDate(false);

/** PostgreSQL's `date` text from the driver's ISO 8601 date: ISO year `0` is 1 BC, `-1` is 2 BC (`-0043-03-15` -> `0044-03-15 BC`) */
const pgDateText = (value: string): string => {
	if (value === 'infinity' || value === '-infinity') return value;
	const yearEnd = value.indexOf('-', 1);
	const year = +value.slice(0, yearEnd);
	return year > 0 ? value : `${String(1 - year).padStart(4, '0')}${value.slice(yearEnd)} BC`;
};
const dateFromIsoText = (value: string): Date => textToDate(pgDateText(value));

/** PostgreSQL's `time` text from the driver's microseconds since midnight */
const pgTimeFromMicroseconds = (value: bigint | number): string => {
	const micros = BigInt(value);
	const seconds = micros / 1_000_000n;
	const fraction = micros % 1_000_000n;
	const hms = `${String(seconds / 3600n).padStart(2, '0')}:${String((seconds / 60n) % 60n).padStart(2, '0')}:${
		String(seconds % 60n).padStart(2, '0')
	}`;
	return fraction === 0n ? hms : `${hms}.${String(fraction).padStart(6, '0').replace(/0+$/, '')}`;
};

/** PostgreSQL's `timetz` text omits zero offset minutes: `12:00:00+05:00` -> `12:00:00+05` */
const pgTimeTzText = (value: string): string =>
	value.endsWith(':00') && value.charCodeAt(value.length - 6) !== 58 /* : */
		? value.slice(0, -3)
		: value;

export const effectPgCodecs = refineGenericPgCodecs({
	bit: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	date: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: dateFromIsoText,
		normalizeArray: arrayCompatNormalize(dateFromIsoText),
	},
	'date:string': {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: pgDateText,
		normalizeArray: arrayCompatNormalize(pgDateText),
	},
	'geometry(point)': {
		normalize: unsupportedCodec('geometry(point)', driver, binaryReason),
		normalizeArray: unsupportedCodec('geometry(point)', driver, binaryReason),
	},
	'geometry(point):tuple': {
		normalize: unsupportedCodec('geometry(point)', driver, binaryReason),
		normalizeArray: unsupportedCodec('geometry(point)', driver, binaryReason),
	},
	'geometry(polygon)': {
		normalizeParamArray: (v) => makePgArray(v),
	},
	interval: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	line: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	'line:tuple': {
		normalizeParamArray: (v) => makePgArray(v),
	},
	macaddr: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('macaddr', driver, binaryReason),
		normalizeArray: unsupportedCodec('macaddr', driver, binaryReason),
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('macaddr8', driver, binaryReason),
		normalizeArray: unsupportedCodec('macaddr8', driver, binaryReason),
	},
	point: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	'point:tuple': {
		normalizeParamArray: (v) => makePgArray(v),
	},
	timestamp: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	timestamptz: {
		normalizeParamArray: (v) => makePgArray(v),
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
	json: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	box: {
		normalizeParamArray: makeBoxArray,
	},
	box2d: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	box3d: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	cidr: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	circle: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	datemultirange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	daterange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	'geography(point)': {
		normalizeParamArray: makeGeometryArray,
	},
	'geography(point):tuple': {
		normalizeParamArray: makeGeometryArray,
	},
	inet: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	int4multirange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	int4range: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	int8multirange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	int8range: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	lseg: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	money: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	nummultirange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	numrange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	oid: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	path: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	polygon: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	raster: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regclass: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regconfig: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regdictionary: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regnamespace: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regoper: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regoperator: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regproc: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regprocedure: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regrole: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	regtype: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	time: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: pgTimeFromMicroseconds,
		normalizeArray: arrayCompatNormalize(pgTimeFromMicroseconds),
	},
	timetz: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: pgTimeTzText,
		normalizeArray: arrayCompatNormalize(pgTimeTzText),
	},
	tsmultirange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsquery: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsrange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	tstzmultirange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	tstzrange: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsvector: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	varbit: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	xml: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	bytea: {
		normalizeInJson: typeof Buffer === 'undefined' ? pgHexToUint8Array : genericPgCodecs.bytea?.normalizeInJson,
		normalizeArrayInJson: typeof Buffer === 'undefined'
			? arrayCompatNormalize(pgHexToUint8Array)
			: genericPgCodecs.bytea?.normalizeArrayInJson,
		normalize: typeof Buffer === 'undefined'
			? undefined
			: (v: Uint8Array) => Buffer.from(v),
		normalizeArray: typeof Buffer === 'undefined'
			? undefined
			: arrayCompatNormalize((v: Uint8Array) => Buffer.from(v)),
		normalizeParamArray: arrayCompatNormalizeInput(bytesToPgHex, true),
	},
	enum: {
		normalizeParamArray: (v) => makePgArray(v),
		normalizeArray: unsupportedCodec('enum[]', driver, binaryReason),
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
	'bigint:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:string': {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: String,
		normalizeArray: arrayCompatNormalize(String),
	},
	'bigserial:number': {
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	// Binary `float4` is widened to float64
	float4: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: shortestFloat32,
		normalizeArray: shortestFloat32Array,
	},
	uuid: {
		normalizeParamArray: (v) => makePgArray(v),
	},
	halfvec: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('halfvec', driver, binaryReason),
		normalizeArray: unsupportedCodec('halfvec', driver, binaryReason),
	},
	sparsevec: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('sparsevec', driver, binaryReason),
		normalizeArray: unsupportedCodec('sparsevec', driver, binaryReason),
	},
	vector: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('vector', driver, binaryReason),
		normalizeArray: unsupportedCodec('vector', driver, binaryReason),
	},
	bigint: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	bigserial: {
		normalizeParamArray: (v) => makePgArray(v),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	// `@effect/sql-pg` can't infer an element type for an empty JS array - array literals are typed by the server
	bool: { normalizeParamArray: (v) => makePgArray(v) },
	char: { normalizeParamArray: (v) => makePgArray(v) },
	varchar: { normalizeParamArray: (v) => makePgArray(v) },
	text: { normalizeParamArray: (v) => makePgArray(v) },
	smallint: { normalizeParamArray: (v) => makePgArray(v) },
	int: { normalizeParamArray: (v) => makePgArray(v) },
	smallserial: { normalizeParamArray: (v) => makePgArray(v) },
	serial: { normalizeParamArray: (v) => makePgArray(v) },
	float8: { normalizeParamArray: (v) => makePgArray(v) },
});
