import { is } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	bit,
	boolean,
	bytea,
	char,
	cidr,
	customType,
	date,
	doublePrecision,
	geometry,
	halfvec,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	PgBigInt53,
	PgBigInt64,
	PgBigIntString,
	PgBigSerial53,
	PgBigSerial64,
	PgBinaryVector,
	PgBoolean,
	PgBytea,
	PgChar,
	PgCidr,
	PgCustomColumn,
	PgDate,
	PgDateString,
	PgDoublePrecision,
	pgEnum,
	PgEnumColumn,
	PgEnumObjectColumn,
	PgGeometry,
	PgGeometryObject,
	PgHalfVector,
	PgInet,
	PgInteger,
	PgInterval,
	PgJson,
	PgJsonb,
	PgLineABC,
	PgLineTuple,
	PgMacaddr,
	PgMacaddr8,
	PgNumeric,
	PgNumericBigInt,
	PgNumericNumber,
	PgPointObject,
	PgPointTuple,
	PgReal,
	PgSerial,
	PgSmallInt,
	PgSmallSerial,
	PgSparseVector,
	pgTable,
	PgText,
	PgTime,
	PgTimestamp,
	PgTimestampString,
	PgUUID,
	PgVarchar,
	PgVector,
	point,
	real,
	serial,
	smallint,
	smallserial,
	sparsevec,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/pg-core';
import { expectTypeOf } from 'vitest';

enum Letters {
	A = 'a',
	B = 'b',
}

const table = pgTable('table', {
	bigint53: bigint({ mode: 'number' }),
	bigint64: bigint({ mode: 'bigint' }),
	bigintString: bigint({ mode: 'string' }),
	bigserial53: bigserial({ mode: 'number' }),
	bigserial64: bigserial({ mode: 'bigint' }),
	bytea: bytea(),
	boolean: boolean(),
	char: char(),
	charEnum: char({ enum: ['a', 'b'] }),
	charEnumNotNull: char({ enum: ['a', 'b'] }).notNull(),
	cidr: cidr(),
	custom: customType<{ data: string }>({ dataType: () => 'custom' })(),
	date: date({ mode: 'date' }),
	dateString: date({ mode: 'string' }),
	doublePrecision: doublePrecision(),
	inet: inet(),
	integer: integer(),
	interval: interval(),
	json: json(),
	jsonb: jsonb(),
	line: line({ mode: 'tuple' }),
	lineAbc: line({ mode: 'abc' }),
	macaddr: macaddr(),
	macaddr8: macaddr8(),
	numeric: numeric(),
	numericNumber: numeric({ mode: 'number' }),
	numericBigint: numeric({ mode: 'bigint' }),
	point: point({ mode: 'tuple' }),
	pointXy: point({ mode: 'xy' }),
	geometry: geometry({ mode: 'tuple' }),
	geometryXy: geometry({ mode: 'xy' }),
	real: real(),
	serial: serial(),
	smallint: smallint(),
	smallserial: smallserial(),
	text: text(),
	textEnum: text({ enum: ['a', 'b'] }),
	textEnumNotNull: text({ enum: ['a', 'b'] }).notNull(),
	textType: text().$type<'a' | 'b'>(),
	textArray: text().array(),
	textEnumArray: text({ enum: ['a', 'b'] }).array(),
	time: time(),
	timestamp: timestamp(),
	timestampString: timestamp({ mode: 'string' }),
	uuid: uuid(),
	varchar: varchar(),
	varcharEnum: varchar({ enum: ['a', 'b'] }),
	varcharEnumNotNull: varchar({ enum: ['a', 'b'] }).notNull(),
	bit: bit({ dimensions: 3 }),
	halfvec: halfvec({ dimensions: 3 }),
	sparsevec: sparsevec({ dimensions: 3 }),
	vector: vector({ dimensions: 3 }),
	pgEnum: pgEnum('enum', ['a', 'b'])(),
	pgEnumObject: pgEnum('enum_object', Letters)(),
});

type Table = typeof table;

if (is(table.bigint53, PgBigInt53)) {
	expectTypeOf(table.bigint53).not.toBeNever();
	expectTypeOf(table.bigint53.dataType).toEqualTypeOf<Table['bigint53']['dataType']>();
}

