import { is } from 'drizzle-orm';
import {
	bigint,
	binary,
	boolean,
	char,
	customType,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	longtext,
	mediumint,
	mediumtext,
	real,
	serial,
	SingleStoreBigInt53,
	SingleStoreBigInt64,
	SingleStoreBigIntString,
	SingleStoreBinary,
	SingleStoreBoolean,
	SingleStoreChar,
	SingleStoreCustomColumn,
	SingleStoreDate,
	SingleStoreDateString,
	SingleStoreDateTime,
	SingleStoreDateTimeString,
	SingleStoreDecimal,
	SingleStoreDecimalBigInt,
	SingleStoreDecimalNumber,
	SingleStoreDouble,
	singlestoreEnum,
	SingleStoreEnumColumn,
	SingleStoreFloat,
	SingleStoreInt,
	SingleStoreJson,
	SingleStoreMediumInt,
	SingleStoreReal,
	SingleStoreSerial,
	SingleStoreSmallInt,
	singlestoreTable,
	SingleStoreText,
	SingleStoreTime,
	SingleStoreTimestamp,
	SingleStoreTimestampString,
	SingleStoreTinyInt,
	SingleStoreVarBinary,
	SingleStoreVarChar,
	SingleStoreVector,
	SingleStoreYear,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	tinytext,
	varbinary,
	varchar,
	vector,
	year,
} from 'drizzle-orm/singlestore-core';
import { expectTypeOf } from 'vitest';

const table = singlestoreTable('table', {
	bigint53: bigint({ mode: 'number' }),
	bigint64: bigint({ mode: 'bigint' }),
	bigintString: bigint({ mode: 'string' }),
	binary: binary(),
	boolean: boolean(),
	char: char(),
	charEnum: char({ enum: ['a', 'b'] }),
	charEnumNotNull: char({ enum: ['a', 'b'] }).notNull(),
	custom: customType<{ data: string }>({ dataType: () => 'custom' })(),
	date: date(),
	dateString: date({ mode: 'string' }),
	datetime: datetime(),
	datetimeString: datetime({ mode: 'string' }),
	decimal: decimal(),
	decimalNumber: decimal({ mode: 'number' }),
	decimalBigint: decimal({ mode: 'bigint' }),
	double: double(),
	singlestoreEnum: singlestoreEnum(['a', 'b']),
	float: float(),
	int: int(),
	json: json(),
	mediumint: mediumint(),
	real: real(),
	serial: serial(),
	smallint: smallint(),
	text: text(),
	textEnum: text({ enum: ['a', 'b'] }),
	textEnumNotNull: text({ enum: ['a', 'b'] }).notNull(),
	textType: text().$type<'a' | 'b'>(),
	tinytext: tinytext(),
	tinytextEnum: tinytext({ enum: ['a', 'b'] }),
	mediumtext: mediumtext(),
	longtext: longtext(),
	time: time(),
	timestamp: timestamp(),
	timestampString: timestamp({ mode: 'string' }),
	tinyint: tinyint(),
	varbinary: varbinary({ length: 10 }),
	varchar: varchar({ length: 10 }),
	varcharEnum: varchar({ length: 10, enum: ['a', 'b'] }),
	varcharEnumNotNull: varchar({ length: 10, enum: ['a', 'b'] }).notNull(),
	vector: vector({ dimensions: 3, elementType: 'F32' }),
	year: year(),
});

type Table = typeof table;

if (is(table.bigint53, SingleStoreBigInt53)) {
	expectTypeOf(table.bigint53).not.toBeNever();
	expectTypeOf(table.bigint53.dataType).toEqualTypeOf<Table['bigint53']['dataType']>();
}

if (is(table.bigint64, SingleStoreBigInt64)) {
	expectTypeOf(table.bigint64).not.toBeNever();
	expectTypeOf(table.bigint64.dataType).toEqualTypeOf<Table['bigint64']['dataType']>();
}

if (is(table.bigintString, SingleStoreBigIntString)) {
	expectTypeOf(table.bigintString).not.toBeNever();
	expectTypeOf(table.bigintString.dataType).toEqualTypeOf<Table['bigintString']['dataType']>();
}

if (is(table.binary, SingleStoreBinary)) {
	expectTypeOf(table.binary).not.toBeNever();
	expectTypeOf(table.binary.dataType).toEqualTypeOf<Table['binary']['dataType']>();
}

if (is(table.boolean, SingleStoreBoolean)) {
	expectTypeOf(table.boolean).not.toBeNever();
	expectTypeOf(table.boolean.dataType).toEqualTypeOf<Table['boolean']['dataType']>();
}

