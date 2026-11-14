import { unsupportedCodec } from '~/codecs.ts';
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
	parsePgVector,
	parsePointTuple,
	parsePointXY,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';

const byteaFromBlob = (v: Uint8Array | Buffer): Buffer => Buffer.from(v);
// `inet::text` always appends netmask, while `inet` output omits it when it's full-width
const inetFromText = (v: string): string =>
	v.endsWith(v.includes(':') ? '/128' : '/32') ? v.slice(0, v.lastIndexOf('/')) : v;

const driver = 'aws-data-api';
const timestamptzTextReason =
	'Data API converts `timestamptz` values to UTC, dropping the offset the server formats in '
	+ "the session's time zone, and accepts no per-query result formats";
const timeTzReason =
	'Data API converts `timetz` values to UTC dropping their offset and accepts no per-query result formats';
const byteaArrayReason = 'Data API has no array type for binary values and returns `bytea[]` empty';

export const awsDataApiPgCodecs = refineGenericPgCodecs({
	json: {
		castParam: (name) => `${name}::json`,
		castArrayParam: (name, _column, dim) => `${name}::json${'[]'.repeat(dim)}`,
		normalize: (v) => JSON.parse(v),
		normalizeArray: arrayCompatNormalize((v: string) => JSON.parse(v)),
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		castParam: (name) => `${name}::jsonb`,
		castArrayParam: (name, _column, dim) => `${name}::jsonb${'[]'.repeat(dim)}`,
		normalize: (v) => JSON.parse(v),
		normalizeArray: arrayCompatNormalize((v: string) => JSON.parse(v)),
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	bytea: {
		castParam: (name) => `${name}::bytea`,
		castArrayParam: (name, _column, dim) => `${name}::bytea${'[]'.repeat(dim)}`,
		normalize: byteaFromBlob,
		normalizeParamArray: (v) => makePgArray(v),
		normalizeArray: unsupportedCodec('bytea[]', driver, byteaArrayReason),
	},
	bit: {
		castParam: (name, column) => `${name}::bit(${column.length})`,
		castArrayParam: (name, column, dim) => `${name}::bit(${column.length})${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'geometry(point)': {
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, _column, dim) => `${name}::geometry${'[]'.repeat(dim)}`,
		normalize: parseGeometryXY,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryXY),
		normalizeParamArray: makeGeometryArray,
	},
	'geometry(point):tuple': {
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, _column, dim) => `${name}::geometry${'[]'.repeat(dim)}`,
		normalize: parseGeometryTuple,
		normalizeArray: parseGeometryArrayAndNormalize(parseGeometryTuple),
		normalizeParamArray: makeGeometryArray,
	},
	interval: {
		castParam: (name) => `${name}::interval`,
		castArrayParam: (name, _column, dim) => `${name}::interval${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	line: {
		castParam: (name) => `${name}::line`,
		castArrayParam: (name, _column, dim) => `${name}::line${'[]'.repeat(dim)}`,
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'line:tuple': {
		castParam: (name) => `${name}::line`,
		castArrayParam: (name, _column, dim) => `${name}::line${'[]'.repeat(dim)}`,
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	macaddr: {
		castParam: (name) => `${name}::macaddr`,
		castArrayParam: (name, _column, dim) => `${name}::macaddr${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castParam: (name) => `${name}::macaddr8`,
		castArrayParam: (name, _column, dim) => `${name}::macaddr8${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	cidr: {
		castParam: (name) => `${name}::cidr`,
		castArrayParam: (name, _column, dim) => `${name}::cidr${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	inet: {
		castParam: (name) => `${name}::inet`,
		castArrayParam: (name, _column, dim) => `${name}::inet${'[]'.repeat(dim)}`,
		normalize: inetFromText,
		normalizeArray: arrayCompatNormalize(inetFromText),
		normalizeParamArray: (v) => makePgArray(v),
	},
	point: {
		castParam: (name) => `${name}::point`,
		castArrayParam: (name, _column, dim) => `${name}::point${'[]'.repeat(dim)}`,
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'point:tuple': {
		castParam: (name) => `${name}::point`,
		castArrayParam: (name, _column, dim) => `${name}::point${'[]'.repeat(dim)}`,
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
		normalizeParamArray: (v) => makePgArray(v),
	},
	halfvec: {
		castParam: (name) => `${name}::halfvec`,
		castArrayParam: (name, _column, dim) => `${name}::halfvec${'[]'.repeat(dim)}`,
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},
	sparsevec: {
		castParam: (name) => `${name}::sparsevec`,
		castArrayParam: (name, _column, dim) => `${name}::sparsevec${'[]'.repeat(dim)}`,
		normalizeArray: (v) => parsePgArray(v),
		normalizeParamArray: (v) => makePgArray(v),
	},
	vector: {
		castParam: (name) => `${name}::vector`,
		castArrayParam: (name, _column, dim) => `${name}::vector${'[]'.repeat(dim)}`,
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeParamArray: (v) => makePgArray(v),
	},

	bool: {
		castParam: (name) => `${name}::boolean`,
		castArrayParam: (name, _column, dim) => `${name}::boolean${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	box: {
		castParam: (name) => `${name}::box`,
		castArrayParam: (name, _column, dim) => `${name}::box${'[]'.repeat(dim)}`,
		normalizeParamArray: makeBoxArray,
	},
	box2d: {
		castParam: (name) => `${name}::box2d`,
		castArrayParam: (name, _column, dim) => `${name}::box2d${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	box3d: {
		castParam: (name) => `${name}::box3d`,
		castArrayParam: (name, _column, dim) => `${name}::box3d${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	char: {
		castParam: (name, column) => `${name}::${column.getSQLType()}`,
		castArrayParam: (name, column, dim) => `${name}::${column.getSQLType()}${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	circle: {
		castParam: (name) => `${name}::circle`,
		castArrayParam: (name, _column, dim) => `${name}::circle${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	datemultirange: {
		castParam: (name) => `${name}::datemultirange`,
		castArrayParam: (name, _column, dim) => `${name}::datemultirange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	daterange: {
		castParam: (name) => `${name}::daterange`,
		castArrayParam: (name, _column, dim) => `${name}::daterange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	float8: {
		castParam: (name) => `${name}::double precision`,
		castArrayParam: (name, _column, dim) => `${name}::double precision${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'geography(point)': {
		castParam: (name) => `${name}::geography`,
		castArrayParam: (name, _column, dim) => `${name}::geography${'[]'.repeat(dim)}`,
		normalizeParamArray: makeGeometryArray,
	},
	'geography(point):tuple': {
		castParam: (name) => `${name}::geography`,
		castArrayParam: (name, _column, dim) => `${name}::geography${'[]'.repeat(dim)}`,
		normalizeParamArray: makeGeometryArray,
	},
	int4multirange: {
		castParam: (name) => `${name}::int4multirange`,
		castArrayParam: (name, _column, dim) => `${name}::int4multirange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int4range: {
		castParam: (name) => `${name}::int4range`,
		castArrayParam: (name, _column, dim) => `${name}::int4range${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int8multirange: {
		castParam: (name) => `${name}::int8multirange`,
		castArrayParam: (name, _column, dim) => `${name}::int8multirange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int8range: {
		castParam: (name) => `${name}::int8range`,
		castArrayParam: (name, _column, dim) => `${name}::int8range${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	lseg: {
		castParam: (name) => `${name}::lseg`,
		castArrayParam: (name, _column, dim) => `${name}::lseg${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	money: {
		castParam: (name) => `${name}::money`,
		castArrayParam: (name, _column, dim) => `${name}::money${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	nummultirange: {
		castParam: (name) => `${name}::nummultirange`,
		castArrayParam: (name, _column, dim) => `${name}::nummultirange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	numrange: {
		castParam: (name) => `${name}::numrange`,
		castArrayParam: (name, _column, dim) => `${name}::numrange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	oid: {
		castParam: (name) => `${name}::oid`,
		castArrayParam: (name, _column, dim) => `${name}::oid${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	path: {
		castParam: (name) => `${name}::path`,
		castArrayParam: (name, _column, dim) => `${name}::path${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	polygon: {
		castParam: (name) => `${name}::polygon`,
		castArrayParam: (name, _column, dim) => `${name}::polygon${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	raster: {
		castParam: (name) => `${name}::raster`,
		castArrayParam: (name, _column, dim) => `${name}::raster${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regclass: {
		castParam: (name) => `${name}::regclass`,
		castArrayParam: (name, _column, dim) => `${name}::regclass${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regconfig: {
		castParam: (name) => `${name}::regconfig`,
		castArrayParam: (name, _column, dim) => `${name}::regconfig${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regdictionary: {
		castParam: (name) => `${name}::regdictionary`,
		castArrayParam: (name, _column, dim) => `${name}::regdictionary${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regnamespace: {
		castParam: (name) => `${name}::regnamespace`,
		castArrayParam: (name, _column, dim) => `${name}::regnamespace${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regoper: {
		castParam: (name) => `${name}::regoper`,
		castArrayParam: (name, _column, dim) => `${name}::regoper${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regoperator: {
		castParam: (name) => `${name}::regoperator`,
		castArrayParam: (name, _column, dim) => `${name}::regoperator${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regproc: {
		castParam: (name) => `${name}::regproc`,
		castArrayParam: (name, _column, dim) => `${name}::regproc${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regprocedure: {
		castParam: (name) => `${name}::regprocedure`,
		castArrayParam: (name, _column, dim) => `${name}::regprocedure${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regrole: {
		castParam: (name) => `${name}::regrole`,
		castArrayParam: (name, _column, dim) => `${name}::regrole${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	regtype: {
		castParam: (name) => `${name}::regtype`,
		castArrayParam: (name, _column, dim) => `${name}::regtype${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	serial: {
		castParam: (name) => `${name}::integer`,
		castArrayParam: (name, _column, dim) => `${name}::integer${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	smallint: {
		castParam: (name) => `${name}::smallint`,
		castArrayParam: (name, _column, dim) => `${name}::smallint${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	smallserial: {
		castParam: (name) => `${name}::smallint`,
		castArrayParam: (name, _column, dim) => `${name}::smallint${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	text: {
		castParam: (name) => `${name}::text`,
		castArrayParam: (name, _column, dim) => `${name}::text${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	// Data API cuts fractional seconds of `time` to milliseconds, text keeps them
	time: {
		castParam: (name) => `${name}::time`,
		castArrayParam: (name, _column, dim) => `${name}::time${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	// Data API converts values with time zones to UTC dropping the offset, text keeps it
	timetz: {
		castParam: (name) => `${name}::timetz`,
		castArrayParam: (name, _column, dim) => `${name}::timetz${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('time with time zone', driver, timeTzReason),
		normalizeArray: unsupportedCodec('time with time zone', driver, timeTzReason),
	},
	tsmultirange: {
		castParam: (name) => `${name}::tsmultirange`,
		castArrayParam: (name, _column, dim) => `${name}::tsmultirange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsquery: {
		castParam: (name) => `${name}::tsquery`,
		castArrayParam: (name, _column, dim) => `${name}::tsquery${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsrange: {
		castParam: (name) => `${name}::tsrange`,
		castArrayParam: (name, _column, dim) => `${name}::tsrange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tstzmultirange: {
		castParam: (name) => `${name}::tstzmultirange`,
		castArrayParam: (name, _column, dim) => `${name}::tstzmultirange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tstzrange: {
		castParam: (name) => `${name}::tstzrange`,
		castArrayParam: (name, _column, dim) => `${name}::tstzrange${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	tsvector: {
		castParam: (name) => `${name}::tsvector`,
		castArrayParam: (name, _column, dim) => `${name}::tsvector${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	varbit: {
		castParam: (name) => `${name}::varbit`,
		castArrayParam: (name, _column, dim) => `${name}::varbit${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	varchar: {
		castParam: (name) => `${name}::varchar`,
		castArrayParam: (name, _column, dim) => `${name}::varchar${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	xml: {
		castParam: (name) => `${name}::xml`,
		castArrayParam: (name, _column, dim) => `${name}::xml${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	enum: {
		castParam: (name, column) => `${name}::${column.getSQLType()}`,
		castArrayParam: (name, column, dimensions) => `${name}::${column.getSQLType()}${'[]'.repeat(dimensions)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	numeric: {
		castParam: (name) => `${name}::numeric`,
		castArrayParam: (name, _column, dim) => `${name}::numeric${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:number': {
		castParam: (name) => `${name}::numeric`,
		castArrayParam: (name, _column, dim) => `${name}::numeric${'[]'.repeat(dim)}`,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'numeric:bigint': {
		castParam: (name) => `${name}::numeric`,
		castArrayParam: (name, _column, dim) => `${name}::numeric${'[]'.repeat(dim)}`,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: (v) => makePgArray(v),
	},
	bigint: {
		castParam: (name) => `${name}::bigint`,
		castArrayParam: (name, _column, dim) => `${name}::bigint${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigint:number': {
		castParam: (name) => `${name}::bigint`,
		castArrayParam: (name, _column, dim) => `${name}::bigint${'[]'.repeat(dim)}`,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	'bigint:string': {
		castParam: (name) => `${name}::bigint`,
		castArrayParam: (name, _column, dim) => `${name}::bigint${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: String,
		normalizeArray: arrayCompatNormalize(String),
	},
	bigserial: {
		castParam: (name) => `${name}::bigint`,
		castArrayParam: (name, _column, dim) => `${name}::bigint${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigserial:number': {
		castParam: (name) => `${name}::bigint`,
		castArrayParam: (name, _column, dim) => `${name}::bigint${'[]'.repeat(dim)}`,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: (v) => makePgArray(v),
	},
	date: {
		castParam: (name) => `${name}::date`,
		castArrayParam: (name, _column, dim) => `${name}::date${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'date:string': {
		castParam: (name) => `${name}::date`,
		castArrayParam: (name, _column, dim) => `${name}::date${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	float4: {
		castParam: (name) => `${name}::real`,
		castArrayParam: (name, _column, dim) => `${name}::real${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	int: {
		castParam: (name) => `${name}::integer`,
		castArrayParam: (name, _column, dim) => `${name}::integer${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	// Data API drops the `BC` suffix of `timestamp`s with fractional seconds
	timestamp: {
		castParam: (name) => `${name}::timestamp`,
		castArrayParam: (name, _column, dim) => `${name}::timestamp${'[]'.repeat(dim)}`,
		normalizeParam: (value) => value.replace('T', ' ').replace('Z', ''),
		normalizeParamArray: (v) => makePgArray(v),
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		castParam: (name) => `${name}::timestamptz`,
		castArrayParam: (name, _column, dim) => `${name}::timestamptz${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
	},
	'timestamp:string': {
		castParam: (name) => `${name}::timestamp`,
		castArrayParam: (name, _column, dim) => `${name}::timestamp${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
	'timestamptz:string': {
		castParam: (name) => `${name}::timestamptz`,
		castArrayParam: (name, _column, dim) => `${name}::timestamptz${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
		normalize: unsupportedCodec('timestamp with time zone', driver, timestamptzTextReason),
		normalizeArray: unsupportedCodec('timestamp with time zone', driver, timestamptzTextReason),
	},
	uuid: {
		castParam: (name) => `${name}::uuid`,
		castArrayParam: (name, _column, dim) => `${name}::uuid${'[]'.repeat(dim)}`,
		normalizeParamArray: (v) => makePgArray(v),
	},
});
