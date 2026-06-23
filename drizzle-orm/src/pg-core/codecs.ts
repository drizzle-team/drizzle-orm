import {
	type CastArrayCodec,
	type CastCodec,
	type Codecs,
	type NormalizeArrayCodec,
	type NormalizeCodec,
	refineCodecs,
} from '~/codecs.ts';
import { type Name, sql, type SQLChunk } from '~/sql/sql.ts';
import type { PartialWithUndefined } from '~/utils.ts';
import { makePgArray, parsePgArray } from './array.ts';
import { parseEWKB } from './columns/postgis_extension/utils.ts';

export type PostGISType =
	| 'geometry(point)'
	| 'geometry(pointz)'
	| 'geometry(pointm)'
	| 'geometry(pointzm)'
	| 'geometry(linestring)'
	| 'geometry(linestringz)'
	| 'geometry(linestringm)'
	| 'geometry(linestringzm)'
	| 'geometry(polygon)'
	| 'geometry(polygonz)'
	| 'geometry(polygonm)'
	| 'geometry(polygonzm)'
	| 'geometry(multipoint)'
	| 'geometry(multipointz)'
	| 'geometry(multipointm)'
	| 'geometry(multipointzm)'
	| 'geometry(multilinestring)'
	| 'geometry(multilinestringz)'
	| 'geometry(multilinestringm)'
	| 'geometry(multilinestringzm)'
	| 'geometry(multipolygon)'
	| 'geometry(multipolygonz)'
	| 'geometry(multipolygonm)'
	| 'geometry(multipolygonzm)'
	| 'geometry(geometrycollection)'
	| 'geometry(geometrycollectionz)'
	| 'geometry(geometrycollectionm)'
	| 'geometry(geometrycollectionzm)'
	| 'geometry(circularstring)'
	| 'geometry(circularstringz)'
	| 'geometry(circularstringm)'
	| 'geometry(circularstringzm)'
	| 'geometry(compoundcurve)'
	| 'geometry(compoundcurvez)'
	| 'geometry(compoundcurvem)'
	| 'geometry(compoundcurvezm)'
	| 'geometry(curvepolygon)'
	| 'geometry(curvepolygonz)'
	| 'geometry(curvepolygonm)'
	| 'geometry(curvepolygonzm)'
	| 'geometry(multicurve)'
	| 'geometry(multicurvez)'
	| 'geometry(multicurvem)'
	| 'geometry(multicurvezm)'
	| 'geometry(multisurface)'
	| 'geometry(multisurfacez)'
	| 'geometry(multisurfacem)'
	| 'geometry(multisurfacezm)'
	| 'geometry(polyhedralsurface)'
	| 'geometry(polyhedralsurfacez)'
	| 'geometry(polyhedralsurfacem)'
	| 'geometry(polyhedralsurfacezm)'
	| 'geometry(tin)'
	| 'geometry(tinz)'
	| 'geometry(tinm)'
	| 'geometry(tinzm)'
	| 'geometry(triangle)'
	| 'geometry(trianglez)'
	| 'geometry(trianglem)'
	| 'geometry(trianglezm)'
	| 'geography(point)'
	| 'geography(linestring)'
	| 'geography(polygon)'
	| 'geography(multipoint)'
	| 'geography(multilinestring)'
	| 'geography(multipolygon)'
	| 'geography(geometrycollection)'
	| 'box2d'
	| 'box3d'
	| 'raster';

