import { is } from 'drizzle-orm';
import {
	bigint,
	bit,
	bool,
	char,
	CockroachBigInt53,
	CockroachBigInt64,
	CockroachBit,
	CockroachBoolean,
	CockroachChar,
	CockroachCustomColumn,
	CockroachDate,
	CockroachDateString,
	CockroachDecimal,
	CockroachDecimalBigInt,
	CockroachDecimalNumber,
	cockroachEnum,
	CockroachEnumColumn,
	CockroachEnumObjectColumn,
	CockroachFloat,
	CockroachGeometry,
	CockroachGeometryObject,
	CockroachInet,
	CockroachInteger,
	CockroachInterval,
	CockroachJsonb,
	CockroachReal,
	CockroachSmallInt,
	CockroachString,
	cockroachTable,
	CockroachTime,
	CockroachTimestamp,
	CockroachTimestampString,
	CockroachUUID,
	CockroachVarbit,
	CockroachVarchar,
	CockroachVector,
	customType,
	date,
	decimal,
	doublePrecision,
	float,
	geometry,
	inet,
	int2,
	int4,
	int8,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uuid,
	varbit,
	varchar,
	vector,
} from 'drizzle-orm/cockroach-core';
import { expectTypeOf } from 'vitest';

enum Letters {
	A = 'a',
	B = 'b',
}

const table = cockroachTable('table', {
	bigint53: bigint({ mode: 'number' }),
	bigint64: bigint({ mode: 'bigint' }),
	int8: int8({ mode: 'number' }),
	bool: bool(),
	char: char(),
	charEnum: char({ enum: ['a', 'b'] }),
	charEnumNotNull: char({ enum: ['a', 'b'] }).notNull(),
	custom: customType<{ data: string }>({ dataType: () => 'custom' })(),
	date: date({ mode: 'date' }),
	dateString: date({ mode: 'string' }),
	doublePrecision: doublePrecision(),
	float: float(),
	inet: inet(),
	int4: int4(),
	int2: int2(),
	interval: interval(),
	jsonb: jsonb(),
	numeric: numeric(),
	numericNumber: numeric({ mode: 'number' }),
	numericBigint: numeric({ mode: 'bigint' }),
	decimal: decimal(),
	geometry: geometry({ mode: 'tuple' }),
	geometryXy: geometry({ mode: 'xy' }),
	real: real(),
	smallint: smallint(),
	string: string(),
	stringEnum: string({ enum: ['a', 'b'] }),
	stringEnumNotNull: string({ enum: ['a', 'b'] }).notNull(),
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
	bit: bit(),
	varbit: varbit(),
	vector: vector({ dimensions: 3 }),
	cockroachEnum: cockroachEnum('enum', ['a', 'b'])(),
	cockroachEnumObject: cockroachEnum('enum_object', Letters)(),
});

type Table = typeof table;

if (is(table.bigint53, CockroachBigInt53)) {
	expectTypeOf(table.bigint53).not.toBeNever();
	expectTypeOf(table.bigint53.dataType).toEqualTypeOf<Table['bigint53']['dataType']>();
}

if (is(table.bigint64, CockroachBigInt64)) {
	expectTypeOf(table.bigint64).not.toBeNever();
	expectTypeOf(table.bigint64.dataType).toEqualTypeOf<Table['bigint64']['dataType']>();
}

if (is(table.int8, CockroachBigInt53)) {
	expectTypeOf(table.int8).not.toBeNever();
	expectTypeOf(table.int8.dataType).toEqualTypeOf<Table['int8']['dataType']>();
}

if (is(table.bool, CockroachBoolean)) {
	expectTypeOf(table.bool).not.toBeNever();
	expectTypeOf(table.bool.dataType).toEqualTypeOf<Table['bool']['dataType']>();
}

if (is(table.char, CockroachChar)) {
	expectTypeOf(table.char).not.toBeNever();
	expectTypeOf(table.char.dataType).toEqualTypeOf<Table['char']['dataType']>();
}