if (is(table.char, SingleStoreChar)) {
	expectTypeOf(table.char).not.toBeNever();
	expectTypeOf(table.char.dataType).toEqualTypeOf<Table['char']['dataType']>();
}

if (is(table.charEnum, SingleStoreChar)) {
	expectTypeOf(table.charEnum).not.toBeNever();
	expectTypeOf(table.charEnum.dataType).toEqualTypeOf<Table['charEnum']['dataType']>();
	expectTypeOf<typeof table.charEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.charEnumNotNull, SingleStoreChar)) {
	expectTypeOf(table.charEnumNotNull).not.toBeNever();
	expectTypeOf(table.charEnumNotNull.dataType).toEqualTypeOf<Table['charEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.charEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.custom, SingleStoreCustomColumn)) {
	expectTypeOf(table.custom).not.toBeNever();
	expectTypeOf(table.custom.dataType).toEqualTypeOf<Table['custom']['dataType']>();
}

if (is(table.date, SingleStoreDate)) {
	expectTypeOf(table.date).not.toBeNever();
	expectTypeOf(table.date.dataType).toEqualTypeOf<Table['date']['dataType']>();
}

if (is(table.dateString, SingleStoreDateString)) {
	expectTypeOf(table.dateString).not.toBeNever();
	expectTypeOf(table.dateString.dataType).toEqualTypeOf<Table['dateString']['dataType']>();
}

if (is(table.datetime, SingleStoreDateTime)) {
	expectTypeOf(table.datetime).not.toBeNever();
	expectTypeOf(table.datetime.dataType).toEqualTypeOf<Table['datetime']['dataType']>();
}

if (is(table.datetimeString, SingleStoreDateTimeString)) {
	expectTypeOf(table.datetimeString).not.toBeNever();
	expectTypeOf(table.datetimeString.dataType).toEqualTypeOf<Table['datetimeString']['dataType']>();
}

if (is(table.decimal, SingleStoreDecimal)) {
	expectTypeOf(table.decimal).not.toBeNever();
	expectTypeOf(table.decimal.dataType).toEqualTypeOf<Table['decimal']['dataType']>();
}

if (is(table.decimalNumber, SingleStoreDecimalNumber)) {
	expectTypeOf(table.decimalNumber).not.toBeNever();
	expectTypeOf(table.decimalNumber.dataType).toEqualTypeOf<Table['decimalNumber']['dataType']>();
}

if (is(table.decimalBigint, SingleStoreDecimalBigInt)) {
	expectTypeOf(table.decimalBigint).not.toBeNever();
	expectTypeOf(table.decimalBigint.dataType).toEqualTypeOf<Table['decimalBigint']['dataType']>();
}

if (is(table.double, SingleStoreDouble)) {
	expectTypeOf(table.double).not.toBeNever();
	expectTypeOf(table.double.dataType).toEqualTypeOf<Table['double']['dataType']>();
}

if (is(table.singlestoreEnum, SingleStoreEnumColumn)) {
	expectTypeOf(table.singlestoreEnum).not.toBeNever();
	expectTypeOf(table.singlestoreEnum.dataType).toEqualTypeOf<Table['singlestoreEnum']['dataType']>();
	expectTypeOf<typeof table.singlestoreEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.singlestoreEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.float, SingleStoreFloat)) {
	expectTypeOf(table.float).not.toBeNever();
	expectTypeOf(table.float.dataType).toEqualTypeOf<Table['float']['dataType']>();
}

if (is(table.int, SingleStoreInt)) {
	expectTypeOf(table.int).not.toBeNever();
	expectTypeOf(table.int.dataType).toEqualTypeOf<Table['int']['dataType']>();
}

if (is(table.json, SingleStoreJson)) {
	expectTypeOf(table.json).not.toBeNever();
	expectTypeOf(table.json.dataType).toEqualTypeOf<Table['json']['dataType']>();
}

if (is(table.mediumint, SingleStoreMediumInt)) {
	expectTypeOf(table.mediumint).not.toBeNever();
	expectTypeOf(table.mediumint.dataType).toEqualTypeOf<Table['mediumint']['dataType']>();
}

if (is(table.real, SingleStoreReal)) {
	expectTypeOf(table.real).not.toBeNever();
	expectTypeOf(table.real.dataType).toEqualTypeOf<Table['real']['dataType']>();
}

if (is(table.serial, SingleStoreSerial)) {
	expectTypeOf(table.serial).not.toBeNever();
	expectTypeOf(table.serial.dataType).toEqualTypeOf<Table['serial']['dataType']>();
}