if (is(table.bigint64, PgBigInt64)) {
	expectTypeOf(table.bigint64).not.toBeNever();
	expectTypeOf(table.bigint64.dataType).toEqualTypeOf<Table['bigint64']['dataType']>();
}

if (is(table.bigintString, PgBigIntString)) {
	expectTypeOf(table.bigintString).not.toBeNever();
	expectTypeOf(table.bigintString.dataType).toEqualTypeOf<Table['bigintString']['dataType']>();
}

if (is(table.bigserial53, PgBigSerial53)) {
	expectTypeOf(table.bigserial53).not.toBeNever();
	expectTypeOf(table.bigserial53.dataType).toEqualTypeOf<Table['bigserial53']['dataType']>();
}

if (is(table.bigserial64, PgBigSerial64)) {
	expectTypeOf(table.bigserial64).not.toBeNever();
	expectTypeOf(table.bigserial64.dataType).toEqualTypeOf<Table['bigserial64']['dataType']>();
}

if (is(table.bytea, PgBytea)) {
	expectTypeOf(table.bytea).not.toBeNever();
	expectTypeOf(table.bytea.dataType).toEqualTypeOf<Table['bytea']['dataType']>();
}

if (is(table.boolean, PgBoolean)) {
	expectTypeOf(table.boolean).not.toBeNever();
	expectTypeOf(table.boolean.dataType).toEqualTypeOf<Table['boolean']['dataType']>();
}

if (is(table.char, PgChar)) {
	expectTypeOf(table.char).not.toBeNever();
	expectTypeOf(table.char.dataType).toEqualTypeOf<Table['char']['dataType']>();
}