if (is(table.charEnum, CockroachChar)) {
	expectTypeOf(table.charEnum).not.toBeNever();
	expectTypeOf(table.charEnum.dataType).toEqualTypeOf<Table['charEnum']['dataType']>();
	expectTypeOf<typeof table.charEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.charEnumNotNull, CockroachChar)) {
	expectTypeOf(table.charEnumNotNull).not.toBeNever();
	expectTypeOf(table.charEnumNotNull.dataType).toEqualTypeOf<Table['charEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.charEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.custom, CockroachCustomColumn)) {
	expectTypeOf(table.custom).not.toBeNever();
	expectTypeOf(table.custom.dataType).toEqualTypeOf<Table['custom']['dataType']>();
}

if (is(table.date, CockroachDate)) {
	expectTypeOf(table.date).not.toBeNever();
	expectTypeOf(table.date.dataType).toEqualTypeOf<Table['date']['dataType']>();
}

if (is(table.dateString, CockroachDateString)) {
	expectTypeOf(table.dateString).not.toBeNever();
	expectTypeOf(table.dateString.dataType).toEqualTypeOf<Table['dateString']['dataType']>();
}

if (is(table.doublePrecision, CockroachFloat)) {
	expectTypeOf(table.doublePrecision).not.toBeNever();
	expectTypeOf(table.doublePrecision.dataType).toEqualTypeOf<Table['doublePrecision']['dataType']>();
}

if (is(table.float, CockroachFloat)) {
	expectTypeOf(table.float).not.toBeNever();
	expectTypeOf(table.float.dataType).toEqualTypeOf<Table['float']['dataType']>();
}

if (is(table.inet, CockroachInet)) {
	expectTypeOf(table.inet).not.toBeNever();
	expectTypeOf(table.inet.dataType).toEqualTypeOf<Table['inet']['dataType']>();
}

if (is(table.int4, CockroachInteger)) {
	expectTypeOf(table.int4).not.toBeNever();
	expectTypeOf(table.int4.dataType).toEqualTypeOf<Table['int4']['dataType']>();
}

if (is(table.int2, CockroachSmallInt)) {
	expectTypeOf(table.int2).not.toBeNever();
	expectTypeOf(table.int2.dataType).toEqualTypeOf<Table['int2']['dataType']>();
}

if (is(table.interval, CockroachInterval)) {
	expectTypeOf(table.interval).not.toBeNever();
	expectTypeOf(table.interval.dataType).toEqualTypeOf<Table['interval']['dataType']>();
}

if (is(table.jsonb, CockroachJsonb)) {
	expectTypeOf(table.jsonb).not.toBeNever();
	expectTypeOf(table.jsonb.dataType).toEqualTypeOf<Table['jsonb']['dataType']>();
}

if (is(table.numeric, CockroachDecimal)) {
	expectTypeOf(table.numeric).not.toBeNever();
	expectTypeOf(table.numeric.dataType).toEqualTypeOf<Table['numeric']['dataType']>();
}

if (is(table.numericNumber, CockroachDecimalNumber)) {
	expectTypeOf(table.numericNumber).not.toBeNever();
	expectTypeOf(table.numericNumber.dataType).toEqualTypeOf<Table['numericNumber']['dataType']>();
}

if (is(table.numericBigint, CockroachDecimalBigInt)) {
	expectTypeOf(table.numericBigint).not.toBeNever();
	expectTypeOf(table.numericBigint.dataType).toEqualTypeOf<Table['numericBigint']['dataType']>();
}

if (is(table.decimal, CockroachDecimal)) {
	expectTypeOf(table.decimal).not.toBeNever();
	expectTypeOf(table.decimal.dataType).toEqualTypeOf<Table['decimal']['dataType']>();
}

if (is(table.geometry, CockroachGeometry)) {
	expectTypeOf(table.geometry).not.toBeNever();
	expectTypeOf(table.geometry.dataType).toEqualTypeOf<Table['geometry']['dataType']>();
}

if (is(table.geometryXy, CockroachGeometryObject)) {
	expectTypeOf(table.geometryXy).not.toBeNever();
	expectTypeOf(table.geometryXy.dataType).toEqualTypeOf<Table['geometryXy']['dataType']>();
}

if (is(table.real, CockroachReal)) {
	expectTypeOf(table.real).not.toBeNever();
	expectTypeOf(table.real.dataType).toEqualTypeOf<Table['real']['dataType']>();
}

if (is(table.smallint, CockroachSmallInt)) {
	expectTypeOf(table.smallint).not.toBeNever();
	expectTypeOf(table.smallint.dataType).toEqualTypeOf<Table['smallint']['dataType']>();
}

if (is(table.string, CockroachString)) {
	expectTypeOf(table.string).not.toBeNever();
	expectTypeOf(table.string.dataType).toEqualTypeOf<Table['string']['dataType']>();
}

if (is(table.stringEnum, CockroachString)) {
	expectTypeOf(table.stringEnum).not.toBeNever();
	expectTypeOf(table.stringEnum.dataType).toEqualTypeOf<Table['stringEnum']['dataType']>();
	expectTypeOf<typeof table.stringEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.stringEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.stringEnumNotNull, CockroachString)) {
	expectTypeOf(table.stringEnumNotNull).not.toBeNever();
	expectTypeOf(table.stringEnumNotNull.dataType).toEqualTypeOf<Table['stringEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.stringEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.stringEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.text, CockroachString)) {
	expectTypeOf(table.text).not.toBeNever();
	expectTypeOf(table.text.dataType).toEqualTypeOf<Table['text']['dataType']>();
}

if (is(table.textEnum, CockroachString)) {
	expectTypeOf(table.textEnum).not.toBeNever();
	expectTypeOf(table.textEnum.dataType).toEqualTypeOf<Table['textEnum']['dataType']>();
	expectTypeOf<typeof table.textEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textEnumNotNull, CockroachString)) {
	expectTypeOf(table.textEnumNotNull).not.toBeNever();
	expectTypeOf(table.textEnumNotNull.dataType).toEqualTypeOf<Table['textEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.textEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textType, CockroachString)) {
	expectTypeOf(table.textType).not.toBeNever();
	expectTypeOf(table.textType.dataType).toEqualTypeOf<Table['textType']['dataType']>();
}

if (is(table.textArray, CockroachString)) {
	expectTypeOf(table.textArray).not.toBeNever();
	expectTypeOf(table.textArray.dataType).toEqualTypeOf<Table['textArray']['dataType']>();
}

if (is(table.textEnumArray, CockroachString)) {
	expectTypeOf(table.textEnumArray).not.toBeNever();
	expectTypeOf(table.textEnumArray.dataType).toEqualTypeOf<Table['textEnumArray']['dataType']>();
	expectTypeOf<typeof table.textEnumArray.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumArray.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.time, CockroachTime)) {
	expectTypeOf(table.time).not.toBeNever();
	expectTypeOf(table.time.dataType).toEqualTypeOf<Table['time']['dataType']>();
}