export type PostgresType =
	// Numeric
	| 'smallint'
	| 'int'
	| 'bigint'
	| 'bigint:number'
	| 'bigint:string'
	| 'numeric'
	| 'numeric:number'
	| 'numeric:bigint'
	| 'float4'
	| 'float8'
	| 'money'
	| 'smallserial'
	| 'serial'
	| 'bigserial'
	| 'bigserial:number'
	// Text
	| 'char'
	| 'varchar'
	| 'text'
	// Binary
	| 'bytea'
	// Datetime
	| 'date'
	| 'date:string'
	| 'time'
	| 'timetz'
	| 'timestamp'
	| 'timestamptz'
	| 'timestamp:string'
	| 'timestamptz:string'
	| 'interval'
	| 'interval:tuple'
	// Boolean
	| 'bool'
	// Enumerated
	| 'enum'
	// Geometric
	| 'point'
	| 'point:tuple'
	| 'line'
	| 'line:tuple'
	| 'lseg'
	| 'box'
	| 'path'
	| 'polygon'
	| 'circle'
	// Network Address
	| 'cidr'
	| 'inet'
	| 'macaddr'
	| 'macaddr8'
	// Bit String
	| 'bit'
	| 'varbit'
	// Full-Text Search
	| 'tsvector'
	| 'tsquery'
	// UUID
	| 'uuid'
	// XML
	| 'xml'
	// JSON
	| 'json'
	| 'jsonb'
	// Range
	| 'int4range'
	| 'int8range'
	| 'numrange'
	| 'tsrange'
	| 'tstzrange'
	| 'daterange'
	// Multirange
	| 'int4multirange'
	| 'int8multirange'
	| 'nummultirange'
	| 'tsmultirange'
	| 'tstzmultirange'
	| 'datemultirange'
	// Object Identifier / System Reference
	| 'oid'
	| 'regproc'
	| 'regprocedure'
	| 'regoper'
	| 'regoperator'
	| 'regclass'
	| 'regtype'
	| 'regrole'
	| 'regnamespace'
	| 'regconfig'
	| 'regdictionary'
	// PostGIS
	| PostGISType
	| `${PostGISType}:tuple`
	// pgvector
	| 'halfvec'
	| 'sparsevec'
	| 'vector';

// Some originals were swapped with aliases for simpler keys
export type PostgresAliasType =
	// Numeric
	| 'int2' // smallint
	| 'integer' // int
	| 'int4' // int
	| 'int8' // bigint
	| 'decimal' // numeric
	| 'real' // float4
	| 'double' // float8
	| 'double precision' // float8
	| 'serial2' // smallserial
	| 'serial4' // serial
	| 'serial8' // bigserial
	// Text
	| 'character' // char
	| 'character varying' // varchar
	// Datetime
	| 'time with time zone' // timetz
	| 'time without time zone' // timetz
	| 'timestamp with time zone' // timestamptz
	| 'timestamp without time zone' // timestamptz
	// Boolean
	| 'boolean' // bool
	// Bit String
	| 'bit varying'; // varbit;

export type PostgresColumnType =
	| PostgresType
	| PostgresAliasType;

const PG_ALIAS_TO_TYPE_MAP: Record<PostgresAliasType, PostgresType> = {
	int2: 'smallint',
	integer: 'int',
	int4: 'int',
	int8: 'bigint',
	decimal: 'numeric',
	real: 'float4',
	double: 'float8',
	'double precision': 'float8',
	serial2: 'smallserial',
	serial4: 'serial',
	serial8: 'bigserial',
	character: 'char',
	'character varying': 'varchar',
	'time with time zone': 'timetz',
	'time without time zone': 'time',
	'timestamp with time zone': 'timestamptz',
	'timestamp without time zone': 'timestamp',
	boolean: 'bool',
	'bit varying': 'varbit',
};

export function resolvePgTypeAlias(type: string) {
	return (PG_ALIAS_TO_TYPE_MAP as Record<string, PostgresType | undefined>)[type] ?? type;
}