if (is(table.charEnum, PgChar)) {
	expectTypeOf(table.charEnum).not.toBeNever();
	expectTypeOf(table.charEnum.dataType).toEqualTypeOf<Table['charEnum']['dataType']>();
	expectTypeOf<typeof table.charEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.charEnumNotNull, PgChar)) {
	expectTypeOf(table.charEnumNotNull).not.toBeNever();
	expectTypeOf(table.charEnumNotNull.dataType).toEqualTypeOf<Table['charEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.charEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.cidr, PgCidr)) {
	expectTypeOf(table.cidr).not.toBeNever();
	expectTypeOf(table.cidr.dataType).toEqualTypeOf<Table['cidr']['dataType']>();
}

if (is(table.custom, PgCustomColumn)) {
	expectTypeOf(table.custom).not.toBeNever();
	expectTypeOf(table.custom.dataType).toEqualTypeOf<Table['custom']['dataType']>();
}

if (is(table.date, PgDate)) {
	expectTypeOf(table.date).not.toBeNever();
	expectTypeOf(table.date.dataType).toEqualTypeOf<Table['date']['dataType']>();
}

if (is(table.dateString, PgDateString)) {
	expectTypeOf(table.dateString).not.toBeNever();
	expectTypeOf(table.dateString.dataType).toEqualTypeOf<Table['dateString']['dataType']>();
}

if (is(table.doublePrecision, PgDoublePrecision)) {
	expectTypeOf(table.doublePrecision).not.toBeNever();
	expectTypeOf(table.doublePrecision.dataType).toEqualTypeOf<Table['doublePrecision']['dataType']>();
}

if (is(table.inet, PgInet)) {
	expectTypeOf(table.inet).not.toBeNever();
	expectTypeOf(table.inet.dataType).toEqualTypeOf<Table['inet']['dataType']>();
}

if (is(table.integer, PgInteger)) {
	expectTypeOf(table.integer).not.toBeNever();
	expectTypeOf(table.integer.dataType).toEqualTypeOf<Table['integer']['dataType']>();
}

if (is(table.interval, PgInterval)) {
	expectTypeOf(table.interval).not.toBeNever();
	expectTypeOf(table.interval.dataType).toEqualTypeOf<Table['interval']['dataType']>();
}

if (is(table.json, PgJson)) {
	expectTypeOf(table.json).not.toBeNever();
	expectTypeOf(table.json.dataType).toEqualTypeOf<Table['json']['dataType']>();
}

if (is(table.jsonb, PgJsonb)) {
	expectTypeOf(table.jsonb).not.toBeNever();
	expectTypeOf(table.jsonb.dataType).toEqualTypeOf<Table['jsonb']['dataType']>();
}

if (is(table.line, PgLineTuple)) {
	expectTypeOf(table.line).not.toBeNever();
	expectTypeOf(table.line.dataType).toEqualTypeOf<Table['line']['dataType']>();
}

if (is(table.lineAbc, PgLineABC)) {
	expectTypeOf(table.lineAbc).not.toBeNever();
	expectTypeOf(table.lineAbc.dataType).toEqualTypeOf<Table['lineAbc']['dataType']>();
}

if (is(table.macaddr, PgMacaddr)) {
	expectTypeOf(table.macaddr).not.toBeNever();
	expectTypeOf(table.macaddr.dataType).toEqualTypeOf<Table['macaddr']['dataType']>();
}

if (is(table.macaddr8, PgMacaddr8)) {
	expectTypeOf(table.macaddr8).not.toBeNever();
	expectTypeOf(table.macaddr8.dataType).toEqualTypeOf<Table['macaddr8']['dataType']>();
}

if (is(table.numeric, PgNumeric)) {
	expectTypeOf(table.numeric).not.toBeNever();
	expectTypeOf(table.numeric.dataType).toEqualTypeOf<Table['numeric']['dataType']>();
}

if (is(table.numericNumber, PgNumericNumber)) {
	expectTypeOf(table.numericNumber).not.toBeNever();
	expectTypeOf(table.numericNumber.dataType).toEqualTypeOf<Table['numericNumber']['dataType']>();
}

if (is(table.numericBigint, PgNumericBigInt)) {
	expectTypeOf(table.numericBigint).not.toBeNever();
	expectTypeOf(table.numericBigint.dataType).toEqualTypeOf<Table['numericBigint']['dataType']>();
}

if (is(table.point, PgPointTuple)) {
	expectTypeOf(table.point).not.toBeNever();
	expectTypeOf(table.point.dataType).toEqualTypeOf<Table['point']['dataType']>();
}

if (is(table.pointXy, PgPointObject)) {
	expectTypeOf(table.pointXy).not.toBeNever();
	expectTypeOf(table.pointXy.dataType).toEqualTypeOf<Table['pointXy']['dataType']>();
}

if (is(table.geometry, PgGeometry)) {
	expectTypeOf(table.geometry).not.toBeNever();
	expectTypeOf(table.geometry.dataType).toEqualTypeOf<Table['geometry']['dataType']>();
}

if (is(table.geometryXy, PgGeometryObject)) {
	expectTypeOf(table.geometryXy).not.toBeNever();
	expectTypeOf(table.geometryXy.dataType).toEqualTypeOf<Table['geometryXy']['dataType']>();
}

if (is(table.real, PgReal)) {
	expectTypeOf(table.real).not.toBeNever();
	expectTypeOf(table.real.dataType).toEqualTypeOf<Table['real']['dataType']>();
}

if (is(table.serial, PgSerial)) {
	expectTypeOf(table.serial).not.toBeNever();
	expectTypeOf(table.serial.dataType).toEqualTypeOf<Table['serial']['dataType']>();
}

if (is(table.smallint, PgSmallInt)) {
	expectTypeOf(table.smallint).not.toBeNever();
	expectTypeOf(table.smallint.dataType).toEqualTypeOf<Table['smallint']['dataType']>();
}

if (is(table.smallserial, PgSmallSerial)) {
	expectTypeOf(table.smallserial).not.toBeNever();
	expectTypeOf(table.smallserial.dataType).toEqualTypeOf<Table['smallserial']['dataType']>();
}

if (is(table.text, PgText)) {
	expectTypeOf(table.text).not.toBeNever();
	expectTypeOf(table.text.dataType).toEqualTypeOf<Table['text']['dataType']>();
}

if (is(table.textEnum, PgText)) {
	expectTypeOf(table.textEnum).not.toBeNever();
	expectTypeOf(table.textEnum.dataType).toEqualTypeOf<Table['textEnum']['dataType']>();
	expectTypeOf<typeof table.textEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textEnumNotNull, PgText)) {
	expectTypeOf(table.textEnumNotNull).not.toBeNever();
	expectTypeOf(table.textEnumNotNull.dataType).toEqualTypeOf<Table['textEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.textEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textType, PgText)) {
	expectTypeOf(table.textType).not.toBeNever();
	expectTypeOf(table.textType.dataType).toEqualTypeOf<Table['textType']['dataType']>();
}

if (is(table.textArray, PgText)) {
	expectTypeOf(table.textArray).not.toBeNever();
	expectTypeOf(table.textArray.dataType).toEqualTypeOf<Table['textArray']['dataType']>();
}

if (is(table.textEnumArray, PgText)) {
	expectTypeOf(table.textEnumArray).not.toBeNever();
	expectTypeOf(table.textEnumArray.dataType).toEqualTypeOf<Table['textEnumArray']['dataType']>();
	expectTypeOf<typeof table.textEnumArray.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumArray.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.time, PgTime)) {
	expectTypeOf(table.time).not.toBeNever();
	expectTypeOf(table.time.dataType).toEqualTypeOf<Table['time']['dataType']>();
}