if (is(table.smallint, SingleStoreSmallInt)) {
	expectTypeOf(table.smallint).not.toBeNever();
	expectTypeOf(table.smallint.dataType).toEqualTypeOf<Table['smallint']['dataType']>();
}

if (is(table.text, SingleStoreText)) {
	expectTypeOf(table.text).not.toBeNever();
	expectTypeOf(table.text.dataType).toEqualTypeOf<Table['text']['dataType']>();
}

if (is(table.textEnum, SingleStoreText)) {
	expectTypeOf(table.textEnum).not.toBeNever();
	expectTypeOf(table.textEnum.dataType).toEqualTypeOf<Table['textEnum']['dataType']>();
	expectTypeOf<typeof table.textEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textEnumNotNull, SingleStoreText)) {
	expectTypeOf(table.textEnumNotNull).not.toBeNever();
	expectTypeOf(table.textEnumNotNull.dataType).toEqualTypeOf<Table['textEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.textEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textType, SingleStoreText)) {
	expectTypeOf(table.textType).not.toBeNever();
	expectTypeOf(table.textType.dataType).toEqualTypeOf<Table['textType']['dataType']>();
}

if (is(table.tinytext, SingleStoreText)) {
	expectTypeOf(table.tinytext).not.toBeNever();
	expectTypeOf(table.tinytext.dataType).toEqualTypeOf<Table['tinytext']['dataType']>();
}

if (is(table.tinytextEnum, SingleStoreText)) {
	expectTypeOf(table.tinytextEnum).not.toBeNever();
	expectTypeOf(table.tinytextEnum.dataType).toEqualTypeOf<Table['tinytextEnum']['dataType']>();
	expectTypeOf<typeof table.tinytextEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.tinytextEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.mediumtext, SingleStoreText)) {
	expectTypeOf(table.mediumtext).not.toBeNever();
	expectTypeOf(table.mediumtext.dataType).toEqualTypeOf<Table['mediumtext']['dataType']>();
}

if (is(table.longtext, SingleStoreText)) {
	expectTypeOf(table.longtext).not.toBeNever();
	expectTypeOf(table.longtext.dataType).toEqualTypeOf<Table['longtext']['dataType']>();
}

if (is(table.time, SingleStoreTime)) {
	expectTypeOf(table.time).not.toBeNever();
	expectTypeOf(table.time.dataType).toEqualTypeOf<Table['time']['dataType']>();
}

if (is(table.timestamp, SingleStoreTimestamp)) {
	expectTypeOf(table.timestamp).not.toBeNever();
	expectTypeOf(table.timestamp.dataType).toEqualTypeOf<Table['timestamp']['dataType']>();
}

if (is(table.timestampString, SingleStoreTimestampString)) {
	expectTypeOf(table.timestampString).not.toBeNever();
	expectTypeOf(table.timestampString.dataType).toEqualTypeOf<Table['timestampString']['dataType']>();
}

if (is(table.tinyint, SingleStoreTinyInt)) {
	expectTypeOf(table.tinyint).not.toBeNever();
	expectTypeOf(table.tinyint.dataType).toEqualTypeOf<Table['tinyint']['dataType']>();
}

if (is(table.varbinary, SingleStoreVarBinary)) {
	expectTypeOf(table.varbinary).not.toBeNever();
	expectTypeOf(table.varbinary.dataType).toEqualTypeOf<Table['varbinary']['dataType']>();
}

if (is(table.varchar, SingleStoreVarChar)) {
	expectTypeOf(table.varchar).not.toBeNever();
	expectTypeOf(table.varchar.dataType).toEqualTypeOf<Table['varchar']['dataType']>();
}

if (is(table.varcharEnum, SingleStoreVarChar)) {
	expectTypeOf(table.varcharEnum).not.toBeNever();
	expectTypeOf(table.varcharEnum.dataType).toEqualTypeOf<Table['varcharEnum']['dataType']>();
	expectTypeOf<typeof table.varcharEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.varcharEnumNotNull, SingleStoreVarChar)) {
	expectTypeOf(table.varcharEnumNotNull).not.toBeNever();
	expectTypeOf(table.varcharEnumNotNull.dataType).toEqualTypeOf<Table['varcharEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.varcharEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.vector, SingleStoreVector)) {
	expectTypeOf(table.vector).not.toBeNever();
	expectTypeOf(table.vector.dataType).toEqualTypeOf<Table['vector']['dataType']>();
}

if (is(table.year, SingleStoreYear)) {
	expectTypeOf(table.year).not.toBeNever();
	expectTypeOf(table.year.dataType).toEqualTypeOf<Table['year']['dataType']>();
}

declare const column: unknown;

if (is(column, SingleStoreEnumColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}