// Cross-type unions mutate data types
// update codec based on type combination
export const unionsTypeTable = {
	smallint: {
		smallint: 'smallint',
		int: 'int',
		bigint: 'bigint:number',
		'bigint:number': 'bigint:number',
		'bigint:string': 'bigint:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'smallint',
		serial: 'int',
		bigserial: 'bigint:number',
		'bigserial:number': 'bigint:number',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	int: {
		smallint: 'int',
		int: 'int',
		bigint: 'bigint:number',
		'bigint:number': 'bigint:number',
		'bigint:string': 'bigint:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'int',
		serial: 'int',
		bigserial: 'bigint:number',
		'bigserial:number': 'bigint:number',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	bigint: {
		smallint: 'bigint',
		int: 'bigint',
		bigint: 'bigint',
		'bigint:number': 'bigint',
		'bigint:string': 'bigint',
		numeric: 'numeric:bigint',
		'numeric:number': 'numeric:bigint',
		'numeric:bigint': 'numeric:bigint',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'bigint',
		serial: 'bigint',
		bigserial: 'bigint',
		'bigserial:number': 'bigint',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	'bigint:number': {
		smallint: 'bigint:number',
		int: 'bigint:number',
		bigint: 'bigint:number',
		'bigint:number': 'bigint:number',
		'bigint:string': 'bigint:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'bigint:number',
		serial: 'bigint:number',
		bigserial: 'bigint:number',
		'bigserial:number': 'bigint:number',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	'bigint:string': {
		smallint: 'bigint:string',
		int: 'bigint:string',
		bigint: 'bigint:string',
		'bigint:number': 'bigint:string',
		'bigint:string': 'bigint:string',
		numeric: 'numeric',
		'numeric:number': 'numeric',
		'numeric:bigint': 'numeric',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'bigint:string',
		serial: 'bigint:string',
		bigserial: 'bigint:string',
		'bigserial:number': 'bigint:string',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	numeric: {
		smallint: 'numeric',
		int: 'numeric',
		bigint: 'numeric',
		'bigint:number': 'numeric',
		'bigint:string': 'numeric',
		numeric: 'numeric',
		'numeric:number': 'numeric',
		'numeric:bigint': 'numeric',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'numeric',
		serial: 'numeric',
		bigserial: 'numeric',
		'bigserial:number': 'numeric',
	},
	'numeric:number': {
		smallint: 'numeric:number',
		int: 'numeric:number',
		bigint: 'numeric:number',
		'bigint:number': 'numeric:number',
		'bigint:string': 'numeric:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'numeric:number',
		serial: 'numeric:number',
		bigserial: 'numeric:number',
		'bigserial:number': 'numeric:number',
	},
	'numeric:bigint': {
		smallint: 'numeric:bigint',
		int: 'numeric:bigint',
		bigint: 'numeric:bigint',
		'bigint:number': 'numeric:bigint',
		'bigint:string': 'numeric:bigint',
		numeric: 'numeric:bigint',
		'numeric:number': 'numeric:bigint',
		'numeric:bigint': 'numeric:bigint',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'numeric:bigint',
		serial: 'numeric:bigint',
		bigserial: 'numeric:bigint',
		'bigserial:number': 'numeric:bigint',
	},
	float4: {
		smallint: 'float4',
		int: 'float4',
		bigint: 'float4',
		'bigint:number': 'float4',
		'bigint:string': 'float4',
		numeric: 'float4',
		'numeric:number': 'float4',
		'numeric:bigint': 'float4',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'float4',
		serial: 'float4',
		bigserial: 'float4',
		'bigserial:number': 'float4',
	},
	float8: {
		smallint: 'float8',
		int: 'float8',
		bigint: 'float8',
		'bigint:number': 'float8',
		'bigint:string': 'float8',
		numeric: 'float8',
		'numeric:number': 'float8',
		'numeric:bigint': 'float8',
		float4: 'float8',
		float8: 'float8',
		smallserial: 'float8',
		serial: 'float8',
		bigserial: 'float8',
		'bigserial:number': 'float8',
	},
	money: {
		money: 'money',
	},
	smallserial: {
		smallint: 'smallint',
		int: 'int',
		bigint: 'bigint:number',
		'bigint:number': 'bigint:number',
		'bigint:string': 'bigint:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'smallint',
		serial: 'int',
		bigserial: 'bigint:number',
		'bigserial:number': 'bigint:number',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	serial: {
		smallint: 'int',
		int: 'int',
		bigint: 'bigint:number',
		'bigint:number': 'bigint:number',
		'bigint:string': 'bigint:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'int',
		serial: 'int',
		bigserial: 'bigint:number',
		'bigserial:number': 'bigint:number',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	bigserial: {
		smallint: 'bigint',
		int: 'bigint',
		bigint: 'bigint',
		'bigint:number': 'bigint',
		'bigint:string': 'bigint',
		numeric: 'numeric:bigint',
		'numeric:number': 'numeric:bigint',
		'numeric:bigint': 'numeric:bigint',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'bigint',
		serial: 'bigint',
		bigserial: 'bigint',
		'bigserial:number': 'bigint',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	'bigserial:number': {
		smallint: 'bigint:number',
		int: 'bigint:number',
		bigint: 'bigint:number',
		'bigint:number': 'bigint:number',
		'bigint:string': 'bigint:number',
		numeric: 'numeric:number',
		'numeric:number': 'numeric:number',
		'numeric:bigint': 'numeric:number',
		float4: 'float4',
		float8: 'float8',
		smallserial: 'bigint:number',
		serial: 'bigint:number',
		bigserial: 'bigint:number',
		'bigserial:number': 'bigint:number',
		oid: 'oid',
		regproc: 'regproc',
		regprocedure: 'regprocedure',
		regoper: 'regoper',
		regoperator: 'regoperator',
		regclass: 'regclass',
		regtype: 'regtype',
		regrole: 'regrole',
		regnamespace: 'regnamespace',
		regconfig: 'regconfig',
		regdictionary: 'regdictionary',
	},
	char: {
		char: 'char',
		varchar: 'char',
		text: 'char',
	},
	varchar: {
		char: 'varchar',
		varchar: 'varchar',
		text: 'varchar',
	},
	text: {
		char: 'text',
		varchar: 'text',
		text: 'text',
	},
	bytea: {
		bytea: 'bytea',
	},
	date: {
		date: 'date',
		'date:string': 'date',
		timestamp: 'timestamp',
		'timestamp:string': 'timestamp',
		timestamptz: 'timestamptz',
		'timestamptz:string': 'timestamptz',
	},
	'date:string': {
		date: 'date:string',
		'date:string': 'date:string',
		timestamp: 'timestamp:string',
		'timestamp:string': 'timestamp:string',
		timestamptz: 'timestamptz:string',
		'timestamptz:string': 'timestamptz:string',
	},
	time: {
		time: 'time',
		timetz: 'timetz',
	},
	timetz: {
		time: 'timetz',
		timetz: 'timetz',
	},
	timestamp: {
		date: 'timestamp',
		'date:string': 'timestamp',
		timestamp: 'timestamp',
		'timestamp:string': 'timestamp',
		timestamptz: 'timestamptz',
		'timestamptz:string': 'timestamptz',
	},
	'timestamp:string': {
		date: 'timestamp:string',
		'date:string': 'timestamp:string',
		timestamp: 'timestamp:string',
		'timestamp:string': 'timestamp:string',
		timestamptz: 'timestamptz:string',
		'timestamptz:string': 'timestamptz:string',
	},
	timestamptz: {
		date: 'timestamptz',
		'date:string': 'timestamptz',
		timestamp: 'timestamptz',
		'timestamp:string': 'timestamptz',
		timestamptz: 'timestamptz',
		'timestamptz:string': 'timestamptz',
	},
	'timestamptz:string': {
		date: 'timestamptz:string',
		'date:string': 'timestamptz:string',
		timestamp: 'timestamptz:string',
		'timestamp:string': 'timestamptz:string',
		timestamptz: 'timestamptz:string',
		'timestamptz:string': 'timestamptz:string',
	},
	interval: {
		interval: 'interval',
		'interval:tuple': 'interval',
	},
	'interval:tuple': {
		interval: 'interval:tuple',
		'interval:tuple': 'interval:tuple',
	},
	bool: {
		bool: 'bool',
	},
	enum: {
		enum: 'enum',
	},
	point: {
		point: 'point',
		'point:tuple': 'point',
	},
	'point:tuple': {
		point: 'point:tuple',
		'point:tuple': 'point:tuple',
	},
	line: {
		line: 'line',
		'line:tuple': 'line',
	},
	'line:tuple': {
		line: 'line:tuple',
		'line:tuple': 'line:tuple',
	},
	lseg: {
		lseg: 'lseg',
	},
	box: {
		box: 'box',
	},
	path: {
		path: 'path',
	},
	polygon: {
		polygon: 'polygon',
	},
	circle: {
		circle: 'circle',
	},
	cidr: {
		cidr: 'cidr',
		inet: 'inet',
	},
	inet: {
		cidr: 'inet',
		inet: 'inet',
	},
	macaddr: {
		macaddr: 'macaddr',
		macaddr8: 'macaddr',
	},
	macaddr8: {
		macaddr: 'macaddr8',
		macaddr8: 'macaddr8',
	},
	bit: {
		bit: 'bit',
		varbit: 'bit',
	},
	varbit: {
		bit: 'varbit',
		varbit: 'varbit',
	},
	tsvector: {
		tsvector: 'tsvector',
	},
	tsquery: {
		tsquery: 'tsquery',
	},
	uuid: {
		uuid: 'uuid',
	},
	xml: {
		xml: 'xml',
	},
	json: {
		json: 'json',
	},
	jsonb: {
		jsonb: 'jsonb',
	},
	int4range: {
		int4range: 'int4range',
	},
	int8range: {
		int8range: 'int8range',
	},
	numrange: {
		numrange: 'numrange',
	},
	tsrange: {
		tsrange: 'tsrange',
	},
	tstzrange: {
		tstzrange: 'tstzrange',
	},
	daterange: {
		daterange: 'daterange',
	},
	int4multirange: {
		int4multirange: 'int4multirange',
	},
	int8multirange: {
		int8multirange: 'int8multirange',
	},
	nummultirange: {
		nummultirange: 'nummultirange',
	},
	tsmultirange: {
		tsmultirange: 'tsmultirange',
	},
	tstzmultirange: {
		tstzmultirange: 'tstzmultirange',
	},
	datemultirange: {
		datemultirange: 'datemultirange',
	},
	oid: {
		smallint: 'oid',
		int: 'oid',
		bigint: 'oid',
		'bigint:number': 'oid',
		'bigint:string': 'oid',
		smallserial: 'oid',
		serial: 'oid',
		bigserial: 'oid',
		'bigserial:number': 'oid',
		oid: 'oid',
		regproc: 'oid',
		regprocedure: 'oid',
		regoper: 'oid',
		regoperator: 'oid',
		regclass: 'oid',
		regtype: 'oid',
		regrole: 'oid',
		regnamespace: 'oid',
		regconfig: 'oid',
		regdictionary: 'oid',
	},
	regproc: {
		smallint: 'regproc',
		int: 'regproc',
		bigint: 'regproc',
		'bigint:number': 'regproc',
		'bigint:string': 'regproc',
		smallserial: 'regproc',
		serial: 'regproc',
		bigserial: 'regproc',
		'bigserial:number': 'regproc',
		oid: 'regproc',
		regproc: 'regproc',
		regprocedure: 'regproc',
	},
	regprocedure: {
		smallint: 'regprocedure',
		int: 'regprocedure',
		bigint: 'regprocedure',
		'bigint:number': 'regprocedure',
		'bigint:string': 'regprocedure',
		smallserial: 'regprocedure',
		serial: 'regprocedure',
		bigserial: 'regprocedure',
		'bigserial:number': 'regprocedure',
		oid: 'regprocedure',
		regproc: 'regprocedure',
		regprocedure: 'regprocedure',
	},
	regoper: {
		smallint: 'regoper',
		int: 'regoper',
		bigint: 'regoper',
		'bigint:number': 'regoper',
		'bigint:string': 'regoper',
		smallserial: 'regoper',
		serial: 'regoper',
		bigserial: 'regoper',
		'bigserial:number': 'regoper',
		oid: 'regoper',
		regoper: 'regoper',
		regoperator: 'regoper',
	},
	regoperator: {
		smallint: 'regoperator',
		int: 'regoperator',
		bigint: 'regoperator',
		'bigint:number': 'regoperator',
		'bigint:string': 'regoperator',
		smallserial: 'regoperator',
		serial: 'regoperator',
		bigserial: 'regoperator',
		'bigserial:number': 'regoperator',
		oid: 'regoperator',
		regoper: 'regoperator',
		regoperator: 'regoperator',
	},
	regclass: {
		smallint: 'regclass',
		int: 'regclass',
		bigint: 'regclass',
		'bigint:number': 'regclass',
		'bigint:string': 'regclass',
		smallserial: 'regclass',
		serial: 'regclass',
		bigserial: 'regclass',
		'bigserial:number': 'regclass',
		oid: 'regclass',
		regclass: 'regclass',
	},
	regtype: {
		smallint: 'regtype',
		int: 'regtype',
		bigint: 'regtype',
		'bigint:number': 'regtype',
		'bigint:string': 'regtype',
		smallserial: 'regtype',
		serial: 'regtype',
		bigserial: 'regtype',
		'bigserial:number': 'regtype',
		oid: 'regtype',
		regtype: 'regtype',
	},
	regrole: {
		smallint: 'regrole',
		int: 'regrole',
		bigint: 'regrole',
		'bigint:number': 'regrole',
		'bigint:string': 'regrole',
		smallserial: 'regrole',
		serial: 'regrole',
		bigserial: 'regrole',
		'bigserial:number': 'regrole',
		oid: 'regrole',
		regrole: 'regrole',
	},
	regnamespace: {
		smallint: 'regnamespace',
		int: 'regnamespace',
		bigint: 'regnamespace',
		'bigint:number': 'regnamespace',
		'bigint:string': 'regnamespace',
		smallserial: 'regnamespace',
		serial: 'regnamespace',
		bigserial: 'regnamespace',
		'bigserial:number': 'regnamespace',
		oid: 'regnamespace',
		regnamespace: 'regnamespace',
	},
	regconfig: {
		smallint: 'regconfig',
		int: 'regconfig',
		bigint: 'regconfig',
		'bigint:number': 'regconfig',
		'bigint:string': 'regconfig',
		smallserial: 'regconfig',
		serial: 'regconfig',
		bigserial: 'regconfig',
		'bigserial:number': 'regconfig',
		oid: 'regconfig',
		regconfig: 'regconfig',
	},
	regdictionary: {
		smallint: 'regdictionary',
		int: 'regdictionary',
		bigint: 'regdictionary',
		'bigint:number': 'regdictionary',
		'bigint:string': 'regdictionary',
		smallserial: 'regdictionary',
		serial: 'regdictionary',
		bigserial: 'regdictionary',
		'bigserial:number': 'regdictionary',
		oid: 'regdictionary',
		regdictionary: 'regdictionary',
	},
} as const satisfies Partial<Record<PostgresColumnType, Partial<Record<PostgresColumnType, PostgresColumnType>>>>;

export type PgCodecs = Codecs<PostgresType>;

export const castToText: CastCodec = (name) => sql`${name}::text`;
export const castToTextArr: CastArrayCodec = (name, arrayDimensions) =>
	sql`${name}::text${sql.raw('[]'.repeat(arrayDimensions))}`;

/** Used for cases when casting requires to unwrap and rebuild arrays
 *
 * @example
 * string_mtx::text[][] // can be casted to array directly
 *
 * encode(bytea_mtx, 'base64')[][] // invalid syntax, cast requires unwrapping and rebuilding array
 */
export const arrayCompatCast = (cast: CastCodec) =>
(
	name: SQLChunk,
	arrayDimensions: number | undefined,
): SQLChunk => {
	if (!arrayDimensions) return cast(name);

	const aliases: Name[] = [];
	for (let i = 0; i < arrayDimensions; i++) {
		aliases.push(sql.identifier(`s${i}`));
	}

	let indexed = name;
	for (const alias of aliases) {
		indexed = sql`${indexed}[${alias}]`;
	}

	let expression = sql`array(\
select ${cast(indexed)} \
from generate_subscripts(${name}, ${sql.raw(arrayDimensions.toString())}) ${aliases[arrayDimensions - 1]} \
order by ${aliases[arrayDimensions - 1]})`;

	for (let dim = arrayDimensions - 1; dim > 0; dim--) {
		expression = sql`array(\
select ${expression} \
from generate_subscripts(${name}, ${sql.raw(dim.toString())}) ${aliases[dim - 1]} \
order by ${aliases[dim - 1]})`;
	}

	// Otherwise null returns as []
	return sql`case when ${name} is null then null else ${expression} end`;
};

/** Used to recursively apply value normalizer to array of unknown dimensions */
export const arrayCompatNormalize = (normalize: NormalizeCodec) => {
	const loop: NormalizeArrayCodec = (value, arrayDimensions) => {
		const innerDimensions = arrayDimensions - 1;
		if (arrayDimensions > 1) {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				loop((value as unknown[][])[i]!, innerDimensions);
			}
		} else {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				value[i] = normalize((value as unknown[][])[i]!);
			}
		}

		return value;
	};

	return loop;
};

/** Doesn't mutate original data - used for insertions */
export const arrayCompatNormalizeInput = (normalize: NormalizeCodec, transformToPgArray = false) => {
	const loop: NormalizeArrayCodec = (value, arrayDimensions): any => {
		const innerDimensions = arrayDimensions - 1;
		const out = Array.from({ length: value.length });
		if (arrayDimensions > 1) {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				out[i] = loop((value as unknown[][])[i]!, innerDimensions);
			}
		} else {
			for (let i = 0; i < (value as unknown[][]).length; ++i) {
				out[i] = normalize((value as unknown[][])[i]!);
			}
		}

		return out;
	};

	return transformToPgArray ? (v: any, d: number) => makePgArray(loop(v, d)) : loop;
};

/** Parses a raw PG array text representation, then applies a per-item normalizer */
export const parsePgArrayAndNormalize = (normalize: NormalizeCodec): NormalizeArrayCodec => {
	const codec = arrayCompatNormalize(normalize);
	return (value, arrayDimensions) => codec(parsePgArray(value), arrayDimensions);
};

export const parseLineTuple = (v: string): [number, number, number] => {
	const [a, b, c] = v.slice(1, -1).split(',');
	return [Number.parseFloat(a!), Number.parseFloat(b!), Number.parseFloat(c!)];
};

export const parseLineABC = (v: string): { a: number; b: number; c: number } => {
	const [a, b, c] = v.slice(1, -1).split(',');
	return { a: Number.parseFloat(a!), b: Number.parseFloat(b!), c: Number.parseFloat(c!) };
};

export const parsePointTuple = (v: string): [number, number] => {
	const [x, y] = v.slice(1, -1).split(',');
	return [Number.parseFloat(x!), Number.parseFloat(y!)];
};

export const parsePointXY = (v: string): { x: number; y: number } => {
	const [x, y] = v.slice(1, -1).split(',');
	return { x: Number.parseFloat(x!), y: Number.parseFloat(y!) };
};

export const parseGeometryTuple = (v: string): [number, number] => parseEWKB(v).point;

export const parseGeometryXY = (v: string): { x: number; y: number } => {
	const parsed = parseEWKB(v);
	return { x: parsed.point[0], y: parsed.point[1] };
};

export const textToDate = (v: string): Date => new Date(v);
export const textToDateWithTz = (v: string): Date => new Date(v + '+0000');

export const parsePgVector = (v: string): number[] => {
	const body = v.slice(1, -1);
	if (body.length === 0) return [];
	return body.split(',').map(Number.parseFloat);
};

export const genericPgCodecs = {
	bytea: {
		castInJson: (name) => sql`encode(${name}, 'base64')`,
		castArrayInJson: arrayCompatCast((name) => sql`encode(${name}, 'base64')`),
		normalizeInJson: (v: string) => Buffer.from(v, 'base64'),
		normalizeArrayInJson: arrayCompatNormalize((v: string) => Buffer.from(v, 'base64')),
	},
	bigint: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
	},
	'bigint:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	'bigint:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	bigserial: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	'bigserial:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	date: {
		normalizeInJson: textToDate,
		normalizeArrayInJson: arrayCompatNormalize(textToDate),
	},
	'date:string': {},
	enum: {
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	'geometry(point)': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseGeometryXY,
		normalizeArray: arrayCompatNormalize(parseGeometryXY),
		normalizeInJson: parseGeometryXY,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryXY),
	},
	'geometry(point):tuple': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseGeometryTuple,
		normalizeArray: arrayCompatNormalize(parseGeometryTuple),
		normalizeInJson: parseGeometryTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseGeometryTuple),
	},
	interval: {
		castArrayInJson: castToTextArr,
	},
	json: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	line: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseLineABC,
		normalizeArray: arrayCompatNormalize(parseLineABC),
		normalizeInJson: parseLineABC,
		normalizeArrayInJson: arrayCompatNormalize(parseLineABC),
	},
	'line:tuple': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parseLineTuple,
		normalizeArray: arrayCompatNormalize(parseLineTuple),
		normalizeInJson: parseLineTuple,
		normalizeArrayInJson: arrayCompatNormalize(parseLineTuple),
	},
	numeric: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	'numeric:number': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeInJson: Number,
		normalizeArrayInJson: arrayCompatNormalize(Number),
	},
	'numeric:bigint': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeInJson: BigInt,
		normalizeArrayInJson: arrayCompatNormalize(BigInt),
	},
	point: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parsePointXY,
		normalizeArray: arrayCompatNormalize(parsePointXY),
		normalizeInJson: parsePointXY,
		normalizeArrayInJson: arrayCompatNormalize(parsePointXY),
	},
	'point:tuple': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalize: parsePointTuple,
		normalizeArray: arrayCompatNormalize(parsePointTuple),
		normalizeInJson: parsePointTuple,
		normalizeArrayInJson: arrayCompatNormalize(parsePointTuple),
	},
	timestamp: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: textToDateWithTz,
		normalizeArrayInJson: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		normalizeInJson: textToDate,
		normalizeArrayInJson: arrayCompatNormalize(textToDate),
	},
	'timestamp:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	'timestamptz:string': {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
	},
	halfvec: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
	vector: {
		normalize: parsePgVector,
		normalizeArray: parsePgArrayAndNormalize(parsePgVector),
		normalizeInJson: parsePgVector,
		normalizeArrayInJson: arrayCompatNormalize(parsePgVector),
	},
} as const satisfies PgCodecs;

export const refineGenericPgCodecs = (extension?: PartialWithUndefined<PgCodecs>): PgCodecs =>
	refineCodecs<PostgresType>(genericPgCodecs, extension);