if (is(table.timestamp, PgTimestamp)) {
	expectTypeOf(table.timestamp).not.toBeNever();
	expectTypeOf(table.timestamp.dataType).toEqualTypeOf<Table['timestamp']['dataType']>();
}

if (is(table.timestampString, PgTimestampString)) {
	expectTypeOf(table.timestampString).not.toBeNever();
	expectTypeOf(table.timestampString.dataType).toEqualTypeOf<Table['timestampString']['dataType']>();
}

if (is(table.uuid, PgUUID)) {
	expectTypeOf(table.uuid).not.toBeNever();
	expectTypeOf(table.uuid.dataType).toEqualTypeOf<Table['uuid']['dataType']>();
}

if (is(table.varchar, PgVarchar)) {
	expectTypeOf(table.varchar).not.toBeNever();
	expectTypeOf(table.varchar.dataType).toEqualTypeOf<Table['varchar']['dataType']>();
}

if (is(table.varcharEnum, PgVarchar)) {
	expectTypeOf(table.varcharEnum).not.toBeNever();
	expectTypeOf(table.varcharEnum.dataType).toEqualTypeOf<Table['varcharEnum']['dataType']>();
	expectTypeOf<typeof table.varcharEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.varcharEnumNotNull, PgVarchar)) {
	expectTypeOf(table.varcharEnumNotNull).not.toBeNever();
	expectTypeOf(table.varcharEnumNotNull.dataType).toEqualTypeOf<Table['varcharEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.varcharEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.bit, PgBinaryVector)) {
	expectTypeOf(table.bit).not.toBeNever();
	expectTypeOf(table.bit.dataType).toEqualTypeOf<Table['bit']['dataType']>();
}

if (is(table.halfvec, PgHalfVector)) {
	expectTypeOf(table.halfvec).not.toBeNever();
	expectTypeOf(table.halfvec.dataType).toEqualTypeOf<Table['halfvec']['dataType']>();
}

if (is(table.sparsevec, PgSparseVector)) {
	expectTypeOf(table.sparsevec).not.toBeNever();
	expectTypeOf(table.sparsevec.dataType).toEqualTypeOf<Table['sparsevec']['dataType']>();
}

if (is(table.vector, PgVector)) {
	expectTypeOf(table.vector).not.toBeNever();
	expectTypeOf(table.vector.dataType).toEqualTypeOf<Table['vector']['dataType']>();
}

if (is(table.pgEnum, PgEnumColumn)) {
	expectTypeOf(table.pgEnum).not.toBeNever();
	expectTypeOf(table.pgEnum.dataType).toEqualTypeOf<Table['pgEnum']['dataType']>();
	expectTypeOf<typeof table.pgEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.pgEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.pgEnumObject, PgEnumObjectColumn)) {
	expectTypeOf(table.pgEnumObject).not.toBeNever();
	expectTypeOf(table.pgEnumObject.dataType).toEqualTypeOf<Table['pgEnumObject']['dataType']>();
	expectTypeOf<typeof table.pgEnumObject.enumValues[number]>().toEqualTypeOf<Letters>();
	expectTypeOf(table.pgEnumObject.enumValues).toExtend<[string, ...string[]]>();
}

declare const column: unknown;

if (is(column, PgEnumColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}

if (is(column, PgEnumObjectColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}