if (is(table.timestamp, CockroachTimestamp)) {
	expectTypeOf(table.timestamp).not.toBeNever();
	expectTypeOf(table.timestamp.dataType).toEqualTypeOf<Table['timestamp']['dataType']>();
}

if (is(table.timestampString, CockroachTimestampString)) {
	expectTypeOf(table.timestampString).not.toBeNever();
	expectTypeOf(table.timestampString.dataType).toEqualTypeOf<Table['timestampString']['dataType']>();
}

if (is(table.uuid, CockroachUUID)) {
	expectTypeOf(table.uuid).not.toBeNever();
	expectTypeOf(table.uuid.dataType).toEqualTypeOf<Table['uuid']['dataType']>();
}

if (is(table.varchar, CockroachVarchar)) {
	expectTypeOf(table.varchar).not.toBeNever();
	expectTypeOf(table.varchar.dataType).toEqualTypeOf<Table['varchar']['dataType']>();
}

if (is(table.varcharEnum, CockroachVarchar)) {
	expectTypeOf(table.varcharEnum).not.toBeNever();
	expectTypeOf(table.varcharEnum.dataType).toEqualTypeOf<Table['varcharEnum']['dataType']>();
	expectTypeOf<typeof table.varcharEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.varcharEnumNotNull, CockroachVarchar)) {
	expectTypeOf(table.varcharEnumNotNull).not.toBeNever();
	expectTypeOf(table.varcharEnumNotNull.dataType).toEqualTypeOf<Table['varcharEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.varcharEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.bit, CockroachBit)) {
	expectTypeOf(table.bit).not.toBeNever();
	expectTypeOf(table.bit.dataType).toEqualTypeOf<Table['bit']['dataType']>();
}

if (is(table.varbit, CockroachVarbit)) {
	expectTypeOf(table.varbit).not.toBeNever();
	expectTypeOf(table.varbit.dataType).toEqualTypeOf<Table['varbit']['dataType']>();
}

if (is(table.vector, CockroachVector)) {
	expectTypeOf(table.vector).not.toBeNever();
	expectTypeOf(table.vector.dataType).toEqualTypeOf<Table['vector']['dataType']>();
}

if (is(table.cockroachEnum, CockroachEnumColumn)) {
	expectTypeOf(table.cockroachEnum).not.toBeNever();
	expectTypeOf(table.cockroachEnum.dataType).toEqualTypeOf<Table['cockroachEnum']['dataType']>();
	expectTypeOf<typeof table.cockroachEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.cockroachEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.cockroachEnumObject, CockroachEnumObjectColumn)) {
	expectTypeOf(table.cockroachEnumObject).not.toBeNever();
	expectTypeOf(table.cockroachEnumObject.dataType).toEqualTypeOf<Table['cockroachEnumObject']['dataType']>();
	expectTypeOf<typeof table.cockroachEnumObject.enumValues[number]>().toEqualTypeOf<Letters>();
	expectTypeOf(table.cockroachEnumObject.enumValues).toExtend<[string, ...string[]]>();
}

declare const column: unknown;

if (is(column, CockroachEnumColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}

if (is(column, CockroachEnumObjectColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}
